"use client";

import React, { useState, useEffect, use } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ArrowLeft, Truck, Package, Receipt, FileText, XCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InvoiceModal } from "./InvoiceModal";
import { PaymentModal } from "@/components/payments/PaymentModal";

export default function RemisionDetallePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { companyId } = useAuth();
  const router = useRouter();
  
  const [remission, setRemission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  useEffect(() => {
    if (!companyId || !params.id) return;

    const fetchRemission = async () => {
      try {
        const docRef = doc(db, "companies", companyId, "remisiones", params.id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setRemission({ id: snap.id, ...snap.data() });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchRemission();
  }, [companyId, params.id]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!remission) {
    return <div className="p-10 text-center">Remisión no encontrada.</div>;
  }

  const handleCancel = async () => {
    if (!companyId) return;
    if (!window.confirm("¿Estás seguro de cancelar esta remisión? El inventario será devuelto al almacén y el pedido regresará a estatus 'Por Surtir'.")) return;
    
    setCanceling(true);
    try {
      // 1. Update Remission status
      await updateDoc(doc(db, "companies", companyId, "remisiones", remission.id), {
        status: "cancelada"
      });

      // 2. Update Order status back to 'por_surtir'
      if (remission.orderId) {
        await updateDoc(doc(db, "companies", companyId, "pedidos", remission.orderId), {
          status: "por_surtir"
        });
      }

      // 3. Revert Inventory Deductions
      for (const item of remission.items) {
        const productRef = doc(db, "companies", companyId, "products", item.productId);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          const updatedVariants = productData.variants?.map((v: any) => {
            if (v.id === item.variantId) {
              return { ...v, stock: (v.stock || 0) + item.quantity }; // Add back
            }
            return v;
          });
          
          await updateDoc(productRef, { variants: updatedVariants });
          
          // Log the reverse movement
          const movId = crypto.randomUUID();
          import("firebase/firestore").then(({ setDoc }) => {
            setDoc(doc(db, "companies", companyId, "inventory_movements", movId), {
              id: movId,
              productId: item.productId,
              variantId: item.variantId,
              type: "IN",
              quantity: item.quantity,
              reason: `Cancelación de Remisión ${remission.remissionNumber}`,
              referenceId: remission.id,
              createdAt: new Date().toISOString()
            });
          });
        }
      }

      alert("Remisión cancelada exitosamente.");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("Error al cancelar la remisión.");
    } finally {
      setCanceling(false);
    }
  };

  const subtotal = remission.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)), 0);
  const tax = subtotal * 0.16;

  return (
    <div className="flex flex-col space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <Link href="/ventas/remisiones">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Remisión {remission.remissionNumber}</h1>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Cliente: {remission.clientName} | Ref. Pedido: <Link href={`/ventas/pedidos/${remission.orderId}`} className="text-indigo-600 hover:underline">{remission.orderNumber}</Link>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {remission.status === 'activa' && (
            <>
              <Button variant="destructive" onClick={handleCancel} disabled={canceling} className="gap-2">
                {canceling ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Cancelar Remisión
              </Button>
              <Button 
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setIsInvoiceModalOpen(true)}
              >
                <Receipt className="w-4 h-4" /> Generar Factura (CFDI)
              </Button>
              {(remission.paidAmount || 0) < remission.totalAmount - 0.01 && (
                <Button onClick={() => setIsPaymentModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <DollarSign className="w-4 h-4" /> Registrar Pago
                </Button>
              )}
            </>
          )}
          {remission.status === 'facturada' && (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-lg flex items-center gap-2">
              <Receipt className="w-5 h-5" /> Documento Facturado
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 bg-slate-50 p-4 rounded-lg border">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Estatus</p>
            <p className="font-bold capitalize">{remission.status}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Proyecto Vinculado</p>
            <p className="font-bold text-indigo-700">{remission.projectName || 'Ninguno'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Fecha de Creación</p>
            <p className="font-bold">{new Date(remission.createdAt).toLocaleString('es-MX')}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Creado por</p>
            <p className="font-bold">{remission.createdBy}</p>
          </div>
        </div>

        <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
          <Truck className="w-5 h-5 text-slate-400" /> Mercancía Entregada
        </h3>

        <div className="space-y-3">
          {remission.items?.map((item: any, idx: number) => (
            <div key={item.variantId || idx} className="flex flex-col sm:flex-row sm:items-center justify-between border p-3 rounded-lg text-sm gap-4 bg-white shadow-sm">
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
              
              <div className="text-right">
                <p className="font-semibold">{item.quantity} x ${(item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                {item.discountPercentage > 0 && <p className="text-[10px] text-emerald-600">Descuento: {item.discountPercentage}%</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-6 border-t mt-6">
          <div className="w-72 space-y-2 text-sm bg-slate-50 p-4 rounded-lg border">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>${subtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>IVA (16%)</span>
              <span>${tax.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            <div className="flex justify-between font-black text-xl pt-2 border-t mt-2 text-slate-900">
              <span>Total Entregado</span>
              <span className="text-indigo-700">${remission.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            {(remission.paidAmount || 0) > 0 && (
              <>
                <div className="flex justify-between text-emerald-600 font-medium pt-2">
                  <span>Pagado</span>
                  <span>${(remission.paidAmount || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between text-rose-600 font-bold border-t mt-2 pt-2">
                  <span>Saldo Pendiente</span>
                  <span>${Math.max(0, remission.totalAmount - (remission.paidAmount || 0)).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      <InvoiceModal 
        isOpen={isInvoiceModalOpen} 
        onClose={() => setIsInvoiceModalOpen(false)} 
        remission={remission} 
        companyId={companyId || ""} 
      />

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        document={remission}
        documentType="remision"
        companyId={companyId || ""}
      />
    </div>
  );
}
