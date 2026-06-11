import React, { useState, useEffect } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Loader2, DollarSign, Calendar, CreditCard, FileText, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { editPaymentOperation } from "@/lib/services/paymentOperations";

interface EditPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: any; // The payment document to edit
  document: any; // The parent document object
  companyId: string;
  onSuccess: () => void;
}

export function EditPaymentModal({ isOpen, onClose, payment, document, companyId, onSuccess }: EditPaymentModalProps) {
  const [loading, setLoading] = useState(false);

  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState("");
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [vatRate, setVatRate] = useState<number>(0.16);

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [vatAccounts, setVatAccounts] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && payment) {
      setAmount(payment.amount || 0);
      setDate(payment.date || new Date().toISOString().split("T")[0]);
      setMethod(payment.method || "Transferencia");
      setReference(payment.reference || "");
      setBankAccountId(payment.bankAccountId || "");
      
      // Default VAT Rate detection
      setVatRate(payment.vatRate !== undefined ? payment.vatRate : 0.16);
    }
  }, [isOpen, payment]);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBankAccounts(allAcc.filter((a: any) => a.type === "ACTIVO" && a.level >= 2 && (a.name.toLowerCase().includes("banco") || a.name.toLowerCase().includes("caja"))));
      setVatAccounts(allAcc.filter((a: any) => a.code.startsWith("208") && a.level >= 2));
    });
    return () => unsubAcc();
  }, [isOpen, companyId]);

  if (!isOpen || !payment) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (amount <= 0) {
      alert("El monto debe ser mayor a 0.");
      return;
    }

    if (!bankAccountId) {
      alert("Debes seleccionar una Cuenta de Banco.");
      return;
    }

    setLoading(true);
    try {
      await editPaymentOperation(companyId, payment.id, payment, {
        amount,
        date,
        method,
        reference,
        bankAccountId,
        vatRate,
        accountId: document.accountId || "",
        accountCode: document.accountCode || "",
        accountName: document.accountName || ""
      });

      alert("Pago actualizado exitosamente.");
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error al editar pago:", error);
      alert("Error al guardar cambios: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const methods = ["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            Editar Pago
          </h2>
          <span className="text-xs font-bold px-2 py-1 bg-slate-200 text-slate-700 rounded-full capitalize">
            {payment.documentType}
          </span>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
              <DollarSign className="w-4 h-4 text-slate-400" />
              Monto del Pago *
            </label>
            <Input 
              type="number" 
              step="0.01" 
              min="0.01" 
              value={amount} 
              onChange={e => setAmount(parseFloat(e.target.value) || 0)} 
              className="text-lg font-bold"
              required 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                <Calendar className="w-4 h-4 text-slate-400" />
                Fecha *
              </label>
              <Input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                required 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                <CreditCard className="w-4 h-4 text-slate-400" />
                Método *
              </label>
              <select 
                value={method} 
                onChange={e => setMethod(e.target.value)} 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                {methods.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
              <BookOpen className="w-4 h-4 text-slate-400" />
              Cuenta de Banco (Destino) *
            </label>
            <select
              value={bankAccountId}
              onChange={e => setBankAccountId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="" disabled>Selecciona la cuenta destino...</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
              <DollarSign className="w-4 h-4 text-slate-400" />
              IVA Aplicable *
            </label>
            <select
              value={vatRate}
              onChange={e => setVatRate(Number(e.target.value))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value={0.16}>16% (General)</option>
              <option value={0.08}>8% (Frontera)</option>
              <option value={0}>0% / Exento</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
              <FileText className="w-4 h-4 text-slate-400" />
              Referencia / Notas
            </label>
            <Input 
              placeholder="Ej. SPEI 123456"
              value={reference} 
              onChange={e => setReference(e.target.value)} 
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cerrar
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
