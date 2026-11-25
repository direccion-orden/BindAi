"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Search, Loader2, Check, Calendar, Building2 } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/utils";

interface PaymentEvidencePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
  onSelectEvidence: (evidence: any) => void;
}

export function PaymentEvidencePickerModal({
  isOpen,
  onClose,
  clientId,
  onSelectEvidence,
}: PaymentEvidencePickerModalProps) {
  const { companyId } = useAuth();

  const [loading, setLoading] = useState(false);
  const [evidences, setEvidences] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterByClientOnly, setFilterByClientOnly] = useState(Boolean(clientId));

  useEffect(() => {
    if (isOpen && companyId) {
      fetchAvailableEvidences();
    }
  }, [isOpen, companyId, clientId, filterByClientOnly]);

  const fetchAvailableEvidences = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      let q;
      if (filterByClientOnly && clientId) {
        q = query(
          collection(db, "companies", companyId, "payment_evidences"),
          where("status", "==", "available"),
          where("clientId", "==", clientId)
        );
      } else {
        q = query(
          collection(db, "companies", companyId, "payment_evidences"),
          where("status", "==", "available")
        );
      }
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.date || "").localeCompare(a.date || ""));
      setEvidences(list);
    } catch (err) {
      console.error("Error al cargar evidencias disponibles:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = evidences.filter((e) => {
    const q = search.toLowerCase();
    const cName = (e.clientName || "").toLowerCase();
    const lName = (e.locationName || "").toLowerCase();
    const notes = (e.notes || "").toLowerCase();
    return cName.includes(q) || lName.includes(q) || notes.includes(q);
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-600" />
            Seleccionar Evidencia de Pago Disponible
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Elige una foto de comprobante cargada previamente por el equipo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <Input
                placeholder="Buscar por cliente, sucursal o referencia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 text-xs rounded-xl"
              />
            </div>

            {clientId && (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={filterByClientOnly}
                  onChange={(e) => setFilterByClientOnly(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                Solo este cliente
              </label>
            )}
          </div>

          {loading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              Buscando evidencias disponibles...
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
              {filtered.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3 bg-white border border-slate-200 hover:border-indigo-500 rounded-xl flex flex-col justify-between transition hover:shadow-md space-y-2 group"
                >
                  <div className="flex gap-3">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-100 flex items-center justify-center">
                      <img
                        src={ev.imageUrl}
                        alt="Miniatura"
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                    </div>
                    <div className="space-y-1 text-xs truncate">
                      <p className="font-bold text-slate-800 truncate" title={ev.clientName}>
                        {ev.clientName}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {ev.locationName}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {ev.date}
                      </p>
                      {ev.amount && (
                        <p className="text-xs font-bold text-emerald-700">
                          {formatMoney(ev.amount)}
                        </p>
                      )}
                    </div>
                  </div>

                  {ev.notes && (
                    <p className="text-[10px] text-slate-500 italic bg-slate-50 p-1.5 rounded truncate">
                      {ev.notes}
                    </p>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onSelectEvidence(ev);
                      onClose();
                    }}
                    className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 h-8 shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Seleccionar esta Foto
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
              No hay fotos de comprobantes disponibles{filterByClientOnly ? " para este cliente" : ""}.
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto text-xs rounded-xl">
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
