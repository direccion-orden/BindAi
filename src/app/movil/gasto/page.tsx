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
  X,
  CreditCard,
  DollarSign
} from "lucide-react";
import { collection, query, getDocs, setDoc, addDoc, doc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { getNextSequence } from "@/lib/firebase/counters";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAYMENT_METHODS = [
  { id: "Efectivo", name: "Efectivo" },
  { id: "Transferencia", name: "Transferencia" },
  { id: "Tarjeta", name: "Tarjeta" }
];

export default function MobileGasto() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  // Catalogs State
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<any | null>(null);
  const [showVendorList, setShowVendorList] = useState(false);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");

  // Form Fields
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Transferencia");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");

  // Image Upload
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Fetch accounts, locations, bank accounts on mount
  useEffect(() => {
    if (!companyId) return;

    const loadCatalogs = async () => {
      try {
        // 1. Load locations
        const locSnap = await getDocs(query(collection(db, "companies", companyId, "locations")));
        const locList = locSnap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().Name || "Sucursal sin nombre"
        }));
        setLocations(locList);
        if (locList.length > 0) setSelectedLocationId(locList[0].id);

        // 2. Load accounts (Gastos & Costos, Level >= 2)
        const accSnap = await getDocs(query(collection(db, "companies", companyId, "accounts")));
        const accList = accSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        const filteredAccs = accList.filter(a => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2);
        setAccounts(filteredAccs);
        if (filteredAccs.length > 0) setSelectedAccountId(filteredAccs[0].id);

        // 3. Load bank accounts
        const bankSnap = await getDocs(query(collection(db, "companies", companyId, "bankAccounts")));
        const bankList = bankSnap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().Name || "Cuenta sin nombre"
        }));
        setBankAccounts(bankList);
        if (bankList.length > 0) setSelectedBankAccountId(bankList[0].id);

      } catch (err) {
        console.error("Error loading catalogs:", err);
      }
    };

    loadCatalogs();
  }, [companyId]);

  // Search vendors
  const handleVendorSearch = async (val: string) => {
    setVendorSearch(val);
    if (val.trim().length < 2 || !companyId) {
      setVendors([]);
      setShowVendorList(false);
      return;
    }

    setVendorsLoading(true);
    try {
      const q = query(collection(db, "companies", companyId, "vendors"));
      const snap = await getDocs(q);
      const all = snap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().LegalName || doc.data().name || doc.data().CommercialName || "Proveedor sin nombre",
        rfc: doc.data().rfc || doc.data().RFC || ""
      }));
      
      const filtered = all.filter(v => 
        v.name.toLowerCase().includes(val.toLowerCase()) || 
        v.rfc.toLowerCase().includes(val.toLowerCase())
      );
      setVendors(filtered);
      setShowVendorList(true);
    } catch (err) {
      console.error(err);
    } finally {
      setVendorsLoading(false);
    }
  };

  const handleSelectVendor = (v: any) => {
    setSelectedVendor(v);
    setVendorSearch(v.name);
    setShowVendorList(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!selectedVendor) {
      alert("Por favor selecciona un proveedor.");
      return;
    }
    if (!selectedAccountId) {
      alert("Por favor selecciona una categoría / cuenta contable de gasto.");
      return;
    }
    if (!selectedLocationId) {
      alert("Por favor selecciona una sucursal / almacén.");
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Por favor ingresa un monto válido.");
      return;
    }
    if (!selectedBankAccountId) {
      alert("Por favor selecciona una cuenta bancaria pagadora.");
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      let imageUrl = "";
      if (imageFile) {
        const storageRef = ref(storage, `companies/${companyId}/expenses_receipts/${Date.now()}_${imageFile.name}`);
        const uploadResult = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(uploadResult.ref);
      }

      // Generate sequence number and document ID
      const sequenceNum = await getNextSequence(companyId, "gastos");
      const expenseId = crypto.randomUUID();

      const selectedAccountObj = accounts.find(a => a.id === selectedAccountId);
      const selectedLocationObj = locations.find(l => l.id === selectedLocationId);
      const selectedBankObj = bankAccounts.find(b => b.id === selectedBankAccountId);

      // 1. Create the Gasto (expense) document
      const expenseDoc = {
        id: expenseId,
        sequenceNumber: sequenceNum,
        vendorId: selectedVendor.id,
        vendorName: selectedVendor.name,
        date,
        notes: notes.trim(),
        concept: concept.trim() || `Gasto ${selectedAccountObj?.name || ""}`,
        totalCost: numAmount,
        vatRate: 0.16, // assuming 16% standard VAT
        locationId: selectedLocationId,
        locationName: selectedLocationObj?.name || "Sucursal",
        accountId: selectedAccountId,
        accountCode: selectedAccountObj?.code || "",
        accountName: selectedAccountObj?.name || "",
        paidAmount: numAmount,
        status: "paid",
        satInvoiceId: null,
        items: [
          {
            productId: "custom",
            variantId: "custom",
            productName: concept.trim() || `Gasto ${selectedAccountObj?.name || ""}`,
            variantTitle: "Gasto",
            quantity: 1,
            unitCost: numAmount,
            lineKey: "line-1",
            costCenterId: null,
            accountId: selectedAccountId,
            locationId: selectedLocationId
          }
        ],
        imageUrl,
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Cajero Móvil"
      };

      await setDoc(doc(db, "companies", companyId, "expenses", expenseId), expenseDoc);

      // 2. Create the Bank Transaction document
      const txData = {
        amount: -numAmount,
        date,
        concept: `${selectedVendor.name} - ${concept.trim() || notes.trim() || selectedAccountObj?.name || "Gasto"}`,
        reference: reference || "",
        reconciled: true,
        matchedAt: new Date().toISOString(),
        reconcileType: "direct",
        matchedDocumentId: expenseId,
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Cajero Móvil"
      };

      const txRef = await addDoc(collection(db, "companies", companyId, "bankAccounts", selectedBankAccountId, "transactions"), txData);

      // 3. Create the Outflow document
      const paymentData = {
        amount: numAmount,
        date,
        method: paymentMethod,
        reference: reference || "",
        documentId: expenseId,
        documentType: "gasto_manual",
        documentNumber: sequenceNum,
        providerName: selectedVendor.name,
        bankAccountId: selectedBankAccountId,
        expenseAccountId: selectedAccountId,
        createdAt: new Date().toISOString(),
        bankTransactionId: txRef.id
      };

      await addDoc(collection(db, "companies", companyId, "outflows"), paymentData);

      setSubmitStatus("success");
    } catch (err: any) {
      console.error("Error submitting expense:", err);
      setErrorMessage(err.message || "Ocurrió un error al intentar crear el gasto.");
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
          <h2 className="text-2xl font-bold text-white">Gasto Registrado</h2>
          <p className="text-slate-400 text-sm max-w-xs">
            El gasto con proveedor <strong className="text-slate-200">{selectedVendor?.name}</strong> por la cantidad de <strong className="text-emerald-400">${parseFloat(amount).toFixed(2)} MXN</strong> ha sido creado y conciliado correctamente.
          </p>
        </div>
        <div className="space-y-3">
          <Button 
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
            onClick={() => {
              setSelectedVendor(null);
              setVendorSearch("");
              setAmount("");
              setConcept("");
              setNotes("");
              setReference("");
              setImageFile(null);
              setImagePreview(null);
              setSubmitStatus("idle");
            }}
          >
            Registrar Otro Gasto
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
        <span className="font-bold text-base text-white">Registrar Gasto</span>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between overflow-y-auto p-5 space-y-6">
        <div className="space-y-5">
          
          {/* 1. Vendor Search */}
          <div className="space-y-1.5 relative">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Proveedor</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-9 h-11 bg-slate-800/80 border-slate-700 text-slate-200 placeholder-slate-500 rounded-xl"
                placeholder="Buscar proveedor..."
                value={vendorSearch}
                onChange={(e) => handleVendorSearch(e.target.value)}
                onFocus={() => { if (vendors.length > 0) setShowVendorList(true); }}
              />
              {selectedVendor && (
                <button 
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-700 text-slate-300 hover:text-white"
                  onClick={() => setSelectedVendor(null)}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Vendors Dropdown */}
            {showVendorList && (
              <div className="absolute top-[70px] left-0 right-0 max-h-60 overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-40 divide-y divide-slate-700/50">
                {vendorsLoading ? (
                  <div className="p-4 flex items-center justify-center gap-2 text-slate-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    Buscando proveedores...
                  </div>
                ) : vendors.length === 0 ? (
                  <div className="p-4 text-slate-400 text-xs text-center">No se encontraron proveedores</div>
                ) : (
                  vendors.map(v => (
                    <div 
                      key={v.id}
                      className="p-3 hover:bg-slate-700/50 cursor-pointer text-left transition-colors"
                      onClick={() => handleSelectVendor(v)}
                    >
                      <p className="text-xs font-bold text-slate-200">{v.name}</p>
                      {v.rfc && <p className="text-[10px] text-slate-500 mt-0.5">RFC: {v.rfc}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 2. Amount Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Monto Total (MXN)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">$</span>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                className="pl-8 h-12 bg-slate-800/80 border-slate-700 text-slate-200 text-xl font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          {/* 3. Account Select (Categoría Gasto) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Categoría / Cuenta de Gasto</label>
            <select
              className="flex h-11 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              required
            >
              {accounts.length === 0 ? (
                <option value="">Cargando categorías...</option>
              ) : (
                accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                ))
              )}
            </select>
          </div>

          {/* 4. Location Select (Sucursal) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Sucursal / Almacén</label>
            <select
              className="flex h-11 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              required
            >
              {locations.length === 0 ? (
                <option value="">Cargando sucursales...</option>
              ) : (
                locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))
              )}
            </select>
          </div>

          {/* 5. Bank Account Selection */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Cuenta Bancaria Pagadora</label>
            <select
              className="flex h-11 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedBankAccountId}
              onChange={(e) => setSelectedBankAccountId(e.target.value)}
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

          {/* 6. Concept & Notes */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Concepto</label>
              <Input
                className="h-11 bg-slate-800/80 border-slate-700 text-slate-200 rounded-xl"
                placeholder="Ej. Papelería y oficina"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Notas / Comentarios</label>
              <Input
                className="h-11 bg-slate-800/80 border-slate-700 text-slate-200 rounded-xl"
                placeholder="Detalles adicionales..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* 7. Date & Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Fecha</label>
              <Input
                type="date"
                className="h-11 bg-slate-800/80 border-slate-700 text-slate-200 rounded-xl"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Método</label>
              <select
                className="flex h-11 w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                required
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 8. Reference Code */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Referencia de Pago</label>
            <Input
              className="h-11 bg-slate-800/80 border-slate-700 text-slate-200 rounded-xl"
              placeholder="Ej. Transferencia 9823 o Ticket #"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          {/* 9. Photo Capture */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block">Foto del Ticket / Factura</label>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700 h-44 bg-slate-950">
                <img src={imagePreview} alt="Receipt preview" className="w-full h-full object-contain" />
                <button 
                  type="button" 
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 text-slate-300 hover:text-white"
                  onClick={handleClearImage}
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
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando Gasto...
              </>
            ) : (
              "Registrar Gasto"
            )}
          </Button>
        </div>
      </form>

    </div>
  );
}
