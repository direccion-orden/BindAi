"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Save, Trash2, User, Package, FolderOpen, Building2, BookOpen, MessageSquare } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";
import { Client } from "@/app/(dashboard)/clientes/page";
import { getNextSequence } from "@/lib/firebase/counters";
import { calculateOrderTotals, EngineItem, EngineDiscount } from "@/lib/utils/discountEngine";
import { Percent, FileText } from "lucide-react";
import { DocumentPaymentsTab } from "@/components/payments/DocumentPaymentsTab";

interface OrderItem {
  lineKey?: string;
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  quantity: number;
  unitPrice: number | string;
  discountPercentage: number;
  imageUrl?: string;
  categoryIds?: string[];
  isService?: boolean;
  description?: string;
  comment?: string;
  showComment?: boolean;
}

export default function NuevoPedidoPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  
  // New Client State
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  
  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const [availableDiscounts, setAvailableDiscounts] = useState<EngineDiscount[]>([]);
  const [enteredPromoCode, setEnteredPromoCode] = useState("");

  const [globalDiscountType, setGlobalDiscountType] = useState<"percentage" | "fixed_amount" | "none">("none");
  const [globalDiscountValue, setGlobalDiscountValue] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("detalle");

  // Mobile/Live View States
  const [mobileViewMode, setMobileViewMode] = useState<"clasica" | "live">("clasica");
  const [liveTab, setLiveTab] = useState<"products" | "services">("products");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [variantUsageMap, setVariantUsageMap] = useState<Record<string, number>>({});
  const [customPrices, setCustomPrices] = useState<Record<string, number | string>>({});
  const [editingPriceVariantId, setEditingPriceVariantId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;

    // Fetch Clients
    const unsubC = onSnapshot(query(collection(db, "companies", companyId, "clients")), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });

    // Fetch Products
    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    // Fetch Projects
    const unsubProj = onSnapshot(query(collection(db, "companies", companyId, "projects")), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch Locations (Branches)
    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          name: data.name || data.Name || "Sucursal sin nombre",
          address: data.address || data.Address || ""
        };
      }));
    });

    // Fetch Accounts (Ingresos)
    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const ingresosAcc = allAcc.filter((a: any) => a.type === "INGRESOS" && a.level >= 2);
      setAccounts(ingresosAcc);
      const targetAcc = allAcc.find((a: any) => a.code === "401.1");
      if (targetAcc) {
        setAccountId(targetAcc.id);
      }
    });

    // Fetch Warehouses
    const unsubW = onSnapshot(query(collection(db, "companies", companyId, "warehouses")), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch Discounts
    const unsubD = onSnapshot(query(collection(db, "companies", companyId, "discounts"), where("status", "==", "active")), (snap) => {
      setAvailableDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as EngineDiscount)));
    });

    // Fetch orders to compute variant frequency usage
    const unsubO = onSnapshot(collection(db, "companies", companyId, "pedidos"), (snap) => {
      const usage: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.items && Array.isArray(data.items)) {
          data.items.forEach((item: any) => {
            if (item.variantId) {
              const qty = Number(item.quantity) || 1;
              usage[item.variantId] = (usage[item.variantId] || 0) + qty;
            }
          });
        }
      });
      setVariantUsageMap(usage);
    });

    return () => { unsubC(); unsubP(); unsubProj(); unsubLoc(); unsubAcc(); unsubW(); unsubD(); unsubO(); };
  }, [companyId]);

  const getFilteredClients = () => {
    if (!clientSearch) return [];
    const term = clientSearch.toLowerCase();
    return clients.filter(c => {
      const nameVal = (c.LegalName || c.CommercialName || c.name || "").toLowerCase();
      const rfcVal = (c.RFC || c.rfc || "").toLowerCase();
      return nameVal.includes(term) || rfcVal.includes(term);
    });
  };

  const getFilteredProducts = () => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p => 
      p.title.toLowerCase().includes(term) || 
      p.variants.some(v => v.sku.toLowerCase().includes(term) || v.barcode?.includes(term))
    );
  };

  const handleSelectClient = (c: Client) => {
    setClientId(c.id);
    const clientName = c.LegalName || c.CommercialName || c.name || "Cliente sin nombre";
    setClientSearch(clientName);
    setProjectId("");
    setIsCreatingProject(false);
    setNewProjectName("");
  };

  const handleAddProduct = (product: ShopifyProduct, variant: any) => {
    const isService = !!product.isService || variant.sku?.startsWith("SER-");
    const customPrice = customPrices[variant.id];
    const finalPrice = customPrice !== undefined ? customPrice : (variant.price || 0);
    
    if (isService) {
      const lineKey = crypto.randomUUID();
      setItems([...items, { 
        lineKey,
        productId: product.id, 
        variantId: variant.id, 
        productName: product.title, 
        variantTitle: variant.title !== "Default Title" ? variant.title : "", 
        quantity: 1, 
        unitPrice: finalPrice,
        discountPercentage: 0,
        imageUrl: product.images?.[0]?.src || "",
        categoryIds: [
          ...(product.productType ? [product.productType] : []),
          ...(product.tags || [])
        ],
        isService: true,
        description: product.bodyHtml || product.title || "",
        comment: "",
        showComment: false
      }]);
    } else {
      const exists = items.find(i => i.variantId === variant.id);
      if (!exists) {
        setItems([...items, { 
          productId: product.id, 
          variantId: variant.id, 
          productName: product.title, 
          variantTitle: variant.title !== "Default Title" ? variant.title : "", 
          quantity: 1, 
          unitPrice: finalPrice,
          discountPercentage: 0,
          imageUrl: product.images?.[0]?.src || "",
          categoryIds: [
            ...(product.productType ? [product.productType] : []),
            ...(product.tags || [])
          ],
          isService: false,
          description: "",
          comment: "",
          showComment: false
        }]);
      } else {
        setItems(prev => prev.map(item => item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
    }
    setProductSearch("");
  };

  const updateItem = (lineKeyOrVariantId: string, field: keyof OrderItem, value: any) => {
    setItems(prev => prev.map(item => {
      const matchKey = item.lineKey || item.variantId;
      if (matchKey === lineKeyOrVariantId) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const removeItem = (lineKeyOrVariantId: string) => {
    setItems(prev => prev.filter(i => (i.lineKey || i.variantId) !== lineKeyOrVariantId));
  };

  // Calculations via Engine
  const engineItems: EngineItem[] = items.map(i => ({
    id: i.lineKey || i.variantId,
    quantity: i.quantity,
    unitPrice: Number(i.unitPrice) || 0,
    manualDiscountPercentage: i.discountPercentage,
    categoryIds: i.categoryIds || []
  }));

  const totals = calculateOrderTotals(
    engineItems,
    availableDiscounts,
    enteredPromoCode,
    globalDiscountType,
    globalDiscountValue
  );

  const handleSave = async () => {
    if (!companyId) return;
    
    let finalClientId = clientId;
    let finalClientName = "";

    if (isNewClient) {
      if (!newClientName || !newClientPhone) {
        alert("El Nombre y Teléfono son obligatorios para crear un cliente nuevo.");
        return;
      }
      finalClientName = newClientName;
    } else {
      if (!finalClientId) {
        alert("Selecciona un cliente válido.");
        return;
      }
      const client = clients.find(c => c.id === finalClientId);
      finalClientName = client ? (client.LegalName || client.CommercialName || client.name || "Desconocido") : "Desconocido";
    }

    if (items.length === 0) {
      alert("Agrega al menos un producto al pedido.");
      return;
    }
    
    if (!locationId || !warehouseId) {
      alert("Debes seleccionar una Sucursal y un Almacén.");
      return;
    }

    setSaving(true);
    try {
      if (isNewClient) {
        finalClientId = crypto.randomUUID();
        const clientRef = doc(db, "companies", companyId, "clients", finalClientId);
        await setDoc(clientRef, {
          id: finalClientId,
          name: newClientName,
          phone: newClientPhone,
          email: "",
          createdAt: new Date().toISOString()
        });
      }

      let finalProjectId = projectId;
      let finalProjectName = projectId ? projects.find(p => p.id === projectId)?.name : null;

      if (isCreatingProject) {
        if (!newProjectName) {
          alert("El nombre del proyecto es obligatorio.");
          setSaving(false);
          return;
        }
        finalProjectId = crypto.randomUUID();
        finalProjectName = newProjectName;

        const projectRef = doc(db, "companies", companyId, "projects", finalProjectId);
        await setDoc(projectRef, {
          id: finalProjectId,
          name: newProjectName,
          clientId: finalClientId,
          createdAt: new Date().toISOString()
        });
      }

      const orderId = crypto.randomUUID();
      const orderNumber = await getNextSequence(companyId, 'pedidos');

      const targetAcc = accounts.find(a => a.code === "401.1");
      const finalAccountId = targetAcc?.id || accountId || "";
      const finalAccountCode = targetAcc?.code || "401.1";
      const finalAccountName = targetAcc?.name || "Ventas Nacionales";

      const orderRef = doc(db, "companies", companyId, "pedidos", orderId);
      await setDoc(orderRef, {
        id: orderId,
        orderNumber,
        quoteNumber: null, // Direct order
        clientId: finalClientId,
        clientName: finalClientName,
        items: items.map(item => ({
          ...item,
          lineKey: item.lineKey || item.variantId
        })),
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        promoCode: totals.appliedPromo?.code || null,
        globalDiscountType,
        globalDiscountValue,
        globalDiscountAmount: totals.globalDiscountTotal,
        tax: totals.tax,
        totalAmount: totals.total,
        projectId: finalProjectId || null,
        projectName: finalProjectName,
        locationId,
        locationName: locations.find(l => l.id === locationId)?.name || "",
        warehouseId,
        warehouseName: warehouses.find(w => w.id === warehouseId)?.name || "",
        accountId: finalAccountId,
        accountCode: finalAccountCode,
        accountName: finalAccountName,
        status: "por_surtir", 
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Unknown"
      });

      alert(`Pedido ${orderNumber} creado exitosamente.`);
      router.push("/ventas/pedidos");
    } catch (error) {
      console.error(error);
      alert("Error al guardar el pedido");
    } finally {
      setSaving(false);
    }
  };

  // Dynamic categories extraction from products (productType and tags)
  const categoriesRaw = Array.from(
    new Set(
      products.flatMap(p => [
        ...(p.productType ? [p.productType] : []),
        ...(p.tags || [])
      ])
    )
  ).filter(Boolean) as string[];

  // Calculate usage count of each category based on variantUsageMap
  const categoryUsageMap: Record<string, number> = {};
  categoriesRaw.forEach(cat => {
    categoryUsageMap[cat] = 0;
  });

  products.forEach(p => {
    const pCats = [
      ...(p.productType ? [p.productType] : []),
      ...(p.tags || [])
    ].filter(Boolean);
    
    p.variants.forEach(v => {
      const usage = variantUsageMap[v.id] || 0;
      pCats.forEach(cat => {
        if (categoryUsageMap[cat] !== undefined) {
          categoryUsageMap[cat] += usage;
        }
      });
    });
  });

  // Sort categories by usage count descending (most used first)
  const categories = [...categoriesRaw].sort((a, b) => (categoryUsageMap[b] || 0) - (categoryUsageMap[a] || 0));

  // Flatten products and variants to selectable cards, with usage counts and service classification
  const selectableItems = products.flatMap(product => 
    product.variants.map(variant => {
      const isService = !!product.isService || variant.sku?.startsWith("SER-") || product.productType?.toLowerCase().includes("servicio") || product.tags?.some(t => t.toLowerCase().includes("servicio"));
      const usageCount = variantUsageMap[variant.id] || 0;
      return {
        product,
        variant,
        isService,
        usageCount,
        id: `${product.id}-${variant.id}`
      };
    })
  );

  // Sort by frequency of use: most used first (usageCount descending)
  const sortedSelectableItems = [...selectableItems].sort((a, b) => b.usageCount - a.usageCount);

  // Filter based on liveTab ("products" | "services") and selectedCategory
  const filteredSelectableItems = sortedSelectableItems.filter(item => {
    // 1. Service/Product filter
    if (liveTab === "products" && item.isService) return false;
    if (liveTab === "services" && !item.isService) return false;

    // 2. Category filter
    if (selectedCategory !== "all") {
      const itemCategories = [
        ...(item.product.productType ? [item.product.productType] : []),
        ...(item.product.tags || [])
      ];
      if (!itemCategories.includes(selectedCategory)) return false;
    }
    return true;
  });

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/ventas/pedidos">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nuevo Pedido Directo</h1>
          <p className="text-muted-foreground">Crea un pedido de venta sin necesidad de cotización.</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b mb-1 px-4 gap-2 bg-card rounded-t-xl border-t border-x pt-2 shrink-0">
        <button 
          onClick={() => setActiveTab("detalle")} 
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === 'detalle' ? 'bg-background border-t border-x border-slate-200 text-indigo-600 font-bold -mb-[1px]' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Detalle
        </button>
        <button 
          onClick={() => setActiveTab("pagos")} 
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === 'pagos' ? 'bg-background border-t border-x border-slate-200 text-indigo-600 font-bold -mb-[1px]' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Pagos
        </button>
        <button 
          onClick={() => setActiveTab("archivos")} 
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === 'archivos' ? 'bg-background border-t border-x border-slate-200 text-indigo-600 font-bold -mb-[1px]' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Archivos
        </button>
        <button 
          onClick={() => setActiveTab("relacionados")} 
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === 'relacionados' ? 'bg-background border-t border-x border-slate-200 text-indigo-600 font-bold -mb-[1px]' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <span className="hidden sm:inline">Documentos relacionados</span>
          <span className="sm:hidden">Docs</span>
        </button>
      </div>

      {activeTab === "detalle" && (
        <>
          {/* Mobile View Selector */}
          <div className="md:hidden flex items-center justify-between bg-card border rounded-xl p-3 shadow-sm mb-4">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Modo de Vista</span>
            <div className="flex bg-slate-100 p-1 rounded-lg border">
              <button 
                type="button"
                onClick={() => setMobileViewMode("clasica")} 
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${mobileViewMode === "clasica" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Clásica
              </button>
              <button 
                type="button"
                onClick={() => setMobileViewMode("live")} 
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${mobileViewMode === "live" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Live
              </button>
            </div>
          </div>

          <div className={mobileViewMode === "live" ? "hidden md:block" : "block"}>
          {/* Top Header Card: Datos Generales */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
          <User className="w-4 h-4 text-indigo-600" />
          Datos Generales del Pedido
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          {/* Column 1: Client search or new client inputs */}
          {isNewClient ? (
            <div className="space-y-3 bg-blue-50/30 p-3 rounded-lg border border-blue-100 col-span-1">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-blue-900">Nuevo Cliente</label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-1 text-[10px] text-blue-600 font-semibold hover:bg-blue-50"
                  onClick={() => {
                    setIsNewClient(false);
                    setIsCreatingProject(false);
                    setNewProjectName("");
                  }}
                >
                  Buscar Existente
                </Button>
              </div>
              <div className="space-y-1">
                <Input 
                  placeholder="Nombre del Cliente *" 
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="bg-white border-blue-200 h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Input 
                  placeholder="Teléfono *" 
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="bg-white border-blue-200 h-8 text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 relative col-span-1">
              <div className="flex justify-between items-center h-5">
                <label className="text-xs font-medium text-slate-500 uppercase">Cliente *</label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-1 text-[10px] text-blue-600 font-semibold hover:bg-blue-50"
                  onClick={() => {
                    setIsNewClient(true);
                    setIsCreatingProject(false);
                    setNewProjectName("");
                  }}
                >
                  + Nuevo Cliente
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-muted-foreground" />
                <Input 
                  placeholder="Buscar cliente (Nombre o RFC)..." 
                  className="pl-8 bg-background h-8 text-xs"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    if (clientId) setClientId(""); 
                  }}
                />
              </div>
              {!clientId && clientSearch && (
                <div className="absolute top-full left-0 right-0 mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y z-50 shadow-xl">
                  {getFilteredClients().map(c => (
                    <div 
                      key={c.id} 
                      className="p-2 hover:bg-muted/50 cursor-pointer text-xs" 
                      onClick={() => handleSelectClient(c)}
                    >
                      <div className="font-medium text-slate-900">{c.LegalName || c.CommercialName || c.name || "Cliente sin nombre"}</div>
                      {(c.RFC || c.rfc) && <div className="text-[10px] text-slate-500">RFC: {c.RFC || c.rfc}</div>}
                    </div>
                  ))}
                  {getFilteredClients().length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground text-center">No se encontraron clientes</div>
                  )}
                </div>
              )}
              {(() => {
                  const selectedClient = clients.find(c => c.id === clientId);
                  return selectedClient && (
                    <div className="mt-1.5 p-2 bg-blue-50/50 border border-blue-100 rounded text-[11px]">
                      <p className="font-semibold text-blue-900 line-clamp-1">{selectedClient.LegalName || selectedClient.CommercialName || selectedClient.name}</p>
                      <p className="text-blue-700/80 text-[10px] mt-0.5 line-clamp-1">{selectedClient.Email || selectedClient.email || 'Sin email'}</p>
                    </div>
                  );
              })()}
            </div>
          )}

          {/* Column 2: Sucursal */}
          <div className="space-y-2 col-span-1">
            <div className="flex items-center h-5">
              <label className="text-xs font-medium text-slate-500 uppercase">Sucursal *</label>
            </div>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
            >
              <option value="" disabled>Selecciona una sucursal...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Column 3: Almacén */}
          <div className="space-y-2 col-span-1">
            <div className="flex items-center h-5">
              <label className="text-xs font-medium text-slate-500 uppercase">Almacén *</label>
            </div>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona un almacén...</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Column 4: Proyecto */}
          <div className="space-y-2 col-span-1">
            <div className="flex justify-between items-center h-5">
              <label className="text-xs font-medium text-slate-500 uppercase">Proyecto (Opcional)</label>
              {(isNewClient || clientId) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-1 text-[10px] text-blue-600 font-semibold hover:bg-blue-50"
                  onClick={() => setIsCreatingProject(true)}
                >
                  + Crear Proyecto
                </Button>
              )}
            </div>
            {isCreatingProject ? (
              <div className="space-y-2 bg-blue-50/30 p-2.5 rounded-lg border border-blue-100 mt-1">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-bold text-blue-900 uppercase">Nuevo Proyecto</label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-4 px-1 text-[9px] text-blue-600 font-semibold hover:bg-blue-50"
                    onClick={() => {
                      setIsCreatingProject(false);
                      setNewProjectName("");
                    }}
                  >
                    Buscar Existente
                  </Button>
                </div>
                <Input 
                  placeholder="Nombre del Proyecto *" 
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="bg-white border-blue-200 h-8 text-xs font-semibold"
                />
              </div>
            ) : (
              <select 
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                disabled={isNewClient || !clientId}
              >
                <option value="">Ninguno</option>
                {!isNewClient && clientId && projects.filter(p => p.clientId === clientId).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Left Column: Items */}
        
          <div className="bg-card border rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                <Package className="w-5 h-5 text-indigo-600" /> Partidas del Pedido
              </h3>
              <span className="text-sm text-slate-500 font-medium">{items.length} productos</span>
            </div>
            
            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Package className="w-12 h-12 mb-3 opacity-20" />
                  <p>Busca y agrega los productos al pedido.</p>
                </div>
              ) : (
                items.map((item, idx) => (
                  <div key={item.lineKey || item.variantId || idx} className="flex flex-col p-4 border rounded-lg bg-background gap-3 shadow-sm relative">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 flex items-start gap-3">
                        <div className="w-12 h-12 rounded bg-slate-100 flex-shrink-0 overflow-hidden border">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-6 h-6 m-auto mt-3 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1">
                          {item.isService ? (
                            <textarea
                              value={item.description || ""}
                              onChange={(e) => updateItem(item.lineKey || item.variantId, 'description', e.target.value)}
                              placeholder="Descripción del servicio..."
                              className="w-full text-xs font-semibold border rounded p-1.5 bg-background resize-y"
                              rows={2}
                            />
                          ) : (
                            <>
                              <p className="font-bold">{item.productName}</p>
                              {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 justify-end">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Cant.
                          </label>
                          <Input 
                            type="number" 
                            min={1} 
                            value={item.quantity}
                            onChange={(e) => updateItem(item.lineKey || item.variantId, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-20 text-center font-bold"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Precio U.
                          </label>
                          <Input 
                            type="number" 
                            min={0} 
                            step={0.01}
                            value={item.unitPrice === 0 ? "" : item.unitPrice}
                            onFocus={() => {
                              if (item.unitPrice === 0 || item.unitPrice === "0") {
                                updateItem(item.lineKey || item.variantId, 'unitPrice', "");
                              }
                            }}
                            onBlur={() => {
                              if (item.unitPrice === "") {
                                updateItem(item.lineKey || item.variantId, 'unitPrice', 0);
                              }
                            }}
                            onChange={(e) => updateItem(item.lineKey || item.variantId, 'unitPrice', e.target.value)}
                            className="w-24 text-right font-medium"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Desc %
                          </label>
                          <Input 
                            type="number" 
                            min={0}
                            max={100}
                            value={item.discountPercentage}
                            onChange={(e) => updateItem(item.lineKey || item.variantId, 'discountPercentage', parseFloat(e.target.value) || 0)}
                            className="w-20 text-center text-emerald-600 font-bold"
                          />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[80px] text-right">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Importe</label>
                          <p className="font-bold text-slate-800">
                            ${(item.quantity * Number(item.unitPrice) * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 mt-4 sm:mt-0">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`${item.comment || item.showComment ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700' : 'text-muted-foreground hover:text-indigo-600'}`}
                            onClick={() => updateItem(item.lineKey || item.variantId, 'showComment', !item.showComment)}
                            title="Agregar nota/comentario"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.lineKey || item.variantId)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    {(item.showComment || item.comment) && (
                      <div className="pt-2 border-t border-slate-100">
                        <Input
                          placeholder="Escribe una nota o comentario sobre esta partida..."
                          value={item.comment || ""}
                          onChange={(e) => updateItem(item.lineKey || item.variantId, 'comment', e.target.value)}
                          className="text-xs bg-muted/30 border-slate-200"
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-5 border-t bg-muted/30 relative">
               <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar producto (SKU, nombre, código)..." 
                    className="pl-9 bg-background"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                {productSearch && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                    {getFilteredProducts().map(product => (
                      product.variants.map(variant => (
                        <div 
                          key={variant.id} 
                          className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm cursor-pointer"
                          onClick={() => {
                            const isService = !!product.isService || variant.sku?.startsWith("SER-");
                            if (isService || !items.some(i => i.variantId === variant.id)) {
                              handleAddProduct(product, variant);
                            }
                          }}
                        >
                          <div>
                            <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-slate-500">SKU: {variant.sku} | Precio Base: ${variant.price?.toLocaleString('es-MX', {minimumFractionDigits:2}) || '0.00'}</div>
                          </div>
                          {items.some(i => i.variantId === variant.id) && !variant.sku?.startsWith("SER-") && !product.isService && (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Agregado</span>
                          )}
                        </div>
                      ))
                    ))}
                    {getFilteredProducts().length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">No se encontraron productos</div>
                    )}
                  </div>
                )}
            </div>
          </div>
        

        {/* Right Column: Totals & Actions */}
        
          <div className="bg-card border rounded-xl shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-base border-b pb-2 flex items-center gap-2 text-slate-800">
              Resumen y Totales
            </h3>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 justify-end items-end w-full">
                <div className="flex flex-col items-end space-y-1 w-48">
                  <label className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5"/> Descuento Global
                  </label>
                  <div className="flex gap-2 w-full justify-end">
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={globalDiscountType}
                      onChange={(e) => {
                        setGlobalDiscountType(e.target.value as any);
                        setGlobalDiscountValue(0);
                      }}
                    >
                      <option value="none">Ninguno</option>
                      <option value="percentage">%</option>
                      <option value="fixed_amount">$</option>
                    </select>
                    {globalDiscountType !== "none" && (
                      <Input
                        type="number"
                        min={0}
                        max={globalDiscountType === "percentage" ? 100 : undefined}
                        step={globalDiscountType === "percentage" ? 1 : 0.01}
                        placeholder={globalDiscountType === "percentage" ? "10" : "100.00"}
                        value={globalDiscountValue || ""}
                        onChange={(e) => setGlobalDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="h-9 text-sm w-20 shrink-0"
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end space-y-1 w-48">
                  <label className="text-xs font-semibold text-indigo-700 flex items-center gap-1 mb-1">
                    <Percent className="w-3.5 h-3.5"/> Código Promocional
                  </label>
                  <Input 
                    value={enteredPromoCode}
                    onChange={(e) => setEnteredPromoCode(e.target.value.toUpperCase())}
                    placeholder="Ej. VERANO20"
                    className="h-9 text-sm font-mono uppercase w-full text-right pr-3"
                  />
                  {totals.error && enteredPromoCode && (
                    <p className="text-[10px] text-red-500 mt-1 font-medium text-right w-full">{totals.error}</p>
                  )}
                  {totals.appliedPromo && (
                    <p className="text-[10px] text-emerald-600 mt-1 font-medium flex items-center gap-1 justify-end w-full">
                      ✓ Aplicado: {totals.appliedPromo.title || totals.appliedPromo.code}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-4 space-y-2 border-t mt-4 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-semibold">${totals.subtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Descuento</span>
                    <span className="font-semibold text-emerald-600">-${totals.totalDiscount.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>IVA (16%)</span>
                  <span className="font-semibold">${totals.tax.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between text-lg pt-2 border-t mt-2 font-bold text-slate-800">
                  <span>TOTAL</span>
                  <span className="font-black text-blue-700">${totals.total.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </div>

              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || items.length === 0 || (!isNewClient && !clientId) || (isNewClient && (!newClientName || !newClientPhone)) || !locationId || !accountId}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 mt-6"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Guardar Pedido Directo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {mobileViewMode === "live" && (
        <div className="md:hidden space-y-4 pb-24">
          {/* Compact Datos Generales */}
          <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b pb-1.5">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" /> Datos del Pedido
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2 relative">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cliente *</label>
                {isNewClient ? (
                  <div className="bg-blue-50/30 p-2 rounded-lg border border-blue-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[10px] text-blue-900">Nuevo Cliente</span>
                      <button type="button" onClick={() => setIsNewClient(false)} className="text-[10px] text-indigo-600 font-bold">Buscar Existente</button>
                    </div>
                    <Input 
                      placeholder="Nombre *" 
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs font-medium"
                    />
                    <Input 
                      placeholder="Teléfono *" 
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      className="bg-white border-blue-200 h-8 text-xs font-medium"
                    />
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input 
                        placeholder="Buscar cliente..." 
                        className="pl-8 bg-background h-8 text-xs font-semibold"
                        value={clientSearch}
                        onChange={(e) => {
                          setClientSearch(e.target.value);
                          if (clientId) setClientId(""); 
                        }}
                      />
                    </div>
                    {!clientId && clientSearch && (
                      <div className="absolute top-full left-0 right-0 mt-1 border rounded-md max-h-40 overflow-y-auto bg-background divide-y z-50 shadow-xl">
                        {getFilteredClients().map(c => (
                          <div 
                            key={c.id} 
                            className="p-2 hover:bg-muted/50 cursor-pointer text-xs" 
                            onClick={() => handleSelectClient(c)}
                          >
                            <div className="font-bold text-slate-900">{c.LegalName || c.CommercialName || c.name || "Cliente sin nombre"}</div>
                            {(c.RFC || c.rfc) && <div className="text-[9px] text-slate-500">RFC: {c.RFC || c.rfc}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const selectedClient = clients.find(c => c.id === clientId);
                      return selectedClient && (
                        <div className="mt-1.5 p-1 px-2 bg-blue-50/50 border border-blue-100 rounded text-[10px] flex justify-between items-center">
                          <span className="font-bold text-blue-900 truncate">{selectedClient.LegalName || selectedClient.CommercialName || selectedClient.name}</span>
                          <button type="button" onClick={() => setIsNewClient(true)} className="text-indigo-600 font-bold shrink-0 ml-2">+ Nuevo Cliente</button>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Sucursal *</label>
                <select 
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-semibold"
                  value={locationId}
                  onChange={e => setLocationId(e.target.value)}
                >
                  <option value="" disabled>Selecciona...</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Almacén *</label>
                <select 
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-semibold"
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                >
                  <option value="" disabled>Selecciona...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Toggle Productos / Servicios */}
          <div className="flex bg-slate-100 p-1 rounded-xl border">
            <button
              type="button"
              onClick={() => { setLiveTab("products"); setSelectedCategory("all"); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${liveTab === "products" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              <Package className="w-4 h-4" /> Productos
            </button>
            <button
              type="button"
              onClick={() => { setLiveTab("services"); setSelectedCategory("all"); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${liveTab === "services" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              <BookOpen className="w-4 h-4" /> Servicios
            </button>
          </div>

          {/* Categorías Scrolling List */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none shrink-0 -mx-4 px-4">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`px-3 py-1.5 text-xs font-bold rounded-full border whitespace-nowrap transition-all shrink-0 ${selectedCategory === "all" ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 border-slate-200"}`}
              >
                Todos
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full border whitespace-nowrap transition-all shrink-0 ${selectedCategory === cat ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 border-slate-200"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Grid of Selectable Items */}
          {filteredSelectableItems.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 border rounded-xl">
              <Package className="w-10 h-10 mx-auto text-slate-300 mb-2 opacity-50" />
              <p className="text-xs text-slate-500 font-medium">No hay {liveTab === "products" ? "productos" : "servicios"} en esta categoría.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {filteredSelectableItems.map(item => {
                const qtyInOrder = items.filter(i => i.variantId === item.variant.id).reduce((sum, i) => sum + i.quantity, 0);
                const isEditingPrice = editingPriceVariantId === item.variant.id;
                const displayPrice = customPrices[item.variant.id] !== undefined 
                  ? customPrices[item.variant.id] 
                  : (item.variant.price || 0);
                const numericDisplayPrice = Number(displayPrice) || 0;

                // Dynamic font size for service names to make it fit completely
                const nameLen = item.product.title.length + (item.variant.title !== "Default Title" ? item.variant.title.length : 0);
                const nameFontSizeClass = item.isService 
                  ? (nameLen > 40 ? "text-[7.5px]" : nameLen > 25 ? "text-[8.5px]" : "text-[9.5px]")
                  : "text-[9px]";

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (!isEditingPrice) {
                        handleAddProduct(item.product, item.variant);
                      }
                    }}
                    className="flex flex-col bg-card border rounded-xl overflow-hidden relative active:scale-95 transition-all text-left shadow-sm hover:border-slate-300"
                  >
                    <div className="aspect-square w-full bg-slate-50 relative overflow-hidden flex items-center justify-center border-b">
                      {item.product.images?.[0]?.src ? (
                        <img 
                          src={item.product.images[0].src} 
                          alt={item.product.title} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-5 h-5 text-slate-300" />
                      )}
                      {qtyInOrder > 0 && (
                        <span className="absolute top-1 right-1 bg-indigo-600 text-white font-extrabold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md animate-scaleIn">
                          {qtyInOrder}
                        </span>
                      )}
                    </div>
                    <div className="p-1.5 flex flex-col justify-between flex-1 min-h-[64px]">
                      <p className={`${nameFontSizeClass} font-bold text-slate-800 leading-tight uppercase tracking-tight break-words ${item.isService ? 'overflow-visible line-clamp-none' : 'line-clamp-2'}`}>
                        {item.product.title} {item.variant.title !== "Default Title" ? `(${item.variant.title})` : ""}
                      </p>
                      <div 
                        className="mt-1"
                        onClick={(e) => {
                          if (item.isService) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {item.isService ? (
                          isEditingPrice ? (
                            <input
                              type="number"
                              autoFocus
                              className="w-full text-[10px] font-bold border border-indigo-400 rounded px-1 py-0.5 bg-white text-slate-900 outline-none"
                              value={displayPrice === 0 || displayPrice === "0" ? "" : displayPrice}
                              onChange={(e) => {
                                setCustomPrices(prev => ({ ...prev, [item.variant.id]: e.target.value }));
                              }}
                              onBlur={() => {
                                if (customPrices[item.variant.id] === "") {
                                  setCustomPrices(prev => ({ ...prev, [item.variant.id]: 0 }));
                                }
                                setEditingPriceVariantId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setEditingPriceVariantId(null);
                                }
                              }}
                            />
                          ) : (
                            <div 
                              className="text-[9px] font-black text-indigo-600 border-b border-dashed border-indigo-400 pb-0.5 inline-block cursor-pointer hover:text-indigo-800"
                              onClick={() => {
                                setEditingPriceVariantId(item.variant.id);
                                if (numericDisplayPrice === 0) {
                                  setCustomPrices(prev => ({ ...prev, [item.variant.id]: "" }));
                                }
                              }}
                            >
                              ${numericDisplayPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </div>
                          )
                        ) : (
                          <p className="text-[10px] font-black text-slate-900">
                            ${numericDisplayPrice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Floating Bottom Bar (Sticky Bottom Bar) */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t p-3 flex justify-between items-center z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider">{items.length} Partidas</p>
              <p className="text-base font-black text-blue-700">${totals.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMobileViewMode("clasica"); setActiveTab("detalle"); }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors"
              >
                Detalle ({items.length})
              </button>
              <Button 
                onClick={handleSave} 
                disabled={saving || items.length === 0 || (!isNewClient && !clientId) || (isNewClient && (!newClientName || !newClientPhone)) || !locationId || !accountId}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-1.5 h-8 rounded-lg shadow-md"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )}

      {activeTab === "pagos" && (
        <div className="bg-white border rounded-xl shadow-sm p-6">
          <DocumentPaymentsTab 
            document={null} 
            documentType="pedido" 
            companyId={companyId || ""} 
          />
        </div>
      )}

      {activeTab === "archivos" && (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-400">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-slate-800 mb-1">Archivos</p>
          <p className="text-xs">Próximamente en el siguiente sprint.</p>
        </div>
      )}

      {activeTab === "relacionados" && (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-slate-800 mb-1">Documentos relacionados</p>
          <p className="text-xs">Próximamente en el siguiente sprint.</p>
        </div>
      )}

    </div>
  );
}
