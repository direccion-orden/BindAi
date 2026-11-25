"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Calendar, Building2, User, CheckCircle2, Clock, DollarSign, FileText } from "lucide-react";
import { formatMoney } from "@/lib/utils";

interface PaymentEvidenceViewModalProps {
  evidence: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PaymentEvidenceViewModal({ evidence, isOpen, onClose }: PaymentEvidenceViewModalProps) {
  if (!evidence) return null;

  const isLinked = evidence.status === "linked";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full p-4 sm:p-6 max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="text-lg font-bold truncate">
              Comprobante de Pago
            </DialogTitle>
            {isLinked ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Relacionado a ANT-{evidence.linkedTo?.anticipoFolio || ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Clock className="w-3.5 h-3.5" />
                Disponible
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* FOTO CON ZOOM / VISTA PREVIA */}
          <div className="relative rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center min-h-64 max-h-[50vh] border border-slate-200">
            <img
              src={evidence.imageUrl}
              alt="Comprobante"
              className="max-h-[50vh] w-auto max-w-full object-contain"
            />
            <a
              href={evidence.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 right-3 bg-slate-900/80 hover:bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur shadow transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver original
            </a>
          </div>

          {/* DETALLES METADATOS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <User className="w-3 h-3" /> Cliente
              </span>
              <p className="font-bold text-slate-800 text-sm">{evidence.clientName}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Building2 className="w-3 h-3" /> Sucursal
              </span>
              <p className="font-semibold text-slate-700">{evidence.locationName}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Fecha del Comprobante
              </span>
              <p className="font-semibold text-slate-700">{evidence.date || "Sin fecha"}</p>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Monto Registrado
              </span>
              <p className="font-bold text-slate-800">
                {evidence.amount ? formatMoney(evidence.amount) : "No especificado"}
              </p>
            </div>

            {evidence.notes && (
              <div className="col-span-1 sm:col-span-2 space-y-1 pt-1 border-t border-slate-200/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Notas / Referencia
                </span>
                <p className="text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                  {evidence.notes}
                </p>
              </div>
            )}

            <div className="col-span-1 sm:col-span-2 text-[10px] text-slate-400 flex items-center justify-between pt-1">
              <span>Subido por: {evidence.createdBy || "Desconocido"}</span>
              {evidence.createdAt?.toDate && (
                <span>{evidence.createdAt.toDate().toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button onClick={onClose} className="w-full sm:w-auto rounded-xl text-xs">
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
