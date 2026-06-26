"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Loader2, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Calendar,
  AlertCircle
} from "lucide-react";
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Area, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/context/AuthContext";

interface CashFlowBoardProps {
  weeks: number;
  setWeeks: (w: number) => void;
  includeOrders: boolean;
  setIncludeOrders: (io: boolean) => void;
}

interface CashFlowData {
  success: boolean;
  initialCash: number;
  bankAccounts: {
    id: string;
    name: string;
    balance: number;
    currencyCode: string;
  }[];
  inflows: {
    id: string;
    type: 'invoice' | 'order';
    number: string;
    clientName: string;
    amount: number;
    date: string;
    dueDate: string;
  }[];
  outflows: {
    id: string;
    type: 'purchase' | 'expense_inbox' | 'expense';
    number: string;
    providerName: string;
    amount: number;
    date: string;
    dueDate: string;
  }[];
}

interface ProviderRow {
  providerName: string;
  overdue: number;
  total: number;
  [key: string]: any;
}

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function getSpanishDayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return DAYS_ES[d.getDay()];
}

function getSpanishMonthName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return MONTHS_ES[d.getMonth()];
}

function formatCurrency(val: number): string {
  return val.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function CashFlowBoard({ weeks, setWeeks, includeOrders, setIncludeOrders }: CashFlowBoardProps) {
  const { companyId } = useAuth();
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch cash flow data from our backend API route
  useEffect(() => {
    if (!companyId) return;

    const fetchCashFlow = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/erp/cash-flow?companyId=${companyId}`);
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || "Error al obtener flujo de efectivo.");
        }
        const json = await response.json();
        setData(json);
      } catch (err: any) {
        console.error("Error fetching cash flow data:", err);
        setError(err.message || "Error al conectar con la base de datos.");
      } finally {
        setLoading(false);
      }
    };

    fetchCashFlow();
  }, [companyId, refreshTrigger]);

  // Compute bucketing & periods client-side
  const { columns, today, endLimitDate } = useMemo(() => {
    const todayStr = getTodayString();
    const cols: { label: string; dateStart: string; dateEnd: string; key: string }[] = [];

    if (weeks <= 4) {
      // Days columns
      const numDays = weeks * 7;
      for (let i = 0; i < numDays; i++) {
        const dateStr = addDays(todayStr, i);
        const dayName = getSpanishDayName(dateStr);
        const dateParts = dateStr.split('-');
        const label = `${dayName} ${dateParts[2]}/${dateParts[1]}`;
        cols.push({
          label,
          dateStart: dateStr,
          dateEnd: dateStr,
          key: dateStr
        });
      }
    } else {
      // Full weeks columns
      for (let w = 0; w < weeks; w++) {
        const start = addDays(todayStr, w * 7);
        const end = addDays(todayStr, (w + 1) * 7 - 1);
        const startParts = start.split('-');
        const endParts = end.split('-');
        const label = `Sem ${w + 1}: ${startParts[2]}/${startParts[1]} - ${endParts[2]}/${endParts[1]}`;
        cols.push({
          label,
          dateStart: start,
          dateEnd: end,
          key: `week_${w}`
        });
      }
    }

    const lastCol = cols[cols.length - 1];
    return {
      columns: cols,
      today: todayStr,
      endLimitDate: lastCol ? lastCol.dateEnd : todayStr
    };
  }, [weeks]);

  // Recalculate KPIs, chart series, and provider pivot table instantly when filters change
  const processed = useMemo(() => {
    if (!data || !columns.length) {
      return {
        kpis: { initialCash: 0, inflows: 0, outflows: 0, net: 0, finalCash: 0 },
        chartData: [],
        providerRows: [] as ProviderRow[],
        columnTotals: {} as Record<string, number>
      };
    }

    let overdueInflow = 0;
    let overdueOutflow = 0;

    const periodInflows: Record<string, number> = {};
    const periodOutflows: Record<string, number> = {};
    columns.forEach(c => {
      periodInflows[c.key] = 0;
      periodOutflows[c.key] = 0;
    });

    const providerPayables: Record<string, Record<string, number>> = {};

    // 1. Process Outflows (Cuentas por Pagar)
    data.outflows.forEach((item: any) => {
      const due = item.dueDate;
      const provider = item.providerName || "Proveedor General";
      const amt = item.amount || 0;

      if (!providerPayables[provider]) {
        providerPayables[provider] = { overdue: 0, total: 0 };
        columns.forEach(c => {
          providerPayables[provider][c.key] = 0;
        });
      }

      if (due < today) {
        overdueOutflow += amt;
        providerPayables[provider].overdue += amt;
        providerPayables[provider].total += amt;
      } else if (due <= endLimitDate) {
        const col = columns.find(c => due >= c.dateStart && due <= c.dateEnd);
        if (col) {
          periodOutflows[col.key] += amt;
          providerPayables[provider][col.key] += amt;
          providerPayables[provider].total += amt;
        }
      }
    });

    // 2. Process Inflows (Cuentas por Cobrar)
    const activeInflows = data.inflows.filter((item: any) => {
      if (item.type === 'order') return includeOrders;
      return true;
    });

    activeInflows.forEach((item: any) => {
      const due = item.dueDate;
      const amt = item.amount || 0;

      if (due < today) {
        overdueInflow += amt;
      } else if (due <= endLimitDate) {
        const col = columns.find(c => due >= c.dateStart && due <= c.dateEnd);
        if (col) {
          periodInflows[col.key] += amt;
        }
      }
    });

    // 3. Compute Chart Data
    let currentBalance = data.initialCash;
    const chartData: any[] = [];

    // Add point for today
    chartData.push({
      label: "Hoy",
      inflows: 0,
      outflows: 0,
      net: 0,
      balance: currentBalance
    });

    // Apply overdue items immediately in the first period
    currentBalance = currentBalance + overdueInflow - overdueOutflow;

    columns.forEach((c, idx) => {
      const inf = periodInflows[c.key] || 0;
      const outf = periodOutflows[c.key] || 0;
      
      const displayInflows = idx === 0 ? inf + overdueInflow : inf;
      const displayOutflows = idx === 0 ? outf + overdueOutflow : outf;
      const net = displayInflows - displayOutflows;
      currentBalance += net;

      // Clean day name for display in chart XAxis
      let label = c.label;
      if (weeks <= 4) {
        const parts = c.label.split(' ');
        label = parts.length > 1 ? parts[1] : c.label;
      } else {
        label = `S${idx + 1}`;
      }

      chartData.push({
        label,
        inflows: Math.round(displayInflows),
        outflows: Math.round(displayOutflows),
        net: Math.round(net),
        balance: Math.round(currentBalance)
      });
    });

    // 4. Compute Totals & Sorted Rows
    const providerRows = Object.entries(providerPayables).map(([name, rowData]) => {
      return {
        providerName: name,
        ...rowData
      } as ProviderRow;
    }).sort((a, b) => b.total - a.total);

    const colTotals: Record<string, number> = { overdue: 0, total: 0 };
    columns.forEach(c => {
      colTotals[c.key] = 0;
    });

    providerRows.forEach((row: ProviderRow) => {
      colTotals.overdue += row.overdue;
      colTotals.total += row.total;
      columns.forEach(c => {
        colTotals[c.key] += row[c.key] || 0;
      });
    });

    // Compute active horizon total inflows/outflows
    const totalInflows = activeInflows.reduce((sum, item) => {
      return item.dueDate <= endLimitDate || item.dueDate < today ? sum + item.amount : sum;
    }, 0);

    const totalOutflows = data.outflows.reduce((sum, item) => {
      return item.dueDate <= endLimitDate || item.dueDate < today ? sum + item.amount : sum;
    }, 0);

    const kpis = {
      initialCash: data.initialCash,
      inflows: totalInflows,
      outflows: totalOutflows,
      net: totalInflows - totalOutflows,
      finalCash: data.initialCash + totalInflows - totalOutflows
    };

    return {
      kpis,
      chartData,
      providerRows,
      columnTotals: colTotals
    };
  }, [data, columns, includeOrders, today, endLimitDate, weeks]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-muted-foreground text-sm">Cargando información contable de Firestore...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-100 bg-red-50/50">
        <CardContent className="flex items-center space-x-3 p-6 text-red-800">
          <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-red-900">Error al cargar datos</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <Button 
              size="sm" 
              variant="outline" 
              className="mt-3 border-red-200 text-red-900 hover:bg-red-100"
              onClick={() => setRefreshTrigger(prev => prev + 1)}
            >
              Intentar de nuevo
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const startMonthName = getSpanishMonthName(today);
  const endMonthName = getSpanishMonthName(endLimitDate);
  const startDay = today.split('-')[2];
  const endDay = endLimitDate.split('-')[2];

  return (
    <div className="space-y-6">
      {/* Controls Card */}
      <Card className="bg-card border shadow-sm border-slate-200/60 overflow-hidden">
        <div className="bg-slate-50/60 dark:bg-slate-900/40 border-b px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Horizonte de Proyección: {startDay} de {startMonthName} al {endDay} de {endMonthName}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2 border rounded-lg bg-card p-1 shadow-sm">
              {[1, 2, 4, 8, 12].map((w) => (
                <Button
                  key={w}
                  size="sm"
                  variant={weeks === w ? "default" : "ghost"}
                  className={`px-3 py-1.5 h-8 text-xs font-semibold ${
                    weeks === w ? "shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => setWeeks(w)}
                >
                  {w} {w === 1 ? "Semana" : "Semanas"}
                </Button>
              ))}
            </div>

            <div className="flex items-center space-x-3 px-3 py-1.5 border rounded-lg bg-card shadow-sm h-8">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Incluir Pedidos</span>
              <Switch
                checked={includeOrders}
                onCheckedChange={setIncludeOrders}
                className="scale-90"
              />
            </div>

            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8 rounded-lg shadow-sm border-slate-200"
              onClick={() => setRefreshTrigger(prev => prev + 1)}
              title="Sincronizar Datos"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
            </Button>
          </div>
        </div>

        {/* Weeks Horizon slider control */}
        <div className="px-6 py-3 flex items-center justify-between border-b bg-slate-50/20 md:hidden">
          <span className="text-xs font-semibold text-slate-500">Ajuste Fino Semanas:</span>
          <input 
            type="range" 
            min="1" 
            max="12" 
            value={weeks} 
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="w-32 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
            {weeks} Sem
          </span>
        </div>
      </Card>

      {/* KPI Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Available Cash Card */}
        <Card className="bg-card border border-slate-200/50 hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/40 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Disponible Inicial</p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {formatCurrency(processed.kpis.initialCash)}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Projected Inflows Card */}
        <Card className="bg-card border border-slate-200/50 hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/20 border border-teal-100/40 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Cobros Proyectados</p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {formatCurrency(processed.kpis.inflows)}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Projected Outflows Card */}
        <Card className="bg-card border border-slate-200/50 hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100/40 flex items-center justify-center shrink-0">
              <ArrowDownRight className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Pagos Proyectados</p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {formatCurrency(processed.kpis.outflows)}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Net Flow Card */}
        <Card className="bg-card border border-slate-200/50 hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5 flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/40 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Flujo Neto</p>
              <h3 className={`text-lg font-bold mt-0.5 ${
                processed.kpis.net >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}>
                {processed.kpis.net >= 0 ? "+" : ""}
                {formatCurrency(processed.kpis.net)}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Final Cash Card */}
        <Card className="bg-card border border-slate-200/50 hover:shadow-md transition-shadow duration-200">
          <CardContent className="p-5 flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${
              processed.kpis.finalCash >= 0 
                ? "bg-emerald-50 border-emerald-100/40" 
                : "bg-amber-50 border-amber-100/40"
            }`}>
              {processed.kpis.finalCash >= 0 ? (
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              ) : (
                <TrendingDown className="w-5 h-5 text-amber-600" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Saldo Final Proyectado</p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {formatCurrency(processed.kpis.finalCash)}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart Section */}
      <Card className="bg-card border shadow-sm border-slate-200/50 overflow-hidden">
        <CardHeader className="bg-slate-50/30 dark:bg-slate-900/20 border-b px-6 py-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100">
            Tendencia del Flujo de Efectivo Proyectado
          </CardTitle>
          <div className="flex items-center space-x-4 text-xs font-semibold text-slate-500">
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />
              <span>Saldo Proyectado</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
              <span>Entradas</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full" />
              <span>Salidas</span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {isMounted ? (
            <div className="w-full h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={processed.chartData}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    stroke="#94a3b8" 
                    fontSize={11}
                    tickLine={false} 
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    yAxisId="left" 
                    stroke="#94a3b8" 
                    fontSize={11}
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                    dx={-10}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right"
                    stroke="#94a3b8" 
                    fontSize={11}
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                    dx={10}
                  />
                  <Tooltip 
                    formatter={(value: any, name: any) => [
                      formatCurrency(Number(value)), 
                      name === "balance" ? "Saldo Proyectado" : (name === "inflows" ? "Entradas" : "Salidas")
                    ]}
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.95)",
                      borderRadius: "12px",
                      borderColor: "#e2e8f0",
                      fontSize: "12px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
                    }}
                  />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="balance" 
                    stroke="#6366f1" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorBalance)" 
                    name="balance"
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="inflows" 
                    fill="#10b981" 
                    radius={[4, 4, 0, 0]} 
                    maxBarSize={30}
                    name="inflows"
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="outflows" 
                    fill="#f43f5e" 
                    radius={[4, 4, 0, 0]} 
                    maxBarSize={30}
                    name="outflows"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[320px] bg-slate-50 animate-pulse rounded-lg flex items-center justify-center">
              <span className="text-xs text-slate-400 font-semibold">Generando gráfica...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supplier Table Section */}
      <Card className="bg-card border shadow-sm border-slate-200/50 overflow-hidden">
        <CardHeader className="bg-slate-50/30 dark:bg-slate-900/20 border-b px-6 py-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-100">
              Cronograma de Pagos a Proveedores (Cuentas por Pagar)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Muestra el vencimiento y los pagos programados distribuidos en el horizonte de tiempo.
            </p>
          </div>
        </CardHeader>
        
        {processed.providerRows.length > 0 ? (
          <div className="overflow-x-auto select-none">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b text-slate-600 dark:bg-slate-900/30">
                  {/* Sticky Provider Column */}
                  <th className="sticky left-0 bg-slate-50/95 dark:bg-slate-900/90 z-20 px-4 py-3 font-semibold text-slate-700 min-w-[200px] border-r">
                    Proveedor
                  </th>
                  <th className="px-4 py-3 font-semibold text-rose-600 text-right min-w-[100px] border-r">
                    Vencido
                  </th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-semibold text-slate-700 text-right min-w-[100px] border-r">
                      {weeks <= 4 ? c.label.split(' ')[1] : c.label.split(':')[0]}
                      <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                        {weeks <= 4 ? c.label.split(' ')[0] : c.label.split(':')[1]?.trim()}
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3 font-semibold text-slate-700 text-right min-w-[110px]">
                    Total Pendiente
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-600">
                {processed.providerRows.map((row: ProviderRow) => (
                  <tr 
                    key={row.providerName} 
                    className="hover:bg-slate-50/50 transition-colors duration-150 group"
                  >
                    <td className="sticky left-0 bg-card group-hover:bg-slate-50/50 border-r px-4 py-2.5 font-medium text-slate-900 font-semibold z-10">
                      {row.providerName}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium border-r ${
                      row.overdue > 0 ? "text-rose-600 font-semibold bg-rose-50/20" : "text-slate-400/80"
                    }`}>
                      {row.overdue > 0 ? formatCurrency(row.overdue) : "-"}
                    </td>
                    {columns.map((c) => {
                      const val = row[c.key] || 0;
                      return (
                        <td key={c.key} className={`px-4 py-2.5 text-right border-r ${
                          val > 0 ? "text-slate-800 font-semibold" : "text-slate-400/70"
                        }`}>
                          {val > 0 ? formatCurrency(val) : "-"}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900 bg-slate-50/20">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                ))}

                {/* Column Totals Row */}
                <tr className="bg-slate-50/60 dark:bg-slate-900/10 border-t-2 font-bold text-slate-900 text-right">
                  <td className="sticky left-0 bg-slate-50/95 dark:bg-slate-900/90 border-r px-4 py-3 text-left text-slate-700 z-10">
                    TOTAL GENERAL
                  </td>
                  <td className={`px-4 py-3 text-right border-r ${
                    processed.columnTotals.overdue > 0 ? "text-rose-600 bg-rose-50/30" : "text-slate-400"
                  }`}>
                    {processed.columnTotals.overdue > 0 ? formatCurrency(processed.columnTotals.overdue) : "-"}
                  </td>
                  {columns.map((c) => {
                    const val = processed.columnTotals[c.key] || 0;
                    return (
                      <td key={c.key} className={`px-4 py-3 text-right border-r ${
                        val > 0 ? "text-slate-800" : "text-slate-400"
                      }`}>
                        {val > 0 ? formatCurrency(val) : "-"}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right bg-slate-100/50 font-extrabold text-slate-900">
                    {formatCurrency(processed.columnTotals.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground text-sm space-y-2">
            <AlertCircle className="w-8 h-8 text-slate-400" />
            <p className="font-semibold text-slate-600">No hay cuentas por pagar activa</p>
            <p className="text-xs">No se encontraron facturas o gastos pendientes en Firestore para el periodo seleccionado.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
