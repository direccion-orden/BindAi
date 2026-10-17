"use client";

import React, { useState } from "react";
import { StrategicScenario, MachineInvestment, TrackedValue } from "@/types/strategicSimulation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataOriginBadge } from "./DataOriginBadge";
import { Factory, Cpu, Plus, Trash2, AlertCircle, Wrench } from "lucide-react";

interface ProductionTabProps {
  scenario: StrategicScenario;
  onUpdateScenario: (updater: (prev: StrategicScenario) => StrategicScenario) => void;
}

export function ProductionTab({ scenario, onUpdateScenario }: ProductionTabProps) {
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

  const addMachine = () => {
    const newMach: MachineInvestment = {
      id: `mach-${Date.now()}`,
      name: "Nueva Maquinaria Especializada",
      purchaseMonth: 6,
      installationMonths: 1,
      capexAmount: 150000,
      downPaymentPct: 40,
      monthlyFinancingPayment: 8500,
      financingMonths: 12,
      capacityIncreaseUnitsMonthly: 400,
      usefulLifeYears: 8,
      monthlyMaintenanceCost: 2000
    };

    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.manufacturing.machines.push(newMach);
      return copy;
    });
  };

  const removeMachine = (id: string) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.manufacturing.machines = copy.manufacturing.machines.filter(m => m.id !== id);
      return copy;
    });
  };

  const updateMachine = (id: string, field: keyof MachineInvestment, val: any) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      const idx = copy.manufacturing.machines.findIndex(m => m.id === id);
      if (idx !== -1) {
        copy.manufacturing.machines[idx] = {
          ...copy.manufacturing.machines[idx],
          [field]: val
        };
      }
      return copy;
    });
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* 1. Capacidad Actual y Costos Unitarios de Fabricación */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Factory className="w-5 h-5 text-indigo-600" />
                Capacidad y Costos de Taller Propio
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Modelado de cuello de botella, consumo de materiales, merma y mano de obra directa
              </CardDescription>
            </div>
            <DataOriginBadge tracked={scenario.manufacturing.currentMonthlyCapacityUnits} showRestoreButton={false} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Capacidad Nominal Actual */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Capacidad Actual (Unidades/Mes)</Label>
              <Input
                type="number"
                value={scenario.manufacturing.currentMonthlyCapacityUnits.value}
                onChange={(e) => updateTracked(sc => sc.manufacturing.currentMonthlyCapacityUnits, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">Piezas equivalentes por mes</p>
            </div>

            {/* Proceso Limitante (Cuello de Botella) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Proceso Limitante (Cuello de Botella)</Label>
              <Input
                type="text"
                value={scenario.manufacturing.bottleneckProcessName.value}
                onChange={(e) => updateTracked(sc => sc.manufacturing.bottleneckProcessName, e.target.value)}
                className="bg-white border-slate-200 text-sm"
              />
              <p className="text-[11px] text-slate-400">Proceso con menor cadencia horaria</p>
            </div>

            {/* Costo Unitario de Materia Prima */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Materia Prima Directa ($/u)</Label>
                <DataOriginBadge tracked={scenario.manufacturing.rawMaterialCostPerUnit} showRestoreButton={false} />
              </div>
              <Input
                type="number"
                value={scenario.manufacturing.rawMaterialCostPerUnit.value}
                onChange={(e) => updateTracked(sc => sc.manufacturing.rawMaterialCostPerUnit, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* Mano de Obra Directa por Unidad */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Mano de Obra Directa ($/u)</Label>
              <Input
                type="number"
                value={scenario.manufacturing.directLaborCostPerUnit.value}
                onChange={(e) => updateTracked(sc => sc.manufacturing.directLaborCostPerUnit, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Porcentaje de Merma / Retrabajos */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Merma y Retrabajos (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={scenario.manufacturing.spoilageAndScrapPct.value}
                onChange={(e) => updateTracked(sc => sc.manufacturing.spoilageAndScrapPct, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* Gastos Fijos de Taller */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Overhead Fijo de Fábrica ($/mes)</Label>
              <Input
                type="number"
                value={scenario.manufacturing.factoryOverheadMonthly.value}
                onChange={(e) => updateTracked(sc => sc.manufacturing.factoryOverheadMonthly, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">Luz, herramientas, mantenimiento general</p>
            </div>

            {/* Política ante Falta de Capacidad */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Política ante Saturación de Capacidad</Label>
              <Select
                value={scenario.manufacturing.stockoutPolicy.value}
                onValueChange={(val: any) => updateTracked(sc => sc.manufacturing.stockoutPolicy, val)}
              >
                <SelectTrigger className="bg-white border-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOST_SALES">Venta Perdida (Tope estricto de capacidad)</SelectItem>
                  <SelectItem value="BACKORDER">Pedido Pendiente (Horas extra hasta +15%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Inversiones en Maquinaria y Ampliación de Capacidad */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-600" />
                Programa de Inversión en Maquinaria y Equipos
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Ampliación de capacidad, calendario de pago inicial, financiamiento y depreciación
              </CardDescription>
            </div>
            <Button size="sm" onClick={addMachine} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Agregar Equipo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700 min-w-[200px]">Equipo / Máquina</TableHead>
                  <TableHead className="font-bold text-slate-700">Mes Compra</TableHead>
                  <TableHead className="font-bold text-slate-700">Inversión (CAPEX)</TableHead>
                  <TableHead className="font-bold text-slate-700">% Anticipo</TableHead>
                  <TableHead className="font-bold text-slate-700">Mensualidad</TableHead>
                  <TableHead className="font-bold text-slate-700">+Capacidad (U/mes)</TableHead>
                  <TableHead className="font-bold text-slate-700">Vida Útil</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-sm">
                {scenario.manufacturing.machines.map((mach) => (
                  <TableRow key={mach.id}>
                    <TableCell>
                      <Input
                        value={mach.name}
                        onChange={(e) => updateMachine(mach.id, "name", e.target.value)}
                        className="h-8 text-xs font-medium"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={mach.purchaseMonth}
                        onChange={(e) => updateMachine(mach.id, "purchaseMonth", Number(e.target.value))}
                        className="h-8 w-16 text-xs text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={mach.capexAmount}
                        onChange={(e) => updateMachine(mach.id, "capexAmount", Number(e.target.value))}
                        className="h-8 w-28 text-xs font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={mach.downPaymentPct}
                        onChange={(e) => updateMachine(mach.id, "downPaymentPct", Number(e.target.value))}
                        className="h-8 w-16 text-xs text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={mach.monthlyFinancingPayment}
                        onChange={(e) => updateMachine(mach.id, "monthlyFinancingPayment", Number(e.target.value))}
                        className="h-8 w-24 text-xs font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={mach.capacityIncreaseUnitsMonthly}
                        onChange={(e) => updateMachine(mach.id, "capacityIncreaseUnitsMonthly", Number(e.target.value))}
                        className="h-8 w-24 text-xs font-mono text-emerald-700 font-bold"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={mach.usefulLifeYears}
                        onChange={(e) => updateMachine(mach.id, "usefulLifeYears", Number(e.target.value))}
                        className="h-8 w-16 text-xs text-center"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMachine(mach.id)}
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
    </div>
  );
}
