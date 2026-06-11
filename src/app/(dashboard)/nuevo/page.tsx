"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Image as ImageIcon, Loader2, Search } from "lucide-react";
import { ErpClient } from "@/app/actions/erp";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp, query as firestoreQuery, orderBy, limit, getDocs, where } from "firebase/firestore";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

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

      // Guardar en Firestore
      await addDoc(collection(db, "companies", companyId, "anticipos"), {
        folio: nextFolio,
        clientId: selectedClient.id,
        clientName: selectedClient.legalName,
        amount: parseFloat(amount),
        balance: parseFloat(amount),
        reference,
        bankAccountId: selectedAccountId,
        bankAccountName: bankAccounts.find(b => b.id === selectedAccountId)?.name || "",
        paymentTermId: parseInt(selectedPaymentTerm),
        paymentTermName: PAYMENT_TERMS.find(p => p.id === selectedPaymentTerm)?.name || "",
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
                onChange={e => setSelectedAccountId(e.target.value)}
              >
                <option value="" disabled>Seleccione una cuenta...</option>
                {bankAccounts.map(b => (
                   <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
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
