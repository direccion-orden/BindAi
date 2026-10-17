"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScenarioDiff } from "@/lib/services/strategicScenarioService";
import { RefreshCw, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

interface DiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  diffs: ScenarioDiff[];
  isLoading: boolean;
}

export function DiffModal({
  isOpen,
  onClose,
  onConfirm,
  diffs,
  isLoading
}: DiffModalProps) {
  const formatMoney = (val: any) => {
    if (typeof val === "number") {
      return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(val);
    }
    return String(val);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
              <RefreshCw className="w-5 h-5" />
            </span>
            <DialogTitle className="text-xl font-bold text-slate-900">
              Actualizar con Datos Actuales del ERP
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-600 text-sm mt-1">
            Se generará una <strong>nueva versión del escenario</strong> contrastando las variables guardadas contra la operación viva del ERP. El escenario anterior permanecerá intacto para garantizar reproducibilidad histórica.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {diffs.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
              <div>
                <strong>Datos sincronizados:</strong> No se detectaron discrepancias relevantes entre los datos del ERP y el escenario actual.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Variables que cambiarán ({diffs.length}):
              </div>

              {diffs.map((diff, idx) => (
                <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                    <span>{diff.variableName}</span>
                    <span className="text-xs font-mono text-slate-400">{diff.variablePath}</span>
                  </div>

                  <div className="flex items-center gap-3 text-sm pt-1">
                    <div className="flex-1 p-2 bg-rose-50 border border-rose-200 rounded text-rose-900 text-center">
                      <span className="text-[11px] block text-rose-500 font-medium">Anterior</span>
                      <strong className="text-base">{formatMoney(diff.previousValue)}</strong>
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />

                    <div className="flex-1 p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 text-center">
                      <span className="text-[11px] block text-emerald-600 font-medium">Actual del ERP</span>
                      <strong className="text-base">{formatMoney(diff.newValue)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Transparencia:</strong> Al confirmar, se creará un duplicado del escenario con el sufijo de la nueva fecha de corte. Ningún registro operativo del ERP sufrirá modificaciones.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
          >
            {isLoading ? "Creando nueva versión..." : "Crear Nueva Versión Actualizada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
