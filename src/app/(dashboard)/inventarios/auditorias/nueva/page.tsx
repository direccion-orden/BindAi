"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Save, Trash2, ListChecks, Calculator } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";

interface Warehouse {
  id: string;
  name: string;
}

interface AuditedItem {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  currentStock: number;
  physicalCount: number;
  unitCost: number;
}

export default function NuevaAuditoriaPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [vendors, setVendors] = useState<{id: string, name: string}[]>([]);
  
  const [warehouseId, setWarehouseId] = useState("");
  const [auditName, setAuditName] = useState("");
  const [notes, setNotes] = useState("");
  
  const [filterCategory, setFilterCategory] = useState("");
  const [filterVendor, setFilterVendor] = useState("");
  const [isRandomSample, setIsRandomSample] = useState(false);
  const [sampleSize, setSampleSize] = useState(10);
  
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<AuditedItem[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const unsubW = onSnapshot(query(collection(db, "companies", companyId, "warehouses")), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    const unsubC = onSnapshot(query(collection(db, "companies", companyId, "categories")), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    const unsubV = onSnapshot(query(collection(db, "companies", companyId, "vendors")), (snap) => {
      setVendors(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    return () => { unsubW(); unsubP(); unsubC(); unsubV(); };
  }, [companyId]);

  const getFilteredProducts = (term: string) => {
    if (!term) return [];
    return products.filter(p => 
      p.title.toLowerCase().includes(term.toLowerCase()) || 
      p.variants.some(v => v.sku.toLowerCase().includes(term.toLowerCase()) || v.barcode?.includes(term))
    );
  };

  const handleAddItem = (product: ShopifyProduct, variant: any) => {
    const exists = items.find(m => m.variantId === variant.id);
    if (!exists) {
      const inv = variant.inventoryByWarehouse || {};
      const stock = warehouseId ? (inv[warehouseId] || 0) : 0;

      setItems(prev => [{
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : "",
        currentStock: stock,
        physicalCount: stock, // Default to expected
        unitCost: variant.cost || 0
      }, ...prev]);
    }
    setSearch("");
  };

  const loadAllProducts = () => {
    if (!warehouseId) {
      alert("Selecciona un almacén primero.");
      return;
    }
    
    // Only load products that actually have stock in this warehouse to avoid massive empty lists,
    // or load all of them? Better to load all active variants to allow counting missing items.
    const allItems: AuditedItem[] = [];
    
    let filteredProducts = products;
    if (filterCategory) {
      filteredProducts = filteredProducts.filter(p => p.categoryId === filterCategory);
    }
    if (filterVendor) {
      filteredProducts = filteredProducts.filter(p => p.vendorId === filterVendor);
    }
    
    filteredProducts.forEach(p => {
      p.variants.forEach(v => {
        const inv = v.inventoryByWarehouse || {};
        const stock = inv[warehouseId] || 0;
        
        // Skip if stock is 0 AND we are bulk loading (they can add it manually if they found hidden stock)
        if (stock !== 0) {
           allItems.push({
            productId: p.id,
            variantId: v.id,
            productName: p.title,
            variantTitle: v.title !== "Default Title" ? v.title : "",
            currentStock: stock,
            physicalCount: stock,
            unitCost: v.cost || 0
          });
        }
      });
    });

    if (isRandomSample && sampleSize > 0) {
      // Fisher-Yates shuffle for true randomness
      const shuffled = [...allItems];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setItems(shuffled.slice(0, sampleSize));
    } else {
      setItems(allItems);
    }
  };

  const updateCount = (variantId: string, value: number) => {
    setItems(prev => prev.map(m => {
      if (m.variantId === variantId) {
        return { ...m, physicalCount: Math.max(0, value) };
      }
      return m;
    }));
  };

  const removeItem = (variantId: string) => {
    setItems(prev => prev.filter(m => m.variantId !== variantId));
  };

  // Compute total discrepancy value
  const totalDiscrepancyValue = items.reduce((sum, item) => {
    const diff = item.physicalCount - item.currentStock;
    return sum + (diff * item.unitCost);
  }, 0);

  const handleSave = async () => {
    if (!companyId || !warehouseId) {
      alert("Selecciona el almacén.");
      return;
    }
    if (!auditName.trim()) {
      alert("Dale un nombre o referencia a esta auditoría.");
      return;
    }
    if (items.length === 0) {
      alert("Debes agregar productos para auditar.");
      return;
    }
    
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const auditId = crypto.randomUUID();
      const warehouseName = warehouses.find(w => w.id === warehouseId)?.name || "";
      const now = new Date().toISOString();

      // Only process items that ACTUALLY have a discrepancy
      const discrepantItems = items.filter(i => i.physicalCount !== i.currentStock);

      // 1. Create Audit Record
      const auditRef = doc(db, "companies", companyId, "inventory_counts", auditId);
      batch.set(auditRef, {
        id: auditId,
        name: auditName,
        warehouseId,
        warehouseName,
        notes,
        itemsCount: items.length, // total items audited
        discrepantItemsCount: discrepantItems.length,
        totalDiscrepancy: totalDiscrepancyValue,
        items: items.map(m => ({
          productId: m.productId,
          variantId: m.variantId,
          productName: m.productName + (m.variantTitle ? ` - ${m.variantTitle}` : ''),
          expected: m.currentStock,
          counted: m.physicalCount,
          diff: m.physicalCount - m.currentStock
        })),
        createdAt: now,
        createdBy: user?.email || "Unknown"
      });

      if (discrepantItems.length > 0) {
        // 2. Create ONE global Adjustment Record linking to this Audit
        const adjustmentId = crypto.randomUUID();
        const adjRef = doc(db, "companies", companyId, "inventory_adjustments", adjustmentId);
        batch.set(adjRef, {
          id: adjustmentId,
          warehouseId,
          warehouseName,
          type: totalDiscrepancyValue >= 0 ? 'IN' : 'OUT', // Generalized direction
          reason: `Conteo Físico: ${auditName}`,
          notes: `Generado automáticamente por auditoría ${auditId}`,
          itemsCount: discrepantItems.length,
          items: discrepantItems.map(m => ({
            productId: m.productId,
            variantId: m.variantId,
            productName: m.productName + (m.variantTitle ? ` - ${m.variantTitle}` : ''),
            quantity: Math.abs(m.physicalCount - m.currentStock),
            isSurplus: m.physicalCount > m.currentStock
          })),
          createdAt: now,
          createdBy: user?.email || "Unknown",
          auditId: auditId
        });

        // 3. Process Inventory Updates and Transactions
        const itemsByProduct = discrepantItems.reduce((acc, item) => {
          if (!acc[item.productId]) acc[item.productId] = [];
          acc[item.productId].push(item);
          return acc;
        }, {} as Record<string, AuditedItem[]>);

        for (const [productId, productItems] of Object.entries(itemsByProduct)) {
          const prodRef = doc(db, "companies", companyId, "products", productId);
          const prodSnap = await getDoc(prodRef);
          if (!prodSnap.exists()) continue;

          const productData = prodSnap.data() as ShopifyProduct;
          const updatedVariants = [...productData.variants];

          for (const item of productItems) {
            const diff = item.physicalCount - item.currentStock;
            if (diff === 0) continue;

            const variantIndex = updatedVariants.findIndex(v => v.id === item.variantId);
            if (variantIndex > -1) {
              const v = updatedVariants[variantIndex];
              const inv = { ...(v.inventoryByWarehouse || {}) };
              
              // Force the absolute value that was counted
              inv[warehouseId] = item.physicalCount;
              updatedVariants[variantIndex] = { ...v, inventoryByWarehouse: inv };
            }

            // Transaction Ledger
            const txType = diff > 0 ? 'IN' : 'OUT';
            const txRef = doc(db, "companies", companyId, "inventory_transactions", crypto.randomUUID());
            const txData: any = {
              type: txType,
              productId: item.productId,
              productName: item.productName + (item.variantTitle ? ` - ${item.variantTitle}` : ''),
              quantity: Math.abs(diff),
              referenceId: adjustmentId,
              reason: `Auditoría: ${auditName}`,
              createdAt: now,
              createdBy: user?.email || "Unknown"
            };
            
            if (txType === 'OUT') {
              txData.fromWarehouseId = warehouseId;
            } else {
              txData.toWarehouseId = warehouseId;
            }

            batch.set(txRef, txData);
          }
          
          batch.update(prodRef, { variants: updatedVariants });
        }
      }

      await batch.commit();
      router.push("/inventarios/auditorias");
    } catch (error) {
      console.error(error);
      alert("Error al guardar la auditoría.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/inventarios/auditorias">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva Auditoría</h1>
          <p className="text-muted-foreground">Realiza un conteo físico y el sistema ajustará las diferencias.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Column: Form Setup */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Datos del Conteo</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Referencia / Título *</label>
              <Input 
                value={auditName}
                onChange={e => setAuditName(e.target.value)}
                placeholder="Ej. Conteo Pasillo A, Cierre Mensual..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Almacén a Auditar *</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={warehouseId}
                onChange={e => {
                  setWarehouseId(e.target.value);
                  setItems([]); // Clear items if warehouse changes
                }}
              >
                <option value="" disabled>Selecciona un almacén...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Notas</label>
              <Input 
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
             <h3 className="font-semibold border-b pb-2">Carga Masiva (Filtros)</h3>
             <p className="text-xs text-muted-foreground">Carga todos los productos con existencias en este almacén. Usa los filtros para hacer conteos cíclicos por partes.</p>
             
             <div className="space-y-3 pt-2">
               <div>
                 <label className="text-[11px] font-bold text-muted-foreground uppercase">Categoría</label>
                 <select 
                   className="w-full border rounded-md px-3 py-1.5 text-sm bg-background mt-1"
                   value={filterCategory}
                   onChange={e => setFilterCategory(e.target.value)}
                 >
                   <option value="">Todas las categorías</option>
                   {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                 </select>
               </div>
               <div>
                 <label className="text-[11px] font-bold text-muted-foreground uppercase">Proveedor</label>
                 <select 
                   className="w-full border rounded-md px-3 py-1.5 text-sm bg-background mt-1"
                   value={filterVendor}
                   onChange={e => setFilterVendor(e.target.value)}
                 >
                   <option value="">Todos los proveedores</option>
                   {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                 </select>
               </div>
             </div>

             <div className="pt-2 border-t mt-2">
               <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                 <input 
                   type="checkbox" 
                   checked={isRandomSample}
                   onChange={e => setIsRandomSample(e.target.checked)}
                   className="rounded text-indigo-600 focus:ring-indigo-500"
                 />
                 Muestra Aleatoria (Conteo Cíclico)
               </label>
               {isRandomSample && (
                 <div className="mt-2 flex items-center gap-2">
                   <span className="text-xs text-muted-foreground">Cantidad de SKUs:</span>
                   <Input 
                     type="number" 
                     min={1}
                     className="w-20 h-8 text-sm"
                     value={sampleSize}
                     onChange={e => setSampleSize(parseInt(e.target.value) || 10)}
                   />
                 </div>
               )}
             </div>

             <Button 
              variant="outline" 
              className="w-full gap-2 text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 mt-2"
              onClick={loadAllProducts}
              disabled={!warehouseId}
            >
              <ListChecks className="w-4 h-4" /> Cargar Lista
            </Button>
          </div>
        </div>

        {/* Right Column: Items */}
        <div className="md:col-span-3">
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[600px]">
            <div className="p-5 border-b flex justify-between items-center bg-muted/10">
              <h3 className="font-semibold text-lg">Hoja de Conteo Físico</h3>
              <div className="flex flex-col text-right">
                <span className="text-xs text-muted-foreground font-medium">{items.length} SKUs a verificar</span>
                <span className={`text-sm font-bold ${totalDiscrepancyValue === 0 ? 'text-muted-foreground' : totalDiscrepancyValue > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                  Diferencia Neta: {totalDiscrepancyValue > 0 ? '+' : ''}${totalDiscrepancyValue.toLocaleString('es-MX', {minimumFractionDigits:2})}
                </span>
              </div>
            </div>
            
            <div className="p-5 border-b bg-muted/30 relative">
               <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Escanear código o buscar producto individual..." 
                    className="pl-9 bg-background"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={!warehouseId}
                  />
                </div>
                {search && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                    {getFilteredProducts(search).map(product => (
                      product.variants.map(variant => (
                        <div key={variant.id} className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm">
                          <div>
                            <div className="font-medium">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={() => handleAddItem(product, variant)}
                            disabled={items.some(i => i.variantId === variant.id)}
                          >
                            Añadir a lista
                          </Button>
                        </div>
                      ))
                    ))}
                  </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/30 text-muted-foreground text-xs uppercase sticky top-0 border-b z-10">
                  <tr>
                    <th className="px-4 py-3">Producto / SKU</th>
                    <th className="px-4 py-3 text-center">Esperado (Sistema)</th>
                    <th className="px-4 py-3 text-center w-32">Conteo Físico</th>
                    <th className="px-4 py-3 text-center">Diferencia</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        <Calculator className="w-8 h-8 mb-3 opacity-20 mx-auto" />
                        <p>Busca productos o usa la Carga Masiva para empezar el conteo.</p>
                      </td>
                    </tr>
                  ) : (
                    items.map(item => {
                      const diff = item.physicalCount - item.currentStock;
                      const isDiscrepancy = diff !== 0;
                      
                      return (
                        <tr key={item.variantId} className={isDiscrepancy ? 'bg-orange-50/30' : ''}>
                          <td className="px-4 py-3">
                            <p className="font-medium">{item.productName}</p>
                            {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-muted text-muted-foreground font-mono text-xs">
                              {item.currentStock}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Input 
                              type="number" 
                              min={0} 
                              value={item.physicalCount === 0 && item.physicalCount.toString() === "" ? "" : item.physicalCount}
                              onChange={(e) => updateCount(item.variantId, parseInt(e.target.value) || 0)}
                              className={`h-8 text-center font-bold ${isDiscrepancy ? 'border-orange-300 focus-visible:ring-orange-400' : ''}`}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {diff === 0 ? (
                              <span className="text-muted-foreground">-</span>
                            ) : diff > 0 ? (
                              <span className="text-emerald-600 font-bold">+{diff}</span>
                            ) : (
                              <span className="text-destructive font-bold">{diff}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.variantId)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-5 border-t bg-muted/10 flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Los productos con diferencia generarán movimientos de ajuste automáticos.
              </div>
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || items.length === 0 || !warehouseId || !auditName.trim()}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Guardar Auditoría
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
