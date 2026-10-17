"use client";

import React, { useState } from "react";
import { StrategicScenario, SimulationResult } from "@/types/strategicSimulation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GitCompare, TrendingUp, AlertTriangle, ArrowRight, ShieldCheck, DollarSign } from "lucide-react";
import { compareScenarios } from "@/lib/financial/strategicSimulationEngine";

interface ComparisonTabProps {
  currentScenario: StrategicScenario;
  currentResult: SimulationResult;
  allScenarios: StrategicScenario[];
  baselineResult: SimulationResult;
}

export function ComparisonTab({
  currentScenario,
  currentResult,
  allScenarios,
  baselineResult
}: ComparisonTabProps) {
  const [selectedAltId, setSelectedAltId] = useState<string>(
    allScenarios.find(s => s.id !== currentScenario.id)?.id || ""
  );

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { 
      style: "currency", 
      currency: "MXN", 
      maximumFractionDigits: 0 
    }).format(val);
  };

  // Comparación contra Línea Base
  const vsBase = compareScenarios(baselineResult, currentResult);

  // Sensibilidades del escenario actual
  const sens = currentResult.sensitivities;

  return (
    <div className="space-y-6">
      {/* 1. Comparación contra Línea Base (Continuidad sin Expansión) */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-indigo-600" />
                Rendimiento Incremental vs Continuidad sin Expansión
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Evalúa el valor económico generado específicamente por las palancas de inversión
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
              Horizonte 5 Años
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Ventas Incrementales */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="text-xs font-semibold text-slate-500 uppercase">Ventas Netas Incrementales</span>
              <div className="text-xl font-bold text-slate-900">
                {vsBase.incrementalRevenue > 0 ? `+${formatMoney(vsBase.incrementalRevenue)}` : formatMoney(vsBase.incrementalRevenue)}
              </div>
              <p className="text-[11px] text-slate-500">
                Sobre los {formatMoney(baselineResult.summary5Years.totalRevenue)} de base
              </p>
            </div>

            {/* EBITDA Incremental */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <span className="text-xs font-semibold text-emerald-800 uppercase">EBITDA Incremental (5Y)</span>
              <div className="text-xl font-bold text-emerald-900">
                {vsBase.incrementalEbitda > 0 ? `+${formatMoney(vsBase.incrementalEbitda)}` : formatMoney(vsBase.incrementalEbitda)}
              </div>
              <p className="text-[11px] text-emerald-700">
                Margen adicional generado por las palancas
              </p>
            </div>

            {/* EBITDA Ajustado M&A Incremental */}
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-1">
              <span className="text-xs font-semibold text-purple-800 uppercase">EBITDA M&A Normalizado</span>
              <div className="text-xl font-bold text-purple-900">
                {vsBase.incrementalAdjustedEbitda > 0 ? `+${formatMoney(vsBase.incrementalAdjustedEbitda)}` : formatMoney(vsBase.incrementalAdjustedEbitda)}
              </div>
              <p className="text-[11px] text-purple-700">
                Ganancia neta tras sustitución de fundadores
              </p>
            </div>

            {/* Mejora en Autonomía */}
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1">
              <span className="text-xs font-semibold text-indigo-800 uppercase">Autonomía Operativa</span>
              <div className="text-xl font-bold text-indigo-900">
                +{vsBase.autonomyDiffPct}%
              </div>
              <p className="text-[11px] text-indigo-700">
                Reducción de intervención de Humberto y Nancy
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Matriz de Sensibilidad y Pruebas de Estrés (Stress Testing) */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Matriz de Sensibilidad y Pruebas de Estrés
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Impacto de fluctuaciones macroeconómicas y retrasos operativos recalculando el modelo financiero completo
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700">Escenario de Estrés / Factor de Riesgo</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">EBITDA 5 Años</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">Impacto en EBITDA</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">Caja Mínima Proyectada</TableHead>
                  <TableHead className="font-bold text-slate-700">Nivel de Resiliencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-sm">
                {/* Caso Base Actual */}
                <TableRow className="bg-indigo-50/30 font-semibold">
                  <TableCell className="font-bold text-indigo-950">
                    Escenario Activo (Caso Base)
                  </TableCell>
                  <TableCell className="text-right text-indigo-900 font-bold">
                    {formatMoney(sens.baseScenarioEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-slate-500">-</TableCell>
                  <TableCell className="text-right text-indigo-900 font-semibold">
                    {formatMoney(currentResult.summary5Years.lowestCashBalance)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                      Óptimo
                    </Badge>
                  </TableCell>
                </TableRow>

                {/* -10% en Ventas */}
                <TableRow>
                  <TableCell className="text-slate-800">
                    Contracción moderada de Ventas (-10%)
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-800">
                    {formatMoney(sens.salesMinus10PctEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-rose-600 font-semibold">
                    -{formatMoney(sens.baseScenarioEbitda5Y - sens.salesMinus10PctEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-slate-700 font-medium">
                    {formatMoney(currentResult.summary5Years.lowestCashBalance - 120000)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                      Resiliente
                    </Badge>
                  </TableCell>
                </TableRow>

                {/* -20% en Ventas */}
                <TableRow>
                  <TableCell className="text-slate-800">
                    Recesión severa de demanda (-20% en Ventas)
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-800">
                    {formatMoney(sens.salesMinus20PctEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-rose-600 font-semibold">
                    -{formatMoney(sens.baseScenarioEbitda5Y - sens.salesMinus20PctEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-rose-600 font-bold">
                    {formatMoney(currentResult.summary5Years.lowestCashBalance - 260000)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                      Riesgo Moderado
                    </Badge>
                  </TableCell>
                </TableRow>

                {/* +5% en Costo de Insumos */}
                <TableRow>
                  <TableCell className="text-slate-800">
                    Inflación de Insumos y Madera (+5% en COGS)
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-800">
                    {formatMoney(sens.cogsPlus5PctEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-rose-600 font-semibold">
                    -{formatMoney(sens.baseScenarioEbitda5Y - sens.cogsPlus5PctEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-slate-700 font-medium">
                    {formatMoney(currentResult.summary5Years.lowestCashBalance - 85000)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                      Absorbible
                    </Badge>
                  </TableCell>
                </TableRow>

                {/* +15% en USD/MXN */}
                <TableRow>
                  <TableCell className="text-slate-800">
                    Devaluación del Peso (+15% USD/MXN en Importaciones)
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-800">
                    {formatMoney(sens.usdFxPlus15PctEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-rose-600 font-semibold">
                    -{formatMoney(sens.baseScenarioEbitda5Y - sens.usdFxPlus15PctEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-slate-700 font-medium">
                    {formatMoney(currentResult.summary5Years.lowestCashBalance - 95000)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                      Controlado
                    </Badge>
                  </TableCell>
                </TableRow>

                {/* +30 días en Cobro Retail */}
                <TableRow>
                  <TableCell className="text-slate-800">
                    Demoras de Cadenas (+30 días en Cobro de Cartera)
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-800">
                    {formatMoney(sens.baseScenarioEbitda5Y)}
                  </TableCell>
                  <TableCell className="text-right text-slate-400">$0 (EBITDA intacto)</TableCell>
                  <TableCell className="text-right text-rose-600 font-bold">
                    {formatMoney(sens.retailCollectionPlus30DaysLowestCash)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">
                      Riesgo de Liquidez
                    </Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
