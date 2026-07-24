"use client";

import React, { useState, useEffect, Suspense } from "react";
import { collection, query, onSnapshot, doc, setDoc, getDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Save, Trash2, User, Package, FolderOpen, Truck, Building2, BookOpen, MessageSquare, Copy } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";
import { Client } from "@/app/(dashboard)/clientes/page";
import { getNextSequence } from "@/lib/firebase/counters";
import { calculateOrderTotals, EngineItem, EngineDiscount } from "@/lib/utils/discountEngine";
import { DocumentPaymentsTab } from "@/components/payments/DocumentPaymentsTab";
import { QuickClientModal } from "@/components/pos/QuickClientModal";
import { FileText, Percent } from "lucide-react";
import { getLocalDateString, getClientDisplayName, matchesClientFilter } from "@/lib/utils";
import { calculateDueDate, getClientCurrentDebt, validateClientCreditLimit } from "@/lib/utils/creditUtils";


interface OrderItem {
  lineKey?: string;
  productId: string;
  variantId: string;
  id?: string;
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

function NuevaRemisionContent() {
  const { companyId, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const copyFromId = searchParams ? searchParams.get("copyFrom") : null;
  const [copiedSourceNumber, setCopiedSourceNumber] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientCreditInfo, setClientCreditInfo] = useState<{ totalDebt: number; creditLimit: number; creditDays: number; hasCredit: boolean; remainingCredit: number } | null>(null);
  
  // New Client State
  const [showQuickClient, setShowQuickClient] = useState(false);

  const [appliedDate, setAppliedDate] = useState(getLocalDateString());

  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState("");

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

    // Fetch Warehouses
    const unsubW = onSnapshot(query(collection(db, "companies", companyId, "warehouses")), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubD = onSnapshot(query(collection(db, "companies", companyId, "discounts"), where("status", "==", "active")), (snap) => {
      setAvailableDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as EngineDiscount)));
    });

    return () => { unsubC(); unsubP(); unsubProj(); unsubLoc(); unsubAcc(); unsubD(); unsubW(); };
  }, [companyId]);

  // Load copyFrom remission data if parameter is present
  useEffect(() => {
    if (!companyId || !copyFromId) return;

    const loadSourceRemission = async () => {
      try {
        const docRef = doc(db, "companies", companyId, "remisiones", copyFromId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const sourceData = snap.data();
          setCopiedSourceNumber(sourceData.remissionNumber || "original");

          if (sourceData.clientId) {
            setClientId(sourceData.clientId);
            setClientSearch(sourceData.clientName || "");
          }
          if (sourceData.locationId) setLocationId(sourceData.locationId);
          if (sourceData.warehouseId) setWarehouseId(sourceData.warehouseId);
          if (sourceData.projectId) setProjectId(sourceData.projectId);
          if (sourceData.globalDiscountType) setGlobalDiscountType(sourceData.globalDiscountType);
          if (sourceData.globalDiscountValue) setGlobalDiscountValue(sourceData.globalDiscountValue);

          if (Array.isArray(sourceData.items)) {
            setItems(sourceData.items.map((item: any) => ({
              ...item,
              lineKey: item.lineKey || crypto.randomUUID()
            })));
          }
        }
      } catch (e) {
        console.error("Error al cargar datos de remisión a copiar:", e);
      }
    };

    loadSourceRemission();
  }, [companyId, copyFromId]);

  const getFilteredClients = () => {
    if (!clientSearch) return [];
    return clients.filter(c => matchesClientFilter(c, clientSearch));
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
    const clientName = getClientDisplayName(c);
    setClientSearch(clientName);
    setProjectId("");
    setIsCreatingProject(false);
    setNewProjectName("");
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

  const selectedClient = clients.find(c => c.id === clientId);

  const handleSave = async () => {
    if (!companyId) return;
    
    if (!clientId) {
      alert("Selecciona un cliente válido.");
      return;
    }

    if (items.length === 0) {
      alert("Agrega al menos un producto a la remisión.");
      return;
    }

    if (!locationId || !warehouseId) {
      alert("Debes seleccionar una Sucursal y un Almacén.");
      return;
    }

    const client = clients.find(c => c.id === clientId);
    if (client && (client.hasCreditLine || (client.creditLimit && client.creditLimit > 0))) {
      const creditCheck = await validateClientCreditLimit(companyId, client, totals.total);
      if (!creditCheck.allowed) {
        alert(`⛔ CRÉDITO INSICIENTE / TOPADO:\n\n${creditCheck.message}`);
        return;
      }
    }

    if (!window.confirm("¿Estás seguro de generar la remisión directa? Esto descontará el inventario del almacén inmediatamente.")) {
      return;
    }

    setSaving(true);
    try {
      const finalClientId = clientId;
      const finalClientName = client ? (client.LegalName || client.CommercialName || client.name || "Desconocido") : "Desconocido";
      
      let finalProjectId = projectId;
      let finalProjectName = projectId ? (projects.find(p => p.id === projectId)?.name || null) : null;

      if (isCreatingProject) {
        if (!newProjectName.trim()) {
          alert("El nombre del nuevo proyecto es obligatorio.");
          setSaving(false);
          return;
        }
        finalProjectId = crypto.randomUUID();
        finalProjectName = newProjectName.trim();

        const projectRef = doc(db, "companies", companyId, "projects", finalProjectId);
        await setDoc(projectRef, {
          id: finalProjectId,
          name: finalProjectName,
          clientId: finalClientId,
          clientName: finalClientName,
          status: "activo",
          createdAt: new Date().toISOString()
        });
      }

      const remId = crypto.randomUUID();
      const remNumber = await getNextSequence(companyId, 'remisiones');

      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
      const appliedISO = new Date(`${appliedDate}T${hours}:${minutes}:${seconds}.${milliseconds}`).toISOString();

      const creditDays = Number(client?.creditDays || 0);
      const calculatedDueDate = calculateDueDate(appliedDate, creditDays);

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
        items: items.map(i => ({
          ...i,
          unitPrice: Number(i.unitPrice) || 0
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
        creditDays,
        dueDate: calculatedDueDate,
        status: "activa", 
        createdAt: appliedISO,
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
            createdAt: appliedISO
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

      {copiedSourceNumber && (
        <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 px-4 py-3 rounded-xl text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <Copy className="w-4 h-4 text-indigo-600 shrink-0 font-bold" />
            <span>
              Copiando datos de la <strong>Remisión #{copiedSourceNumber}</strong>. Puedes modificar clientes, partidas o precios antes de guardar.
            </span>
          </div>
          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded">
            Copia Editable
          </span>
        </div>
      )}

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
        <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
          <User className="w-4 h-4 text-emerald-600" />
          Datos Generales de la Remisión
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
          {/* Column 1: Client search */}
          <div className="space-y-2 relative col-span-1">
            <div className="flex justify-between items-center h-5">
              <label className="text-xs font-medium text-slate-500 uppercase">Cliente *</label>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 px-1 text-[10px] text-blue-600 font-semibold hover:bg-blue-50"
                onClick={() => setShowQuickClient(true)}
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
                  setClientId("");
                }}
              />
            </div>

            {/* Date Input */}
            <div className="mt-3 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Fecha Aplicada</label>
              <Input 
                type="date"
                value={appliedDate}
                onChange={(e) => setAppliedDate(e.target.value)}
                className="bg-background h-8 text-xs font-medium border-slate-200"
              />
            </div>

            {!clientId && clientSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y z-50 shadow-xl">
                {clients
                  .filter(c => (c.name || "").toLowerCase().includes(clientSearch.toLowerCase()) || (c.rfc || "").toLowerCase().includes(clientSearch.toLowerCase()))
                  .map(c => (
                    <div 
                      key={c.id} 
                      className="p-2 hover:bg-muted/50 cursor-pointer text-xs" 
                      onClick={() => {
                        setClientId(c.id);
                        setClientSearch(getClientDisplayName(c));
                      }}
                    >
                      <div className="font-medium text-slate-900">{getClientDisplayName(c)}</div>
                      {(c.rfc || c.RFC || c.taxId) && <div className="text-[10px] text-slate-500">RFC: {c.rfc || c.RFC || c.taxId}</div>}
                    </div>
                  ))}
                  {clients.filter(c => matchesClientFilter(c, clientSearch)).length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground text-center">No se encontraron clientes</div>
                  )}
                </div>
              )}
              {(() => {
                  const selectedClient = clients.find(c => c.id === clientId);
                  if (!selectedClient) return null;
                  const hasCredit = Boolean(selectedClient.hasCreditLine || (selectedClient.creditLimit && selectedClient.creditLimit > 0));
                  const dueDateCalculated = hasCredit && selectedClient.creditDays ? calculateDueDate(appliedDate, selectedClient.creditDays) : appliedDate;

                  return (
                    <div className="mt-2 space-y-1.5">
                      <div className="p-2 bg-emerald-50/50 border border-emerald-100 rounded text-[11px]">
                        <p className="font-semibold text-emerald-900 line-clamp-1">{getClientDisplayName(selectedClient)}</p>
                        <p className="text-emerald-700/80 text-[10px] mt-0.5 line-clamp-1">{selectedClient.Email || selectedClient.email || 'Sin email'}</p>
                      </div>

                      {hasCredit ? (
                        <div className="p-2 bg-indigo-50/80 border border-indigo-100 rounded text-[10px] space-y-1">
                          <div className="flex items-center justify-between font-bold text-indigo-900">
                            <span>💳 Línea de Crédito:</span>
                            <span>${(selectedClient.creditLimit || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex items-center justify-between text-indigo-700">
                            <span>Plazo Vencimiento:</span>
                            <span className="font-bold">{selectedClient.creditDays || 0} días ({dueDateCalculated})</span>
                          </div>
                        </div>
                      ) : (
                        <div className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-500 italic">
                          Cliente de contado (Sin línea de crédito asignada)
                        </div>
                      )}
                    </div>
                  );
              })()}
            </div>


          {/* Column 2: Sucursal */}
          <div className="space-y-2 col-span-1">
            <div className="flex items-center h-5">
              <label className="text-xs font-medium text-slate-500 uppercase">Sucursal (Origen) *</label>
            </div>
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

          {/* Column 3: Almacén */}
          <div className="space-y-2 col-span-1">
            <div className="flex items-center h-5">
              <label className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                Almacén *
              </label>
            </div>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={warehouseId}
              onChange={e => setWarehouseId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona almacén...</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>


          {/* Column 4: Proyecto */}
          <div className="space-y-2 col-span-1">
            <div className="flex justify-between items-center h-5">
              <label className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
                <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
                Proyecto (Opcional)
              </label>
              {clientId && (
                <Button 
                  type="button"
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
                    type="button"
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
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm disabled:opacity-50"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                disabled={!clientId}
              >
                <option value="">Ninguno</option>
                {clientId && projects.filter(p => p.clientId === clientId).map(p => (

                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Column 5: Fecha de Aplicación */}
          <div className="space-y-2 col-span-1">
            <div className="flex items-center h-5">
              <label className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
                Fecha de Aplicación *
              </label>
            </div>
            <Input 
              type="date"
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={appliedDate}
              onChange={e => setAppliedDate(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Left Column: Line Items */}
        
          <div className="bg-card border rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                <Truck className="w-5 h-5 text-indigo-600" />
                Mercancía a Entregar
              </h3>
              <span className="text-sm text-slate-500 font-medium">{items.length} partidas</span>
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
                    className="h-9 text-sm font-mono uppercase bg-white w-full text-right pr-3"
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
                  <span className="font-black text-emerald-700">${totals.total.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </div>
              
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || items.length === 0 || !clientId || !locationId || !accountId}

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
      {showQuickClient && (
        <QuickClientModal 
          initialSearch={clientSearch}
          existingClients={clients}
          onClose={() => setShowQuickClient(false)}
          onClientCreated={(client) => {
            setClientId(client.id);
            setClientSearch(client.name);
            setShowQuickClient(false);
          }}
        />
      )}
    </div>
  );
}

export default function NuevaRemisionPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>}>
      <NuevaRemisionContent />
    </Suspense>
  );
}

