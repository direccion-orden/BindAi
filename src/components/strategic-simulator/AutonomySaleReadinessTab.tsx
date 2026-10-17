"use client";

import React from "react";
import { StrategicScenario, HiredExecutive, TrackedValue, SimulationResult } from "@/types/strategicSimulation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DataOriginBadge } from "./DataOriginBadge";
import { Award, UserCheck, Plus, Trash2, Clock, DollarSign, TrendingUp, HelpCircle } from "lucide-react";

interface AutonomySaleReadinessTabProps {
  scenario: StrategicScenario;
  result: SimulationResult;
  onUpdateScenario: (updater: (prev: StrategicScenario) => StrategicScenario) => void;
}

export function AutonomySaleReadinessTab({
  scenario,
  result,
  onUpdateScenario
}: AutonomySaleReadinessTabProps) {
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

  const addExecutive = () => {
    const execCount = scenario.autonomy.executives.length + 1;
    const newExec: HiredExecutive = {
      id: `exec-${Date.now()}`,
      title: `Líder / Gerente de Área ${execCount}`,
      hireMonth: 12,
      monthlySalary: 35000,
      replacesFounderRole: 'BOTH',
      founderHoursReductionPct: 20
    };

    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.autonomy.executives.push(newExec);
      return copy;
    });
  };

  const removeExecutive = (id: string) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.autonomy.executives = copy.autonomy.executives.filter(e => e.id !== id);
      return copy;
    });
  };

  const updateExecutive = (id: string, field: keyof HiredExecutive, val: any) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      const idx = copy.autonomy.executives.findIndex(e => e.id === id);
      if (idx !== -1) {
        copy.autonomy.executives[idx] = {
          ...copy.autonomy.executives[idx],
          [field]: val
        };
      }
      return copy;
    });
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { 
      style: "currency", 
      currency: "MXN", 
      maximumFractionDigits: 0 
    }).format(val);
  };

  const { summary5Years, months } = result;
  const lastMonth = months[months.length - 1];

  const initialHrsHumberto = scenario.autonomy.founderInitialWeeklyHoursHumberto.value;
  const initialHrsNancy = scenario.autonomy.founderInitialWeeklyHoursNancy.value;
  const finalHrsHumberto = lastMonth?.founderHoursRemainingHumberto || initialHrsHumberto;
  const finalHrsNancy = lastMonth?.founderHoursRemainingNancy || initialHrsNancy;

  return (
    <div className="space-y-6">
      {/* 1. Indicadores de Autonomía y Preparación de Venta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Score de Autonomía */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                Nivel de Autonomía Organizacional
              </CardTitle>
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold">
                Año 5
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Mide la capacidad de la empresa de operar sin la intervención diaria de los fundadores
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-indigo-700">
                {summary5Years.finalAutonomyScorePct}%
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Desconexión operativa lograda
              </span>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <div className="flex justify-between items-center">
                <span>Horas semanales Humberto:</span>
                <span className="font-semibold text-slate-800">
                  {initialHrsHumberto} hrs/sem <span className="text-emerald-600 font-bold">→ {finalHrsHumberto} hrs/sem</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Horas semanales Nancy:</span>
                <span className="font-semibold text-slate-800">
                  {initialHrsNancy} hrs/sem <span className="text-emerald-600 font-bold">→ {finalHrsNancy} hrs/sem</span>
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Costo sombra mensual de horas pendientes (Año 5):</span>
                <strong className="text-slate-900">{formatMoney(lastMonth?.founderReplacementShadowCost || 0)}/mes</strong>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score de Preparación para Venta (M&A) */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-purple-600" />
                Score de Preparación para Venta (M&A)
              </CardTitle>
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                Índice Compuesto
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Ponderación de autonomía (40%), rentabilidad EBITDA (25%), multicanalidad (20%) y calidad contable (15%)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-purple-700">
                {summary5Years.finalSaleReadinessScorePct}
              </span>
              <span className="text-slate-400 font-semibold text-base">/ 100</span>
              <Badge 
                variant="outline" 
                className={`ml-auto font-semibold ${
                  summary5Years.finalSaleReadinessScorePct >= 75 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : "bg-amber-50 text-amber-700 border-amber-300"
                }`}
              >
                {summary5Years.finalSaleReadinessScorePct >= 75 ? "Atractivo para Adquisición" : "En Maduración"}
              </Badge>
            </div>

            <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>EBITDA 5 Años Acumulado:</span>
                <strong className="text-slate-900">{formatMoney(summary5Years.totalEbitda)}</strong>
              </div>
              <div className="flex justify-between">
                <span>EBITDA Normalizado (Ajustado M&A):</span>
                <strong className="text-purple-700">{formatMoney(summary5Years.totalAdjustedEbitda)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Rango Valuación Empresa (EV):</span>
                <strong className="text-slate-900">
                  {formatMoney(summary5Years.enterpriseValueMin)} - {formatMoney(summary5Years.enterpriseValueMax)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Valor del Capital de Socios (Equity Value):</span>
                <strong className="text-emerald-700">
                  {formatMoney(summary5Years.equityValueMin)} - {formatMoney(summary5Years.equityValueMax)}
                </strong>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Roadmap de Contratación y Delegación */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                Roadmap de Contratación de Liderazgo y Delegación
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Puestos contratados, sueldo de mercado, mes de incorporación y reducción de carga a los fundadores
              </CardDescription>
            </div>
            <Button size="sm" onClick={addExecutive} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Agregar Puesto
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700 min-w-[200px]">Puesto / Responsabilidad</TableHead>
                  <TableHead className="font-bold text-slate-700">Mes Ingreso</TableHead>
                  <TableHead className="font-bold text-slate-700">Sueldo Mensual</TableHead>
                  <TableHead className="font-bold text-slate-700">Sustituye Función</TableHead>
                  <TableHead className="font-bold text-slate-700">Reducción Horas</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-sm">
                {scenario.autonomy.executives.map((exec) => (
                  <TableRow key={exec.id}>
                    <TableCell>
                      <Input
                        value={exec.title}
                        onChange={(e) => updateExecutive(exec.id, "title", e.target.value)}
                        className="h-8 text-xs font-semibold"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={exec.hireMonth}
                        onChange={(e) => updateExecutive(exec.id, "hireMonth", Number(e.target.value))}
                        className="h-8 w-16 text-xs text-center font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={exec.monthlySalary}
                        onChange={(e) => updateExecutive(exec.id, "monthlySalary", Number(e.target.value))}
                        className="h-8 w-28 text-xs font-mono font-medium"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={exec.replacesFounderRole}
                        onValueChange={(val: any) => updateExecutive(exec.id, "replacesFounderRole", val)}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="HUMBERTO">Humberto</SelectItem>
                          <SelectItem value="NANCY">Nancy</SelectItem>
                          <SelectItem value="BOTH">Ambos</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          value={exec.founderHoursReductionPct}
                          onChange={(e) => updateExecutive(exec.id, "founderHoursReductionPct", Number(e.target.value))}
                          className="h-8 w-16 text-xs text-center font-mono font-bold text-emerald-700"
                        />
                        <span className="text-xs text-slate-500">%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExecutive(exec.id)}
                        className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 3. Parámetros de Valuación para M&A */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="space-y-1">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Múltiplos de Valuación (M&A)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Rangos orientativos introducidos por el usuario aplicados al EBITDA Ajustado del Año 5
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Múltiplo Mínimo (Conservador)</Label>
              <Input
                type="number"
                step="0.5"
                value={scenario.autonomy.valuationEbitdaMultipleMin.value}
                onChange={(e) => updateTracked(sc => sc.autonomy.valuationEbitdaMultipleMin, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-400">ej. 4.0x EBITDA</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Múltiplo Máximo (Estratégico)</Label>
              <Input
                type="number"
                step="0.5"
                value={scenario.autonomy.valuationEbitdaMultipleMax.value}
                onChange={(e) => updateTracked(sc => sc.autonomy.valuationEbitdaMultipleMax, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-400">ej. 6.5x EBITDA</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tarifa Sombra Humberto ($/hr)</Label>
              <Input
                type="number"
                value={scenario.autonomy.shadowHourlyRateHumberto.value}
                onChange={(e) => updateTracked(sc => sc.autonomy.shadowHourlyRateHumberto, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tarifa Sombra Nancy ($/hr)</Label>
              <Input
                type="number"
                value={scenario.autonomy.shadowHourlyRateNancy.value}
                onChange={(e) => updateTracked(sc => sc.autonomy.shadowHourlyRateNancy, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
