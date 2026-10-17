"use client";

import React, { useState, useMemo } from "react";
import { 
  StrategicScenario, 
  SimulationResult 
} from "@/types/strategicSimulation";
import { SliderControl } from "./SliderControl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine 
} from "recharts";
import { 
  Wallet, 
  Factory, 
  Store, 
  Globe, 
  Ship, 
  Truck, 
  UserCheck, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Award, 
  TrendingUp, 
  DollarSign, 
  Sparkles, 
  ShieldAlert 
} from "lucide-react";
import { exportSimulationToCsv } from "@/lib/services/strategicScenarioService";

interface ExecutiveCockpitProps {
  scenario: StrategicScenario;
  result: SimulationResult;
  onUpdateScenario: (updater: (prev: StrategicScenario) => StrategicScenario) => void;
}

export function ExecutiveCockpit({
  scenario,
  result,
  onUpdateScenario
}: ExecutiveCockpitProps) {
  // Preset rápido seleccionado: 'pesimista' | 'base' | 'optimista'
  const [activePreset, setActivePreset] = useState<"pesimista" | "base" | "optimista">("base");
  const [tableMode, setTableMode] = useState<"ANNUAL" | "MONTHLY">("ANNUAL");

  // Secciones colapsables del panel lateral izquierdo
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    inversion: true,
    fabricacion: true,
    tiendas: true,
    ecommerce: false,
    china: false,
    retail: false,
    autonomia: false
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { 
      style: "currency", 
      currency: "MXN", 
      maximumFractionDigits: 0 
    }).format(val);
  };

  // Helper para actualizar valores numéricos en el escenario
  const updateNumberField = (updaterFn: (sc: StrategicScenario, val: number) => void, val: number) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      updaterFn(copy, val);
      copy.updatedAt = new Date().toISOString();
      return copy;
    });
  };

  // Aplicar Preset de 1 clic (Pesimista / Base / Optimista)
  const applyPreset = (preset: "pesimista" | "base" | "optimista") => {
    setActivePreset(preset);
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      if (preset === "pesimista") {
        copy.baseline.referenceMonthlySales.value = 340000;
        if (copy.stores.stores[1]) copy.stores.stores[1].targetMonthlySales = 320000;
        copy.ecommerce.monthlyAdSpend.value = 18000;
        copy.ecommerce.conversionRatePct.value = 1.0;
        copy.chinaImport.exchangeRateUSDMXN.value = 19.80;
        copy.chinaImport.seaFreightPerContainerUSD.value = 5200;
        if (copy.retail.chains[0]) {
          copy.retail.chains[0].targetUnitsPerStoreMonthly = 18;
          copy.retail.chains[0].wholesaleDiscountPct.value = 45;
          copy.retail.chains[0].paymentTermsDays.value = 90;
        }
      } else if (preset === "optimista") {
        copy.baseline.referenceMonthlySales.value = 450000;
        if (copy.stores.stores[1]) {
          copy.stores.stores[1].targetMonthlySales = 460000;
          copy.stores.stores[1].rampUpMonths = 4;
        }
        copy.ecommerce.monthlyAdSpend.value = 35000;
        copy.ecommerce.conversionRatePct.value = 1.9;
        copy.chinaImport.exchangeRateUSDMXN.value = 17.80;
        copy.chinaImport.seaFreightPerContainerUSD.value = 3800;
        if (copy.retail.chains[0]) {
          copy.retail.chains[0].targetUnitsPerStoreMonthly = 35;
          copy.retail.chains[0].wholesaleDiscountPct.value = 38;
          copy.retail.chains[0].paymentTermsDays.value = 45;
        }
      } else {
        // Base
        copy.baseline.referenceMonthlySales.value = 400000;
        if (copy.stores.stores[1]) {
          copy.stores.stores[1].targetMonthlySales = 400000;
          copy.stores.stores[1].rampUpMonths = 6;
        }
        copy.ecommerce.monthlyAdSpend.value = 25000;
        copy.ecommerce.conversionRatePct.value = 1.4;
        copy.chinaImport.exchangeRateUSDMXN.value = 18.50;
        copy.chinaImport.seaFreightPerContainerUSD.value = 4200;
        if (copy.retail.chains[0]) {
          copy.retail.chains[0].targetUnitsPerStoreMonthly = 25;
          copy.retail.chains[0].wholesaleDiscountPct.value = 42;
          copy.retail.chains[0].paymentTermsDays.value = 60;
        }
      }
      return copy;
    });
  };

  // Preparar datos de Gráficas Anuales (Años 1 a 5)
  const annualData = useMemo(() => {
    let cumulativeCash = -(scenario.budget.interpretation.value === 'OPTION_A' ? 700000 : 1000000);

    return [1, 2, 3, 4, 5].map(yr => {
      const yrMonths = result.months.slice((yr - 1) * 12, yr * 12);
      const lastMonth = yrMonths[yrMonths.length - 1];

      const netSales = yrMonths.reduce((acc, m) => acc + m.revenue.totalNetRevenue, 0);
      const currentStoreSales = yrMonths.reduce((acc, m) => acc + m.revenue.currentStore, 0);
      const newStoresSales = yrMonths.reduce((acc, m) => acc + m.revenue.newStores, 0);
      const ecomSales = yrMonths.reduce((acc, m) => acc + m.revenue.ecommerce, 0);
      const retailSales = yrMonths.reduce((acc, m) => acc + m.revenue.retailChains, 0);

      const cogs = yrMonths.reduce((acc, m) => acc + m.cogs.totalCogs, 0);
      const grossProfit = netSales - cogs;
      const grossMarginPct = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(1)) : 0;

      const opex = yrMonths.reduce((acc, m) => acc + m.opex.totalOpex, 0);
      const ebitda = yrMonths.reduce((acc, m) => acc + m.ebitda, 0);
      const ebitdaMarginPct = netSales > 0 ? Number(((ebitda / netSales) * 100).toFixed(1)) : 0;

      const taxes = yrMonths.reduce((acc, m) => acc + m.incomeTaxes, 0);
      const netProfit = yrMonths.reduce((acc, m) => acc + m.netProfit, 0);
      const netMarginPct = netSales > 0 ? Number(((netProfit / netSales) * 100).toFixed(1)) : 0;

      const netCashFlow = yrMonths.reduce((acc, m) => acc + m.cashFlow.netCashFlow, 0);
      cumulativeCash += netCashFlow;

      return {
        yearLabel: `Año ${yr}`,
        netSales,
        cogs,
        grossProfit,
        grossMarginPct,
        opex,
        ebitda,
        ebitdaMarginPct,
        netProfit,
        netMarginPct,
        cumulativeCash,
        currentStoreSales,
        newStoresSales,
        ecomSales,
        retailSales,
        taxes,
        endingCash: lastMonth?.balance.cash || 0
      };
    });
  }, [result, scenario]);

  // Totales 5 Años para la tabla
  const totals5Y = useMemo(() => {
    return {
      netSales: annualData.reduce((acc, a) => acc + a.netSales, 0),
      currentStoreSales: annualData.reduce((acc, a) => acc + a.currentStoreSales, 0),
      newStoresSales: annualData.reduce((acc, a) => acc + a.newStoresSales, 0),
      ecomSales: annualData.reduce((acc, a) => acc + a.ecomSales, 0),
      retailSales: annualData.reduce((acc, a) => acc + a.retailSales, 0),
      cogs: annualData.reduce((acc, a) => acc + a.cogs, 0),
      grossProfit: annualData.reduce((acc, a) => acc + a.grossProfit, 0),
      opex: annualData.reduce((acc, a) => acc + a.opex, 0),
      ebitda: annualData.reduce((acc, a) => acc + a.ebitda, 0),
      taxes: annualData.reduce((acc, a) => acc + a.taxes, 0),
      netProfit: annualData.reduce((acc, a) => acc + a.netProfit, 0),
      cumulativeCash: annualData[4]?.cumulativeCash || 0
    };
  }, [annualData]);

  // Datos para Gráfica 3: Mix Donut de Canales
  const pieData = [
    { name: "Tienda Matriz (Propia)", value: totals5Y.currentStoreSales, color: "#6366f1" },
    { name: "Nuevas Tiendas", value: totals5Y.newStoresSales, color: "#3b82f6" },
    { name: "Ecommerce Online", value: totals5Y.ecomSales, color: "#06b6d4" },
    { name: "Cadenas Retail", value: totals5Y.retailSales, color: "#f59e0b" }
  ].filter(d => d.value > 0);

  const isOptionA = scenario.budget.interpretation.value === 'OPTION_A';

  return (
    <div className="space-y-5">
      {/* Barra de Presets Rápidos y Métricas Clave */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-xl shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Escenario Rápido:
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => applyPreset("pesimista")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                activePreset === "pesimista"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pesimista
            </button>
            <button
              onClick={() => applyPreset("base")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                activePreset === "base"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Base (ERP)
            </button>
            <button
              onClick={() => applyPreset("optimista")}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                activePreset === "optimista"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Optimista
            </button>
          </div>
        </div>

        {/* 4 KPIs Rápidos en la barra */}
        <div className="flex items-center gap-4 text-xs font-medium flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Ventas 5Y:</span>
            <strong className="text-slate-900 font-bold">{formatMoney(result.summary5Years.totalRevenue)}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">EBITDA 5Y:</span>
            <strong className="text-indigo-600 font-bold">{formatMoney(result.summary5Years.totalEbitda)}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Retorno Expansión:</span>
            <strong className="text-emerald-600 font-bold">{result.summary5Years.roiOnExpansionBudgetPct}%</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Autonomía Fundadores:</span>
            <strong className="text-purple-600 font-bold">{result.summary5Years.finalAutonomyScorePct}%</strong>
          </div>
        </div>
      </div>

      {/* CUERPO PRINCIPAL: 2 COLUMNAS (CONTROLES A LA IZQUIERDA, RESULTADOS A LA DERECHA) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ============================================================== */}
        {/* COLUMNA IZQUIERDA: CONTROLES Y SLIDERS (3.5 cols ~ 28% ancho) */}
        {/* ============================================================== */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-3 max-h-[1400px] overflow-y-auto pr-1">
          {/* 1. Inversión y Presupuesto */}
          <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div
              onClick={() => toggleSection("inversion")}
              className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer border-b border-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Inversión y Presupuesto
                </span>
              </div>
              {openSections.inversion ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            {openSections.inversion && (
              <CardContent className="p-3.5 space-y-3">
                {/* Selector de Opción A vs B */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500">Regla Presupuestal:</span>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <button
                      onClick={() => updateNumberField((sc, v) => sc.budget.interpretation.value = 'OPTION_A', 0)}
                      className={`p-1.5 rounded border text-left font-semibold ${
                        isOptionA ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      Opción A ($1M Total)
                      <span className="block text-[9px] font-normal text-slate-500">$700k exp + $300k res</span>
                    </button>
                    <button
                      onClick={() => updateNumberField((sc, v) => sc.budget.interpretation.value = 'OPTION_B', 0)}
                      className={`p-1.5 rounded border text-left font-semibold ${
                        !isOptionA ? "bg-indigo-50 border-indigo-400 text-indigo-700" : "bg-white border-slate-200 text-slate-600"
                      }`}
                    >
                      Opción B ($1.3M)
                      <span className="block text-[9px] font-normal text-slate-500">$1M exp + $300k res</span>
                    </button>
                  </div>
                </div>

                <SliderControl
                  label="CAPEX Taller / Maquinaria"
                  value={scenario.manufacturing.machines[0]?.capexAmount || 280000}
                  min={50000}
                  max={600000}
                  step={10000}
                  prefix="$"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.manufacturing.machines[0]) sc.manufacturing.machines[0].capexAmount = v;
                    }, val);
                  }}
                />

                <SliderControl
                  label="Adecuación Nueva Sucursal"
                  value={scenario.stores.stores[1]?.setupCapex || 350000}
                  min={50000}
                  max={600000}
                  step={10000}
                  prefix="$"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.stores.stores[1]) sc.stores.stores[1].setupCapex = v;
                    }, val);
                  }}
                />

                <SliderControl
                  label="Depósito en Garantía Local"
                  value={scenario.stores.stores[1]?.leaseDeposit || 80000}
                  min={20000}
                  max={200000}
                  step={5000}
                  prefix="$"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.stores.stores[1]) sc.stores.stores[1].leaseDeposit = v;
                    }, val);
                  }}
                />
              </CardContent>
            )}
          </Card>

          {/* 2. Fabricación Propia */}
          <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div
              onClick={() => toggleSection("fabricacion")}
              className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer border-b border-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Factory className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Fabricación Propia (Taller)
                </span>
              </div>
              {openSections.fabricacion ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            {openSections.fabricacion && (
              <CardContent className="p-3.5 space-y-3">
                <SliderControl
                  label="Capacidad Actual Taller"
                  value={scenario.manufacturing.currentMonthlyCapacityUnits.value}
                  min={500}
                  max={3000}
                  step={50}
                  suffix=" u/mes"
                  onChange={(val) => updateNumberField((sc, v) => sc.manufacturing.currentMonthlyCapacityUnits.value = v, val)}
                />

                <SliderControl
                  label="Materia Prima Directa"
                  value={scenario.manufacturing.rawMaterialCostPerUnit.value}
                  min={30}
                  max={200}
                  step={2}
                  prefix="$"
                  onChange={(val) => updateNumberField((sc, v) => sc.manufacturing.rawMaterialCostPerUnit.value = v, val)}
                />

                <SliderControl
                  label="Mano de Obra Directa (MOD)"
                  value={scenario.manufacturing.directLaborCostPerUnit.value}
                  min={20}
                  max={150}
                  step={2}
                  prefix="$"
                  onChange={(val) => updateNumberField((sc, v) => sc.manufacturing.directLaborCostPerUnit.value = v, val)}
                />

                <SliderControl
                  label="Merma y Retrabajo"
                  value={scenario.manufacturing.spoilageAndScrapPct.value}
                  min={1}
                  max={15}
                  step={0.5}
                  suffix="%"
                  onChange={(val) => updateNumberField((sc, v) => sc.manufacturing.spoilageAndScrapPct.value = v, val)}
                />
              </CardContent>
            )}
          </Card>

          {/* 3. Tiendas Físicas */}
          <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div
              onClick={() => toggleSection("tiendas")}
              className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer border-b border-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Tiendas Físicas
                </span>
              </div>
              {openSections.tiendas ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            {openSections.tiendas && (
              <CardContent className="p-3.5 space-y-3">
                <SliderControl
                  label="Venta Base Matriz Actual"
                  value={scenario.baseline.referenceMonthlySales.value}
                  min={200000}
                  max={700000}
                  step={10000}
                  prefix="$"
                  onChange={(val) => updateNumberField((sc, v) => sc.baseline.referenceMonthlySales.value = v, val)}
                />

                <SliderControl
                  label="Venta Objetivo Nueva Sucursal"
                  value={scenario.stores.stores[1]?.targetMonthlySales || 400000}
                  min={150000}
                  max={800000}
                  step={10000}
                  prefix="$"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.stores.stores[1]) sc.stores.stores[1].targetMonthlySales = v;
                    }, val);
                  }}
                />

                <SliderControl
                  label="Maduración Ramp-up"
                  value={scenario.stores.stores[1]?.rampUpMonths || 6}
                  min={1}
                  max={12}
                  step={1}
                  suffix=" meses"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.stores.stores[1]) sc.stores.stores[1].rampUpMonths = v;
                    }, val);
                  }}
                />

                <SliderControl
                  label="Canibalización Matriz"
                  value={scenario.stores.stores[1]?.cannibalizationPct || 8}
                  min={0}
                  max={25}
                  step={1}
                  suffix="%"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.stores.stores[1]) sc.stores.stores[1].cannibalizationPct = v;
                    }, val);
                  }}
                />
              </CardContent>
            )}
          </Card>

          {/* 4. Ecommerce */}
          <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div
              onClick={() => toggleSection("ecommerce")}
              className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer border-b border-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Canal Ecommerce
                </span>
              </div>
              {openSections.ecommerce ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            {openSections.ecommerce && (
              <CardContent className="p-3.5 space-y-3">
                <SliderControl
                  label="Inversión Pauta Publicitaria"
                  value={scenario.ecommerce.monthlyAdSpend.value}
                  min={5000}
                  max={80000}
                  step={2000}
                  prefix="$"
                  onChange={(val) => updateNumberField((sc, v) => sc.ecommerce.monthlyAdSpend.value = v, val)}
                />

                <SliderControl
                  label="Ticket Promedio (AOV)"
                  value={scenario.ecommerce.averageOrderValue.value}
                  min={300}
                  max={2500}
                  step={25}
                  prefix="$"
                  onChange={(val) => updateNumberField((sc, v) => sc.ecommerce.averageOrderValue.value = v, val)}
                />

                <SliderControl
                  label="Tasa de Conversión"
                  value={scenario.ecommerce.conversionRatePct.value}
                  min={0.5}
                  max={4.0}
                  step={0.1}
                  suffix="%"
                  onChange={(val) => updateNumberField((sc, v) => sc.ecommerce.conversionRatePct.value = v, val)}
                />
              </CardContent>
            )}
          </Card>

          {/* 5. Importación China */}
          <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div
              onClick={() => toggleSection("china")}
              className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer border-b border-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Ship className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Importación China
                </span>
              </div>
              {openSections.china ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            {openSections.china && (
              <CardContent className="p-3.5 space-y-3">
                <SliderControl
                  label="Tipo de Cambio USD/MXN"
                  value={scenario.chinaImport.exchangeRateUSDMXN.value}
                  min={16.5}
                  max={24.0}
                  step={0.25}
                  prefix="$"
                  onChange={(val) => updateNumberField((sc, v) => sc.chinaImport.exchangeRateUSDMXN.value = v, val)}
                />

                <SliderControl
                  label="Arancel Estimado IGI"
                  value={scenario.chinaImport.customsDutyAvgPct.value}
                  min={0}
                  max={30}
                  step={1}
                  suffix="%"
                  onChange={(val) => updateNumberField((sc, v) => sc.chinaImport.customsDutyAvgPct.value = v, val)}
                />

                <SliderControl
                  label="Flete Contenedor 40HQ"
                  value={scenario.chinaImport.seaFreightPerContainerUSD.value}
                  min={2000}
                  max={9000}
                  step={100}
                  prefix="USD $"
                  onChange={(val) => updateNumberField((sc, v) => sc.chinaImport.seaFreightPerContainerUSD.value = v, val)}
                />
              </CardContent>
            )}
          </Card>

          {/* 6. Cadenas de Retail */}
          <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div
              onClick={() => toggleSection("retail")}
              className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer border-b border-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Cadenas de Retail
                </span>
              </div>
              {openSections.retail ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            {openSections.retail && (
              <CardContent className="p-3.5 space-y-3">
                <SliderControl
                  label="Sucursales en Cadena"
                  value={scenario.retail.chains[0]?.storeCount || 15}
                  min={5}
                  max={80}
                  step={1}
                  suffix=" tiendas"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.retail.chains[0]) sc.retail.chains[0].storeCount = v;
                    }, val);
                  }}
                />

                <SliderControl
                  label="Descuento Comercial Cadena"
                  value={scenario.retail.chains[0]?.wholesaleDiscountPct.value || 42}
                  min={25}
                  max={55}
                  step={1}
                  suffix="%"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.retail.chains[0]) sc.retail.chains[0].wholesaleDiscountPct.value = v;
                    }, val);
                  }}
                />

                <SliderControl
                  label="Plazo de Pago Contractual"
                  value={scenario.retail.chains[0]?.paymentTermsDays.value || 60}
                  min={30}
                  max={90}
                  step={30}
                  suffix=" días"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.retail.chains[0]) sc.retail.chains[0].paymentTermsDays.value = v;
                    }, val);
                  }}
                />
              </CardContent>
            )}
          </Card>

          {/* 7. Autonomía y Fundadores */}
          <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <div
              onClick={() => toggleSection("autonomia")}
              className="flex items-center justify-between p-3.5 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer border-b border-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Autonomía y Fundadores
                </span>
              </div>
              {openSections.autonomia ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>

            {openSections.autonomia && (
              <CardContent className="p-3.5 space-y-3">
                <SliderControl
                  label="Horas Semanales Humberto"
                  value={scenario.autonomy.founderInitialWeeklyHoursHumberto.value}
                  min={10}
                  max={60}
                  step={2}
                  suffix=" hrs"
                  onChange={(val) => updateNumberField((sc, v) => sc.autonomy.founderInitialWeeklyHoursHumberto.value = v, val)}
                />

                <SliderControl
                  label="Horas Semanales Nancy"
                  value={scenario.autonomy.founderInitialWeeklyHoursNancy.value}
                  min={10}
                  max={60}
                  step={2}
                  suffix=" hrs"
                  onChange={(val) => updateNumberField((sc, v) => sc.autonomy.founderInitialWeeklyHoursNancy.value = v, val)}
                />

                <SliderControl
                  label="Reducción Horas por Ejecutivos"
                  value={scenario.autonomy.executives[0]?.founderHoursReductionPct || 35}
                  min={10}
                  max={70}
                  step={5}
                  suffix="%"
                  onChange={(val) => {
                    updateNumberField((sc, v) => {
                      if (sc.autonomy.executives[0]) sc.autonomy.executives[0].founderHoursReductionPct = v;
                    }, val);
                  }}
                />
              </CardContent>
            )}
          </Card>
        </div>

        {/* ============================================================== */}
        {/* COLUMNA DERECHA: 4 GRÁFICAS (2x2) + TABLA FINANCIERA (72% ancho) */}
        {/* ============================================================== */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-5">
          {/* FILA 1 DE GRÁFICAS: Flujo Acumulado + Barras Ventas/Costos/EBITDA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gráfica 1: Flujo de Caja Acumulado y Payback */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                  <span>Flujo Acumulado y Payback</span>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Payback: {result.summary5Years.paybackMonths}m
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={annualData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="yearLabel" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} tickLine={false} />
                      <Tooltip formatter={(v: any) => [formatMoney(v), "Flujo Acumulado"]} />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="cumulativeCash" stroke="#f59e0b" strokeWidth={2.5} fill="url(#colorCash)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gráfica 2: Ventas vs Costos vs EBITDA */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Ventas vs Costos vs EBITDA (Años 1 al 5)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={annualData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="yearLabel" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} tickLine={false} />
                      <Tooltip formatter={(v: any) => [formatMoney(v), ""]} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }} />
                      <Bar dataKey="netSales" name="Ventas" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="cogs" name="COGS" fill="#f87171" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="ebitda" name="EBITDA" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* FILA 2 DE GRÁFICAS: Donut Mix de Categorías + Líneas Evolución de Márgenes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Gráfica 3: Mix Donut de Canales */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Mix de Ingresos por Canal (5 Años)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-56 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [formatMoney(v), ""]} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gráfica 4: Evolución de Márgenes % */}
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Evolución de Márgenes (%)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={annualData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="yearLabel" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}%`} tickLine={false} domain={[0, 60]} />
                      <Tooltip formatter={(v: any) => [`${v}%`, ""]} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }} />
                      <Line type="monotone" dataKey="grossMarginPct" name="Margen Bruto" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="ebitdaMarginPct" name="Margen EBITDA" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="netMarginPct" name="Margen Neto" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* TABLA EJECUTIVA INFERIOR: ESTADO DE RESULTADOS */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Estado de Resultados — Corrida Estratégica
                </CardTitle>
                <CardDescription className="text-[11px] text-slate-500">
                  Proyección consolidada año con año de ingresos, márgenes y generación neta de efectivo
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                  <button
                    onClick={() => setTableMode("ANNUAL")}
                    className={`px-2.5 py-1 font-bold rounded ${tableMode === "ANNUAL" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"}`}
                  >
                    Anual (5 Años)
                  </button>
                  <button
                    onClick={() => setTableMode("MONTHLY")}
                    className={`px-2.5 py-1 font-bold rounded ${tableMode === "MONTHLY" ? "bg-white text-indigo-700 shadow-xs" : "text-slate-600"}`}
                  >
                    Mensual (Año 1)
                  </button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportSimulationToCsv(result)}
                  className="h-7 text-xs border-slate-300"
                >
                  <Download className="w-3 h-3 mr-1" />
                  CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 text-slate-700">
                  <TableRow className="text-xs">
                    <TableHead className="font-bold text-slate-800">AÑO</TableHead>
                    <TableHead className="font-bold text-right">VENTAS NETAS</TableHead>
                    <TableHead className="font-bold text-right">MARCA PROPIA</TableHead>
                    <TableHead className="font-bold text-right">IMPORTACIÓN / OTRAS</TableHead>
                    <TableHead className="font-bold text-right">COGS</TableHead>
                    <TableHead className="font-bold text-right text-emerald-700">UTILIDAD BRUTA</TableHead>
                    <TableHead className="font-bold text-right text-rose-700">OPEX</TableHead>
                    <TableHead className="font-bold text-right text-indigo-700">EBITDA</TableHead>
                    <TableHead className="font-bold text-right">MARGEN %</TableHead>
                    <TableHead className="font-bold text-right text-emerald-700">UTILIDAD NETA</TableHead>
                    <TableHead className="font-bold text-right">FLUJO ACUMULADO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {tableMode === "ANNUAL" ? (
                    <>
                      {annualData.map((row) => (
                        <TableRow key={row.yearLabel} className="hover:bg-slate-50/70">
                          <TableCell className="font-bold text-slate-900">{row.yearLabel}</TableCell>
                          <TableCell className="text-right font-bold text-slate-900">{formatMoney(row.netSales)}</TableCell>
                          <TableCell className="text-right text-slate-600">{formatMoney(row.currentStoreSales + row.newStoresSales)}</TableCell>
                          <TableCell className="text-right text-slate-600">{formatMoney(row.retailSales + row.ecomSales)}</TableCell>
                          <TableCell className="text-right text-rose-600 font-medium">-{formatMoney(row.cogs)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">{formatMoney(row.grossProfit)}</TableCell>
                          <TableCell className="text-right text-rose-600 font-medium">-{formatMoney(row.opex)}</TableCell>
                          <TableCell className="text-right font-extrabold text-indigo-700">{formatMoney(row.ebitda)}</TableCell>
                          <TableCell className="text-right font-bold text-slate-700">{row.ebitdaMarginPct}%</TableCell>
                          <TableCell className="text-right font-bold text-emerald-600">{formatMoney(row.netProfit)}</TableCell>
                          <TableCell className={`text-right font-bold ${row.cumulativeCash >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                            {formatMoney(row.cumulativeCash)}
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* Fila Total 5 Años */}
                      <TableRow className="bg-slate-100 font-extrabold border-t-2 border-slate-300">
                        <TableCell className="text-slate-900">Total 5 Años</TableCell>
                        <TableCell className="text-right text-slate-900">{formatMoney(totals5Y.netSales)}</TableCell>
                        <TableCell className="text-right text-slate-700">{formatMoney(totals5Y.currentStoreSales + totals5Y.newStoresSales)}</TableCell>
                        <TableCell className="text-right text-slate-700">{formatMoney(totals5Y.retailSales + totals5Y.ecomSales)}</TableCell>
                        <TableCell className="text-right text-rose-700">-{formatMoney(totals5Y.cogs)}</TableCell>
                        <TableCell className="text-right text-emerald-700">{formatMoney(totals5Y.grossProfit)}</TableCell>
                        <TableCell className="text-right text-rose-700">-{formatMoney(totals5Y.opex)}</TableCell>
                        <TableCell className="text-right text-indigo-700">{formatMoney(totals5Y.ebitda)}</TableCell>
                        <TableCell className="text-right text-slate-900">{result.summary5Years.avgEbitdaMarginPct}%</TableCell>
                        <TableCell className="text-right text-emerald-700">{formatMoney(totals5Y.netProfit)}</TableCell>
                        <TableCell className={`text-right ${totals5Y.cumulativeCash >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {formatMoney(totals5Y.cumulativeCash)}
                        </TableCell>
                      </TableRow>
                    </>
                  ) : (
                    result.months.slice(0, 12).map((m) => (
                      <TableRow key={m.monthIndex} className="hover:bg-slate-50/70">
                        <TableCell className="font-bold text-slate-900">{m.monthLabel.split(" ")[0]}</TableCell>
                        <TableCell className="text-right font-bold text-slate-900">{formatMoney(m.revenue.totalNetRevenue)}</TableCell>
                        <TableCell className="text-right text-slate-600">{formatMoney(m.revenue.currentStore + m.revenue.newStores)}</TableCell>
                        <TableCell className="text-right text-slate-600">{formatMoney(m.revenue.retailChains + m.revenue.ecommerce)}</TableCell>
                        <TableCell className="text-right text-rose-600 font-medium">-{formatMoney(m.cogs.totalCogs)}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-600">{formatMoney(m.grossProfit)}</TableCell>
                        <TableCell className="text-right text-rose-600 font-medium">-{formatMoney(m.opex.totalOpex)}</TableCell>
                        <TableCell className="text-right font-extrabold text-indigo-700">{formatMoney(m.ebitda)}</TableCell>
                        <TableCell className="text-right font-bold text-slate-700">{m.ebitdaMarginPct}%</TableCell>
                        <TableCell className="text-right font-bold text-emerald-600">{formatMoney(m.netProfit)}</TableCell>
                        <TableCell className={`text-right font-bold ${m.cashFlow.endingCash >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                          {formatMoney(m.cashFlow.endingCash)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* TARJETA EJECUTIVA DE AUTONOMÍA Y PREPARACIÓN M&A */}
          <Card className="border-indigo-100 shadow-sm bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-white">
            <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-600" />
                  <span className="text-sm font-bold text-slate-900">
                    Preparación para Venta (M&A) & Reducción de Dependencia
                  </span>
                  <Badge variant="outline" className="bg-indigo-100 text-indigo-800 border-indigo-300 font-bold">
                    Score: {result.summary5Years.finalSaleReadinessScorePct}/100
                  </Badge>
                </div>
                <p className="text-xs text-slate-600">
                  Desconexión de fundadores: <strong>94 hrs/sem → {result.months[59]?.founderHoursRemainingHumberto + result.months[59]?.founderHoursRemainingNancy} hrs/sem</strong> (-{result.summary5Years.finalAutonomyScorePct}%) | 
                  EBITDA Normalizado Año 5: <strong>{formatMoney(result.summary5Years.totalAdjustedEbitda / 5)}</strong>.
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-500 block">Valuación Estimada de Salida (Equity):</span>
                <span className="text-lg font-black text-indigo-950 font-mono">
                  {formatMoney(result.summary5Years.equityValueMin)} - {formatMoney(result.summary5Years.equityValueMax)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
