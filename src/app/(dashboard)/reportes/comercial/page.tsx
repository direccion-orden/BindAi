"use client";

import React, { useState } from "react";
import { Loader2, TrendingUp, Users, Target, Clock, Download, Calendar, ShoppingCart, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, ComposedChart
} from "recharts";

// Mock Data for Phase 1
const salesData = [
  { name: "Ene", ventas: 400000, meta: 350000 },
  { name: "Feb", ventas: 300000, meta: 350000 },
  { name: "Mar", ventas: 500000, meta: 400000 },
  { name: "Abr", ventas: 278000, meta: 400000 },
  { name: "May", ventas: 189000, meta: 450000 }, // Current month partial
];

const topClients = [
  { name: "Industrias Alfa", value: 450000 },
  { name: "Comercializadora Beta", value: 380000 },
  { name: "Grupo Gamma", value: 290000 },
  { name: "Servicios Delta", value: 150000 },
  { name: "Constructora Épsilon", value: 80000 },
];

const productCategories = [
  { name: "Electrónica", value: 400 },
  { name: "Ferretería", value: 300 },
  { name: "Herramientas", value: 300 },
  { name: "Otros", value: 200 },
];
const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#94a3b8"];

export default function ReporteComercialPage() {
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
          <h1 className="text-3xl font-bold tracking-tight">Desempeño Comercial</h1>
          <p className="text-muted-foreground">
            Métricas de ventas, conversión y comportamiento de clientes.
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
              <p className="text-sm font-medium text-muted-foreground">Venta Total Facturada</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">$1,667,000.00</h3>
            </div>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1 mt-3">
            <TrendingUp className="w-3 h-3" /> +12.5% vs. período anterior
          </p>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tasa de Conversión (Win Rate)</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">42.8%</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            De Cotización a Pedido Cerrado
          </p>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Backlog (Por Surtir)</p>
              <h3 className="text-2xl font-black text-amber-600 mt-1">$245,000.00</h3>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            18 pedidos pendientes de entrega
          </p>
        </div>

        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Ticket Promedio</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">$12,450.00</h3>
            </div>
            <div className="p-2 bg-indigo-50 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          <p className="text-xs font-semibold text-red-500 flex items-center gap-1 mt-3">
            <TrendingUp className="w-3 h-3 rotate-180" /> -2.1% vs. período anterior
          </p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-6 shadow-sm lg:col-span-2">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Ventas Facturadas vs Meta (2024)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={salesData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis 
                  yAxisId="left" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12}} 
                  tickFormatter={(val) => `$${val/1000}k`}
                  dx={-10}
                />
                <RechartsTooltip 
                  formatter={(value: any) => [`$${value?.toLocaleString() || ""}`, undefined]}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Legend wrapperStyle={{paddingTop: '20px'}} />
                <Bar yAxisId="left" dataKey="ventas" name="Ventas Reales" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={50} />
                <Line yAxisId="left" type="monotone" dataKey="meta" name="Meta de Venta" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Venta por Categoría (ABC)
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productCategories}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {productCategories.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  formatter={(value: any) => [`${value} unids.`, "Volumen"]}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            {productCategories.map((cat, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}}></div>
                <span className="text-slate-600 truncate">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Top 5 Clientes (Principio de Pareto)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={topClients}
                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(val) => `$${val/1000}k`} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 500}} width={120} />
                <RechartsTooltip 
                  formatter={(value: any) => [`$${value?.toLocaleString() || ""}`, "Monto"]}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20}>
                  {topClients.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border">
            <Calendar className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="font-bold text-slate-800 text-lg">Próximamente: Desempeño por Vendedor</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
            Esta sección se activará automáticamente cuando comiences a registrar múltiples usuarios con el rol de Vendedor.
          </p>
        </div>
      </div>

    </div>
  );
}
