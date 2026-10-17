"use client";

import React, { useState } from "react";
import { SimulationResult, MonthlySimulationStep } from "@/types/strategicSimulation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Printer, AlertTriangle, CheckCircle2 } from "lucide-react";
import { exportSimulationToCsv } from "@/lib/services/strategicScenarioService";

interface FinancialStatementsTabProps {
  result: SimulationResult;
}

export function FinancialStatementsTab({ result }: FinancialStatementsTabProps) {
  const [viewMode, setViewMode] = useState<"ANNUAL" | "MONTHLY">("ANNUAL");
  const [selectedYear, setSelectedYear] = useState<number>(1);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { 
      style: "currency", 
      currency: "MXN", 
      maximumFractionDigits: 0 
    }).format(val);
  };

  // Filtrar meses para vista mensual (Año 1: 1-12, Año 2: 13-24, etc.)
  const startIdx = (selectedYear - 1) * 12;
  const filteredMonths = result.months.slice(startIdx, startIdx + 12);

  // Agregados anuales (Años 1 a 5)
  const annualSummary = [1, 2, 3, 4, 5].map(yr => {
    const yrMonths = result.months.slice((yr - 1) * 12, yr * 12);
    const lastMonth = yrMonths[yrMonths.length - 1];

    const netRevenue = yrMonths.reduce((acc, m) => acc + m.revenue.totalNetRevenue, 0);
    const grossProfit = yrMonths.reduce((acc, m) => acc + m.grossProfit, 0);
    const cogs = yrMonths.reduce((acc, m) => acc + m.cogs.totalCogs, 0);
    const opex = yrMonths.reduce((acc, m) => acc + m.opex.totalOpex, 0);
    const ebitda = yrMonths.reduce((acc, m) => acc + m.ebitda, 0);
    const adjustedEbitda = yrMonths.reduce((acc, m) => acc + m.adjustedEbitda, 0);
    const depreciation = yrMonths.reduce((acc, m) => acc + m.depreciation, 0);
    const interest = yrMonths.reduce((acc, m) => acc + m.interestExpense, 0);
    const taxes = yrMonths.reduce((acc, m) => acc + m.incomeTaxes, 0);
    const netProfit = yrMonths.reduce((acc, m) => acc + m.netProfit, 0);
    const operatingCashFlow = yrMonths.reduce((acc, m) => acc + m.cashFlow.operatingCashFlow, 0);
    const capex = yrMonths.reduce((acc, m) => acc + m.cashFlow.capexSpending, 0);
    const chinaAdvances = yrMonths.reduce((acc, m) => acc + m.cashFlow.chinaAdvancePayments, 0);
    const netCashFlow = yrMonths.reduce((acc, m) => acc + m.cashFlow.netCashFlow, 0);

    return {
      year: yr,
      netRevenue,
      cogs,
      grossProfit,
      grossMarginPct: netRevenue > 0 ? Number(((grossProfit / netRevenue) * 100).toFixed(1)) : 0,
      opex,
      ebitda,
      ebitdaMarginPct: netRevenue > 0 ? Number(((ebitda / netRevenue) * 100).toFixed(1)) : 0,
      adjustedEbitda,
      depreciation,
      interest,
      taxes,
      netProfit,
      operatingCashFlow,
      capex,
      chinaAdvances,
      netCashFlow,
      endingCash: lastMonth?.balance.cash || 0,
      accountsReceivable: lastMonth?.balance.accountsReceivableRetail || 0,
      inventory: (lastMonth?.balance.inventoryFinishedGoods || 0) + (lastMonth?.balance.inventoryMaritimeTransit || 0),
      netWorkingCapital: lastMonth?.balance.netWorkingCapital || 0
    };
  });

  return (
    <div className="space-y-6">
      {/* Controles de Vista */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Estados Financieros Proyectados a 60 Meses
            </h2>
            <p className="text-xs text-slate-500">
              Estado de Resultados (P&L), Flujo de Efectivo y Posición de Capital de Trabajo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Selector de Modo */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setViewMode("ANNUAL")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === "ANNUAL" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Consolidado Anual (5 Años)
            </button>
            <button
              onClick={() => setViewMode("MONTHLY")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                viewMode === "MONTHLY" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Detalle Mensual (12 Meses)
            </button>
          </div>

          {/* Selector de Año si está en mensual */}
          {viewMode === "MONTHLY" && (
            <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
              <SelectTrigger className="w-28 h-8 text-xs bg-white border-slate-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Año 1 (M1-M12)</SelectItem>
                <SelectItem value="2">Año 2 (M13-M24)</SelectItem>
                <SelectItem value="3">Año 3 (M25-M36)</SelectItem>
                <SelectItem value="4">Año 4 (M37-M48)</SelectItem>
                <SelectItem value="5">Año 5 (M49-M60)</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportSimulationToCsv(result)}
            className="text-xs border-slate-300"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* 1. ESTADO DE RESULTADOS (P&L) */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-slate-900">
            Estado de Resultados Proyectado {viewMode === "ANNUAL" ? "(Consolidado 5 Años)" : `(Año ${selectedYear})`}
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Ingresos netos por canal, costo de ventas y desglose de EBITDA
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700 min-w-[220px]">Concepto Financiero</TableHead>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableHead key={a.year} className="font-bold text-slate-700 text-right">
                        Año {a.year}
                      </TableHead>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableHead key={m.monthIndex} className="font-bold text-slate-700 text-right min-w-[100px]">
                        {m.monthLabel.split(" ")[0]}
                      </TableHead>
                    ))
                  )}
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {/* Ingresos Netos */}
                <TableRow className="font-bold bg-slate-50/60">
                  <TableCell className="text-indigo-900 text-sm">Ventas Netas Totales</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-indigo-900 font-bold">
                        {formatMoney(a.netRevenue)}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-indigo-900 font-bold">
                        {formatMoney(m.revenue.totalNetRevenue)}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* Costo de Ventas */}
                <TableRow>
                  <TableCell className="text-slate-600 pl-4">(-) Costo de Ventas (COGS)</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-slate-600">
                        {formatMoney(a.cogs)}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-slate-600">
                        {formatMoney(m.cogs.totalCogs)}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* Utilidad Bruta */}
                <TableRow className="font-semibold bg-emerald-50/30">
                  <TableCell className="text-emerald-900">(=) Utilidad Bruta</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-emerald-800 font-bold">
                        {formatMoney(a.grossProfit)} ({a.grossMarginPct}%)
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-emerald-800 font-bold">
                        {formatMoney(m.grossProfit)}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* OPEX */}
                <TableRow>
                  <TableCell className="text-slate-600 pl-4">(-) Gastos Operativos (OPEX)</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-slate-600">
                        {formatMoney(a.opex)}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-slate-600">
                        {formatMoney(m.opex.totalOpex)}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* EBITDA */}
                <TableRow className="font-bold bg-indigo-50/40 border-t-2 border-indigo-200">
                  <TableCell className="text-indigo-950 text-sm">(=) EBITDA Operativo</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-indigo-950 font-extrabold">
                        {formatMoney(a.ebitda)} ({a.ebitdaMarginPct}%)
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-indigo-950 font-extrabold">
                        {formatMoney(m.ebitda)}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* EBITDA Ajustado */}
                <TableRow className="bg-purple-50/20 text-purple-900 font-medium">
                  <TableCell className="pl-4">EBITDA Ajustado (Sustitución Fundadores)</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-purple-900 font-semibold">
                        {formatMoney(a.adjustedEbitda)}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-purple-900 font-semibold">
                        {formatMoney(m.adjustedEbitda)}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* Utilidad Neta */}
                <TableRow className="font-semibold text-slate-800">
                  <TableCell className="pl-4">(=) Utilidad Neta (post-impuestos)</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right font-semibold">
                        {formatMoney(a.netProfit)}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right font-semibold">
                        {formatMoney(m.netProfit)}
                      </TableCell>
                    ))
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 2. ESTADO DE FLUJO DE EFECTIVO */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold text-slate-900">
            Flujo de Efectivo Proyectado (Cash Flow)
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Cobranza real recibida, salidas operativas, desembolsos de CAPEX y saldo de tesorería
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700 min-w-[220px]">Movimiento de Efectivo</TableHead>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableHead key={a.year} className="font-bold text-slate-700 text-right">
                        Año {a.year}
                      </TableHead>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableHead key={m.monthIndex} className="font-bold text-slate-700 text-right min-w-[100px]">
                        {m.monthLabel.split(" ")[0]}
                      </TableHead>
                    ))
                  )}
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {/* Flujo Operativo */}
                <TableRow className="font-semibold">
                  <TableCell className="text-slate-800">Flujo de Operación (Cobros - Pagos OPEX)</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-emerald-700 font-bold">
                        {formatMoney(a.operatingCashFlow)}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-emerald-700 font-bold">
                        {formatMoney(m.cashFlow.operatingCashFlow)}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* CAPEX e Inversiones */}
                <TableRow>
                  <TableCell className="text-slate-600 pl-4">(-) Inversión en Maquinaria y Tiendas (CAPEX)</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-rose-600">
                        {a.capex > 0 ? `-${formatMoney(a.capex)}` : "$0"}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-rose-600">
                        {m.cashFlow.capexSpending > 0 ? `-${formatMoney(m.cashFlow.capexSpending)}` : "$0"}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* Anticipos de Importación China */}
                <TableRow>
                  <TableCell className="text-slate-600 pl-4">(-) Pagos de Inventario Importado (China)</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-slate-600">
                        {a.chinaAdvances > 0 ? `-${formatMoney(a.chinaAdvances)}` : "$0"}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-slate-600">
                        {m.cashFlow.chinaAdvancePayments > 0 ? `-${formatMoney(m.cashFlow.chinaAdvancePayments)}` : "$0"}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* Flujo Neto */}
                <TableRow className="font-bold bg-slate-50">
                  <TableCell className="text-slate-900">(=) Flujo Neto del Periodo</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className={`text-right font-bold ${a.netCashFlow >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {formatMoney(a.netCashFlow)}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className={`text-right font-bold ${m.cashFlow.netCashFlow >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {formatMoney(m.cashFlow.netCashFlow)}
                      </TableCell>
                    ))
                  )}
                </TableRow>

                {/* Saldo Final de Caja */}
                <TableRow className="font-extrabold bg-indigo-50/50 border-t-2 border-indigo-200">
                  <TableCell className="text-indigo-950 text-sm">Saldo de Caja al Cierre</TableCell>
                  {viewMode === "ANNUAL" ? (
                    annualSummary.map(a => (
                      <TableCell key={a.year} className="text-right text-indigo-950 font-extrabold text-sm">
                        {formatMoney(a.endingCash)}
                      </TableCell>
                    ))
                  ) : (
                    filteredMonths.map(m => (
                      <TableCell key={m.monthIndex} className="text-right text-indigo-950 font-extrabold">
                        {formatMoney(m.cashFlow.endingCash)}
                      </TableCell>
                    ))
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
