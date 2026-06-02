"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Package, ArrowLeft, Save, Edit2, Trash2, Search, Truck, FileText, CheckCircle2, XCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProcessOrderModal } from "./ProcessOrderModal";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { getNextSequence } from "@/lib/firebase/counters";

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
  
  const [products, setProducts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");

  useEffect(() => {
    if (!companyId || !params.id) return;

    const fetchOrder = async () => {
      try {
        const orderDoc = await getDoc(doc(db, "companies", companyId, "pedidos", params.id));
        if (orderDoc.exists()) {
          setOrder({ id: orderDoc.id, ...orderDoc.data() });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [companyId, params.id]);

  useEffect(() => {
    if (isEditing && products.length === 0 && companyId) {
      getDocs(collection(db, "companies", companyId, "products")).then(snap => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      getDocs(collection(db, "companies", companyId, "projects")).then(snap => {
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
      const grossSubtotal = order.items && Array.isArray(order.items)
        ? order.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0)
        : 0;
      const totalDiscount = order.items && Array.isArray(order.items)
        ? order.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice * (item.discountPercentage || 0) / 100), 0)
        : 0;

      const subtotal = isItemsModified ? grossSubtotal : (order.subtotal || grossSubtotal);
      const discount = isItemsModified ? totalDiscount : (order.totalDiscount || totalDiscount);
      const taxableSubtotal = subtotal - discount;

      const tax = isItemsModified
        ? taxableSubtotal * 0.16
        : (order.tax !== undefined ? order.tax : taxableSubtotal * 0.16);
      const totalAmount = isItemsModified
        ? taxableSubtotal + tax
        : (order.totalAmount !== undefined ? order.totalAmount : taxableSubtotal + tax);

      let finalProjectName = order.projectName;
      if (order.projectId) {
        finalProjectName = projects.find(p => p.id === order.projectId)?.name || null;
      }

      const updatedOrder = {
        ...order,
        projectName: finalProjectName,
        subtotal,
        totalDiscount: discount,
        tax,
        totalAmount,
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

  const updateItem = (variantId: string, field: string, value: number) => {
    setIsItemsModified(true);
    setOrder((prev: any) => ({
      ...prev,
      items: prev.items.map((item: any) => 
        item.variantId === variantId ? { ...item, [field]: value } : item
      )
    }));
  };

  const removeItem = (variantId: string) => {
    setIsItemsModified(true);
    setOrder((prev: any) => ({
      ...prev,
      items: prev.items.filter((item: any) => item.variantId !== variantId)
    }));
  };

  const handleAddProduct = (product: any, variant: any) => {
    setIsItemsModified(true);
    const exists = order.items.find((i: any) => i.variantId === variant.id);
    if (!exists) {
      setOrder((prev: any) => ({
        ...prev,
        items: [...prev.items, {
          productId: product.id,
          variantId: variant.id,
          productName: product.title,
          variantTitle: variant.title !== "Default Title" ? variant.title : "",
          quantity: 1,
          unitPrice: variant.price || 0,
          discountPercentage: 0,
          imageUrl: product.images?.[0]?.src || ""
        }]
      }));
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

  const handleCancel = async () => {
    if (!companyId) return;
    if (!window.confirm("¿Estás seguro de cancelar este pedido? Se marcará como cancelado y no podrá surtirse.")) return;
    
    setCanceling(true);
    try {
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

  const grossSubtotal = order.items && Array.isArray(order.items)
    ? order.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0)
    : 0;
  const totalDiscount = order.items && Array.isArray(order.items)
    ? order.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice * (item.discountPercentage || 0) / 100), 0)
    : 0;

  const displaySubtotal = isItemsModified ? grossSubtotal : (order.subtotal || grossSubtotal);
  const displayDiscount = isItemsModified ? totalDiscount : (order.totalDiscount || totalDiscount);
  const taxableSubtotal = displaySubtotal - displayDiscount;

  const displayTax = isItemsModified
    ? taxableSubtotal * 0.16
    : (order.tax !== undefined ? order.tax : taxableSubtotal * 0.16);
  const displayTotal = isItemsModified
    ? taxableSubtotal + displayTax
    : (order.totalAmount !== undefined ? order.totalAmount : taxableSubtotal + displayTax);

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
            <p className="text-muted-foreground text-sm mt-1">
              Ref: Cotización {order.quoteNumber} | Cliente: {order.clientName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {order.status === 'por_surtir' && (
            <>
              {isEditing ? (
                <>
                  <Button variant="ghost" onClick={() => { setIsEditing(false); window.location.reload(); }} disabled={saving}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar Cambios
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="destructive" onClick={handleCancel} disabled={canceling} className="gap-2">
                    {canceling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Cancelar Pedido
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditing(true)} className="gap-2">
                    <Edit2 className="w-4 h-4" /> Editar Pedido
                  </Button>
                  <Button onClick={() => setIsProcessModalOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Truck className="w-4 h-4" /> Facturar / Procesar
                  </Button>
                  {(order.paidAmount || 0) < displayTotal - 0.01 && (
                    <Button onClick={() => setIsPaymentModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                      <DollarSign className="w-4 h-4" /> Registrar Pago
                    </Button>
                  )}
                </>
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

      <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-lg border mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Estatus</p>
            <p className="font-bold capitalize text-slate-900">
              {order.status === 'por_surtir' ? 'Activo' : order.status.replace('_', ' ')}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Proyecto Vinculado</p>
            {isEditing ? (
              <select 
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-sm shadow-sm"
                value={order.projectId || ""}
                onChange={e => setOrder({...order, projectId: e.target.value})}
              >
                <option value="">Ninguno</option>
                {projects.filter(p => p.clientId === order.clientId).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <p className="font-bold text-indigo-700">{order.projectName || 'Ninguno'}</p>
            )}
          </div>
        </div>
        <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
          <Package className="w-5 h-5 text-slate-400" /> Partidas del Pedido
        </h3>

        <div className="space-y-3">
          {order.items?.map((item: any, idx: number) => (
            <div key={item.variantId || idx} className={`flex flex-col sm:flex-row sm:items-center justify-between border p-3 rounded-lg text-sm gap-4 ${isEditing ? 'bg-slate-50 border-blue-200' : 'bg-white shadow-sm'}`}>
              <div className="flex-1 flex items-center gap-3">
                <div className="w-12 h-12 rounded bg-slate-100 flex-shrink-0 overflow-hidden border">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-6 h-6 m-auto mt-3 text-slate-300" />
                  )}
                </div>
                <div>
                  <p className="font-bold">{item.productName}</p>
                  {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                </div>
              </div>
              
              {isEditing ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Cant.</label>
                    <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.variantId, 'quantity', parseInt(e.target.value)||1)} className="w-20 h-9 text-center bg-white" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Precio U.</label>
                    <Input type="number" step={0.01} value={item.unitPrice} onChange={(e) => updateItem(item.variantId, 'unitPrice', parseFloat(e.target.value)||0)} className="w-28 h-9 text-right bg-white" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-emerald-600 font-bold uppercase">Desc %</label>
                    <Input type="number" min={0} max={100} value={item.discountPercentage} onChange={(e) => updateItem(item.variantId, 'discountPercentage', parseFloat(e.target.value)||0)} className="w-20 h-9 text-center text-emerald-600 bg-white" />
                  </div>
                  <div className="flex flex-col gap-1 text-right min-w-[90px]">
                    <label className="text-[10px] text-slate-500 font-bold uppercase">Subtotal</label>
                    <span className="h-9 flex items-center justify-end font-bold text-slate-900 pr-1">
                      ${(item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeItem(item.variantId)} className="h-9 w-9 text-red-500 mt-4 bg-white hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
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
          ))}
        </div>

        {isEditing && (
          <div className="mt-4 p-4 border rounded-lg bg-indigo-50/50 relative">
            <h4 className="text-xs font-bold text-indigo-900 uppercase mb-2">Agregar más productos al pedido</h4>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nombre, SKU o código de barras..." 
                className="pl-9 bg-white"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            {productSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 border rounded-md max-h-64 overflow-y-auto bg-white divide-y z-50 shadow-2xl">
                {getFilteredProducts().map(product => (
                  product.variants?.map((variant:any) => (
                    <div 
                      key={variant.id} 
                      className="p-3 hover:bg-slate-50 flex justify-between items-center text-sm cursor-pointer"
                      onClick={() => {
                        if (!order.items?.some((i:any) => i.variantId === variant.id)) {
                          handleAddProduct(product, variant);
                        }
                      }}
                    >
                      <div>
                        <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                        <div className="text-xs text-slate-500">Stock actual: {variant.stock || 0} | Precio: ${variant.price}</div>
                      </div>
                      {order.items?.some((i:any) => i.variantId === variant.id) && (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Agregado</span>
                      )}
                    </div>
                  ))
                ))}
                {getFilteredProducts().length === 0 && (
                  <div className="p-4 text-center text-sm text-slate-500">No se encontraron productos.</div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-6 border-t mt-6">
          <div className="w-72 space-y-2 text-sm bg-slate-50 p-4 rounded-lg border">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>${displaySubtotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            {displayDiscount > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Descuento</span>
                <span>-${displayDiscount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500">
              <span>IVA (16%)</span>
              <span>${displayTax?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            <div className="flex justify-between font-black text-xl pt-2 border-t mt-2 text-slate-900">
              <span>Total</span>
              <span className="text-indigo-700">${displayTotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            {(order.paidAmount || 0) > 0 && (
              <>
                <div className="flex justify-between text-emerald-600 font-medium pt-2">
                  <span>Pagado</span>
                  <span>${(order.paidAmount || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between text-rose-600 font-bold border-t mt-2 pt-2">
                  <span>Saldo Pendiente</span>
                  <span>${Math.max(0, displayTotal - (order.paidAmount || 0)).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

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
