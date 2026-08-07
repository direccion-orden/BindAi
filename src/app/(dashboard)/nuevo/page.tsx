"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Image as ImageIcon, Loader2, Search } from "lucide-react";
import { ErpClient } from "@/app/actions/erp";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query as firestoreQuery, orderBy, limit, getDocs, where, onSnapshot, doc, updateDoc, increment } from "firebase/firestore";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, AlertCircle } from "lucide-react";

const PAYMENT_TERMS = [
  { id: "1", name: "Efectivo" },
  { id: "2", name: "Cheque" },
  { id: "3", name: "Transferencia Electrónica" },
  { id: "4", name: "Tarjeta de Crédito" },
  { id: "5", name: "Tarjeta de Débito" }
];

export default function NuevoAnticipoPage() {
  const { user, companyId } = useAuth();
  const router = useRouter();
  
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().split("T")[0]);

  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedPaymentTerm, setSelectedPaymentTerm] = useState("3");
  
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reconciliation states
  const [unreconciledTransactions, setUnreconciledTransactions] = useState<any[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>("manual");

  React.useEffect(() => {
    if (!companyId) return;
    const fetchAccounts = async () => {
      try {
        const q = firestoreQuery(collection(db, "companies", companyId, "bankAccounts"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().Name || doc.data().name || "Cuenta sin nombre" }));
        setBankAccounts(data);
        if (data && data.length > 0) setSelectedAccountId(data[0].id);
      } catch (error) {
        console.error("Error loading bank accounts:", error);
      }
    };
    fetchAccounts();
  }, [companyId]);

  // Fetch unreconciled transactions when account changes
  React.useEffect(() => {
    if (!companyId || !selectedAccountId) {
      setUnreconciledTransactions([]);
      return;
    }

    const q = firestoreQuery(
      collection(db, "companies", companyId, "bankAccounts", selectedAccountId, "transactions"),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const txs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      // Only positive amounts (inflows) and not reconciled
      const filtered = txs.filter(t => t.amount > 0 && !t.reconciled);
      setUnreconciledTransactions(filtered);
    }, (error) => {
      console.error("Error loading transactions:", error);
    });

    return () => unsubscribe();
  }, [companyId, selectedAccountId]);

  // Auto-fill when a transaction is selected
  React.useEffect(() => {
    if (selectedTransactionId && selectedTransactionId !== "manual") {
      const matchedTx = unreconciledTransactions.find(t => t.id === selectedTransactionId);
      if (matchedTx) {
        if (matchedTx.reference) setReference(matchedTx.reference);
        if (matchedTx.date) setReceivedAt(matchedTx.date);
        if (matchedTx.amount) setAmount(String(matchedTx.amount));
      }
    }
  }, [selectedTransactionId, unreconciledTransactions]);

  const handleSearch = async () => {
    if (!query || !companyId) return;
    setIsSearching(true);
    try {
      const q = firestoreQuery(collection(db, "companies", companyId, "clients"));
      const snapshot = await getDocs(q);
      const allClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      const searchTerm = query.toLowerCase();
      const results = allClients.filter(c => {
        const nameVal = (c.LegalName || c.CommercialName || c.ClientName || c.legalName || c.name || c.razonSocial || "").toLowerCase();
        const rfcVal = (c.RFC || c.rfc || "").toLowerCase();
        const emailVal = (c.Email || c.email || "").toLowerCase();
        return nameVal.includes(searchTerm) || rfcVal.includes(searchTerm) || emailVal.includes(searchTerm);
      });
      
      // Map to expected structure
      const mapped = results.map(c => {
        const nameVal = c.LegalName || c.CommercialName || c.ClientName || c.legalName || c.name || c.razonSocial || "Cliente sin nombre";
        const rfcVal = c.RFC || c.rfc || "";
        return {
          id: c.id,
          legalName: nameVal,
          rfc: rfcVal
        };
      });
      
      setClients(mapped);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !amount || parseFloat(amount) <= 0) return;
    if (!selectedAccountId) {
      alert("Debes seleccionar una cuenta bancaria.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      let imageUrl = "";
      
      if (imageFile) {
        const storageRef = ref(storage, `anticipos/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      // 1. Obtener último Folio
      if (!companyId) return;
      let nextFolio = 1;
      const qFolio = firestoreQuery(collection(db, "companies", companyId, "anticipos"), orderBy("folio", "desc"), limit(1));
      const folioSnap = await getDocs(qFolio);
      if (!folioSnap.empty) {
        nextFolio = ((folioSnap.docs[0].data() as any).folio || 0) + 1;
      }

      const finalAmount = parseFloat(amount);
      let finalBankTransactionId = "";

      // 2. Conciliación Bancaria
      if (selectedTransactionId && selectedTransactionId !== "manual") {
        finalBankTransactionId = selectedTransactionId;
        await updateDoc(doc(db, "companies", companyId, "bankAccounts", selectedAccountId, "transactions", selectedTransactionId), {
          reconciled: true,
          matchedAt: new Date().toISOString(),
          reconcileType: "match",
          matchedDocumentId: `ANT-${nextFolio}`
        });
      } else if (selectedPaymentTerm === "1") { // 1 = Efectivo
        // Registro manual: crear transacción conciliada SOLO para Efectivo (para evitar duplicados en bancos)
        const txData = {
          amount: finalAmount,
          date: receivedAt,
          concept: `Anticipo de Cliente (Efectivo): ${selectedClient.legalName} - Ref: ${reference || "Sin Ref"}`,
          reference: reference || "",
          reconciled: true,
          matchedAt: new Date().toISOString(),
          reconcileType: "direct",
          matchedDocumentId: `ANT-${nextFolio}`,
          createdAt: new Date().toISOString(),
        };
        const txRef = await addDoc(collection(db, "companies", companyId, "bankAccounts", selectedAccountId, "transactions"), txData);
        finalBankTransactionId = txRef.id;

        // Actualizar saldo de la cuenta bancaria (Caja/Efectivo)
        await updateDoc(doc(db, "companies", companyId, "bankAccounts", selectedAccountId), {
          balance: increment(finalAmount)
        });
      } else {
        // Registro manual para otros métodos: NO crear movimiento, queda pendiente de conciliar para evitar duplicados
        finalBankTransactionId = "";
      }

      const termName = PAYMENT_TERMS.find(p => p.id === selectedPaymentTerm)?.name || "Efectivo";

      // 3. Guardar Anticipo en Firestore
      await addDoc(collection(db, "companies", companyId, "anticipos"), {
        folio: nextFolio,
        clientId: selectedClient.id,
        clientName: selectedClient.legalName,
        amount: finalAmount,
        balance: finalAmount,
        reference,
        bankAccountId: selectedAccountId,
        bankAccountName: bankAccounts.find(b => b.id === selectedAccountId)?.name || "",
        bankTransactionId: finalBankTransactionId || null,
        paymentTermId: parseInt(selectedPaymentTerm),
        paymentTermName: termName,
        imageUrl,
        receivedAt,
        createdBy: user?.email,
        createdAt: serverTimestamp(),
        status: "pending" // pending -> partially_applied -> applied
      });

      router.push("/anticipos");

    } catch (error) {
      console.error("Error creating anticipo", error);
      alert("Hubo un error al guardar el anticipo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nuevo Anticipo</h1>
        <p className="text-muted-foreground">
          Captura un nuevo anticipo y sube evidencia o toma una foto.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-card p-6 rounded-lg shadow-sm border">
        
        {/* Selección de Cliente */}
        <div className="space-y-3">
          <label className="text-sm font-medium">1. Buscar Cliente (ERP)</label>
          {selectedClient ? (
            <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
              <span className="font-medium text-primary">{selectedClient.legalName}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedClient(null)}>
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input 
                  value={query} 
                  onChange={(e) => setQuery(e.target.value)} 
                  placeholder="Nombre o RFC..." 
                />
                <Button type="button" onClick={handleSearch} disabled={isSearching} variant="secondary">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {clients.length > 0 && (
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {clients.map(c => (
                    <div 
                      key={c.id} 
                      className="p-3 hover:bg-muted cursor-pointer text-sm"
                      onClick={() => setSelectedClient(c)}
                    >
                      {c.legalName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detalles del Anticipo */}
        <div className="space-y-3">
          <label className="text-sm font-medium">2. Detalles del Monto</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Monto (MXN)</span>
              <Input 
                type="number" 
                min="0.01" 
                step="0.01" 
                required 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                placeholder="0.00" 
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Fecha de Recepción</span>
              <Input 
                type="date" 
                required 
                value={receivedAt} 
                onChange={e => setReceivedAt(e.target.value)} 
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Referencia (Opcional)</span>
              <Input 
                value={reference} 
                onChange={e => setReference(e.target.value)} 
                placeholder="Transferencia #00123" 
              />
            </div>
          </div>
        </div>

        {/* Método y Cuenta de Pago */}
        <div className="space-y-3">
          <label className="text-sm font-medium">3. Forma de Pago y Depósito</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Forma de Pago</span>
              <select 
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={selectedPaymentTerm}
                onChange={e => setSelectedPaymentTerm(e.target.value)}
              >
                {PAYMENT_TERMS.map(term => (
                   <option key={term.id} value={term.id}>{term.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Cuenta de Depósito (ERP)</span>
              <select 
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={selectedAccountId}
                onChange={e => {
                  setSelectedAccountId(e.target.value);
                  setSelectedTransactionId("manual"); // Reset transaction when account changes
                }}
              >
                <option value="" disabled>Seleccione una cuenta...</option>
                {bankAccounts.map(b => (
                   <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Sugerencia de Conciliación */}
          {selectedAccountId && (
            <div className="mt-4 p-4 border rounded-lg bg-indigo-50/50 border-indigo-100 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Vincular con Movimiento Bancario
                </label>
                <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase">
                  Recomendado
                </span>
              </div>
              
              <div className="space-y-2">
                <select
                  className="flex h-10 w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  value={selectedTransactionId}
                  onChange={(e) => setSelectedTransactionId(e.target.value)}
                >
                  <option value="manual">-- Crear registro manual (No sugerido) --</option>
                  {unreconciledTransactions.map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {new Date(tx.date + "T12:00:00").toLocaleDateString()} - ${tx.amount.toLocaleString('es-MX')} - {tx.concept || tx.reference || 'Sin concepto'}
                    </option>
                  ))}
                </select>
                
                {selectedTransactionId === "manual" ? (
                  <p className="text-[11px] text-amber-700 flex items-center gap-1.5 px-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {selectedPaymentTerm === "1" 
                      ? "Se creará un registro en Caja (Efectivo) y quedará autoconciliado." 
                      : "El anticipo quedará pendiente de conciliar para evitar duplicados al importar estados de cuenta."}
                  </p>
                ) : (
                  <p className="text-[11px] text-green-700 flex items-center gap-1.5 px-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ¡Excelente! El anticipo quedará conciliado con el movimiento seleccionado.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Evidencia: Foto/Cámara */}
        <div className="space-y-3">
          <label className="text-sm font-medium">4. Evidencia del Anticipo</label>
          
          <div className="flex flex-col gap-4">
            {imagePreview && (
              <div className="relative w-full h-48 rounded-md overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="Evidencia" className="object-cover w-full h-full" />
                <Button 
                  type="button"
                  variant="destructive" 
                  size="sm" 
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-2 right-2"
                >
                  Quitar
                </Button>
              </div>
            )}

            {!imagePreview && (
              <div className="flex gap-4">
                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-md p-6 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm font-medium">Tomar Foto</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                    onChange={handleImageChange}
                  />
                </label>

                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-md p-6 cursor-pointer hover:bg-muted/50 transition-colors">
                  <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm font-medium">Subir Imagen</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleImageChange}
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-4 border-t">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!selectedClient || !amount || isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar Anticipo
          </Button>
        </div>
      </form>
    </div>
  );
}
