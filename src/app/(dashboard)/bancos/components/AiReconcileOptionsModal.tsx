"use client";

import React, { useState } from "react";
import { Sparkles, FileCheck, Receipt, X, Landmark, Calendar, ShieldCheck, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AiReconcileOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (includeProvisional: boolean) => void;
  bankAccountName: string;
  dateRangeLabel: string;
  pendingCount?: number;
}

export function AiReconcileOptionsModal({
  isOpen,
  onClose,
  onConfirm,
  bankAccountName,
  dateRangeLabel,
  pendingCount = 0
}: AiReconcileOptionsModalProps) {
  const [selectedMode, setSelectedMode] = useState<"without_provisional" | "with_provisional">("without_provisional");

  if (!isOpen) return null;

  const handleStart = () => {
    onConfirm(selectedMode === "with_provisional");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con gradiente */}
        <div className="relative px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-indigo-500 p-0.5 shadow-lg flex items-center justify-center">
              <div className="w-full h-full bg-slate-950/40 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Agente Conciliador IA
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Modo de Operación
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                Configura cómo procesará el agente los movimientos bancarios.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen de Contexto */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 font-medium">
            <Landmark className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="text-slate-500">Cuenta:</span>
            <span className="font-bold text-slate-900">{bankAccountName || "Cuenta Bancaria"}</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <Calendar className="w-4 h-4 text-purple-600 shrink-0" />
            <span className="text-slate-500">Periodo:</span>
            <span className="font-bold text-slate-900">{dateRangeLabel || "Cualquier fecha"}</span>
          </div>
          {pendingCount > 0 && (
            <div className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {pendingCount} pendientes
            </div>
          )}
        </div>

        {/* Opciones de Selección */}
        <div className="p-6 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Selecciona la modalidad de conciliación:
          </p>

          {/* Opción 1: Sin gastos provisionales (Recomendada) */}
          <div
            onClick={() => setSelectedMode("without_provisional")}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedMode === "without_provisional"
                ? "border-indigo-600 bg-indigo-50/40 shadow-md ring-2 ring-indigo-500/20"
                : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <input
                type="radio"
                name="ai-reconcile-mode"
                checked={selectedMode === "without_provisional"}
                onChange={() => setSelectedMode("without_provisional")}
                className="mt-1 h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                      <FileCheck className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-slate-900">
                      Sin gastos provisionales (Solo XMLs)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Recomendado
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  El agente conciliará <strong>exclusivamente</strong> los movimientos bancarios que coincidan con un CFDI / XML existente en el sistema y generará un <strong>gasto final definitivo</strong> (no provisional).
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] font-medium text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Los movimientos sin XML permanecerán pendientes sin crear registros temporales.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Opción 2: Con gastos provisionales */}
          <div
            onClick={() => setSelectedMode("with_provisional")}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedMode === "with_provisional"
                ? "border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-500/20"
                : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <input
                type="radio"
                name="ai-reconcile-mode"
                checked={selectedMode === "with_provisional"}
                onChange={() => setSelectedMode("with_provisional")}
                className="mt-1 h-4 w-4 text-purple-600 border-slate-300 focus:ring-purple-500 cursor-pointer"
              />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-md bg-purple-100 text-purple-700">
                      <PlusCircle className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-bold text-slate-900">
                      Con gastos provisionales (Modo Completo)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    Incluye Sin XML
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  El agente conciliará tanto las facturas existentes como los consumos que <strong>aún no tienen XML</strong> (compras con tarjeta, servicios, comisiones), creando gastos provisionales clasificados con IA.
                </p>
                <div className="flex items-center gap-2 pt-1 text-[11px] font-medium text-slate-500">
                  <Receipt className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span>Crea comprobantes provisionales que requerirán formalizarse posteriormente con XML.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold text-slate-700 h-9"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleStart}
            className="bg-gradient-to-r from-amber-500 via-purple-600 to-indigo-600 hover:from-amber-600 hover:via-purple-700 hover:to-indigo-700 text-white font-bold text-xs h-9 px-4 rounded-lg flex items-center gap-1.5 shadow-md transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Iniciar Conciliación IA</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
