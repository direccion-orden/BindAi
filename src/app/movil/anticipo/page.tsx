"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Search, 
  Camera, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  X
} from "lucide-react";
import { collection, query, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAYMENT_TERMS = [
  { id: "1", name: "Efectivo" },
  { id: "3", name: "Transferencia" },
  { id: "4", name: "Tarjeta" }
];

export default function MobileAnticipo() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  // State
  const [allClients, setAllClients] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [showClientList, setShowClientList] = useState(false);

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("3"); // Default Transferencia
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().split("T")[0]);

  // Image Upload & AI Extraction
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiExtractedFields, setAiExtractedFields] = useState<{
    client?: boolean;
    amount?: boolean;
    date?: boolean;
    reference?: boolean;
    paymentMethod?: boolean;
    bankAccount?: boolean;
  }>({});

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Load bank accounts and clients on mount
  useEffect(() => {
    if (!companyId) return;

    const loadBankAccounts = async () => {
      try {
        const q = query(collection(db, "companies", companyId, "bankAccounts"));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().Name || doc.data().name || "Cuenta sin nombre"
        }));
        setBankAccounts(list);
        if (list.length > 0) setSelectedAccountId(list[0].id);
      } catch (err) {
        console.error("Error loading bank accounts:", err);
      }
    };

    const loadClients = async () => {
      setClientsLoading(true);
      try {
        const q = query(collection(db, "companies", companyId, "clients"));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().LegalName || doc.data().CommercialName || doc.data().ClientName || "Cliente sin nombre",
          rfc: doc.data().rfc || doc.data().RFC || ""
        }));
        setAllClients(list);
      } catch (err) {
        console.error("Error loading clients:", err);
      } finally {
        setClientsLoading(false);
      }
    };

    loadBankAccounts();
    loadClients();
  }, [companyId]);

  // Search clients locally
  const handleClientSearch = (val: string) => {
    setClientSearch(val);
    setAiExtractedFields(prev => ({ ...prev, client: false }));
    
    if (val.trim().length < 2) {
      setFilteredClients([]);
      setShowClientList(false);
      return;
    }

    const filtered = allClients.filter(c => 
      c.name.toLowerCase().includes(val.toLowerCase()) || 
      c.rfc.toLowerCase().includes(val.toLowerCase())
    );
    setFilteredClients(filtered);
    setShowClientList(true);
  };

  const handleSelectClient = (c: any) => {
    setSelectedClient(c);
    setClientSearch(c.name);
    setShowClientList(false);
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Analyze receipt image with Gemini
  const analyzeReceiptWithAI = async (file: File) => {
    setIsAnalyzing(true);
    setAiExtractedFields({});
    try {
      const base64 = await fileToBase64(file);
      
      const response = await fetch("/api/ai/analyze-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64: base64,
          imageType: file.type,
          clients: allClients,
          bankAccounts: bankAccounts,
          companyId
        })
      });

      if (!response.ok) {
        throw new Error("Error analizando el comprobante con la API");
      }

      const result = await response.json();
      const updatedExtracted: typeof aiExtractedFields = {};

      if (result.amount) {
        setAmount(result.amount.toString());
        updatedExtracted.amount = true;
      }
      if (result.date) {
        setReceivedAt(result.date);
        updatedExtracted.date = true;
      }
      if (result.reference) {
        setReference(result.reference);
        updatedExtracted.reference = true;
      }
      if (result.paymentTermId) {
        setPaymentTerm(result.paymentTermId);
        updatedExtracted.paymentMethod = true;
      }
      if (result.matchingBankAccount && result.matchingBankAccount.id) {
        setSelectedAccountId(result.matchingBankAccount.id);
        updatedExtracted.bankAccount = true;
      }
      if (result.matchingClient && result.matchingClient.id) {
        const matched = allClients.find(c => c.id === result.matchingClient.id);
        if (matched) {
          setSelectedClient(matched);
          setClientSearch(matched.name);
          updatedExtracted.client = true;
        }
      }

      setAiExtractedFields(updatedExtracted);
    } catch (err) {
      console.error("AI Analysis error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      analyzeReceiptWithAI(file);
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setAiExtractedFields({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!selectedClient) {
      alert("Por favor selecciona un cliente.");
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Por favor ingresa un monto válido.");
      return;
    }
    if (!selectedAccountId) {
      alert("Por favor selecciona una cuenta bancaria.");
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      let imageUrl = "";
      if (imageFile) {
        const storageRef = ref(storage, `companies/${companyId}/anticipos_receipts/${Date.now()}_${imageFile.name}`);
        const uploadResult = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      // Add to Firestore
      await addDoc(collection(db, "companies", companyId, "anticipos"), {
        amount: numAmount.toString(),
        balance: numAmount.toString(),
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        reference: reference.trim(),
        receivedAt,
        status: "pending",
        bankAccountId: selectedAccountId,
        paymentTermId: paymentTerm,
        imageUrl,
        createdAt: serverTimestamp(),
        createdBy: user?.email || "Cajero Móvil"
      });

      setSubmitStatus("success");
    } catch (err: any) {
      console.error("Error submitting advance payment:", err);
      setErrorMessage(err.message || "Ocurrió un error inesperado al guardar el anticipo.");
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitStatus === "success") {
    return (
      <div className="flex-1 flex flex-col justify-between p-6 bg-slate-900 h-full animate-in fade-in">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center animate-bounce">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">Anticipo Guardado</h2>
          <p className="text-slate-400 text-sm max-w-xs">
            El anticipo del cliente <strong className="text-slate-200">{selectedClient?.name}</strong> por la cantidad de <strong className="text-emerald-400">${parseFloat(amount).toFixed(2)} MXN</strong> se ha registrado correctamente en el sistema.
          </p>
        </div>
        <div className="space-y-3">
          <Button 
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
            onClick={() => {
              setSelectedClient(null);
              setClientSearch("");
              setAmount("");
              setReference("");
              setImageFile(null);
              setImagePreview(null);
              setSubmitStatus("idle");
              setAiExtractedFields({});
            }}
          >
            Registrar Otro Anticipo
          </Button>
          <Button 
            variant="ghost"
            className="w-full h-12 text-slate-400 hover:text-white"
            onClick={() => router.push("/movil")}
          >
            Volver al Menú Principal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-900 h-full overflow-hidden">
      
      {/* Header Navigation */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-white/5 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 shrink-0">
        <button onClick={() => router.push("/movil")} className="p-2 -ml-2 rounded-lg hover:bg-white/5 active:scale-90 transition-all">
          <ArrowLeft className="w-5 h-5 text-slate-300" />
        </button>
        <span className="font-bold text-base text-white">Registrar Anticipo</span>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between overflow-y-auto p-5 space-y-6">
        <div className="space-y-5">
          
          {/* TOP OPTION: Photo / Gallery Upload */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block">Foto del Comprobante</label>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 h-44 bg-slate-950">
                <img src={imagePreview} alt="Receipt preview" className="w-full h-full object-contain" />
                
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 animate-in fade-in">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <span className="text-xs font-semibold text-slate-200">Analizando comprobante con IA...</span>
                  </div>
                )}
                
                <button 
                  type="button" 
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 text-slate-300 hover:text-white z-10"
                  onClick={handleClearImage}
                  disabled={isAnalyzing}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col items-center justify-center border border-dashed border-slate-700 rounded-xl h-24 bg-slate-800/20 hover:bg-slate-800/40 transition-colors cursor-pointer group">
                  <Camera className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-300 mt-1">Cámara</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                    onChange={handleImageChange} 
                  />
                </label>
                <label className="flex flex-col items-center justify-center border border-dashed border-slate-700 rounded-xl h-24 bg-slate-800/20 hover:bg-slate-800/40 transition-colors cursor-pointer group">
                  <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                  <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-300 mt-1">Galería</span>
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

          {/* 1. Cliente Input */}
          <div className="space-y-1.5 relative">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
              <span>Cliente</span>
              {aiExtractedFields.client && (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">
                  Sugerido con IA
                </span>
              )}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-9 h-11 bg-slate-800/80 border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl"
                placeholder="Buscar por nombre o RFC..."
                value={clientSearch}
                onChange={(e) => handleClientSearch(e.target.value)}
                onFocus={() => { if (filteredClients.length > 0) setShowClientList(true); }}
              />
              {selectedClient && (
                <button 
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-700 text-slate-300 hover:text-white"
                  onClick={() => {
                    setSelectedClient(null);
                    setClientSearch("");
                    setFilteredClients([]);
                    setAiExtractedFields(prev => ({ ...prev, client: false }));
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Clients Autocomplete List */}
            {showClientList && (
              <div className="absolute top-[70px] left-0 right-0 max-h-60 overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-40 divide-y divide-slate-700/50">
                {clientsLoading ? (
                  <div className="p-4 flex items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    Buscando clientes...
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="p-4 text-slate-400 text-xs text-center">No se encontraron clientes</div>
                ) : (
                  filteredClients.map(c => (
                    <div 
                      key={c.id}
                      className="p-3 hover:bg-slate-700/50 cursor-pointer text-left transition-colors"
                      onClick={() => handleSelectClient(c)}
                    >
                      <p className="text-xs font-bold text-slate-200">{c.name}</p>
                      {c.rfc && <p className="text-[10px] text-slate-500 mt-0.5">RFC: {c.rfc}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2. Monto Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
              <span>Monto (MXN)</span>
              {aiExtractedFields.amount && (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                  Extraído con IA
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">$</span>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                className="pl-8 h-12 bg-slate-800/80 border-slate-700 text-slate-200 text-xl font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setAiExtractedFields(prev => ({ ...prev, amount: false }));
                }}
                required
              />
            </div>
          </div>

          {/* 3. Cuenta Bancaria Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
              <span>Cuenta Bancaria Receptora</span>
              {aiExtractedFields.bankAccount && (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20 animate-pulse">
                  Asociado con IA
                </span>
              )}
            </label>
            <select
              className="flex h-11 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setAiExtractedFields(prev => ({ ...prev, bankAccount: false }));
              }}
              required
            >
              {bankAccounts.length === 0 ? (
                <option value="">Cargando cuentas...</option>
              ) : (
                bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))
              )}
            </select>
          </div>

          {/* 4. Payment Method Tabs */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
              <span>Método de Pago</span>
              {aiExtractedFields.paymentMethod && (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                  Extraído con IA
                </span>
              )}
            </label>
            <div className="grid grid-cols-3 gap-2 bg-slate-800/50 p-1 rounded-xl border border-slate-700">
              {PAYMENT_TERMS.map(term => (
                <button
                  key={term.id}
                  type="button"
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    paymentTerm === term.id 
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10" 
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => {
                    setPaymentTerm(term.id);
                    setAiExtractedFields(prev => ({ ...prev, paymentMethod: false }));
                  }}
                >
                  {term.name}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Fecha Input (un solo campo por línea) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
              <span>Fecha</span>
              {aiExtractedFields.date && (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                  Extraído con IA
                </span>
              )}
            </label>
            <Input
              type="date"
              className="h-11 bg-slate-800/80 border-slate-700 text-slate-200 rounded-xl"
              value={receivedAt}
              onChange={(e) => {
                setReceivedAt(e.target.value);
                setAiExtractedFields(prev => ({ ...prev, date: false }));
              }}
              required
            />
          </div>

          {/* 6. Referencia Input (un solo campo por línea) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center justify-between">
              <span>Referencia</span>
              {aiExtractedFields.reference && (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                  Extraído con IA
                </span>
              )}
            </label>
            <Input
              className="h-11 bg-slate-800/80 border-slate-700 text-slate-200 rounded-xl"
              placeholder="Ej. Clave de rastreo o folio"
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                setAiExtractedFields(prev => ({ ...prev, reference: false }));
              }}
            />
          </div>

        </div>

        {/* Submit Button */}
        <div className="pt-4 shrink-0">
          {submitStatus === "error" && (
            <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 text-xs text-rose-400 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
          
          <Button 
            type="submit" 
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl gap-2 flex items-center justify-center shadow-lg shadow-indigo-600/15"
            disabled={isSubmitting || isAnalyzing}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Registrando...
              </>
            ) : (
              "Registrar Anticipo"
            )}
          </Button>
        </div>
      </form>

    </div>
  );
}
