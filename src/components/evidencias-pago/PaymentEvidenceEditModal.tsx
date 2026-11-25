"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Loader2, Check, AlertCircle, Building2, User, Search, X } from "lucide-react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

interface PaymentEvidenceEditModalProps {
  evidence: any | null;
  isOpen: boolean;
  onClose: () => void;
  clients: any[];
  locations: any[];
  onSuccess: () => void;
}

export function PaymentEvidenceEditModal({
  evidence,
  isOpen,
  onClose,
  clients,
  locations,
  onSuccess,
}: PaymentEvidenceEditModalProps) {
  const { companyId } = useAuth();

  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (evidence) {
      setSelectedClient({
        id: evidence.clientId,
        name: evidence.clientName,
      });
      setSelectedLocationId(evidence.locationId || "");
      setDate(evidence.date || "");
      setAmount(evidence.amount ? String(evidence.amount) : "");
      setNotes(evidence.notes || "");
      setErrorMessage("");
    }
  }, [evidence]);

  if (!evidence) return null;

  const filteredClients = clients.filter((c) => {
    const q = clientSearch.toLowerCase();
    const name = (c.name || c.legalName || c.LegalName || "").toLowerCase();
    const rfc = (c.rfc || c.RFC || "").toLowerCase();
    return name.includes(q) || rfc.includes(q);
  }).slice(0, 15);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

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
      const locationObj = locations.find((l) => l.id === selectedLocationId);
      const locationName = locationObj ? locationObj.name || locationObj.Name || "Sucursal" : "Sucursal";

      await updateDoc(doc(db, "companies", companyId, "payment_evidences", evidence.id), {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        locationId: selectedLocationId,
        locationName,
        date: date || evidence.date,
        amount: amount ? parseFloat(amount) : null,
        notes: notes.trim(),
        updatedAt: serverTimestamp(),
      });

      onSuccess();
    } catch (err: any) {
      console.error("Error al actualizar evidencia:", err);
      setErrorMessage("Ocurrió un error al guardar los cambios: " + (err.message || ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md w-[95vw] sm:w-full p-4 sm:p-6 rounded-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Pencil className="w-5 h-5 text-indigo-600" />
            Editar Evidencia de Pago
          </DialogTitle>
        </DialogHeader>

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* CLIENTE */}
          <div className="space-y-1.5 relative">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Cliente <span className="text-rose-500">*</span></span>
            </label>

            {selectedClient ? (
              <div className="flex items-center justify-between p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                <p className="text-xs font-bold text-indigo-950 truncate">{selectedClient.name}</p>
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
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  className="pl-9 h-10 text-xs rounded-xl"
                  placeholder="Buscar cliente..."
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    setIsClientDropdownOpen(true);
                  }}
                  onFocus={() => setIsClientDropdownOpen(true)}
                />

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

          {/* SUCURSAL */}
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
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10 text-xs rounded-xl"
              />
            </div>
          </div>

          {/* NOTAS */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Notas / Referencia</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10 text-xs rounded-xl"
            />
          </div>

          <DialogFooter className="pt-2 flex flex-row gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl flex-1 sm:flex-none text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
