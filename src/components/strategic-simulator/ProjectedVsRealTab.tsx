"use client";

import React from "react";
import { StrategicScenario, SimulationResult } from "@/types/strategicSimulation";
import { StrategicBaselineData } from "@/lib/financial/strategicDataAdapter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Calendar, LineChart, TrendingUp } from "lucide-react";

interface ProjectedVsRealTabProps {
  scenario: StrategicScenario;
  result: SimulationResult;
  baselineData: StrategicBaselineData | null;
}

export function ProjectedVsRealTab({
  scenario,
  result,
  baselineData
}: ProjectedVsRealTabProps) {
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { 
      style: "currency", 
      currency: "MXN", 
      maximumFractionDigits: 0 
    }).format(val);
  };

  // Comparar los primeros meses de proyección contra la línea base real observada
  const comparisonRows = result.months.slice(0, 12).map((m, idx) => {
    const historicalMonth = baselineData?.monthlyHistory[idx % (baselineData?.monthlyHistory.length || 1)];
    const realSales = historicalMonth ? historicalMonth.sales : 0;
    const projectedSales = m.revenue.totalNetRevenue;
    const salesVariancePct = realSales > 0 ? Number((((realSales - projectedSales) / projectedSales) * 100).toFixed(1)) : 0;

    const realEbitda = historicalMonth ? historicalMonth.ebitda : 0;
    const projectedEbitda = m.ebitda;
    const ebitdaVariancePct = projectedEbitda !== 0 ? Number((((realEbitda - projectedEbitda) / Math.abs(projectedEbitda)) * 100).toFixed(1)) : 0;

    return {
      monthLabel: m.monthLabel,
      monthIndex: m.monthIndex,
      projectedSales,
      realSales,
      salesVariancePct,
      projectedEbitda,
      realEbitda,
      ebitdaVariancePct,
      hasRealData: realSales > 0
    };
  });

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <LineChart className="w-5 h-5 text-indigo-600" />
                Seguimiento: Proyectado vs Realizado
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Auditoría continua del cumplimiento del plan contrastando los meses transcurridos en el ERP contra las metas del escenario
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Corte de proyección: <strong>{scenario.cutoffDate}</strong></span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-lg text-xs text-indigo-900 leading-relaxed">
            <strong>Monitoreo de Desviaciones:</strong> Esta vista permite validar la precisión de los supuestos una vez que la empresa comienza a ejecutar las aperturas, importaciones o negociaciones con cadenas. Si una palanca difiere en más de ±15% de lo proyectado, se recomienda duplicar el escenario y ajustar la curva de maduración.
          </div>

          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700">Periodo</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">Venta Proyectada</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">Venta Real ERP</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">Varianza Ventas</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">EBITDA Proyectado</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">EBITDA Real ERP</TableHead>
                  <TableHead className="font-bold text-slate-700 text-right">Varianza EBITDA</TableHead>
                  <TableHead className="font-bold text-slate-700 text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {comparisonRows.map((row) => (
                  <TableRow key={row.monthIndex}>
                    <TableCell className="font-semibold text-slate-800">{row.monthLabel}</TableCell>
                    <TableCell className="text-right font-medium text-slate-900">{formatMoney(row.projectedSales)}</TableCell>
                    <TableCell className="text-right font-bold text-indigo-700">
                      {row.hasRealData ? formatMoney(row.realSales) : "Pendiente"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.hasRealData ? (
                        <span className={`font-semibold ${row.salesVariancePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {row.salesVariancePct >= 0 ? `+${row.salesVariancePct}%` : `${row.salesVariancePct}%`}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-900">{formatMoney(row.projectedEbitda)}</TableCell>
                    <TableCell className="text-right font-bold text-indigo-700">
                      {row.hasRealData ? formatMoney(row.realEbitda) : "Pendiente"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.hasRealData ? (
                        <span className={`font-semibold ${row.ebitdaVariancePct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {row.ebitdaVariancePct >= 0 ? `+${row.ebitdaVariancePct}%` : `${row.ebitdaVariancePct}%`}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.hasRealData ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                          Auditado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300">
                          Proyectado
                        </Badge>
                      )}
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
