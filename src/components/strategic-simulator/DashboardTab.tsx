"use client";

import React from "react";
import { StrategicScenario, SimulationResult } from "@/types/strategicSimulation";
import { 
  TrendingUp, 
  DollarSign, 
  ShieldAlert, 
  Award, 
  Factory, 
  Store, 
  Globe, 
  Truck, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  ReferenceLine 
} from "recharts";

interface DashboardTabProps {
  scenario: StrategicScenario;
  result: SimulationResult;
}

export function DashboardTab({ scenario, result }: DashboardTabProps) {
  const { summary5Years, months } = result;

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { 
      style: "currency", 
      currency: "MXN", 
      maximumFractionDigits: 0 
    }).format(val);
  };

  // Preparar datos para gráfica de ingresos por canal
  const revenueChartData = months.map(m => ({
    name: m.monthIndex % 6 === 0 ? m.monthLabel : `M${m.monthIndex}`,
    fullLabel: m.monthLabel,
    "Tienda Actual": m.revenue.currentStore,
    "Nuevas Tiendas": m.revenue.newStores,
    "Ecommerce": m.revenue.ecommerce,
    "Cadenas Retail": m.revenue.retailChains,
    "Total Neto": m.revenue.totalNetRevenue
  }));

  // Preparar datos para gráfica de EBITDA y Flujo
  const financialChartData = months.map(m => ({
    name: m.monthIndex % 6 === 0 ? m.monthLabel : `M${m.monthIndex}`,
    fullLabel: m.monthLabel,
    "EBITDA": m.ebitda,
    "EBITDA Ajustado (M&A)": m.adjustedEbitda,
    "Flujo Neto de Caja": m.cashFlow.netCashFlow
  }));

  // Preparar datos para gráfica de Liquidez y Reserva
  const securityReserve = scenario.budget.securityReserve.value;
  const cashChartData = months.map(m => ({
    name: m.monthIndex % 6 === 0 ? m.monthLabel : `M${m.monthIndex}`,
    fullLabel: m.monthLabel,
    "Caja en Bancos": m.balance.cash,
    "Reserva de Seguridad": securityReserve
  }));

  return (
    <div className="space-y-6">
      {/* 4 KPIs Ejecutivos Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Ventas Netas 5 Años */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>Ventas Netas (5 Años)</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 pt-1">
              {formatMoney(summary5Years.totalRevenue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xs text-slate-500 flex items-center justify-between">
              <span>Margen Bruto Promedio:</span>
              <strong className="text-slate-800 font-semibold">{summary5Years.avgGrossMarginPct}%</strong>
            </div>
            <div className="text-xs text-slate-500 flex items-center justify-between mt-1">
              <span>Utilidad Bruta 5Y:</span>
              <span className="text-slate-700">{formatMoney(summary5Years.totalGrossProfit)}</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 2: EBITDA Acumulado */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>EBITDA Operativo (5 Años)</span>
              <DollarSign className="w-4 h-4 text-indigo-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 pt-1">
              {formatMoney(summary5Years.totalEbitda)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xs text-slate-500 flex items-center justify-between">
              <span>Margen EBITDA Promedio:</span>
              <strong className="text-indigo-600 font-semibold">{summary5Years.avgEbitdaMarginPct}%</strong>
            </div>
            <div className="text-xs text-slate-500 flex items-center justify-between mt-1">
              <span>EBITDA Normalizado M&A:</span>
              <span className="text-slate-700">{formatMoney(summary5Years.totalAdjustedEbitda)}</span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 3: Liquidez y Riesgo de Caja */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>Liquidez y Caja Mínima</span>
              <ShieldAlert className={`w-4 h-4 ${summary5Years.didBreachSecurityReserve ? "text-amber-500" : "text-emerald-500"}`} />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 pt-1">
              {formatMoney(summary5Years.lowestCashBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xs text-slate-500 flex items-center justify-between">
              <span>Mes de Menor Caja:</span>
              <strong className="text-slate-800 font-semibold">Mes {summary5Years.monthOfLowestCash}</strong>
            </div>
            <div className="text-xs text-slate-500 flex items-center justify-between mt-1">
              <span>Reserva ($300k):</span>
              <span className={`font-semibold ${summary5Years.didBreachSecurityReserve ? "text-rose-600" : "text-emerald-600"}`}>
                {summary5Years.didBreachSecurityReserve ? "Vulnerada temporalmente" : "100% Protegida"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: Autonomía y Venta M&A */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>Preparación para Venta (M&A)</span>
              <Award className="w-4 h-4 text-purple-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-purple-700 pt-1">
              {summary5Years.finalSaleReadinessScorePct} / 100
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xs text-slate-500 flex items-center justify-between">
              <span>Autonomía de Fundadores:</span>
              <strong className="text-purple-600 font-semibold">{summary5Years.finalAutonomyScorePct}%</strong>
            </div>
            <div className="text-xs text-slate-500 flex items-center justify-between mt-1">
              <span>Valuación Estimada:</span>
              <span className="text-slate-700 font-medium">
                {formatMoney(summary5Years.enterpriseValueMin)} - {formatMoney(summary5Years.enterpriseValueMax)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerta de Diagnóstico Estratégico */}
      <div className={`p-4 rounded-xl border flex items-start gap-3 ${
        summary5Years.monthsWithDeficitCount > 0 
          ? "bg-rose-50 border-rose-200 text-rose-900" 
          : summary5Years.didBreachSecurityReserve 
            ? "bg-amber-50 border-amber-200 text-amber-900" 
            : "bg-emerald-50 border-emerald-200 text-emerald-900"
      }`}>
        {summary5Years.monthsWithDeficitCount > 0 ? (
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
        ) : (
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
        )}
        <div className="space-y-1 text-sm">
          <div className="font-bold">
            {summary5Years.monthsWithDeficitCount > 0
              ? `Atención: Se proyectan ${summary5Years.monthsWithDeficitCount} meses con déficit de caja (Pico máximo: ${formatMoney(summary5Years.peakCashDeficit)})`
              : summary5Years.didBreachSecurityReserve
                ? `Alerta de Liquidez: El saldo toca el piso mínimo en Mes ${summary5Years.monthOfLowestCash} (${formatMoney(summary5Years.lowestCashBalance)}), requiriendo ajuste de calendario de compras o puente de capital.`
                : "Escenario Financieramente Sólido: La caja se mantiene por encima de la reserva de seguridad de $300,000 durante los 60 meses."
            }
          </div>
          <p className="text-xs opacity-90">
            Presupuesto de expansión: <strong>{formatMoney(scenario.budget.interpretation.value === 'OPTION_A' ? 700000 : 1000000)}</strong> | 
            Retorno proyectado (ROI EBITDA): <strong>{summary5Years.roiOnExpansionBudgetPct}%</strong> | 
            Periodo de recuperación (Payback): <strong>{summary5Years.paybackMonths} meses</strong>.
          </p>
        </div>
      </div>

      {/* Gráfica 1: Proyección de Ventas por Canal a 60 Meses */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">
                Proyección Multicanal de Ventas (60 Meses)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Evolución mensual combinada: Tienda matriz, nuevas sucursales, ecommerce y cadenas de retail
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-1 text-slate-600">
                <Store className="w-3.5 h-3.5 text-indigo-500" /> Tiendas Físicas
              </span>
              <span className="flex items-center gap-1 text-slate-600">
                <Globe className="w-3.5 h-3.5 text-cyan-500" /> Ecommerce
              </span>
              <span className="flex items-center gap-1 text-slate-600">
                <Truck className="w-3.5 h-3.5 text-amber-500" /> Retail Cadenas
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorStore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorNewStores" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorEcom" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorRetail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={11} 
                  tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} 
                  tickLine={false} 
                />
                <Tooltip 
                  formatter={(val: any) => [formatMoney(val), ""]}
                  labelFormatter={(lbl, p) => p[0]?.payload.fullLabel || lbl}
                  contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }} />
                <Area type="monotone" dataKey="Tienda Actual" stackId="1" stroke="#6366f1" fill="url(#colorStore)" />
                <Area type="monotone" dataKey="Nuevas Tiendas" stackId="1" stroke="#3b82f6" fill="url(#colorNewStores)" />
                <Area type="monotone" dataKey="Ecommerce" stackId="1" stroke="#06b6d4" fill="url(#colorEcom)" />
                <Area type="monotone" dataKey="Cadenas Retail" stackId="1" stroke="#f59e0b" fill="url(#colorRetail)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Gráfica 2 y 3: EBITDA & Flujo de Caja y Posición de Liquidez */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* EBITDA vs Flujo */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              EBITDA Operativo vs Flujo Neto de Caja
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Distingue el resultado contable del flujo de efectivo tras compras de inventario y CAPEX
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financialChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={11} 
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} 
                    tickLine={false} 
                  />
                  <Tooltip 
                    formatter={(val: any) => [formatMoney(val), ""]}
                    labelFormatter={(lbl, p) => p[0]?.payload.fullLabel || lbl}
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  <Bar dataKey="EBITDA" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Flujo Neto de Caja" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Posición de Liquidez y Piso de Reserva */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Saldo de Caja en Bancos vs Reserva de Seguridad ($300k)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Trayectoria de liquidez mensual asegurando la continuidad operativa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={11} 
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} 
                    tickLine={false} 
                  />
                  <Tooltip 
                    formatter={(val: any) => [formatMoney(val), ""]}
                    labelFormatter={(lbl, p) => p[0]?.payload.fullLabel || lbl}
                    contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  <ReferenceLine y={securityReserve} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "Piso Reserva $300k", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />
                  <Line type="monotone" dataKey="Caja en Bancos" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
