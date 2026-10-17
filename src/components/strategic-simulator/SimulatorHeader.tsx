"use client";

import React, { useState } from "react";
import { 
  StrategicScenario, 
  SimulationResult 
} from "@/types/strategicSimulation";
import { 
  Save, 
  Copy, 
  RefreshCw, 
  Download, 
  Printer, 
  FileSpreadsheet, 
  FileJson, 
  Sparkles, 
  Calendar, 
  ChevronDown, 
  Plus, 
  Check, 
  Trash2, 
  Layers 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { exportScenarioToJson, exportSimulationToCsv } from "@/lib/services/strategicScenarioService";

interface SimulatorHeaderProps {
  scenarios: StrategicScenario[];
  activeScenario: StrategicScenario;
  onSelectScenario: (scenarioId: string) => void;
  onSaveScenario: () => Promise<void>;
  onDuplicateScenario: () => Promise<void>;
  onOpenUpdateModal: () => void;
  onNewScenario: () => void;
  onDeleteScenario: (scenarioId: string) => Promise<void>;
  simulationResult: SimulationResult;
  isSaving: boolean;
}

export function SimulatorHeader({
  scenarios,
  activeScenario,
  onSelectScenario,
  onSaveScenario,
  onDuplicateScenario,
  onOpenUpdateModal,
  onNewScenario,
  onDeleteScenario,
  simulationResult,
  isSaving
}: SimulatorHeaderProps) {
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    await onSaveScenario();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Titulo y selector de escenario */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700">
              <Sparkles className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Simulador de Crecimiento Estratégico
            </h1>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-mono text-xs">
              Motor {activeScenario.engineVersion}
            </Badge>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-600 flex-wrap pt-1">
            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-slate-500" />
              Escenario activo:
            </span>

            {/* Selector de Escenarios Guardados */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="bg-white font-medium border-slate-300">
                  <span className="truncate max-w-[260px]">{activeScenario.name}</span>
                  <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80">
                <DropdownMenuLabel className="text-xs text-slate-500 uppercase tracking-wider">
                  Escenarios Guardados ({scenarios.length})
                </DropdownMenuLabel>
                {scenarios.map((sc) => (
                  <DropdownMenuItem
                    key={sc.id}
                    onClick={() => onSelectScenario(sc.id)}
                    className="flex items-center justify-between py-2 cursor-pointer"
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className={`text-sm truncate ${sc.id === activeScenario.id ? "font-bold text-indigo-600" : "text-slate-800"}`}>
                        {sc.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Corte: {sc.cutoffDate} | {sc.isBaselineOnly ? "Continuidad" : "Expansión"}
                      </span>
                    </div>
                    {sc.id === activeScenario.id && (
                      <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onNewScenario} className="text-indigo-600 font-semibold cursor-pointer">
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Nuevo Escenario
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Fecha de corte */}
            <div className="flex items-center gap-1 text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Fecha de corte: <strong className="text-slate-700">{activeScenario.cutoffDate}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Horizonte: <strong className="text-slate-700">60 meses</strong></span>
            </div>
          </div>
        </div>

        {/* Botones de acción principales */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Actualizar con datos actuales del ERP */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenUpdateModal}
            className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium"
            title="Recalcular con los datos más recientes de ventas, compras y bancos del ERP generando una nueva versión"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Actualizar con datos actuales
          </Button>

          {/* Duplicar Escenario */}
          <Button
            variant="outline"
            size="sm"
            onClick={onDuplicateScenario}
            className="border-slate-300 text-slate-700 hover:bg-slate-50"
            title="Crea una copia de este escenario para probar variaciones"
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Duplicar
          </Button>

          {/* Exportar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-slate-300 text-slate-700">
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Exportar
                <ChevronDown className="w-3.5 h-3.5 ml-1 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => exportSimulationToCsv(simulationResult)} className="cursor-pointer">
                <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
                Exportar a Excel / CSV (60 Meses)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportScenarioToJson(activeScenario, simulationResult)} className="cursor-pointer">
                <FileJson className="w-4 h-4 mr-2 text-indigo-600" />
                Exportar Escenario (JSON Completo)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Imprimir */}
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="border-slate-300 text-slate-700 hover:bg-slate-50"
            title="Genera versión imprimible del resumen ejecutivo y estados proyectados"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Imprimir Resumen
          </Button>

          {/* Guardar Escenario */}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className={`font-semibold transition-all ${
              saveSuccess 
                ? "bg-emerald-600 hover:bg-emerald-700 text-white" 
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
            }`}
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                ¡Guardado!
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1.5" />
                {isSaving ? "Guardando..." : "Guardar Escenario"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
