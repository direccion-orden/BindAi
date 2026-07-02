import React, { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Loader2, DollarSign, Plus, Edit2, Trash2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentModal } from "./PaymentModal";
import { EditPaymentModal } from "./EditPaymentModal";
import { cancelPaymentOperation } from "@/lib/services/paymentOperations";

interface DocumentPaymentsTabProps {
  document: any; // The invoice/order/remission object
  documentType: "pedido" | "remision" | "factura";
  companyId: string;
  onUpdate?: () => void; // Optional callback to refresh parent
}

export function DocumentPaymentsTab({ document: docObj, documentType, companyId, onUpdate }: DocumentPaymentsTabProps) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // If the document has no ID, it means it hasn't been saved yet.
  const isNewDocument = !docObj || !docObj.id || docObj.id === "nueva" || docObj.id === "nuevo";

  useEffect(() => {
    if (isNewDocument || !companyId) {
      setLoading(false);
      return;
    }

    // Query 1: Direct payments for this document
    const q1 = query(
      collection(db, "companies", companyId, "payments"),
      where("documentId", "==", docObj.id),
      where("documentType", "==", documentType)
    );

    // Query 2: Payments linked to this order (via orderId)
    const q2 = query(
      collection(db, "companies", companyId, "payments"),
      where("orderId", "==", docObj.id)
    );

    let list1: any[] = [];
    let list2: any[] = [];
    let list3: any[] = [];
    let list4: any[] = [];
    let loaded1 = false;
    let loaded2 = false;
    let loaded3 = false;
    let loaded4 = false;

    const updateCombinedResults = () => {
      const combined = [...list1];
      [list2, list3, list4].forEach(l => {
        l.forEach(p => {
          if (!combined.some(cp => cp.id === p.id)) {
            combined.push(p);
          }
        });
      });
      
      // Sort by date/createdAt descending
      combined.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.date).getTime();
        const dateB = new Date(b.createdAt || b.date).getTime();
        return dateB - dateA;
      });
      
      setPayments(combined);
      if (loaded1 && loaded2 && loaded3 && loaded4) setLoading(false);
    };

    const unsub1 = onSnapshot(q1, (snap) => {
      list1 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loaded1 = true;
      updateCombinedResults();
    }, (error) => {
      console.error("Error Q1:", error);
      loaded1 = true;
      updateCombinedResults();
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      list2 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loaded2 = true;
      updateCombinedResults();
    }, (error) => {
      console.error("Error Q2:", error);
      loaded2 = true;
      updateCombinedResults();
    });

    // Query 3: Linked remission payments
    let unsub3 = () => {};
    if (documentType === "pedido" && docObj.remissionId) {
      const q3 = query(
        collection(db, "companies", companyId, "payments"),
        where("documentId", "==", docObj.remissionId)
      );
      unsub3 = onSnapshot(q3, (snap) => {
        list3 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loaded3 = true;
        updateCombinedResults();
      }, () => { loaded3 = true; updateCombinedResults(); });
    } else {
      loaded3 = true;
    }

    // Query 4: Linked invoice payments
    let unsub4 = () => {};
    if (documentType === "pedido" && docObj.invoiceId) {
      const q4 = query(
        collection(db, "companies", companyId, "payments"),
        where("documentId", "==", docObj.invoiceId)
      );
      unsub4 = onSnapshot(q4, (snap) => {
        list4 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        loaded4 = true;
        updateCombinedResults();
      }, () => { loaded4 = true; updateCombinedResults(); });
    } else {
      loaded4 = true;
    }

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [docObj.id, docObj.remissionId, docObj.invoiceId, companyId, documentType, isNewDocument]);

  if (isNewDocument) {
    return (
      <div className="bg-white border rounded-xl p-8 text-center text-slate-400">
        <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-amber-500 opacity-80" />
        <p className="font-semibold text-slate-800 mb-1">Documento no guardado</p>
        <p className="text-xs max-w-md mx-auto">
          Debes guardar este documento primero para poder registrar, editar o cancelar pagos relacionados.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Calculate totals based on ACTIVE payments in state
  const totalAmount = docObj.totalAmount || 0;
  const activePayments = payments.filter(p => p.status !== "cancelado");
  const paidAmount = activePayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const pendingBalance = Math.max(0, totalAmount - paidAmount);

  const handleCancelPayment = async (paymentId: string) => {
    if (!window.confirm("¿Estás seguro de cancelar este pago? Se anulará la póliza de ingreso y se restará del saldo cobrado del documento.")) {
      return;
    }

    setCancelingId(paymentId);
    try {
      await cancelPaymentOperation(companyId, paymentId, docObj.id, documentType);
      alert("Pago cancelado exitosamente.");
      if (onUpdate) onUpdate();
    } catch (e: any) {
      console.error(e);
      alert("Error al cancelar el pago: " + e.message);
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Financial State Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 border rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Monto Total</p>
          <p className="text-2xl font-black text-slate-800 mt-1">${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 uppercase">Monto Cobrado</p>
          <p className="text-2xl font-black text-emerald-800 mt-1">${paidAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 shadow-sm relative">
          <p className="text-xs font-semibold text-indigo-700 uppercase">Saldo Pendiente</p>
          <p className="text-2xl font-black text-indigo-800 mt-1">${pendingBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          {pendingBalance <= 0.01 && totalAmount > 0 && (
            <span className="absolute top-4 right-4 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              <CheckCircle2 className="w-3 h-3" /> Liquidado
            </span>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-indigo-600" /> Historial de Pagos
        </h3>
        
        {pendingBalance > 0.01 && docObj.status !== 'cancelada' && docObj.status !== 'cancelado' && (
          <Button onClick={() => setIsPaymentModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
            <Plus className="w-4 h-4" /> Registrar Pago
          </Button>
        )}
      </div>

      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Monto</th>
                <th className="px-6 py-4">Método</th>
                <th className="px-6 py-4">Referencia</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No se han registrado pagos para este documento.
                  </td>
                </tr>
              ) : (
                payments.map((payment) => {
                  const isCancelled = payment.status === "cancelado";
                  return (
                    <tr key={payment.id} className={`hover:bg-slate-50 transition-colors ${isCancelled ? 'bg-slate-50/50 text-slate-400' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium">
                        {payment.date ? new Date(payment.date + "T12:00:00").toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                      </td>
                      <td className={`px-6 py-4 font-bold ${isCancelled ? 'line-through text-slate-400' : 'text-emerald-700'}`}>
                        ${payment.amount?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 font-medium">{payment.method}</td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-500 truncate max-w-[150px]" title={payment.reference}>
                        {payment.reference || '--'}
                      </td>
                      <td className="px-6 py-4">
                        {isCancelled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold border border-red-200">
                            Cancelado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {!isCancelled && (
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setEditingPayment(payment)}
                              className="h-8 gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Editar
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleCancelPayment(payment.id)}
                              disabled={cancelingId === payment.id}
                              className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            >
                              {cancelingId === payment.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                              Cancelar
                            </Button>
                          </div>
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

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          if (onUpdate) onUpdate();
        }}
        document={docObj}
        documentType={documentType}
        companyId={companyId}
      />

      <EditPaymentModal
        isOpen={!!editingPayment}
        onClose={() => setEditingPayment(null)}
        payment={editingPayment}
        document={docObj}
        companyId={companyId}
        onSuccess={() => {
          if (onUpdate) onUpdate();
        }}
      />
    </div>
  );
}
