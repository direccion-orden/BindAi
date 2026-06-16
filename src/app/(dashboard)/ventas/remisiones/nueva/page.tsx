"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, getDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Save, Trash2, User, Package, FolderOpen, Truck, Building2, BookOpen, MessageSquare } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";
import { Client } from "@/app/(dashboard)/clientes/page";
import { getNextSequence } from "@/lib/firebase/counters";
import { calculateOrderTotals, EngineItem, EngineDiscount } from "@/lib/utils/discountEngine";
import { DocumentPaymentsTab } from "@/components/payments/DocumentPaymentsTab";
import { FileText } from "lucide-react";
import { Percent } from "lucide-react";

interface OrderItem {
  lineKey?: string;
  productId: string;
  variantId: string;
  id?: string;
  productName: string;
  variantTitle: string;
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
  imageUrl?: string;
  categoryIds?: string[];
  isService?: boolean;
  description?: string;
  comment?: string;
  showComment?: boolean;
}

export default function NuevaRemisionPage() {
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

  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");

  const [availableDiscounts, setAvailableDiscounts] = useState<EngineDiscount[]>([]);
  const [enteredPromoCode, setEnteredPromoCode] = useState("");

  const [globalDiscountType, setGlobalDiscountType] = useState<"percentage" | "fixed_amount" | "none">("none");
  const [globalDiscountValue, setGlobalDiscountValue] = useState<number>(0);

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("detalle");

  useEffect(() => {
    if (!companyId) return;

    const unsubC = onSnapshot(query(collection(db, "companies", companyId, "clients")), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });

    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    const unsubProj = onSnapshot(query(collection(db, "companies", companyId, "projects")), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

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

    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(allAcc.filter((a: any) => a.type === "INGRESOS" && a.level >= 2));
      const targetAcc = allAcc.find((a: any) => a.code === "401.1");
      if (targetAcc) {
        setAccountId(targetAcc.id);
      }
    });

    const unsubD = onSnapshot(query(collection(db, "companies", companyId, "discounts"), where("status", "==", "active")), (snap) => {
      setAvailableDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as EngineDiscount)));
    });

    return () => { unsubC(); unsubP(); unsubProj(); unsubLoc(); unsubAcc(); unsubD(); };
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
  };

  const handleAddProduct = (product: ShopifyProduct, variant: any) => {
    const isService = !!product.isService || variant.sku?.startsWith("SER-");

    if (isService) {
      const lineKey = crypto.randomUUID();
      setItems([...items, { 
        lineKey,
        productId: product.id, 
        variantId: variant.id, 
        productName: product.title, 
        variantTitle: variant.title !== "Default Title" ? variant.title : "", 
        quantity: 1, 
        unitPrice: variant.price || 0,
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
          unitPrice: variant.price || 0,
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
        setItems(items.map(item => item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item));
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
    unitPrice: i.unitPrice,
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

  const selectedClient = clients.find(c => c.id === clientId);

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
      alert("Agrega al menos un producto a la remisión.");
      return;
    }

    if (!locationId) {
      alert("Debes seleccionar una Sucursal.");
      return;
    }

    if (!window.confirm("¿Estás seguro de generar la remisión directa? Esto descontará el inventario del almacén inmediatamente.")) {
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

      const remId = crypto.randomUUID();
      const remNumber = await getNextSequence(companyId, 'remisiones');

      const targetAcc = accounts.find(a => a.code === "401.1");
      const finalAccountId = targetAcc?.id || accountId || "";
      const finalAccountCode = targetAcc?.code || "401.1";
      const finalAccountName = targetAcc?.name || "Ventas Nacionales";

      const remRef = doc(db, "companies", companyId, "remisiones", remId);
      await setDoc(remRef, {
        id: remId,
        remissionNumber: remNumber,
        orderId: null, // Direct remission
        orderNumber: null,
        clientId: finalClientId,
        clientName: finalClientName,
        items: items,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        promoCode: totals.appliedPromo?.code || null,
        globalDiscountType,
        globalDiscountValue,
        globalDiscountAmount: totals.globalDiscountTotal,
        tax: totals.tax,
        totalAmount: totals.total,
        projectId: projectId || null,
        projectName: projectId ? (projects.find(p => p.id === projectId)?.name || null) : null,
        locationId,
        locationName: locations.find(l => l.id === locationId)?.name || "",
        accountId: finalAccountId,
        accountCode: finalAccountCode,
        accountName: finalAccountName,
        status: "activa", 
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Unknown"
      });

      // Inventory Deduction Logic
      for (const item of items) {
        const productRef = doc(db, "companies", companyId, "products", item.productId);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          const updatedVariants = productData.variants?.map((v: any) => {
            if (v.id === (item.variantId || item.id)) {
              return { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) };
            }
            return v;
          });
          
          await updateDoc(productRef, { variants: updatedVariants });
          
          // Generate Inventory Movement record
          const movId = crypto.randomUUID();
          await setDoc(doc(db, "companies", companyId, "inventory_movements", movId), {
            id: movId,
            productId: item.productId,
            variantId: item.variantId || item.id || "",
            type: "OUT",
            quantity: item.quantity,
            reason: `Remisión Directa ${remNumber}`,
            referenceId: remId,
            createdAt: new Date().toISOString()
          });
        }
      }

      alert(`Remisión ${remNumber} generada exitosamente. Inventario descontado.`);
      router.push("/ventas/remisiones");
    } catch (error) {
      console.error(error);
      alert("Error al generar la remisión.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/ventas/remisiones">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva Remisión Directa</h1>
          <p className="text-muted-foreground">Crea una entrega de mercancía sin necesidad de pedido previo.</p>
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
          Documentos relacionados
        </button>
      </div>

      {activeTab === "detalle" && (
        <>
          {/* Top Header Card: Datos Generales */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-sm text-indigo-950 flex items-center gap-2 border-b pb-2">
          <User className="w-4 h-4 text-emerald-600" />
          Datos Generales de la Remisión
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {/* Column 1: Client search or new client inputs */}
          {isNewClient ? (
            <div className="space-y-3 bg-emerald-50/30 p-3 rounded-lg border border-emerald-100 col-span-1">
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-emerald-900">Nuevo Cliente</label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-1 text-[10px] text-emerald-600 font-semibold hover:bg-emerald-50"
                  onClick={() => setIsNewClient(false)}
                >
                  Buscar Existente
                </Button>
              </div>
              <div className="space-y-1">
                <Input 
                  placeholder="Nombre del Cliente *" 
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="bg-white border-emerald-200 h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Input 
                  placeholder="Teléfono *" 
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  className="bg-white border-emerald-200 h-8 text-xs"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 relative col-span-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-slate-500 uppercase">Cliente *</label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-1 text-[10px] text-emerald-600 font-semibold hover:bg-emerald-50"
                  onClick={() => setIsNewClient(true)}
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
              {selectedClient && (
                <div className="mt-1.5 p-2 bg-emerald-50/50 border border-emerald-100 rounded text-[11px]">
                  <p className="font-semibold text-emerald-900 line-clamp-1">{selectedClient.LegalName || selectedClient.CommercialName || selectedClient.name}</p>
                  <p className="text-emerald-700/80 text-[10px] mt-0.5 line-clamp-1">{selectedClient.Email || selectedClient.email || 'Sin email'}</p>
                </div>
              )}
            </div>
          )}

          {/* Column 2: Sucursal */}
          <div className="space-y-2 col-span-1">
            <label className="text-xs font-medium text-slate-500 uppercase">Sucursal (Origen) *</label>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona sucursal...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>


          {/* Column 4: Proyecto */}
          <div className="space-y-2 col-span-1">
            <label className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
              Proyecto (Opcional)
            </label>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm disabled:opacity-50"
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              disabled={isNewClient || !clientId}
            >
              <option value="">Ninguno</option>
              {projects.filter(p => p.clientId === clientId).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Left Column: Line Items */}
        
          <div className="bg-card border rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-blue-50/30">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-900">
                <Truck className="w-5 h-5 text-blue-600" />
                Mercancía a Entregar
              </h3>
              <span className="text-sm text-blue-700 font-medium">{items.length} partidas</span>
            </div>
            
            <div className="p-5 border-b bg-muted/30 relative">
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
                            <div className="text-xs text-slate-500">SKU: {variant.sku} | Stock Actual: {variant.stock || 0}</div>
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

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Truck className="w-12 h-12 mb-3 opacity-20" />
                  <p>Busca y agrega los productos a entregar.</p>
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
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cant.</label>
                          <Input 
                            type="number" 
                            min={1} 
                            value={item.quantity}
                            onChange={(e) => updateItem(item.lineKey || item.variantId, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-20 text-center font-bold"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Precio U.</label>
                          <Input 
                            type="number" 
                            min={0} 
                            step={0.01}
                            value={item.unitPrice}
                            onChange={(e) => updateItem(item.lineKey || item.variantId, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-24 text-right font-medium"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Desc %</label>
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
                            ${(item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
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
          </div>
        

        {/* Right Column: Totals & Actions */}
        
          <div className="bg-card border rounded-xl shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-base border-b pb-2 flex items-center gap-2 text-slate-800">
              Resumen y Totales
            </h3>

            <div className="space-y-3">
              <div className="space-y-1">
                 <label className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5"/> Descuento Global
                 </label>
                 <div className="flex gap-2">
                   <select
                     className="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                     value={globalDiscountType}
                     onChange={(e) => {
                       setGlobalDiscountType(e.target.value as any);
                       setGlobalDiscountValue(0);
                     }}
                   >
                     <option value="none">Ninguno</option>
                     <option value="percentage">Porcentaje (%)</option>
                     <option value="fixed_amount">Monto ($)</option>
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
                       className="h-9 text-sm"
                     />
                   )}
                 </div>
              </div>

              <div className="space-y-1 pt-2">
                 <label className="text-xs font-semibold text-indigo-700 flex items-center gap-1 mb-1">
                    <Percent className="w-3.5 h-3.5"/> Código Promocional
                 </label>
                 <Input 
                    value={enteredPromoCode}
                    onChange={(e) => setEnteredPromoCode(e.target.value.toUpperCase())}
                    placeholder="Ej. VERANO20"
                    className="h-9 text-sm font-mono uppercase bg-white"
                 />
                 {totals.error && enteredPromoCode && (
                   <p className="text-[10px] text-red-500 mt-1 font-medium">{totals.error}</p>
                 )}
                 {totals.appliedPromo && (
                   <p className="text-[10px] text-emerald-600 mt-1 font-medium flex items-center gap-1">
                     ✓ Aplicado: {totals.appliedPromo.title || totals.appliedPromo.code}
                   </p>
                 )}
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
                  <span className="font-black text-emerald-700">${totals.total.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </div>
              
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || items.length === 0 || (!isNewClient && !clientId) || (isNewClient && (!newClientName || !newClientPhone)) || !locationId || !accountId}
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 mt-6 text-white"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Generar Remisión Directa
              </Button>
            </div>
          </div>
        </div>
      </>
      )}

      {activeTab === "pagos" && (
        <div className="bg-white border rounded-xl shadow-sm p-6">
          <DocumentPaymentsTab 
            document={null} 
            documentType="remision" 
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
