import React, { useState, useEffect } from "react";
import { doc, collection, addDoc, updateDoc, increment, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Loader2, DollarSign, Calendar, CreditCard, FileText, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: any; // The document object (pedido, remision, factura)
  documentType: "pedido" | "remision" | "factura";
  companyId: string;
}

export function PaymentModal({ isOpen, onClose, document, documentType, companyId }: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  
  const totalAmount = Math.round(((document?.totalAmount || 0) + Number.EPSILON) * 100) / 100;
  const paidAmount = Math.round(((document?.paidAmount || 0) + Number.EPSILON) * 100) / 100;
  const saldoPendiente = Math.max(0, totalAmount - paidAmount);

  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");

  const [vatAccounts, setVatAccounts] = useState<any[]>([]);
  const [vatRate, setVatRate] = useState<number>(0.16); // Default 16%

  useEffect(() => {
    if (isOpen) {
      setAmount(Number(saldoPendiente.toFixed(2)));
      setDate(new Date().toISOString().split("T")[0]);
      setMethod("Transferencia");
      setReference("");
      setBankAccountId("");
      setVatRate(0.16);
    }
  }, [isOpen, saldoPendiente]);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBankAccounts(allAcc.filter((a: any) => a.type === "ACTIVO" && a.level >= 2 && (a.name.toLowerCase().includes("banco") || a.name.toLowerCase().includes("caja"))));
      setVatAccounts(allAcc.filter((a: any) => a.code.startsWith("208") && a.level >= 2));
    });
    return () => unsubAcc();
  }, [isOpen, companyId]);

  if (!isOpen || !document) return null;

  // Determine the collection name based on documentType
  let collectionName = "";
  if (documentType === "pedido") collectionName = "pedidos";
  else if (documentType === "remision") collectionName = "remisiones";
  else if (documentType === "factura") collectionName = "facturas";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (amount <= 0 || amount > Number((saldoPendiente + 0.01).toFixed(2))) { // Allow minor rounding difference
      alert("El monto debe ser mayor a 0 y no puede exceder el saldo pendiente.");
      return;
    }
    
    if (!bankAccountId) {
      alert("Debes seleccionar una Cuenta de Banco.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create payment record
      const paymentData = {
        amount,
        date,
        method,
        reference,
        documentId: document.id,
        documentType,
        documentNumber: document.orderNumber || document.remissionNumber || document.invoiceNumber || document.id,
        clientId: document.clientId || "",
        clientName: document.clientName || "",
        bankAccountId,
        createdAt: new Date().toISOString()
      };

      const paymentRef = await addDoc(collection(db, "companies", companyId, "payments"), paymentData);

      // 1.5 Create Journal Entry (Póliza de Ingreso)
      // Cargo a Banco (Activo aumenta con cargo)
      // Abono a Ingreso (Ingreso aumenta con abono)
      // Abono a IVA Trasladado Cobrado (Pasivo aumenta con abono)
      if (document.accountId) {
        const bankAccount = bankAccounts.find(a => a.id === bankAccountId);
        
        let subtotalAmount = amount;
        let vatAmount = 0;
        let vatAccount = null;

        if (vatRate > 0) {
           subtotalAmount = amount / (1 + vatRate);
           vatAmount = amount - subtotalAmount;
           // Try to find IVA Trasladado Cobrado account (usually 208.something)
           vatAccount = vatAccounts[0]; // Take the first one found, or we could let them select it
        }

        const entries = [
          {
            accountId: bankAccountId,
            accountCode: bankAccount?.code || "",
            accountName: bankAccount?.name || "",
            debit: amount,
            credit: 0
          },
          {
            accountId: document.accountId,
            accountCode: document.accountCode || "",
            accountName: document.accountName || "",
            debit: 0,
            credit: subtotalAmount
          }
        ];

        if (vatAmount > 0 && vatAccount) {
           entries.push({
             accountId: vatAccount.id,
             accountCode: vatAccount.code,
             accountName: vatAccount.name,
             debit: 0,
             credit: vatAmount
           });
        }
        
        await addDoc(collection(db, "companies", companyId, "journal_entries"), {
          type: "ingreso",
          date,
          description: `Cobro de ${documentType} ${paymentData.documentNumber}`,
          referenceId: paymentRef.id,
          referenceType: "payment",
          createdAt: new Date().toISOString(),
          status: "activa",
          entries
        });
        
        // Update Account Balances
        await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountId), {
          balance: increment(amount)
        });
        await updateDoc(doc(db, "companies", companyId, "accounts", document.accountId), {
          balance: increment(subtotalAmount) // Naturaleza Acreedora
        });
        if (vatAmount > 0 && vatAccount) {
          await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
            balance: increment(vatAmount) // Naturaleza Acreedora
          });
        }
      }

      // 2. Update document paidAmount
      const docRef = doc(db, "companies", companyId, collectionName, document.id);
      
      const newPaidAmount = paidAmount + amount;
      const updates: any = {
        paidAmount: increment(amount)
      };

      // Optional: Update status if fully paid (For facturas mainly, but we can do it for remisiones too)
      if (newPaidAmount >= totalAmount - 0.01) {
        if (documentType === "factura" || documentType === "remision") {
          // Si el estatus actual no es cancelado ni facturado/facturada
          if (
            document.status !== "cancelada" && 
            document.status !== "cancelado" && 
            document.status !== "facturada" && 
            document.status !== "facturado"
          ) {
            updates.status = "pagada";
          }
        }
      }

      await updateDoc(docRef, updates);

      alert("Pago registrado exitosamente.");
      onClose();
      // Reload page to reflect changes
      window.location.reload();
      
    } catch (error) {
      console.error("Error al registrar pago:", error);
      alert("Error al registrar el pago.");
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
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Registrar Pago
          </h2>
          <span className="text-xs font-bold px-2 py-1 bg-slate-200 text-slate-700 rounded-full capitalize">
            {documentType}
          </span>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          
          <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg border border-emerald-100 flex justify-between items-center mb-4">
            <span className="text-sm font-medium">Saldo Pendiente</span>
            <span className="text-lg font-black">${saldoPendiente.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
              <DollarSign className="w-4 h-4 text-slate-400" />
              Monto a Pagar *
            </label>
            <Input 
              type="number" 
              step="0.01" 
              min="0.01" 
              max={saldoPendiente + 0.01}
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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
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
              Impuesto incluido en el Pago (IVA) *
            </label>
            <select
              value={vatRate}
              onChange={e => setVatRate(Number(e.target.value))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              required
            >
              <option value={0.16}>16% (General)</option>
              <option value={0.08}>8% (Frontera)</option>
              <option value={0}>0% / Exento</option>
            </select>
            {vatRate > 0 && vatAccounts.length === 0 && (
              <p className="text-xs text-rose-600 mt-1">Advertencia: No tienes una cuenta de IVA Trasladado Cobrado (208) configurada.</p>
            )}
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
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar Pago
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
