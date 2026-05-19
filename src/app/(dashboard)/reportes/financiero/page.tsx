"use client";

import React, { useState } from "react";
import { Loader2, DollarSign, Wallet, FileX, Download, Calendar, BarChart3, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  AreaChart, Area, Cell
} from "recharts";

// Mock Data for Phase 1
const agingData = [
  { name: "Al corriente", monto: 120000, qty: 15 },
  { name: "1-30 días", monto: 85000, qty: 8 },
  { name: "31-60 días", monto: 45000, qty: 4 },
  { name: "61-90 días", monto: 15000, qty: 2 },
  { name: "+90 días", monto: 35000, qty: 5 },
];

const cashflowData = [
  { name: "Ene", ingresos: 400000, egresos: 280000 },
  { name: "Feb", ingresos: 300000, egresos: 250000 },
  { name: "Mar", ingresos: 500000, egresos: 350000 },
  { name: "Abr", ingresos: 278000, egresos: 210000 },
  { name: "May", ingresos: 189000, egresos: 120000 },
];

export default function ReporteFinancieroPage() {
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState("ytd"); // ytd, month, quarter

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col space-y-6 pb-10">
      {/* Header & Global Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Salud Financiera</h1>
          <p className="text-muted-foreground">
            Métricas de liquidez, cuentas por cobrar y rentabilidad global.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border rounded-lg p-1 shadow-sm">
            <Button 
              variant={timeRange === 'month' ? 'secondary' : 'ghost'} 
              size="sm" 
              className={`text-xs h-8 ${timeRange === 'month' ? 'bg-indigo-50 text-indigo-700' : ''}`}
              onClick={() => setTimeRange('month')}
            >
              Mes Actual
            </Button>
            <Button 
              variant={timeRange === 'quarter' ? 'secondary' : 'ghost'} 
              size="sm" 
              className={`text-xs h-8 ${timeRange === 'quarter' ? 'bg-indigo-50 text-indigo-700' : ''}`}
              onClick={() => setTimeRange('quarter')}
            >
              Este Trimestre
            </Button>
            <Button 
              variant={timeRange === 'ytd' ? 'secondary' : 'ghost'} 
              size="sm" 
              className={`text-xs h-8 ${timeRange === 'ytd' ? 'bg-indigo-50 text-indigo-700' : ''}`}
              onClick={() => setTimeRange('ytd')}
            >
              Año Actual (YTD)
            </Button>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Exportar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Flujo de Efectivo Neto</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">$454,000.00</h3>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-3">
            (Ingresos Op. - Egresos Op.)
          </p>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Margen Bruto General</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">38.5%</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-emerald-600 font-semibold mt-3">
            Saludable (&gt; 30% objetivo)
          </p>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Cuentas por Cobrar</p>
              <h3 className="text-2xl font-black text-amber-600 mt-1">$300,000.00</h3>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <Wallet className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            34 facturas pendientes de cobro
          </p>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm ring-1 ring-red-100">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-medium text-red-500">Cartera Vencida (+30 días)</p>
              <h3 className="text-2xl font-black text-red-700 mt-1">$95,000.00</h3>
            </div>
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <p className="text-xs font-semibold text-red-600 flex items-center gap-1 mt-3">
            31.6% del total por cobrar
          </p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <FileX className="w-5 h-5 text-indigo-600" />
            Antigüedad de Saldos (Cuentas por Cobrar)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12}} 
                  tickFormatter={(val) => `$${val/1000}k`}
                  dx={-10}
                />
                <RechartsTooltip 
                  formatter={(value: number) => [`$${value.toLocaleString()}`, "Deuda Total"]}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="monto" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {agingData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : index === 1 ? '#f59e0b' : index === 2 ? '#f97316' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-center text-slate-500 mt-2">
            Monto agrupo por el tiempo de atraso desde la fecha de vencimiento de la factura.
          </p>
        </div>

        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-indigo-600" />
            Ingresos vs Egresos (Flujo de Efectivo)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorEgresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12}} 
                  tickFormatter={(val) => `$${val/1000}k`}
                  dx={-10}
                />
                <RechartsTooltip 
                  formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Legend wrapperStyle={{paddingTop: '20px'}} />
                <Area type="monotone" dataKey="ingresos" name="Ingresos (Cobranza)" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIngresos)" />
                <Area type="monotone" dataKey="egresos" name="Egresos (Pagos)" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorEgresos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}
