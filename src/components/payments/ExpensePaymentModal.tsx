import React, { useState, useEffect } from "react";
import { doc, collection, addDoc, updateDoc, increment, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Loader2, DollarSign, Calendar, CreditCard, FileText, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ExpensePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: any; // The document object (orden_compra, gasto, recepcion)
  documentType: "orden_compra" | "gasto" | "recepcion";
  companyId: string;
}

export function ExpensePaymentModal({ isOpen, onClose, document, documentType, companyId }: ExpensePaymentModalProps) {
  const [loading, setLoading] = useState(false);
  
  // Total can be totalAmount (ordenes), total (gastos), totalCost (recepciones)
  const totalAmount = document?.totalAmount || document?.total || document?.totalCost || 0;
  const paidAmount = document?.paidAmount || 0;
  const saldoPendiente = totalAmount - paidAmount;

  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");

  const [vatAccounts, setVatAccounts] = useState<any[]>([]);
  const [vatRate, setVatRate] = useState<number>(0.16); // Default 16%

  useEffect(() => {
    if (isOpen) {
      setAmount(Number(saldoPendiente.toFixed(2)));
      setDate(new Date().toISOString().split("T")[0]);
      setMethod("Transferencia");
      setReference("");
      setBankAccountId("");
      setExpenseAccountId(document?.accountId || "");
      setVatRate(0.16);
    }
  }, [isOpen, saldoPendiente, document]);

  const [accountingAccounts, setAccountingAccounts] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    
    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccountingAccounts(allAcc);
      setExpenseAccounts(allAcc.filter((a: any) => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2));
      setVatAccounts(allAcc.filter((a: any) => a.code.startsWith("118") && a.level >= 2));
    });

    const unsubBank = onSnapshot(query(collection(db, "companies", companyId, "bankAccounts")), (snap) => {
      const allBanks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBankAccounts(allBanks);
    });

    return () => {
      unsubAcc();
      unsubBank();
    };
  }, [isOpen, companyId]);

  if (!isOpen || !document) return null;

  // Determine the collection name based on documentType
  let collectionName = "";
  if (documentType === "orden_compra") collectionName = "purchase_orders";
  else if (documentType === "gasto") collectionName = "expenses_inbox";
  else if (documentType === "recepcion") collectionName = "purchases";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (amount <= 0 || amount > Number((saldoPendiente + 0.01).toFixed(2))) { // Allow minor rounding difference
      alert("El monto debe ser mayor a 0 y no puede exceder el saldo pendiente.");
      return;
    }
    
    if (!bankAccountId) {
      alert("Debes seleccionar una Cuenta de Banco (Origen).");
      return;
    }

    if (!expenseAccountId && !document?.accountId) {
      alert("Debes clasificar este egreso en una Cuenta de Gasto.");
      return;
    }

    setLoading(true);
    try {
      // Determine provider name
      const providerName = document.vendorName || document.emisorName || "Proveedor";
      const documentNumber = document.orderNumber || document.invoiceNumber || document.uuid || document.id;

      // 1. Create payment record in outflows
      const paymentData = {
        amount,
        date,
        method,
        reference,
        documentId: document.id || document.uuid, // gastos uses uuid as ID sometimes, but document.id is safer
        documentType,
        documentNumber,
        providerName,
        bankAccountId,
        expenseAccountId: document.accountId || expenseAccountId,
        createdAt: new Date().toISOString()
      };

      const paymentRef = await addDoc(collection(db, "companies", companyId, "outflows"), paymentData);

      // 1.5 Create Journal Entry (Póliza de Egreso)
      // Cargo a Gasto (Gasto aumenta con cargo)
      // Cargo a IVA Acreditable Pagado (Activo aumenta con cargo)
      // Abono a Banco (Activo disminuye con abono)
      const finalExpenseAccountId = document.accountId || expenseAccountId;
      const physicalBankAccount = bankAccounts.find(a => a.id === bankAccountId);
      const expenseAccount = expenseAccounts.find(a => a.id === finalExpenseAccountId);
      
      const bankAccountingId = physicalBankAccount?.accountId;
      const bankAccountingAccount = bankAccountingId ? accountingAccounts.find(a => a.id === bankAccountingId) : null;

      if (!bankAccountingAccount) {
         alert(`La cuenta/caja "${physicalBankAccount?.name || 'seleccionada'}" no está enlazada a una cuenta contable. Por favor, elimínala y vuélvela a crear en Configuración > Cuentas.`);
         setLoading(false);
         return;
      }

      if (finalExpenseAccountId && physicalBankAccount && expenseAccount && bankAccountingAccount) {
        
        let subtotalAmount = amount;
        let vatAmount = 0;
        let vatAccount = null;

        if (vatRate > 0) {
           subtotalAmount = amount / (1 + vatRate);
           vatAmount = amount - subtotalAmount;
           vatAccount = vatAccounts[0]; 
        }

        const entries = [
          {
            accountId: finalExpenseAccountId,
            accountCode: expenseAccount.code,
            accountName: expenseAccount.name,
            debit: subtotalAmount,
            credit: 0
          },
          {
            accountId: bankAccountingId,
            accountCode: bankAccountingAccount.code,
            accountName: bankAccountingAccount.name,
            debit: 0,
            credit: amount
          }
        ];

        if (vatAmount > 0 && vatAccount) {
           entries.push({
             accountId: vatAccount.id,
             accountCode: vatAccount.code,
             accountName: vatAccount.name,
             debit: vatAmount,
             credit: 0
           });
        }

        await addDoc(collection(db, "companies", companyId, "journal_entries"), {
          type: "egreso",
          date,
          description: `Pago de ${documentType.replace('_', ' ')} ${paymentData.documentNumber}`,
          referenceId: paymentRef.id,
          referenceType: "payment_outflow",
          createdAt: new Date().toISOString(),
          status: "activa",
          entries
        });
        
        // Update Account Balances
        // Gasto (Naturaleza Deudora) -> Suma
        await updateDoc(doc(db, "companies", companyId, "accounts", finalExpenseAccountId), {
          balance: increment(subtotalAmount)
        });
        // Banco (Naturaleza Deudora) -> Resta en cuenta contable
        await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
          balance: increment(-amount) 
        });
        // Resta en cuenta bancaria física
        await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId), {
          balance: increment(-amount)
        });
        if (vatAmount > 0 && vatAccount) {
          await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
            balance: increment(vatAmount)
          });
        }
      }

      // If document didn't have accountId (e.g. from SAT), update it so it's classified
      if (!document.accountId && expenseAccountId) {
        await updateDoc(doc(db, "companies", companyId, collectionName, document.id || document.uuid), {
          accountId: expenseAccountId,
          accountCode: expenseAccount?.code || "",
          accountName: expenseAccount?.name || ""
        });
      }

      // 2. Update document paidAmount
      const docRefId = document.id || document.uuid;
      const docRef = doc(db, "companies", companyId, collectionName, docRefId);
      
      const newPaidAmount = paidAmount + amount;
      const updates: any = {
        paidAmount: increment(amount)
      };

      // Optional: Update status if fully paid
      if (newPaidAmount >= totalAmount - 0.01) {
        if (documentType === "gasto") {
          // Si el gasto no tiene status o es pending, lo pasamos a paid
          if (!document.status || document.status === "pending") {
             updates.status = "paid";
          }
        }
        if (documentType === "orden_compra") {
           updates.paymentStatus = "PAID";
        }
      }

      await updateDoc(docRef, updates);

      alert("Egreso registrado exitosamente.");
      onClose();
      // Reload page to reflect changes
      window.location.reload();
      
    } catch (error) {
      console.error("Error al registrar egreso:", error);
      alert("Error al registrar el egreso.");
    } finally {
      setLoading(false);
    }
  };

  const methods = ["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
        <div className="px-6 py-4 border-b bg-rose-50 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2 text-rose-900">
            <DollarSign className="w-5 h-5 text-rose-600" />
            Registrar Pago (Egreso)
          </h2>
          <span className="text-xs font-bold px-2 py-1 bg-rose-200 text-rose-800 rounded-full capitalize">
            {documentType.replace('_', ' ')}
          </span>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          
          <div className="bg-rose-50 text-rose-800 p-3 rounded-lg border border-rose-100 flex justify-between items-center mb-4">
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
              Cuenta de Banco (Origen) *
            </label>
            <select
              value={bankAccountId}
              onChange={e => setBankAccountId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              required
            >
              <option value="" disabled>Selecciona la cuenta origen...</option>
              {bankAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency || 'MXN'})</option>
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
              <p className="text-xs text-rose-600 mt-1">Advertencia: No tienes una cuenta de IVA Acreditable Pagado (118) configurada.</p>
            )}
          </div>

          {!document?.accountId && (
            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                <BookOpen className="w-4 h-4 text-slate-400" />
                Clasificación de Gasto *
              </label>
              <select
                value={expenseAccountId}
                onChange={e => setExpenseAccountId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value="" disabled>Clasifica este egreso...</option>
                {expenseAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
          )}

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
            <Button type="submit" disabled={loading} className="bg-rose-600 hover:bg-rose-700 text-white gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirmar Egreso
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
