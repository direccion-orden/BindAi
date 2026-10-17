"use client";

import React from "react";
import { StrategicScenario, TrackedValue } from "@/types/strategicSimulation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataOriginBadge } from "./DataOriginBadge";
import { DollarSign, Wallet, TrendingUp, Sliders, AlertCircle, Info } from "lucide-react";

interface AssumptionsTabProps {
  scenario: StrategicScenario;
  onUpdateScenario: (updater: (prev: StrategicScenario) => StrategicScenario) => void;
}

export function AssumptionsTab({ scenario, onUpdateScenario }: AssumptionsTabProps) {
  const updateTracked = <T,>(
    path: (sc: StrategicScenario) => TrackedValue<T>,
    newValue: T
  ) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      const target = path(copy);
      target.value = newValue;
      target.isOverridden = true;
      target.origin = 'USER_ASSUMPTION';
      target.lastUpdated = new Date().toISOString();
      return copy;
    });
  };

  const restoreTracked = <T,>(
    path: (sc: StrategicScenario) => TrackedValue<T>
  ) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      const target = path(copy);
      if (target.originalValue !== undefined) {
        target.value = target.originalValue;
        target.isOverridden = false;
        target.origin = 'REAL_ERP';
        target.lastUpdated = new Date().toISOString();
      }
      return copy;
    });
  };

  const isOptionA = scenario.budget.interpretation.value === 'OPTION_A';

  return (
    <div className="space-y-6">
      {/* 1. Selector de Presupuesto y Reglas de Liquidez */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-600" />
                Presupuesto y Capital para Expansión
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Define el tamaño del fondo, la reserva intocable de seguridad y la estructura de financiamiento
              </CardDescription>
            </div>
            <DataOriginBadge tracked={scenario.budget.interpretation} showRestoreButton={false} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Selector de Interpretación A vs B */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              onClick={() => updateTracked(sc => sc.budget.interpretation, 'OPTION_A')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                isOptionA 
                  ? "border-indigo-600 bg-indigo-50/50 shadow-sm" 
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 text-sm">Opción A (Provisional Recomendada)</span>
                {isOptionA && <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>$1,000,000 totales</strong>, incluyendo $300,000 de reserva de seguridad.
              </p>
              <div className="mt-3 pt-3 border-t border-indigo-100 flex justify-between text-xs font-semibold">
                <span className="text-slate-500">Expansión Disponible:</span>
                <span className="text-indigo-700 text-sm">$700,000</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Reserva de Seguridad:</span>
                <span>$300,000</span>
              </div>
            </div>

            <div 
              onClick={() => updateTracked(sc => sc.budget.interpretation, 'OPTION_B')}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                !isOptionA 
                  ? "border-indigo-600 bg-indigo-50/50 shadow-sm" 
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-900 text-sm">Opción B</span>
                {!isOptionA && <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong>$1,000,000 para expansión</strong>, adicionales a $300,000 de reserva.
              </p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-xs font-semibold">
                <span className="text-slate-500">Expansión Disponible:</span>
                <span className="text-indigo-700 text-sm">$1,000,000</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Reserva de Seguridad:</span>
                <span>$300,000</span>
              </div>
            </div>
          </div>

          {/* Desglose de Fuentes de Capital */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Efectivo Existente en Bancos */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Efectivo de Bancos (ERP)</Label>
                <DataOriginBadge 
                  tracked={scenario.budget.existingBankCashUsed} 
                  onRestore={() => restoreTracked(sc => sc.budget.existingBankCashUsed)} 
                />
              </div>
              <Input
                type="number"
                value={scenario.budget.existingBankCashUsed.value}
                onChange={(e) => updateTracked(sc => sc.budget.existingBankCashUsed, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">Fondos ya en cuentas de la empresa</p>
            </div>

            {/* Capital Nuevo (Equity) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Capital Nuevo (Socios)</Label>
                <DataOriginBadge tracked={scenario.budget.newExternalEquity} showRestoreButton={false} />
              </div>
              <Input
                type="number"
                value={scenario.budget.newExternalEquity.value}
                onChange={(e) => updateTracked(sc => sc.budget.newExternalEquity, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">Aportación de socios para la expansión</p>
            </div>

            {/* Deuda / Financiamiento */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Línea de Crédito / Deuda</Label>
                <DataOriginBadge tracked={scenario.budget.debtFinancing} showRestoreButton={false} />
              </div>
              <Input
                type="number"
                value={scenario.budget.debtFinancing.value}
                onChange={(e) => updateTracked(sc => sc.budget.debtFinancing, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">Crédito bancario para financiar maquinaria o stock</p>
            </div>
          </div>

          {/* Política ante falta de caja */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800">Regla de Gestión ante Déficit de Caja:</span>
              <p className="text-[11px] text-slate-500">
                Evita crecimiento financiado implícitamente sin visibilidad del faltante
              </p>
            </div>
            <Select
              value={scenario.budget.deficitPolicy.value}
              onValueChange={(val: any) => updateTracked(sc => sc.budget.deficitPolicy, val)}
            >
              <SelectTrigger className="w-64 bg-white border-slate-300 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FINANCE_DEFICIT">Modelar Financiamiento Puente Requerido</SelectItem>
                <SelectItem value="HALT_INVESTMENTS">Detener Inversiones y Compras</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 2. Configuración de Línea Base (Continuidad sin Expansión) */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-600" />
                Línea Base: Continuidad sin Expansión
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Parámetros para simular la operación actual sin las palancas de crecimiento
              </CardDescription>
            </div>
            <DataOriginBadge tracked={scenario.baseline.projectionMethod} showRestoreButton={false} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Método de Proyección */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Método de Proyección</Label>
              <Select
                value={scenario.baseline.projectionMethod.value}
                onValueChange={(val: any) => updateTracked(sc => sc.baseline.projectionMethod, val)}
              >
                <SelectTrigger className="bg-white border-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HISTORICAL_AVERAGE">Promedio de Meses Completos</SelectItem>
                  <SelectItem value="RECENT_RUN_RATE">Ritmo Reciente de Ventas</SelectItem>
                  <SelectItem value="GROWTH_TREND">Tendencia de Crecimiento</SelectItem>
                  <SelectItem value="SEASONAL">Estacionalidad Histórica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ventas Mensuales de Referencia */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Ventas Base Mensuales</Label>
                <DataOriginBadge 
                  tracked={scenario.baseline.referenceMonthlySales} 
                  onRestore={() => restoreTracked(sc => sc.baseline.referenceMonthlySales)} 
                />
              </div>
              <Input
                type="number"
                value={scenario.baseline.referenceMonthlySales.value}
                onChange={(e) => updateTracked(sc => sc.baseline.referenceMonthlySales, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* OPEX Mensual de Referencia */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">OPEX Base Mensual</Label>
                <DataOriginBadge 
                  tracked={scenario.baseline.referenceMonthlyOpex} 
                  onRestore={() => restoreTracked(sc => sc.baseline.referenceMonthlyOpex)} 
                />
              </div>
              <Input
                type="number"
                value={scenario.baseline.referenceMonthlyOpex.value}
                onChange={(e) => updateTracked(sc => sc.baseline.referenceMonthlyOpex, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Crecimiento Inercial Anual */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Crecimiento Inercial Anual (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={scenario.baseline.annualGrowthTrendPct.value}
                onChange={(e) => updateTracked(sc => sc.baseline.annualGrowthTrendPct, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* Demanda No Atendida Estimada */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Demanda No Atendida ($/mes)</Label>
                <DataOriginBadge tracked={scenario.baseline.unattendedDemandMonthly} showRestoreButton={false} />
              </div>
              <Input
                type="number"
                value={scenario.baseline.unattendedDemandMonthly.value}
                onChange={(e) => updateTracked(sc => sc.baseline.unattendedDemandMonthly, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">Ventas perdidas históricas por falta de stock</p>
            </div>

            {/* Inflación Anual */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Inflación Presupuestada (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={scenario.macro.inflationAnnualPct.value}
                onChange={(e) => updateTracked(sc => sc.macro.inflationAnnualPct, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
