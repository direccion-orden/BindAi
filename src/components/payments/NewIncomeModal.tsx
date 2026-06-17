import React, { useState, useEffect } from "react";
import { collection, query, getDocs, addDoc, updateDoc, doc, increment, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Loader2, DollarSign, Calendar, CreditCard, FileText, Search, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NewIncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

export function NewIncomeModal({ isOpen, onClose, companyId }: NewIncomeModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingClients, setFetchingClients] = useState(false);
  const [fetchingDocs, setFetchingDocs] = useState(false);

  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [documentType, setDocumentType] = useState<"pedido" | "remision" | "factura">("factura");
  
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");

  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [bankAccountId, setBankAccountId] = useState("");

  const [vatAccounts, setVatAccounts] = useState<any[]>([]);
  const [vatRate, setVatRate] = useState<number>(0.16); // Default 16%

  // Fetch Bank Accounts when modal opens
  useEffect(() => {
    if (!isOpen || !companyId) return;
    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBankAccounts(allAcc.filter((a: any) => a.type === "ACTIVO" && a.level >= 2 && (a.name.toLowerCase().includes("banco") || a.name.toLowerCase().includes("caja"))));
      setVatAccounts(allAcc.filter((a: any) => a.code.startsWith("208") && a.level >= 2));
    });
    return () => unsubAcc();
  }, [isOpen, companyId]);

  // Fetch Clients when modal opens
  useEffect(() => {
    if (!isOpen || !companyId) return;
    const fetchClients = async () => {
      setFetchingClients(true);
      try {
        const snap = await getDocs(collection(db, "companies", companyId, "clients"));
        const clientsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort alphabetically
        clientsData.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
        setClients(clientsData);
      } catch (e) {
        console.error("Error fetching clients", e);
      } finally {
        setFetchingClients(false);
      }
    };
    fetchClients();
    
    // Reset state
    setSelectedClientId("");
    setClientSearch("");
    setShowClientDropdown(false);
    setDocumentType("factura");
    setDocuments([]);
    setSelectedDocId("");
    setAmount(0);
    setDate(new Date().toISOString().split("T")[0]);
    setMethod("Transferencia");
    setReference("");
    setBankAccountId("");
  }, [isOpen, companyId]);

  // Fetch Documents when client or type changes
  useEffect(() => {
    if (!selectedClientId || !documentType || !companyId) {
      setDocuments([]);
      setSelectedDocId("");
      return;
    }

    const fetchDocuments = async () => {
      setFetchingDocs(true);
      try {
        let collectionName = "";
        if (documentType === "pedido") collectionName = "pedidos";
        else if (documentType === "remision") collectionName = "remisiones";
        else if (documentType === "factura") collectionName = "facturas";

        const q = query(
          collection(db, "companies", companyId, collectionName),
          where("clientId", "==", selectedClientId)
        );
        const snap = await getDocs(q);
        
        let docsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Filter out canceled and fully paid
        docsData = docsData.filter((d: any) => {
          if (d.status === "cancelado" || d.status === "cancelada") return false;
          const total = d.totalAmount || 0;
          const paid = d.paidAmount || 0;
          return total - paid > 0.01;
        });

        // Sort by creation date desc
        docsData.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

        setDocuments(docsData);
        setSelectedDocId("");
      } catch (e) {
        console.error("Error fetching documents", e);
      } finally {
        setFetchingDocs(false);
      }
    };

    fetchDocuments();
  }, [selectedClientId, documentType, companyId]);

  // Update default amount when document changes
  useEffect(() => {
    if (selectedDocId) {
      const doc = documents.find(d => d.id === selectedDocId);
      if (doc) {
        const saldoPendiente = (doc.totalAmount || 0) - (doc.paidAmount || 0);
        setAmount(Number(saldoPendiente.toFixed(2)));
      }
    } else {
      setAmount(0);
    }
  }, [selectedDocId, documents]);

  if (!isOpen) return null;

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const saldoPendiente = selectedDoc ? (selectedDoc.totalAmount || 0) - (selectedDoc.paidAmount || 0) : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !selectedDoc) return;
    if (amount <= 0 || amount > Number((saldoPendiente + 0.01).toFixed(2))) {
      alert("El monto debe ser mayor a 0 y no puede exceder el saldo pendiente.");
      return;
    }
    
    if (!bankAccountId) {
      alert("Debes seleccionar una Cuenta de Banco.");
      return;
    }

    setLoading(true);
    try {
      let collectionName = "";
      if (documentType === "pedido") collectionName = "pedidos";
      else if (documentType === "remision") collectionName = "remisiones";
      else if (documentType === "factura") collectionName = "facturas";

      // 1. Create payment record
      const paymentData = {
        amount,
        date,
        method,
        reference,
        documentId: selectedDoc.id,
        documentType,
        documentNumber: selectedDoc.orderNumber || selectedDoc.remissionNumber || selectedDoc.invoiceNumber || selectedDoc.id,
        clientId: selectedDoc.clientId || "",
        clientName: selectedDoc.clientName || "",
        locationId: selectedDoc.locationId || null,
        locationName: selectedDoc.locationName || "",
        bankAccountId,
        createdAt: new Date().toISOString()
      };

      const paymentRef = await addDoc(collection(db, "companies", companyId, "payments"), paymentData);

      // 1.5 Create Journal Entry (Póliza de Ingreso)
      // Cargo a Banco (Activo aumenta con cargo)
      // Abono a Ingreso (Ingreso aumenta con abono)
      // Abono a IVA Trasladado Cobrado (Pasivo aumenta con abono)
      if (selectedDoc.accountId) {
        const bankAccount = bankAccounts.find(a => a.id === bankAccountId);
        
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
            accountId: bankAccountId,
            accountCode: bankAccount?.code || "",
            accountName: bankAccount?.name || "",
            debit: amount,
            credit: 0
          },
          {
            accountId: selectedDoc.accountId,
            accountCode: selectedDoc.accountCode || "",
            accountName: selectedDoc.accountName || "",
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
        await updateDoc(doc(db, "companies", companyId, "accounts", selectedDoc.accountId), {
          balance: increment(subtotalAmount) 
        });
        if (vatAmount > 0 && vatAccount) {
          await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
            balance: increment(vatAmount)
          });
        }
      }

      // 2. Update document paidAmount
      const docRef = doc(db, "companies", companyId, collectionName, selectedDoc.id);
      
      const newPaidAmount = (selectedDoc.paidAmount || 0) + amount;
      const updates: any = {
        paidAmount: increment(amount)
      };

      if (newPaidAmount >= (selectedDoc.totalAmount || 0) - 0.01) {
        if (documentType === "factura" || documentType === "remision") {
          if (selectedDoc.status !== "cancelada" && selectedDoc.status !== "cancelado") {
            updates.status = "pagada";
          }
        }
      }

      await updateDoc(docRef, updates);

      alert("Pago registrado exitosamente.");
      onClose();
      // En la pagina de ingresos, el onSnapshot actualizará la tabla
      
    } catch (error) {
      console.error("Error al registrar pago:", error);
      alert("Error al registrar el pago.");
    } finally {
      setLoading(false);
    }
  };

  const methods = ["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 my-auto">
        <div className="px-6 py-4 border-b bg-emerald-50 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-900">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Registrar Nuevo Ingreso
          </h2>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border">
            <h3 className="text-sm font-bold uppercase text-slate-500 mb-2">1. Selecciona el Documento</h3>
            
            <div className="space-y-2 relative">
              <label className="text-sm font-semibold text-slate-700">Cliente</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar cliente por nombre..."
                  className="pl-9 bg-white"
                  value={clientSearch}
                  onChange={e => {
                    setClientSearch(e.target.value);
                    setShowClientDropdown(true);
                    if (e.target.value === "") {
                      setSelectedClientId("");
                    }
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                  onBlur={() => setTimeout(() => setShowClientDropdown(false), 200)}
                  required={!selectedClientId}
                />
              </div>
              
              {showClientDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {clients.filter(c => (c.name || "").toLowerCase().includes(clientSearch.toLowerCase())).length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No hay resultados.</div>
                  ) : (
                    clients.filter(c => (c.name || "").toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                      <div 
                        key={c.id}
                        className="px-4 py-2 hover:bg-slate-100 cursor-pointer text-sm"
                        onMouseDown={(e) => { 
                          e.preventDefault(); // Prevent blur
                          setSelectedClientId(c.id);
                          setClientSearch(c.name);
                          setShowClientDropdown(false);
                        }}
                      >
                        {c.name}
                      </div>
                    ))
                  )}
                </div>
              )}
              {fetchingClients && <span className="text-xs flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin"/> Cargando clientes...</span>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Tipo de Documento</label>
              <select 
                value={documentType} 
                onChange={e => setDocumentType(e.target.value as any)} 
                className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm capitalize"
                disabled={!selectedClientId}
              >
                <option value="pedido">Pedido</option>
                <option value="remision">Remisión</option>
                <option value="factura">Factura</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 flex justify-between">
                Documento a Pagar
                {fetchingDocs && <span className="text-xs flex items-center gap-1 text-indigo-600"><Loader2 className="w-3 h-3 animate-spin"/> Buscando...</span>}
              </label>
              <select 
                value={selectedDocId} 
                onChange={e => setSelectedDocId(e.target.value)} 
                className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                disabled={!selectedClientId || documents.length === 0}
                required
              >
                <option value="">
                  {!selectedClientId ? "Selecciona un cliente primero" : documents.length === 0 ? "No hay documentos con saldo" : "Seleccione un documento..."}
                </option>
                {documents.map(d => {
                  const num = d.orderNumber || d.remissionNumber || d.invoiceNumber || d.id;
                  const prefix = documentType === "pedido" ? "PED" : documentType === "remision" ? "REM" : "FAC";
                  const pending = (d.totalAmount || 0) - (d.paidAmount || 0);
                  return (
                    <option key={d.id} value={d.id}>
                      {prefix}-{num} - Saldo: ${pending.toLocaleString('es-MX', {minimumFractionDigits:2})}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>

          <div className={`space-y-4 transition-opacity ${!selectedDocId ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            <h3 className="text-sm font-bold uppercase text-slate-500 mb-2 border-b pb-2">2. Detalles del Pago</h3>

            {selectedDoc && (
              <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg border border-emerald-100 flex justify-between items-center mb-4">
                <span className="text-sm font-medium">Saldo Pendiente</span>
                <span className="text-lg font-black">${saldoPendiente.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
              </div>
            )}

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
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !selectedDocId} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar Ingreso
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
