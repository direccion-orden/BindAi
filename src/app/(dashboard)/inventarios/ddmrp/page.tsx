"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, doc, getDoc, writeBatch, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, TrendingDown, TrendingUp, AlertTriangle, Settings, RefreshCcw, Save, Search, Tag, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShopifyProduct } from "@/types/product";

interface DDMRPVariant {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  sku: string;
  totalStock: number;
  adu: number;
  ddmrpConfig: {
    isDecoupled: boolean;
    leadTimeDays: number;
    variabilityFactor: number;
    moq: number;
  };
  zones: {
    red: number;
    yellow: number;
    green: number;
    tor: number;
    toy: number;
    tog: number;
  };
  netFlow: number;
  statusColor: 'RED' | 'YELLOW' | 'GREEN' | 'OVERSTOCK';
  suggestedOrder: number;
}

export default function DDMRPPage() {
  const { companyId } = useAuth();
  const [activeTab, setActiveTab] = useState<'board' | 'config'>('board');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [aduMap, setAduMap] = useState<Record<string, number>>({});
  const [savingConfig, setSavingConfig] = useState<string | null>(null);

  // Configuration Form State
  const [configForms, setConfigForms] = useState<Record<string, {
    isDecoupled: boolean;
    leadTimeDays: number;
    variabilityFactor: number;
    moq: number;
  }>>({});

  // Filters and Categories State
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [searchTerm, setSearchTerm] = useState("");
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    // Fetch Categories
    getDocs(collection(db, "companies", companyId, "categories")).then(snap => {
      const catList = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name || d.Name || d.description || d.Description || ""
        };
      }).filter(c => c.name !== "");
      catList.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      setCategories(catList);
    });

    // Fetch Products
    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      const prods = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct));
      setProducts(prods);
      
      // Initialize Config Forms for variants
      const forms: any = {};
      prods.forEach(p => p.variants.forEach(v => {
        if (!forms[v.id]) {
          forms[v.id] = {
            isDecoupled: v.ddmrp?.isDecoupled || false,
            leadTimeDays: v.ddmrp?.leadTimeDays || 7,
            variabilityFactor: v.ddmrp?.variabilityFactor || 0.5,
            moq: v.ddmrp?.moq || 1
          };
        }
      }));
      setConfigForms(prev => ({...forms, ...prev}));
    });

    // Fetch Transactions for ADU (Last 30 days)
    const fetchADU = async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const q = query(
        collection(db, "companies", companyId, "inventory_movements"),
        where("type", "==", "OUT"),
        where("createdAt", ">=", thirtyDaysAgo.toISOString())
      );
      
      try {
        const snap = await getDocs(q);
        const map: Record<string, number> = {};
        snap.docs.forEach(doc => {
          const data = doc.data();
          // Assuming transaction logs variantId. Wait, our transactions only log productId and productName?
          // Let's fallback to productId if variantId is missing, but ideally we should track variantId in transactions.
          // For now, if we don't have variantId, we use productId.
          const id = data.variantId || data.productId; 
          map[id] = (map[id] || 0) + (data.quantity || 0);
        });
        
        // Divide by 30 to get average per day
        Object.keys(map).forEach(k => map[k] = map[k] / 30);
        setAduMap(map);
      } catch (err) {
        console.error("Error calculating ADU:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchADU();

    return () => unsubP();
  }, [companyId]);

  const handleSaveConfig = async (productId: string, variantIndex: number, variantId: string) => {
    if (!companyId) return;
    setSavingConfig(variantId);
    try {
      const prodRef = doc(db, "companies", companyId, "products", productId);
      const prodSnap = await getDoc(prodRef);
      if (prodSnap.exists()) {
        const data = prodSnap.data() as ShopifyProduct;
        data.variants[variantIndex].ddmrp = configForms[variantId];
        
        const batch = writeBatch(db);
        batch.update(prodRef, { variants: data.variants });
        await batch.commit();
      }
    } catch (e) {
      console.error(e);
      alert("Error al guardar la configuración");
    } finally {
      setSavingConfig(null);
    }
  };

  // Filtered variants for Buffer Configuration
  const filteredConfigItems = useMemo(() => {
    const list: { product: ShopifyProduct; variant: any; variantIndex: number }[] = [];
    products.forEach(p => {
      // Resolve Category ID
      const catId = p.categoryId || (p as any).Category1ID || "";
      
      if (selectedCategory !== "Todas") {
        const matchedCatObj = categories.find(c => c.name.toLowerCase() === selectedCategory.toLowerCase());
        const matchedCatId = matchedCatObj?.id;

        const matchesCategory = matchedCatId && (
          catId === matchedCatId ||
          p.productType?.toLowerCase() === selectedCategory.toLowerCase()
        );
        if (!matchesCategory) return;
      }

      p.variants.forEach((v, idx) => {
        const fullName = v.title !== "Default Title" ? `${p.title} - ${v.title}` : p.title;
        const sku = v.sku || "";

        if (searchTerm.trim() !== "") {
          const term = searchTerm.toLowerCase().trim();
          const matchesSearch = 
            fullName.toLowerCase().includes(term) ||
            sku.toLowerCase().includes(term);
          if (!matchesSearch) return;
        }

        list.push({ product: p, variant: v, variantIndex: idx });
      });
    });
    return list;
  }, [products, categories, selectedCategory, searchTerm]);

  // Bulk Selection State
  const isAllFilteredSelected = useMemo(() => {
    if (filteredConfigItems.length === 0) return false;
    return filteredConfigItems.every(({ variant }) => {
      const form = configForms[variant.id];
      return form?.isDecoupled === true;
    });
  }, [filteredConfigItems, configForms]);

  const isSomeFilteredSelected = useMemo(() => {
    return filteredConfigItems.some(({ variant }) => {
      const form = configForms[variant.id];
      return form?.isDecoupled === true;
    });
  }, [filteredConfigItems, configForms]);

  const handleToggleSelectAllFiltered = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setConfigForms(prev => {
      const next = { ...prev };
      filteredConfigItems.forEach(({ variant }) => {
        const form = next[variant.id];
        if (form) {
          next[variant.id] = { ...form, isDecoupled: checked };
        }
      });
      return next;
    });
  };

  // Pending Changes State
  const changedConfigItems = useMemo(() => {
    const list: { productId: string; variantIndex: number; variantId: string; config: any }[] = [];
    products.forEach(p => {
      p.variants.forEach((v, idx) => {
        const form = configForms[v.id];
        if (form) {
          const currentConfig = v.ddmrp || { isDecoupled: false, leadTimeDays: 7, variabilityFactor: 0.5, moq: 1 };
          const isChanged = JSON.stringify(form) !== JSON.stringify(currentConfig);
          if (isChanged) {
            list.push({ productId: p.id, variantIndex: idx, variantId: v.id, config: form });
          }
        }
      });
    });
    return list;
  }, [products, configForms]);

  const hasChanges = changedConfigItems.length > 0;

  // Bulk Save Handler
  const handleSaveAllConfigs = async () => {
    if (!companyId || changedConfigItems.length === 0) return;
    setSavingAll(true);
    try {
      const groupedByProduct: Record<string, { variantIndex: number; config: any }[]> = {};
      changedConfigItems.forEach(({ productId, variantIndex, config }) => {
        if (!groupedByProduct[productId]) {
          groupedByProduct[productId] = [];
        }
        groupedByProduct[productId].push({ variantIndex, config });
      });

      const batch = writeBatch(db);

      for (const productId of Object.keys(groupedByProduct)) {
        const prodRef = doc(db, "companies", companyId, "products", productId);
        const prodSnap = await getDoc(prodRef);
        if (prodSnap.exists()) {
          const prodData = prodSnap.data() as ShopifyProduct;
          const updates = groupedByProduct[productId];
          updates.forEach(({ variantIndex, config }) => {
            if (prodData.variants && prodData.variants[variantIndex]) {
              prodData.variants[variantIndex].ddmrp = config;
            }
          });
          batch.update(prodRef, { variants: prodData.variants });
        }
      }

      await batch.commit();
      alert("Configuraciones de buffers guardadas exitosamente");
    } catch (e) {
      console.error(e);
      alert("Error al guardar las configuraciones de buffers");
    } finally {
      setSavingAll(false);
    }
  };

  // Build DDMRP View Data
  const viewData: DDMRPVariant[] = [];
  
  products.forEach(p => {
    p.variants.forEach(v => {
      if (v.ddmrp?.isDecoupled) {
        // Find ADU (try variantId, fallback to productId)
        // If system hasn't run for 30 days, we might have 0. We'll enforce a minimum ADU of 0.1 to avoid breaking math
        let rawAdu = aduMap[v.id] || aduMap[p.id] || 0;
        const adu = Math.max(0.1, rawAdu); 
        
        const totalStock = Object.values(v.inventoryByWarehouse || {}).reduce((a: any, b: any) => a + b, 0) as number;
        
        // Calculate DDMRP Zones
        const redZone = adu * v.ddmrp.leadTimeDays * v.ddmrp.variabilityFactor;
        const yellowZone = adu * v.ddmrp.leadTimeDays;
        const greenZone = Math.max(v.ddmrp.moq, adu * 7); // Max between MOQ and 1 week of usage
        
        const tor = redZone;
        const toy = tor + yellowZone;
        const tog = toy + greenZone;
        
        const netFlow = totalStock; // In a full implementation: OnHand + OnOrder - QualifiedSales
        
        let statusColor: 'RED' | 'YELLOW' | 'GREEN' | 'OVERSTOCK' = 'GREEN';
        if (netFlow <= tor) statusColor = 'RED';
        else if (netFlow <= toy) statusColor = 'YELLOW';
        else if (netFlow <= tog) statusColor = 'GREEN';
        else statusColor = 'OVERSTOCK';
        
        // Suggested Order: Always aim to reach Top of Green (TOG)
        let suggestedOrder = 0;
        if (statusColor === 'RED' || statusColor === 'YELLOW') {
          suggestedOrder = Math.ceil(tog - netFlow);
          // Adjust to meet MOQ
          if (suggestedOrder < v.ddmrp.moq) suggestedOrder = v.ddmrp.moq;
        }

        viewData.push({
          productId: p.id,
          variantId: v.id,
          productName: p.title,
          variantTitle: v.title !== "Default Title" ? v.title : "",
          sku: v.sku,
          totalStock,
          adu,
          ddmrpConfig: v.ddmrp,
          zones: { red: redZone, yellow: yellowZone, green: greenZone, tor, toy, tog },
          netFlow,
          statusColor,
          suggestedOrder
        });
      }
    });
  });

  // Sort by execution priority (RED first, then YELLOW, then relative penetration into the zone)
  viewData.sort((a, b) => {
    const priorityMap = { RED: 0, YELLOW: 1, GREEN: 2, OVERSTOCK: 3 };
    if (priorityMap[a.statusColor] !== priorityMap[b.statusColor]) {
      return priorityMap[a.statusColor] - priorityMap[b.statusColor];
    }
    // Secondary sort: Buffer Penetration (lower NetFlow relative to TOG is higher priority)
    return (a.netFlow / a.zones.tog) - (b.netFlow / b.zones.tog);
  });

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Buffer Management (DDMRP)</h1>
        <p className="text-muted-foreground">Posicionamiento estratégico y ejecución basada en el flujo neto.</p>
      </div>

      <div className="flex gap-2 border-b">
        <Button 
          variant={activeTab === 'board' ? 'default' : 'ghost'} 
          className={activeTab === 'board' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
          onClick={() => setActiveTab('board')}
        >
          Tablero de Planeación (Planning Board)
        </Button>
        <Button 
          variant={activeTab === 'config' ? 'default' : 'ghost'} 
          className={activeTab === 'config' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
          onClick={() => setActiveTab('config')}
        >
          Configuración de Buffers
        </Button>
      </div>

      {activeTab === 'board' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-black text-red-600">{viewData.filter(v => v.statusColor === 'RED').length}</span>
              <span className="text-xs font-bold text-red-800 uppercase">Alertas Críticas</span>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-black text-yellow-600">{viewData.filter(v => v.statusColor === 'YELLOW').length}</span>
              <span className="text-xs font-bold text-yellow-800 uppercase">Sugerencias de Reorden</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-black text-emerald-600">{viewData.filter(v => v.statusColor === 'GREEN').length}</span>
              <span className="text-xs font-bold text-emerald-800 uppercase">Buffers Saludables</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-black text-slate-600">{viewData.filter(v => v.statusColor === 'OVERSTOCK').length}</span>
              <span className="text-xs font-bold text-slate-800 uppercase">Sobreinventario</span>
            </div>
          </div>

          <div className="bg-card border rounded-xl shadow-sm overflow-hidden mt-6">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b text-xs uppercase">
                <tr>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">SKU / Producto</th>
                  <th className="px-4 py-3 text-center">ADU<br/><span className="text-[10px] font-normal lowercase">(Prom. Diario)</span></th>
                  <th className="px-4 py-3 text-center">Flujo Neto<br/><span className="text-[10px] font-normal lowercase">(Inventario Actual)</span></th>
                  <th className="px-4 py-3 text-center">Ecuación DDMRP<br/><span className="text-[10px] font-normal lowercase">(Rojo | Amarillo | Verde)</span></th>
                  <th className="px-4 py-3 text-center">Sugerencia<br/><span className="text-[10px] font-normal lowercase">Comprar</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {viewData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      <Settings className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <p>No tienes ningún producto configurado como punto de desacople estratégico (Buffer).</p>
                      <p className="text-sm mt-1">Ve a la pestaña de "Configuración de Buffers" para activar DDMRP en tus SKU principales.</p>
                    </td>
                  </tr>
                ) : (
                  viewData.map(item => {
                    // Calculate visual bar widths percentage based on Top of Green
                    const redPct = (item.zones.red / item.zones.tog) * 100;
                    const yellowPct = (item.zones.yellow / item.zones.tog) * 100;
                    const greenPct = (item.zones.green / item.zones.tog) * 100;
                    
                    const flowPct = Math.min(100, (item.netFlow / item.zones.tog) * 100);

                    return (
                      <tr key={`${item.variantId}-${item.productId}`} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          {item.statusColor === 'RED' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-100 text-red-800 text-[10px] font-bold"><AlertTriangle className="w-3 h-3"/> CRÍTICO</span>}
                          {item.statusColor === 'YELLOW' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-yellow-100 text-yellow-800 text-[10px] font-bold"><RefreshCcw className="w-3 h-3"/> REORDEN</span>}
                          {item.statusColor === 'GREEN' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">SALUDABLE</span>}
                          {item.statusColor === 'OVERSTOCK' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-800 text-[10px] font-bold">EXCESO</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-xs">{item.sku}</p>
                          <p className="font-medium">{item.productName}</p>
                          {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs">
                          {item.adu.toFixed(1)} / día
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-lg font-bold ${item.statusColor === 'RED' ? 'text-red-600' : item.statusColor === 'YELLOW' ? 'text-yellow-600' : 'text-emerald-600'}`}>
                            {item.netFlow}
                          </span>
                        </td>
                        <td className="px-4 py-3 w-64">
                          <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                            <div className="h-full bg-red-500" style={{ width: `${redPct}%` }} title={`TOR: ${Math.round(item.zones.tor)}`} />
                            <div className="h-full bg-yellow-400" style={{ width: `${yellowPct}%` }} title={`TOY: ${Math.round(item.zones.toy)}`} />
                            <div className="h-full bg-emerald-500" style={{ width: `${greenPct}%` }} title={`TOG: ${Math.round(item.zones.tog)}`} />
                            
                            {/* Net Flow Indicator Line */}
                            <div 
                              className="absolute top-0 bottom-0 w-1 bg-black z-10" 
                              style={{ left: `calc(${flowPct}% - 2px)` }}
                              title={`Flujo Neto: ${item.netFlow}`}
                            />
                          </div>
                          <div className="flex justify-between mt-1 text-[9px] text-muted-foreground font-mono font-medium">
                            <span>0</span>
                            <span>{Math.round(item.zones.tor)}</span>
                            <span>{Math.round(item.zones.toy)}</span>
                            <span>{Math.round(item.zones.tog)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.suggestedOrder > 0 ? (
                            <span className="inline-flex items-center justify-center px-3 py-1 bg-indigo-100 text-indigo-800 font-bold rounded">
                              + {item.suggestedOrder}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="bg-card border rounded-xl shadow-sm p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Posicionamiento Estratégico (Configuración)</h2>
              <p className="text-sm text-muted-foreground">Activa el Buffer DDMRP para los artículos que deseas gestionar mediante demanda real. Define los tiempos de entrega de tu proveedor y el tamaño de lote.</p>
            </div>
            {hasChanges && (
              <Button
                onClick={handleSaveAllConfigs}
                disabled={savingAll}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2 shadow-sm shrink-0 self-start md:self-center"
              >
                {savingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Todos los Cambios ({changedConfigItems.length})
              </Button>
            )}
          </div>
          
          {/* Filters Bar */}
          <div className="p-4 border border-slate-200 rounded-xl flex flex-col md:flex-row items-center gap-4 bg-slate-50/50">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Buscar por producto o SKU..." 
                className="pl-9 h-10 text-xs w-full bg-white border-slate-200 placeholder:text-slate-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {/* Category Filter */}
            <div className="w-full md:w-60 shrink-0">
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full pl-9 pr-3 border border-slate-200 rounded-md h-10 text-xs bg-white text-slate-700 font-semibold"
                >
                  <option value="Todas">Todas las categorías</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            {filteredConfigItems.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="p-3 bg-slate-100 rounded-full w-max mx-auto">
                  <Inbox className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-700">Sin artículos encontrados</h3>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  No hay productos ni variantes que coincidan con los filtros de búsqueda aplicados.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground font-medium border-b text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 pl-6">Producto</th>
                    <th className="px-4 py-3 text-center w-36">
                      <div className="flex flex-col items-center gap-1">
                        <span>Activar Buffer</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <input
                            type="checkbox"
                            checked={isAllFilteredSelected}
                            ref={el => {
                              if (el) {
                                el.indeterminate = isSomeFilteredSelected && !isAllFilteredSelected;
                              }
                            }}
                            onChange={handleToggleSelectAllFiltered}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            title="Seleccionar todos los filtrados"
                          />
                          <span className="text-[9px] text-muted-foreground font-bold lowercase select-none">Todos</span>
                        </div>
                      </div>
                    </th>
                    <th className="px-4 py-3">Lead Time (Días)</th>
                    <th className="px-4 py-3">Factor Variabilidad</th>
                    <th className="px-4 py-3">MOQ (Mínimo Compra)</th>
                    <th className="px-4 py-3 pr-6 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredConfigItems.map(({ product, variant, variantIndex }) => {
                    const form = configForms[variant.id];
                    if (!form) return null;
                    const isChanged = JSON.stringify(form) !== JSON.stringify(variant.ddmrp || { isDecoupled: false, leadTimeDays: 7, variabilityFactor: 0.5, moq: 1 });
                    
                    return (
                      <tr key={`${variant.id}-${product.id}`} className="hover:bg-muted/10">
                        <td className="px-4 py-3 pl-6">
                          <p className="font-semibold text-slate-900 text-sm leading-tight">{product.title}</p>
                          <p className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded w-max mt-1">
                            {variant.sku} {variant.title !== "Default Title" ? `- ${variant.title}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input 
                            type="checkbox" 
                            checked={form.isDecoupled}
                            onChange={e => setConfigForms(prev => ({...prev, [variant.id]: {...form, isDecoupled: e.target.checked}}))}
                            className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input 
                            type="number" 
                            min={1} 
                            value={form.leadTimeDays}
                            onChange={e => setConfigForms(prev => ({...prev, [variant.id]: {...form, leadTimeDays: parseInt(e.target.value)||1}}))}
                            className="w-24 h-8 text-xs font-semibold"
                            disabled={!form.isDecoupled}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select 
                            value={form.variabilityFactor}
                            onChange={e => setConfigForms(prev => ({...prev, [variant.id]: {...form, variabilityFactor: parseFloat(e.target.value)}}))}
                            className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white h-8 font-semibold text-slate-700"
                            disabled={!form.isDecoupled}
                          >
                            <option value={0.2}>Baja (0.2)</option>
                            <option value={0.5}>Media (0.5)</option>
                            <option value={0.8}>Alta (0.8)</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <Input 
                            type="number" 
                            min={1} 
                            value={form.moq}
                            onChange={e => setConfigForms(prev => ({...prev, [variant.id]: {...form, moq: parseInt(e.target.value)||1}}))}
                            className="w-24 h-8 text-xs font-semibold"
                            disabled={!form.isDecoupled}
                          />
                        </td>
                        <td className="px-4 py-3 pr-6 text-right">
                          {isChanged && (
                            <Button 
                              size="sm" 
                              onClick={() => handleSaveConfig(product.id, variantIndex, variant.id)}
                              disabled={savingConfig === variant.id}
                              className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs shadow-sm font-semibold gap-1.5"
                            >
                              {savingConfig === variant.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Guardar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
