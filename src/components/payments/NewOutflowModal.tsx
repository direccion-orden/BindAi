import React, { useState, useEffect } from "react";
import { collection, query, getDocs, addDoc, updateDoc, doc, increment, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Loader2, DollarSign, Calendar, CreditCard, FileText, Search, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NewOutflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

export function NewOutflowModal({ isOpen, onClose, companyId }: NewOutflowModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingDocs, setFetchingDocs] = useState(false);

  const [documentType, setDocumentType] = useState<"orden_compra" | "gasto" | "recepcion">("orden_compra");
  const [documents, setDocuments] = useState<any[]>([]);
  
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [docSearch, setDocSearch] = useState("");
  const [showDocDropdown, setShowDocDropdown] = useState(false);

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
    if (!isOpen || !companyId) return;
    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBankAccounts(allAcc.filter((a: any) => a.type === "ACTIVO" && a.level > 2 && (a.name.toLowerCase().includes("banco") || a.name.toLowerCase().includes("caja"))));
      setExpenseAccounts(allAcc.filter((a: any) => (a.type === "GASTOS" || a.type === "COSTOS") && a.level > 2));
      setVatAccounts(allAcc.filter((a: any) => a.code.startsWith("118") && a.level > 2));
    });
    return () => unsubAcc();
  }, [isOpen, companyId]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setDocumentType("orden_compra");
      setDocuments([]);
      setSelectedDocId("");
      setDocSearch("");
      setShowDocDropdown(false);
      setAmount(0);
      setDate(new Date().toISOString().split("T")[0]);
      setMethod("Transferencia");
      setReference("");
      setBankAccountId("");
      setExpenseAccountId("");
      setVatRate(0.16);
    }
  }, [isOpen]);

  // Fetch Documents when type changes
  useEffect(() => {
    if (!isOpen || !companyId || !documentType) {
      setDocuments([]);
      setSelectedDocId("");
      setDocSearch("");
      return;
    }

    const fetchDocuments = async () => {
      setFetchingDocs(true);
      try {
        let collectionName = "";
        if (documentType === "orden_compra") collectionName = "purchase_orders";
        else if (documentType === "gasto") collectionName = "expenses_inbox";
        else if (documentType === "recepcion") collectionName = "purchases";

        const q = query(collection(db, "companies", companyId, collectionName));
        const snap = await getDocs(q);
        
        let docsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter out canceled and fully paid
        docsData = docsData.filter((d: any) => {
          if (d.status === "cancelado" || d.status === "cancelada") return false;
          const total = d.totalAmount || d.total || d.totalCost || 0;
          const paid = d.paidAmount || 0;
          return total - paid > 0.01;
        });

        // Sort by creation date desc
        docsData.sort((a: any, b: any) => {
          const dateA = (a.createdAt || a.date) ? new Date(a.createdAt || a.date).getTime() : 0;
          const dateB = (b.createdAt || b.date) ? new Date(b.createdAt || b.date).getTime() : 0;
          return dateB - dateA;
        });

        setDocuments(docsData);
        setSelectedDocId("");
        setDocSearch("");
      } catch (e) {
        console.error("Error fetching documents", e);
      } finally {
        setFetchingDocs(false);
      }
    };

    fetchDocuments();
  }, [documentType, companyId, isOpen]);

  // Update default amount when document changes
  useEffect(() => {
    if (selectedDocId) {
      const doc = documents.find(d => (d.id || d.uuid) === selectedDocId);
      if (doc) {
        const total = doc.totalAmount || doc.total || doc.totalCost || 0;
        const paid = doc.paidAmount || 0;
        const saldoPendiente = total - paid;
        setAmount(Number(saldoPendiente.toFixed(2)));
        setExpenseAccountId(doc.accountId || "");
      }
    } else {
      setAmount(0);
      setExpenseAccountId("");
    }
  }, [selectedDocId, documents]);

  if (!isOpen) return null;

  const selectedDoc = documents.find(d => (d.id || d.uuid) === selectedDocId);
  let saldoPendiente = 0;
  if (selectedDoc) {
     const total = selectedDoc.totalAmount || selectedDoc.total || selectedDoc.totalCost || 0;
     const paid = selectedDoc.paidAmount || 0;
     saldoPendiente = total - paid;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !selectedDoc) return;
    if (amount <= 0 || amount > Number((saldoPendiente + 0.01).toFixed(2))) {
      alert("El monto debe ser mayor a 0 y no puede exceder el saldo pendiente.");
      return;
    }

    if (!bankAccountId) {
      alert("Debes seleccionar una Cuenta de Banco (Origen).");
      return;
    }

    if (!expenseAccountId && !selectedDoc?.accountId) {
      alert("Debes clasificar este egreso en una Cuenta de Gasto.");
      return;
    }

    setLoading(true);
    try {
      let collectionName = "";
      if (documentType === "orden_compra") collectionName = "purchase_orders";
      else if (documentType === "gasto") collectionName = "expenses_inbox";
      else if (documentType === "recepcion") collectionName = "purchases";

      const providerName = selectedDoc.vendorName || selectedDoc.emisorName || "Proveedor";
      const docRefId = selectedDoc.id || selectedDoc.uuid;
      const documentNumber = selectedDoc.orderNumber || selectedDoc.invoiceNumber || selectedDoc.uuid || selectedDoc.id;

      // 1. Create payment record
      const paymentData = {
        amount,
        date,
        method,
        reference,
        documentId: docRefId,
        documentType,
        documentNumber,
        providerName,
        bankAccountId,
        expenseAccountId: selectedDoc.accountId || expenseAccountId,
        createdAt: new Date().toISOString()
      };

      const paymentRef = await addDoc(collection(db, "companies", companyId, "outflows"), paymentData);

      // 1.5 Create Journal Entry (Póliza de Egreso)
      const finalExpenseAccountId = selectedDoc.accountId || expenseAccountId;
      const bankAccount = bankAccounts.find(a => a.id === bankAccountId);
      const expenseAccount = expenseAccounts.find(a => a.id === finalExpenseAccountId);
      
      if (finalExpenseAccountId && bankAccount && expenseAccount) {
        
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
            accountId: bankAccountId,
            accountCode: bankAccount.code,
            accountName: bankAccount.name,
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
        await updateDoc(doc(db, "companies", companyId, "accounts", finalExpenseAccountId), {
          balance: increment(subtotalAmount)
        });
        await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountId), {
          balance: increment(-amount) 
        });
        if (vatAmount > 0 && vatAccount) {
          await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
            balance: increment(vatAmount)
          });
        }
      }

      // If document didn't have accountId (e.g. from SAT), update it so it's classified
      if (!selectedDoc.accountId && expenseAccountId) {
        await updateDoc(doc(db, "companies", companyId, collectionName, docRefId), {
          accountId: expenseAccountId,
          accountCode: expenseAccount?.code || "",
          accountName: expenseAccount?.name || ""
        });
      }

      // 2. Update document paidAmount
      const docRef = doc(db, "companies", companyId, collectionName, docRefId);
      
      const newPaidAmount = (selectedDoc.paidAmount || 0) + amount;
      const updates: any = {
        paidAmount: increment(amount)
      };

      const total = selectedDoc.totalAmount || selectedDoc.total || selectedDoc.totalCost || 0;
      if (newPaidAmount >= total - 0.01) {
        if (documentType === "gasto") {
          if (!selectedDoc.status || selectedDoc.status === "pending") {
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
      
    } catch (error) {
      console.error("Error al registrar egreso:", error);
      alert("Error al registrar el egreso.");
    } finally {
      setLoading(false);
    }
  };

  const methods = ["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"];

  const getDocLabel = (d: any) => {
      const num = d.orderNumber || d.invoiceNumber || (d.uuid ? d.uuid.slice(0,8) : d.id.slice(-6));
      const prov = d.vendorName || d.emisorName || "Proveedor";
      const pending = (d.totalAmount || d.total || d.totalCost || 0) - (d.paidAmount || 0);
      return `${prov} - ${num} (Saldo: $${pending.toLocaleString('es-MX', {minimumFractionDigits:2})})`;
  };

  const filteredDocs = documents.filter(d => getDocLabel(d).toLowerCase().includes(docSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 my-auto">
        <div className="px-6 py-4 border-b bg-rose-50 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2 text-rose-900">
            <DollarSign className="w-5 h-5 text-rose-600" />
            Registrar Nuevo Egreso
          </h2>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border">
            <h3 className="text-sm font-bold uppercase text-slate-500 mb-2">1. Selecciona el Documento</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Tipo de Documento</label>
              <select 
                value={documentType} 
                onChange={e => setDocumentType(e.target.value as any)} 
                className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm capitalize"
              >
                <option value="orden_compra">Orden de Compra</option>
                <option value="gasto">Gasto / Factura de Proveedor</option>
                <option value="recepcion">Recepción de Mercancía</option>
              </select>
            </div>

            <div className="space-y-2 relative">
              <label className="text-sm font-semibold text-slate-700 flex justify-between">
                Documento a Pagar
                {fetchingDocs && <span className="text-xs flex items-center gap-1 text-rose-600"><Loader2 className="w-3 h-3 animate-spin"/> Buscando...</span>}
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por proveedor o folio..."
                  className="pl-9 bg-white"
                  value={docSearch}
                  onChange={e => {
                    setDocSearch(e.target.value);
                    setShowDocDropdown(true);
                    if (e.target.value === "") {
                      setSelectedDocId("");
                    }
                  }}
                  onFocus={() => setShowDocDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDocDropdown(false), 200)}
                  disabled={documents.length === 0}
                  required={!selectedDocId}
                />
              </div>
              
              {showDocDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredDocs.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No hay documentos pendientes encontrados.</div>
                  ) : (
                    filteredDocs.map(d => {
                      const docId = d.id || d.uuid;
                      return (
                        <div 
                          key={docId}
                          className="px-4 py-2 hover:bg-slate-100 cursor-pointer text-sm"
                          onMouseDown={(e) => { 
                            e.preventDefault(); 
                            setSelectedDocId(docId);
                            setDocSearch(getDocLabel(d));
                            setShowDocDropdown(false);
                          }}
                        >
                          {getDocLabel(d)}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={`space-y-4 transition-opacity ${!selectedDocId ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <h3 className="text-sm font-bold uppercase text-slate-500 mb-2 border-b pb-2">2. Detalles del Pago</h3>

            {selectedDoc && (
              <div className="bg-rose-50 text-rose-800 p-3 rounded-lg border border-rose-100 flex justify-between items-center mb-4">
                <span className="text-sm font-medium">Saldo Pendiente</span>
                <span className="text-lg font-black">${saldoPendiente.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                <DollarSign className="w-4 h-4 text-slate-400" />
                Monto Pagado *
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
                <p className="text-xs text-rose-600 mt-1">Advertencia: No tienes una cuenta de IVA Acreditable Pagado (118) configurada.</p>
              )}
            </div>

            {!selectedDoc?.accountId && (
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
                placeholder="Ej. Transferencia SPEI"
                value={reference} 
                onChange={e => setReference(e.target.value)} 
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !selectedDocId} className="bg-rose-600 hover:bg-rose-700 text-white gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar Egreso
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
