"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Package, ArrowLeft, Save, Edit2, Trash2, Search, Truck, FileText, CheckCircle2, XCircle, DollarSign, Percent, MessageSquare, ChevronDown, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProcessOrderModal } from "./ProcessOrderModal";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { getNextSequence } from "@/lib/firebase/counters";
import { calculateOrderTotals, EngineDiscount, EngineItem } from "@/lib/utils/discountEngine";
import { FolderOpen } from "lucide-react";
import { DocumentPaymentsTab } from "@/components/payments/DocumentPaymentsTab";

export default function PedidoDetallePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = React.use(paramsPromise);
  const { companyId } = useAuth();
  const router = useRouter();
  
  const [order, setOrder] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isItemsModified, setIsItemsModified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("detalle");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [orderDate, setOrderDate] = useState("");
  
  const [products, setProducts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [availableDiscounts, setAvailableDiscounts] = useState<EngineDiscount[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [relatedDocs, setRelatedDocs] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId || !params.id) return;

    const unsubOrder = onSnapshot(doc(db, "companies", companyId, "pedidos", params.id), (d) => {
      if (d.exists()) {
        const data = d.data();
        setOrder({ id: d.id, ...data });
        if (data.createdAt) {
          setOrderDate(data.createdAt.split('T')[0]);
        }
      }
      setLoading(false);
    });

    // Fetch related remisiones
    const remsQuery = query(collection(db, "companies", companyId, "remisiones"), where("orderId", "==", params.id));
    const unsubRems = onSnapshot(remsQuery, (snap) => {
      const rems = snap.docs.map(d => ({ ...d.data(), type: 'Remisión', docType: 'remision' }));
      setRelatedDocs(prev => {
        const others = prev.filter(d => d.docType !== 'remision');
        return [...others, ...rems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
    });

    // Fetch related facturas
    const factsQuery = query(collection(db, "companies", companyId, "facturas"), where("orderId", "==", params.id));
    const unsubFacts = onSnapshot(factsQuery, (snap) => {
      const facts = snap.docs.map(d => ({ ...d.data(), type: 'Factura', docType: 'factura' }));
      setRelatedDocs(prev => {
        const others = prev.filter(d => d.docType !== 'factura');
        return [...others, ...facts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });
    });

    return () => {
      unsubOrder();
      unsubRems();
      unsubFacts();
    };
  }, [companyId, params.id]);

  useEffect(() => {
    if (isEditing && products.length === 0 && companyId) {
      getDocs(collection(db, "companies", companyId, "products")).then(snap => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      getDocs(collection(db, "companies", companyId, "projects")).then(snap => {
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      getDocs(collection(db, "companies", companyId, "locations")).then(snap => {
        setLocations(snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || data.Name || "Sucursal sin nombre"
          };
        }));
      });
      getDocs(collection(db, "companies", companyId, "warehouses")).then(snap => {
        setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      getDocs(query(collection(db, "companies", companyId, "discounts"), where("status", "==", "active"))).then(snap => {
        setAvailableDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as EngineDiscount)));
      });
      getDocs(collection(db, "companies", companyId, "clients")).then(snap => {
        setClients(snap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.LegalName || data.CommercialName || data.ClientName || data.legalName || data.name || data.razonSocial || "Cliente sin nombre",
            rfc: data.rfc || data.Rfc || ""
          };
        }).sort((a, b) => a.name.localeCompare(b.name, "es")));
      });
    }
  }, [isEditing, companyId, products.length]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!order) {
    return <div className="p-10 text-center">Pedido no encontrado.</div>;
  }

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const sanitizedItems = (order.items || []).map((i: any) => ({
        ...i,
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
        discountPercentage: Number(i.discountPercentage) || 0
      }));

      const engineItems: EngineItem[] = sanitizedItems.map((i: any) => ({
        id: i.variantId || i.id,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        manualDiscountPercentage: i.discountPercentage || 0,
        categoryIds: i.categoryIds || []
      }));
      
      const calc = calculateOrderTotals(
        engineItems,
        availableDiscounts,
        order.promoCode || null,
        order.globalDiscountType || "none",
        order.globalDiscountValue || 0
      );

      let finalProjectId = order.projectId;
      let finalProjectName = order.projectId ? (projects.find(p => p.id === order.projectId)?.name || null) : null;

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
          clientId: order.clientId,
          createdAt: new Date().toISOString()
        });
      }

      let finalLocationName = order.locationName || "";
      if (order.locationId) {
        finalLocationName = locations.find(l => l.id === order.locationId)?.name || order.locationName || "";
      }

      let finalWarehouseName = order.warehouseName || "";
      if (order.warehouseId) {
        finalWarehouseName = warehouses.find(w => w.id === order.warehouseId)?.name || order.warehouseName || "";
      }

      const updatedOrder = {
        ...order,
        items: sanitizedItems,
        projectId: finalProjectId || null,
        projectName: finalProjectName,
        locationName: finalLocationName,
        warehouseName: finalWarehouseName,
        subtotal: calc.subtotal,
        totalDiscount: calc.totalDiscount,
        globalDiscountType: order.globalDiscountType || "none",
        globalDiscountValue: order.globalDiscountValue || 0,
        globalDiscountAmount: calc.globalDiscountTotal,
        tax: calc.tax,
        totalAmount: calc.total,
        createdAt: new Date(orderDate + "T" + (order.createdAt?.split('T')[1] || new Date().toISOString().split('T')[1])).toISOString()
      };

      await updateDoc(doc(db, "companies", companyId, "pedidos", order.id), updatedOrder);
      setIsEditing(false);
      setIsItemsModified(false);
      setOrder(updatedOrder);
      alert("Pedido actualizado correctamente.");
    } catch (e) {
      console.error(e);
      alert("Error al actualizar el pedido.");
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    setIsItemsModified(true);
    setOrder((prev: any) => ({
      ...prev,
      items: prev.items.map((item: any, idx: number) => 
        idx === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const removeItem = (index: number) => {
    setIsItemsModified(true);
    setOrder((prev: any) => ({
      ...prev,
      items: prev.items.filter((_: any, idx: number) => idx !== index)
    }));
  };

  const handleAddProduct = (product: any, variant: any) => {
    setIsItemsModified(true);
    const isService = !!product.isService || variant.sku?.startsWith("SER-");
    
    if (isService) {
      const lineKey = crypto.randomUUID();
      setOrder((prev: any) => ({
        ...prev,
        items: [...(prev.items || []), {
          lineKey,
          productId: product.id,
          variantId: variant.id,
          productName: product.title,
          variantTitle: variant.title !== "Default Title" ? variant.title : "",
          sku: variant.sku || "",
          quantity: 1,
          unitPrice: variant.price || 0,
          discountPercentage: 0,
          imageUrl: product.images?.[0]?.src || "",
          isService: true,
          description: product.bodyHtml || product.title || "",
          comment: "",
          showComment: false
        }]
      }));
    } else {
      const exists = order.items?.find((i: any) => i.variantId === variant.id);
      if (!exists) {
        setOrder((prev: any) => ({
          ...prev,
          items: [...(prev.items || []), {
            productId: product.id,
            variantId: variant.id,
            productName: product.title,
            variantTitle: variant.title !== "Default Title" ? variant.title : "",
            sku: variant.sku || "",
            quantity: 1,
            unitPrice: variant.price || 0,
            discountPercentage: 0,
            imageUrl: product.images?.[0]?.src || "",
            isService: false,
            description: "",
            comment: "",
            showComment: false
          }]
        }));
      } else {
        setOrder((prev: any) => ({
          ...prev,
          items: prev.items.map((item: any) => item.variantId === variant.id ? { ...item, quantity: (Number(item.quantity) || 0) + 1 } : item)
        }));
      }
    }
    setProductSearch("");
  };

  const getFilteredProducts = () => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p => 
      p.title.toLowerCase().includes(term) || 
      p.variants?.some((v:any) => v.sku.toLowerCase().includes(term) || v.barcode?.includes(term))
    );
  };
  
  const getFilteredClients = () => {
    const term = clientSearch.toLowerCase();
    return clients.filter(c => 
      c.name.toLowerCase().includes(term) || 
      c.rfc.toLowerCase().includes(term)
    ).slice(0, 10);
  };

  const handleCancel = async () => {
    if (!companyId) return;
    if (!window.confirm("¿Estás seguro de cancelar este pedido? Se marcará como cancelado y no podrá surtirse.")) return;
    
    setCanceling(true);
    try {
      // Release related quote if it exists
      if (order.quoteId) {
        try {
          await updateDoc(doc(db, "companies", companyId, "quotes", order.quoteId), {
            status: "negociacion",
            orderId: null
          });
        } catch (e) {
          console.warn("Failed to release related quote:", e);
        }
      }

      await updateDoc(doc(db, "companies", companyId, "pedidos", order.id), {
        status: "cancelado"
      });
      alert("Pedido cancelado exitosamente.");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("Error al cancelar el pedido.");
    } finally {
      setCanceling(false);
    }
  };

  // Helpers to update global discount in state
  const handleGlobalDiscountTypeChange = (val: string) => {
    setIsItemsModified(true);
    setOrder((prev: any) => ({
      ...prev,
      globalDiscountType: val,
      globalDiscountValue: 0
    }));
  };

  const handleGlobalDiscountValueChange = (val: number) => {
    setIsItemsModified(true);
    setOrder((prev: any) => ({
      ...prev,
      globalDiscountValue: val
    }));
  };

  // Recalc UI totals on the fly using calculateOrderTotals
  const engineItems: EngineItem[] = (order.items || []).map((i: any) => ({
    id: i.variantId || i.id,
    quantity: Number(i.quantity) || 0,
    unitPrice: Number(i.unitPrice) || 0,
    manualDiscountPercentage: Number(i.discountPercentage) || 0,
    categoryIds: i.categoryIds || []
  }));

  const calcTotals = calculateOrderTotals(
    engineItems,
    availableDiscounts,
    order.promoCode || null,
    order.globalDiscountType || "none",
    order.globalDiscountValue || 0
  );

  const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;
  const displaySubtotal = round2(isEditing || isItemsModified ? calcTotals.subtotal : (order.subtotal || calcTotals.subtotal));
  const displayDiscount = round2(isEditing || isItemsModified ? calcTotals.totalDiscount : (order.totalDiscount || calcTotals.totalDiscount));
  const displayTax = round2(isEditing || isItemsModified ? calcTotals.tax : (order.tax !== undefined ? order.tax : calcTotals.tax));
  const displayTotal = round2(isEditing || isItemsModified ? calcTotals.total : (order.totalAmount !== undefined ? order.totalAmount : calcTotals.total));

  return (
    <div className="flex flex-col space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <Link href="/ventas/pedidos">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Pedido {order.orderNumber}</h1>
              <Link href={`/pdf/pedido/${order.id}`} target="_blank">
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                  <FileText className="w-3 h-3" /> Ver PDF
                </Button>
              </Link>
            </div>
            <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> 
              Fecha: {order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {(order.status === 'por_surtir' || order.status === 'pagado') && (
            <>
              {isEditing ? null : (
                <div className="relative">
                  <Button 
                    onClick={() => setIsActionsOpen(!isActionsOpen)} 
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm"
                  >
                    Acciones <ChevronDown className="w-4 h-4" />
                  </Button>
                  {isActionsOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsActionsOpen(false)} />
                      <div className="absolute right-0 mt-2 w-56 bg-white border rounded-xl shadow-xl py-2 z-50 animate-in fade-in-50 slide-in-from-top-2 duration-100">
                        <button 
                          onClick={() => { setIsActionsOpen(false); setIsEditing(true); }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                        >
                          <Edit2 className="w-4 h-4 text-indigo-500" />
                          Editar Pedido
                        </button>
                        <button 
                          onClick={() => { setIsActionsOpen(false); setIsProcessModalOpen(true); }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                        >
                          <Truck className="w-4 h-4 text-emerald-500" />
                          Facturar / Procesar
                        </button>
                        {(order.paidAmount || 0) < displayTotal - 0.01 && (
                          <button 
                            onClick={() => { setIsActionsOpen(false); setIsPaymentModalOpen(true); }}
                            className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                          >
                            <DollarSign className="w-4 h-4 text-amber-500" />
                            Registrar Pago
                          </button>
                        )}
                        <div className="border-t my-1" />
                        <button 
                          onClick={() => { setIsActionsOpen(false); handleCancel(); }}
                          disabled={canceling}
                          className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm font-medium text-red-600 flex items-center gap-2 disabled:opacity-50"
                        >
                          {canceling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 text-red-500" />}
                          Cancelar Pedido
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {order.status === 'cancelado' && (
            <div className="px-4 py-2 bg-red-50 text-red-700 font-bold rounded-lg flex items-center gap-2">
              <XCircle className="w-5 h-5" /> Pedido Cancelado
            </div>
          )}
          {order.status === 'remisionado' && (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> Pedido Remisionado
            </div>
          )}
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
        <div className="flex justify-between items-center border-b pb-2">
          <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            Información General del Pedido
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              {order.status === 'por_surtir' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                  Por Surtir
                </span>
              )}
              {order.status === 'pagado' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  Pagado
                </span>
              )}
              {order.status === 'cancelado' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-red-50 text-red-700 border border-red-200 uppercase">
                  Cancelado
                </span>
              )}
              {order.status === 'remisionado' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                  Remisionado
                </span>
              )}
              {order.status === 'facturado' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  Facturado
                </span>
              )}
              {order.status === 'pre_facturado' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
                  Pre-Facturado
                </span>
              )}
            </div>
            <span className="text-xs font-bold text-indigo-700">
              {order.quoteNumber ? `Ref: Cotización ${order.quoteNumber}` : 'Ref: Directo / Sin cotización'}
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start pt-2">
          <div className="md:col-span-4">
            <div className="flex items-center h-5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente / Empresa</label>
            </div>
            {isEditing ? (
              <div className="relative mt-1">
                <div className="relative">
                  <Input
                    className="h-8 pr-8 text-xs font-semibold"
                    placeholder="Buscar cliente..."
                    value={clientSearch || (order.clientName || "")}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setIsClientDropdownOpen(true);
                    }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    {isClientDropdownOpen ? (
                      <ChevronDown className="w-3 h-3 text-slate-400 rotate-180 transition-transform" />
                    ) : (
                      <Search className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </div>

                {isClientDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-[60]" 
                      onClick={() => {
                        setIsClientDropdownOpen(false);
                        setClientSearch("");
                      }} 
                    />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-xl z-[70] max-h-60 overflow-y-auto overflow-x-hidden divide-y">
                      {getFilteredClients().length === 0 ? (
                        <div className="p-2 text-[10px] text-slate-500 text-center italic">
                          No se encontraron clientes
                        </div>
                      ) : (
                        getFilteredClients().map(c => (
                          <div 
                            key={c.id} 
                            className="p-2 hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => {
                              setOrder({
                                ...order,
                                clientId: c.id,
                                clientName: c.name,
                                rfc: c.rfc || ""
                              });
                              setClientSearch("");
                              setIsClientDropdownOpen(false);
                              setIsCreatingProject(false);
                            }}
                          >
                            <p className="text-[11px] font-bold text-slate-800">{c.name}</p>
                            <p className="text-[9px] text-slate-500">{c.rfc}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm font-black text-slate-800 mt-1">{order.clientName || 'Sin Cliente'}</p>
            )}
          </div>

          <div className="md:col-span-3">
            <div className="flex items-center h-5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha del Pedido</label>
            </div>
            {isEditing ? (
              <Input 
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-8 text-xs font-semibold mt-1"
              />
            ) : (
              <p className="text-sm font-black text-slate-800 mt-1">
                {order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center h-5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sucursal</label>
            </div>
            {isEditing ? (
              <select 
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm font-semibold"
                value={order.locationId || ""}
                onChange={e => setOrder({...order, locationId: e.target.value})}
              >
                <option value="">Seleccionar</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            ) : (
              <p className="font-bold text-slate-900 mt-1">{order.locationName || 'N/A'}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center h-5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Almacén</label>
            </div>
            {isEditing ? (
              <select 
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm font-semibold"
                value={order.warehouseId || ""}
                onChange={e => setOrder({...order, warehouseId: e.target.value})}
              >
                <option value="">Seleccionar</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            ) : (
              <p className="font-bold text-slate-900 mt-1">{order.warehouseName || 'N/A'}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="flex justify-between items-center h-5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyecto</label>
              {isEditing && order.clientId && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-1 text-[9px] text-blue-600 font-bold hover:bg-blue-50"
                  onClick={() => setIsCreatingProject(true)}
                >
                  + Nuevo
                </Button>
              )}
            </div>
            {isEditing ? (
              isCreatingProject ? (
                <div className="space-y-2 bg-blue-50/30 p-2 rounded-lg border border-blue-100 mt-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[9px] font-bold text-blue-900 uppercase">Nuevo Proyecto</label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-4 px-1 text-[8px] text-blue-600 font-bold hover:bg-blue-50"
                      onClick={() => {
                        setIsCreatingProject(false);
                        setNewProjectName("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                  <Input 
                    placeholder="Nombre..." 
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="bg-white border-blue-200 h-7 text-[10px] font-semibold"
                  />
                </div>
              ) : (
                <select 
                  className="mt-1 flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm font-semibold"
                  value={order.projectId || ""}
                  onChange={e => setOrder({...order, projectId: e.target.value})}
                >
                  <option value="">Ninguno</option>
                  {projects.filter(p => p.clientId === order.clientId).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )
            ) : (
              <p className="font-bold text-indigo-700 mt-1 truncate">{order.projectName || 'Ninguno'}</p>
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
              <span className="text-sm text-slate-500 font-medium">{(order.items || []).length} partidas</span>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {(!order.items || order.items.length === 0) ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Package className="w-12 h-12 mb-3 opacity-20" />
                  <p>No hay productos en este pedido.</p>
                </div>
              ) : (
                order.items.map((item: any, idx: number) => (
                  <div key={item.lineKey || (item.variantId ? `${item.variantId}-${idx}` : idx)} className="flex flex-col p-4 border rounded-lg bg-background gap-3 shadow-sm relative">
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
                          {isEditing ? (
                            item.isService ? (
                              <div className="space-y-1 w-full">
                                {item.sku && (
                                  <div>
                                    <span className="inline-block font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                      {item.sku}
                                    </span>
                                  </div>
                                )}
                                <textarea
                                  value={item.description || ""}
                                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                  placeholder="Descripción del servicio..."
                                  className="w-full text-xs font-semibold border rounded p-1.5 bg-background resize-y"
                                  rows={2}
                                />
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold">{item.productName}</p>
                                  {item.sku && (
                                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                      {item.sku}
                                    </span>
                                  )}
                                </div>
                                {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                              </>
                            )
                          ) : (
                            item.isService ? (
                              <div className="space-y-1">
                                {item.sku && (
                                  <div>
                                    <span className="inline-block font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                      {item.sku}
                                    </span>
                                  </div>
                                )}
                                <p className="font-semibold text-sm leading-tight text-foreground/90 whitespace-pre-wrap">{item.description}</p>
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-bold">{item.productName}</p>
                                  {item.sku && (
                                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                      {item.sku}
                                    </span>
                                  )}
                                </div>
                                {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                              </>
                            )
                          )}

                          {!isEditing && item.comment && (
                            <p className="text-xs text-indigo-600 font-medium flex items-start gap-1 mt-1 bg-indigo-50/50 p-1.5 rounded border border-indigo-100/50 whitespace-pre-wrap">
                              <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>{item.comment}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-3 justify-end">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cant.</label>
                            <Input 
                              type="number" 
                              min={1} 
                              value={item.quantity}
                              onFocus={() => {
                                if (item.quantity === 1 || item.quantity === "1") {
                                  updateItem(idx, 'quantity', "");
                                }
                              }}
                              onBlur={() => {
                                if (item.quantity === "") {
                                  updateItem(idx, 'quantity', 1);
                                }
                              }}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                updateItem(
                                  idx, 
                                  'quantity', 
                                  e.target.value === "" ? "" : (isNaN(val) ? 1 : Math.max(1, val))
                                );
                              }}
                              className="w-20 text-center font-bold" 
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                             <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Precio U.</label>
                             <Input 
                               type="number" 
                               step={0.01} 
                               value={item.unitPrice === 0 ? "" : item.unitPrice} 
                               onFocus={() => {
                                 if (item.unitPrice === 0 || item.unitPrice === "0") {
                                   updateItem(idx, 'unitPrice', "");
                                 }
                               }}
                               onBlur={() => {
                                 if (item.unitPrice === "") {
                                   updateItem(idx, 'unitPrice', 0);
                                 }
                               }}
                               onChange={(e) => updateItem(idx, 'unitPrice', e.target.value)} 
                               className="w-24 text-right font-medium" 
                             />
                           </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Desc %</label>
                            <Input type="number" min={0} max={100} value={item.discountPercentage} onChange={(e) => updateItem(idx, 'discountPercentage', parseFloat(e.target.value)||0)} className="w-20 text-center text-emerald-600 font-bold" />
                          </div>
                          <div className="flex flex-col gap-1 text-right min-w-[80px]">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Importe</label>
                            <p className="font-bold text-slate-800">
                              ${(Number(item.quantity) * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 mt-4 sm:mt-0">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className={`${item.comment || item.showComment ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700' : 'text-muted-foreground hover:text-indigo-600'}`}
                              onClick={() => updateItem(idx, 'showComment', !item.showComment)}
                              title="Agregar nota/comentario"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-right flex items-center gap-6">
                          <div className="text-slate-500 text-xs">
                            <span className="font-semibold text-slate-700">{item.quantity}</span> x ${item.unitPrice.toLocaleString('es-MX', {minimumFractionDigits:2})}
                            {item.discountPercentage > 0 && (
                              <span className="text-emerald-600 font-medium ml-1.5">(-{item.discountPercentage}%)</span>
                            )}
                          </div>
                          <div className="font-bold text-slate-950 min-w-[100px] text-base">
                            ${(item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                          </div>
                        </div>
                      )}
                    </div>
                    {isEditing && (item.showComment || item.comment) && (
                      <div className="pt-2 border-t border-slate-100">
                        <Input
                          placeholder="Escribe una nota o comentario sobre esta partida..."
                          value={item.comment || ""}
                          onChange={(e) => updateItem(idx, 'comment', e.target.value)}
                          className="text-xs bg-muted/30 border-slate-200"
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {isEditing && (
              <div className="p-5 border-t bg-muted/30 relative">
                <h4 className="text-xs font-bold text-indigo-900 uppercase mb-2">Agregar más productos al pedido</h4>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por nombre, SKU o código de barras..." 
                    className="pl-9 bg-background"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                {productSearch && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                    {getFilteredProducts().map(product => (
                      product.variants?.map((variant: any) => (
                        <div 
                          key={variant.id} 
                          className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm cursor-pointer"
                          onClick={() => {
                            const isService = !!product.isService || variant.sku?.startsWith("SER-");
                            if (isService || !order.items?.some((i: any) => i.variantId === variant.id)) {
                              handleAddProduct(product, variant);
                            }
                          }}
                        >
                          <div>
                            <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-slate-500">Stock actual: {variant.stock || 0} | Precio: ${variant.price}</div>
                          </div>
                          {order.items?.some((i: any) => i.variantId === variant.id) && !variant.sku?.startsWith("SER-") && !product.isService && (
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
            )}
          </div>
        

        {/* Right Column: Totals & Actions */}
        
          <div className="bg-card border rounded-xl shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-base border-b pb-2 flex items-center gap-2 text-slate-800">
              Resumen y Totales
            </h3>

            <div className="space-y-3">
              {isEditing && (
                <div className="flex flex-col items-end w-full space-y-1">
                  <label className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                    <Percent className="w-3.5 h-3.5"/> Descuento Global
                  </label>
                  <div className="flex gap-2 w-64 justify-end">
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      value={order.globalDiscountType || "none"}
                      onChange={(e) => handleGlobalDiscountTypeChange(e.target.value)}
                    >
                      <option value="none">Ninguno</option>
                      <option value="percentage">%</option>
                      <option value="fixed_amount">$</option>
                    </select>
                    {(order.globalDiscountType && order.globalDiscountType !== "none") && (
                      <Input
                        type="number"
                        min={0}
                        max={order.globalDiscountType === "percentage" ? 100 : undefined}
                        step={order.globalDiscountType === "percentage" ? 1 : 0.01}
                        placeholder={order.globalDiscountType === "percentage" ? "10" : "100.00"}
                        value={order.globalDiscountValue !== undefined ? order.globalDiscountValue : ""}
                        onChange={(e) => handleGlobalDiscountValueChange(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="h-9 text-sm w-24 shrink-0"
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="pt-4 space-y-2 border-t mt-4 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-semibold">${displaySubtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                {displayDiscount > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>Descuento</span>
                    <span className="font-semibold text-emerald-600">-${displayDiscount.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>IVA (16%)</span>
                  <span className="font-semibold">${displayTax.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between text-lg pt-2 border-t mt-2 font-bold text-slate-800">
                  <span>TOTAL</span>
                  <span className="font-black text-blue-700">${displayTotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>

                {(order.paidAmount || 0) > 0 && (
                  <div className="pt-2 mt-2 border-t border-dashed space-y-2">
                    <div className="flex justify-between text-emerald-600 font-semibold">
                      <span>Pagado</span>
                      <span>${(order.paidAmount || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                    </div>
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>Saldo Pendiente</span>
                      <span>${Math.max(0, displayTotal - (order.paidAmount || 0)).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                    </div>
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="pt-4 flex flex-col gap-2">
                  <Button 
                    size="lg" 
                    onClick={handleSave} 
                    disabled={saving}
                    className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Guardar Cambios
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => { setIsEditing(false); window.location.reload(); }}
                    disabled={saving}
                    className="w-full"
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
      )}

      {activeTab === "pagos" && (
        <div className="bg-white border rounded-xl shadow-sm p-6">
          <DocumentPaymentsTab 
            document={order} 
            documentType="pedido" 
            companyId={companyId || ""} 
            onUpdate={() => window.location.reload()}
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
        <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b bg-slate-50/50 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-800">Documentos Vinculados</h3>
          </div>
          
          {relatedDocs.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-semibold text-slate-800 mb-1">Sin documentos relacionados</p>
              <p className="text-xs text-slate-500">Aún no se han generado remisiones o facturas para este pedido.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Tipo</th>
                    <th className="px-6 py-3">Folio</th>
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Estatus</th>
                    <th className="px-6 py-3 text-right">Monto</th>
                    <th className="px-6 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {relatedDocs.map((doc: any) => (
                    <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {doc.docType === 'remision' ? <Truck className="w-4 h-4 text-emerald-600" /> : <Receipt className="w-4 h-4 text-blue-600" />}
                          <span className="font-bold text-slate-700">{doc.type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {doc.docType === 'remision' ? `REM-${doc.remissionNumber}` : `FAC-${doc.invoiceNumber}`}
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">
                        {new Date(doc.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                          doc.status === 'activa' || doc.status === 'timbrada' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {doc.status?.toUpperCase() || 'DESCONOCIDO'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-900">
                        ${Number(doc.totalAmount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link 
                          href={doc.docType === 'remision' ? `/ventas/remisiones/${doc.id}` : `/ventas/facturas/${doc.id}`}
                          className="text-indigo-600 hover:text-indigo-800 font-bold text-xs hover:underline"
                        >
                          Ver Detalle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ProcessOrderModal 
        isOpen={isProcessModalOpen}
        onClose={() => setIsProcessModalOpen(false)}
        order={order}
        companyId={companyId || ""}
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        document={order}
        documentType="pedido"
        companyId={companyId || ""}
      />
    </div>
  );
}
