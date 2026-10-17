"use client";

import React from "react";
import { StrategicScenario, StoreConfig, TrackedValue } from "@/types/strategicSimulation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataOriginBadge } from "./DataOriginBadge";
import { Store, Globe, Plus, Trash2, TrendingUp, DollarSign, Calculator } from "lucide-react";

interface StoresEcommerceTabProps {
  scenario: StrategicScenario;
  onUpdateScenario: (updater: (prev: StrategicScenario) => StrategicScenario) => void;
}

export function StoresEcommerceTab({ scenario, onUpdateScenario }: StoresEcommerceTabProps) {
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

  const addStore = () => {
    const storeCount = scenario.stores.stores.length + 1;
    const newStore: StoreConfig = {
      id: `store-0${storeCount}-${Date.now()}`,
      name: `Sucursal ${storeCount} (Nueva Expansión)`,
      isExisting: false,
      openMonth: 12,
      setupCapex: 320000,
      leaseDeposit: 75000,
      monthlyRent: 38000,
      monthlyStaffCost: 52000,
      monthlyOtherOpex: 40000,
      targetMonthlySales: 380000,
      rampUpMonths: 6,
      cannibalizationPct: 5,
      supervisionCostMonthly: 10000
    };

    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.stores.stores.push(newStore);
      return copy;
    });
  };

  const removeStore = (id: string) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.stores.stores = copy.stores.stores.filter(s => s.id !== id);
      return copy;
    });
  };

  const updateStore = (id: string, field: keyof StoreConfig, val: any) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      const idx = copy.stores.stores.findIndex(s => s.id === id);
      if (idx !== -1) {
        copy.stores.stores[idx] = {
          ...copy.stores.stores[idx],
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
      {/* 1. Red de Tiendas Físicas */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-600" />
                Red de Tiendas Propias
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Configuración de tienda matriz y expansión de nuevas sucursales (inversión, maduración y canibalización)
              </CardDescription>
            </div>
            <Button size="sm" onClick={addStore} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Agregar Sucursal
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700 min-w-[180px]">Sucursal / Tienda</TableHead>
                  <TableHead className="font-bold text-slate-700">Apertura</TableHead>
                  <TableHead className="font-bold text-slate-700">Adecuación (CAPEX)</TableHead>
                  <TableHead className="font-bold text-slate-700">Depósito Renta</TableHead>
                  <TableHead className="font-bold text-slate-700">Renta Mensual</TableHead>
                  <TableHead className="font-bold text-slate-700">Nómina Tienda</TableHead>
                  <TableHead className="font-bold text-slate-700">Venta Objetivo</TableHead>
                  <TableHead className="font-bold text-slate-700">Maduración</TableHead>
                  <TableHead className="font-bold text-slate-700">Punto Equilibrio</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-sm">
                {scenario.stores.stores.map((st) => {
                  const totalStoreOpex = st.monthlyRent + st.monthlyStaffCost + st.monthlyOtherOpex + st.supervisionCostMonthly;
                  // Estimación de punto de equilibrio con margen bruto del 45%
                  const breakEvenSales = Math.round(totalStoreOpex / 0.45);

                  return (
                    <TableRow key={st.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={st.name}
                            onChange={(e) => updateStore(st.id, "name", e.target.value)}
                            className="h-8 text-xs font-semibold"
                          />
                          {st.isExisting && (
                            <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                              Matriz Actual
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={st.openMonth}
                          disabled={st.isExisting}
                          onChange={(e) => updateStore(st.id, "openMonth", Number(e.target.value))}
                          className="h-8 w-16 text-xs text-center"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={st.setupCapex}
                          disabled={st.isExisting}
                          onChange={(e) => updateStore(st.id, "setupCapex", Number(e.target.value))}
                          className="h-8 w-24 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={st.leaseDeposit}
                          disabled={st.isExisting}
                          onChange={(e) => updateStore(st.id, "leaseDeposit", Number(e.target.value))}
                          className="h-8 w-20 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={st.monthlyRent}
                          onChange={(e) => updateStore(st.id, "monthlyRent", Number(e.target.value))}
                          className="h-8 w-20 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={st.monthlyStaffCost}
                          onChange={(e) => updateStore(st.id, "monthlyStaffCost", Number(e.target.value))}
                          className="h-8 w-20 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={st.targetMonthlySales}
                          onChange={(e) => updateStore(st.id, "targetMonthlySales", Number(e.target.value))}
                          className="h-8 w-24 text-xs font-mono font-bold text-indigo-700"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-600">{st.rampUpMonths} meses</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono font-semibold text-emerald-700">
                          {formatMoney(breakEvenSales)}/m
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {!st.isExisting && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeStore(st.id)}
                            className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 2. Canal Ecommerce / Tienda Online */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-600" />
                Canal Ecommerce (Venta Digital)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Modelo de conversión, comisiones de pago, costo logístico y empaque protector
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-600">Activar Ecommerce:</span>
              <Switch
                checked={scenario.ecommerce.isEnabled.value}
                onCheckedChange={(val) => updateTracked(sc => sc.ecommerce.isEnabled, val)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Método de Proyección */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Método de Proyección</Label>
              <Select
                value={scenario.ecommerce.projectionMethod.value}
                onValueChange={(val: any) => updateTracked(sc => sc.ecommerce.projectionMethod, val)}
              >
                <SelectTrigger className="bg-white border-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRAFFIC_CONVERSION">Embudo (Tráfico × Conversión × Ticket)</SelectItem>
                  <SelectItem value="AD_DRIVEN">Inversión Pauta (Ad Spend / CAC)</SelectItem>
                  <SelectItem value="DIRECT_SALES">Venta Mensual Directa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tráfico Mensual de Visitas */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Visitas Mensuales al Sitio</Label>
              <Input
                type="number"
                value={scenario.ecommerce.monthlyVisitors.value}
                onChange={(e) => updateTracked(sc => sc.ecommerce.monthlyVisitors, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* Tasa de Conversión */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tasa de Conversión (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={scenario.ecommerce.conversionRatePct.value}
                onChange={(e) => updateTracked(sc => sc.ecommerce.conversionRatePct, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* Ticket Promedio */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Ticket Promedio (AOV MXN)</Label>
              <Input
                type="number"
                value={scenario.ecommerce.averageOrderValue.value}
                onChange={(e) => updateTracked(sc => sc.ecommerce.averageOrderValue, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            {/* Inversión en Pauta Publicitaria */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Pauta Mensual (Meta / Google)</Label>
              <Input
                type="number"
                value={scenario.ecommerce.monthlyAdSpend.value}
                onChange={(e) => updateTracked(sc => sc.ecommerce.monthlyAdSpend, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* Comisiones Pasarelas */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Comisión Pasarela (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={scenario.ecommerce.paymentGatewayCommissionPct.value}
                onChange={(e) => updateTracked(sc => sc.ecommerce.paymentGatewayCommissionPct, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* Costo Empaque y Logística */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Empaque y Subsidio Envío (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={scenario.ecommerce.packagingAndLogisticsCostPct.value}
                onChange={(e) => updateTracked(sc => sc.ecommerce.packagingAndLogisticsCostPct, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            {/* Tasa de Devoluciones */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Devoluciones / Garantías (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={scenario.ecommerce.returnRatePct.value}
                onChange={(e) => updateTracked(sc => sc.ecommerce.returnRatePct, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
