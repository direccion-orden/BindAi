"use client";

import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Image as ImageIcon, Loader2, X, Check, Search, AlertCircle, Building2, User } from "lucide-react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { getLocalDateString } from "@/lib/utils";

interface PaymentEvidenceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newEvidenceId: string) => void;
  clients: any[];
  locations: any[];
}

export function PaymentEvidenceUploadModal({
  isOpen,
  onClose,
  onSuccess,
  clients,
  locations,
}: PaymentEvidenceUploadModalProps) {
  const { user, companyId } = useAuth();

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [date, setDate] = useState(getLocalDateString(new Date()));
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setImageFile(null);
    setImagePreview(null);
    setClientSearch("");
    setSelectedClient(null);
    setIsClientDropdownOpen(false);
    setSelectedLocationId(locations.length === 1 ? locations[0].id : "");
    setDate(getLocalDateString(new Date()));
    setAmount("");
    setNotes("");
    setErrorMessage("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setErrorMessage("");
    }
  };

  const filteredClients = clients.filter((c) => {
    const q = clientSearch.toLowerCase();
    const name = (c.name || c.legalName || c.LegalName || "").toLowerCase();
    const rfc = (c.rfc || c.RFC || "").toLowerCase();
    return name.includes(q) || rfc.includes(q);
  }).slice(0, 15);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!imageFile) {
      setErrorMessage("Debes capturar o seleccionar la foto del comprobante.");
      return;
    }
    if (!selectedClient) {
      setErrorMessage("El cliente es obligatorio.");
      return;
    }
    if (!selectedLocationId) {
      setErrorMessage("La sucursal es obligatoria.");
      return;
    }
    if (!companyId) return;

    setIsSubmitting(true);
    try {
      // 1. Subir a Storage
      const cleanFileName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `companies/${companyId}/payment_evidences/${Date.now()}_${cleanFileName}`;
      const storageRef = ref(storage, storagePath);
      const snapshot = await uploadBytes(storageRef, imageFile);
      const imageUrl = await getDownloadURL(snapshot.ref);

      const locationObj = locations.find((l) => l.id === selectedLocationId);
      const locationName = locationObj ? locationObj.name || locationObj.Name || "Sucursal" : "Sucursal";

      // 2. Guardar en Firestore
      const docRef = await addDoc(collection(db, "companies", companyId, "payment_evidences"), {
        companyId,
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        locationId: selectedLocationId,
        locationName,
        imageUrl,
        date: date || getLocalDateString(new Date()),
        amount: amount ? parseFloat(amount) : null,
        notes: notes.trim(),
        status: "available", // available | linked
        linkedTo: null,
        createdBy: user?.email || "Usuario",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetForm();
      onSuccess(docRef.id);
    } catch (err: any) {
      console.error("Error al guardar evidencia:", err);
      setErrorMessage("Ocurrió un error al subir la evidencia: " + (err.message || ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-lg w-[95vw] sm:w-full p-4 sm:p-6 max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-600" />
            Nueva Evidencia de Pago
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Sube o toma una foto del comprobante de pago para asociarlo a un cliente y sucursal.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* FOTO / COMPROBANTE (OBLIGATORIO) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Foto del Comprobante <span className="text-rose-500">*</span></span>
              {imageFile && (
                <span className="text-[10px] text-emerald-600 font-semibold lowercase">
                  ✓ {(imageFile.size / 1024).toFixed(0)} KB
                </span>
              )}
            </label>

            {imagePreview ? (
              <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-900/5 group flex items-center justify-center max-h-56">
                <img
                  src={imagePreview}
                  alt="Vista previa"
                  className="w-full h-auto max-h-56 object-contain bg-slate-950/20"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-2 right-2 bg-slate-900/80 hover:bg-rose-600 text-white p-1.5 rounded-full transition shadow"
                  title="Eliminar foto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {/* Botón Cámara móvil */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/80 rounded-xl transition text-center group active:scale-95"
                >
                  <div className="p-2.5 rounded-full bg-indigo-600 text-white mb-2 shadow-sm group-hover:scale-105 transition">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-indigo-900">Tomar Foto</span>
                  <span className="text-[10px] text-indigo-600">Abrir cámara</span>
                </button>

                {/* Botón Galería / Archivo */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 rounded-xl transition text-center group active:scale-95"
                >
                  <div className="p-2.5 rounded-full bg-slate-700 text-white mb-2 shadow-sm group-hover:scale-105 transition">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">Galería</span>
                  <span className="text-[10px] text-slate-500">Elegir archivo</span>
                </button>
              </div>
            )}

            {/* Inputs ocultos */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* CLIENTE (OBLIGATORIO) */}
          <div className="space-y-1.5 relative">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Cliente <span className="text-rose-500">*</span></span>
            </label>

            {selectedClient ? (
              <div className="flex items-center justify-between p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                <div className="truncate">
                  <p className="text-xs font-bold text-indigo-950 truncate">{selectedClient.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClient(null);
                    setClientSearch("");
                  }}
                  className="p-1 hover:bg-indigo-200 text-indigo-700 rounded-lg transition ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <Input
                    className="pl-9 h-10 text-xs rounded-xl"
                    placeholder="Buscar cliente por nombre o RFC..."
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      setIsClientDropdownOpen(true);
                    }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                  />
                </div>

                {isClientDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100">
                    {filteredClients.length > 0 ? (
                      filteredClients.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedClient({
                              id: c.id,
                              name: c.name || c.legalName || c.LegalName || "Cliente",
                            });
                            setIsClientDropdownOpen(false);
                            setClientSearch("");
                          }}
                          className="p-2.5 text-xs hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition"
                        >
                          <span className="font-semibold text-slate-800 truncate">
                            {c.name || c.legalName || c.LegalName}
                          </span>
                          {(c.rfc || c.RFC) && (
                            <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                              {c.rfc || c.RFC}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-xs text-center text-slate-400">
                        No se encontraron clientes
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SUCURSAL (OBLIGATORIA) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Sucursal <span className="text-rose-500">*</span></span>
            </label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs ring-offset-background outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Selecciona una sucursal --</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name || loc.Name || "Sucursal"}
                </option>
              ))}
            </select>
          </div>

          {/* FECHA Y MONTO */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Fecha</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">$</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7 h-10 text-xs rounded-xl font-semibold"
                />
              </div>
            </div>
          </div>

          {/* NOTAS / REFERENCIA */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Referencia / Notas (opcional)
            </label>
            <Input
              placeholder="Ej. Transferencia Banamex / Pago de factura"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10 text-xs rounded-xl"
            />
          </div>

          <DialogFooter className="pt-2 flex flex-row gap-2 justify-end sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => { resetForm(); onClose(); }}
              disabled={isSubmitting}
              className="rounded-xl flex-1 sm:flex-none text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-2 shadow"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Guardar Evidencia
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
