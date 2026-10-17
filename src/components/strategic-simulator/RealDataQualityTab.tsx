"use client";

import React from "react";
import { StrategicScenario } from "@/types/strategicSimulation";
import { StrategicBaselineData } from "@/lib/financial/strategicDataAdapter";
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Layers, 
  RotateCcw, 
  Table as TableIcon, 
  Building2, 
  Calendar, 
  HelpCircle 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RealDataQualityTabProps {
  scenario: StrategicScenario;
  baselineData: StrategicBaselineData | null;
  onRestoreErpBaseline: () => void;
}

export function RealDataQualityTab({
  scenario,
  baselineData,
  onRestoreErpBaseline
}: RealDataQualityTabProps) {
  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { 
      style: "currency", 
      currency: "MXN", 
      maximumFractionDigits: 0 
    }).format(val);
  };

  const reportedSales = 400000;
  const reportedOpex = 250000;

  const realSales = baselineData?.realSalesAvgMonthly || 0;
  const realOpex = baselineData?.realOpexAvgMonthly || 0;
  const realCostOfSales = baselineData?.realCostOfSalesAvgMonthly || 0;
  const realCash = baselineData?.realCashInBanks || 0;
  const realMargin = baselineData?.realGrossMarginPct || 0;

  return (
    <div className="space-y-6">
      {/* Diagnóstico de Calidad de Datos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Puntuación de Calidad */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-900">
                Puntaje de Calidad de Datos
              </CardTitle>
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
            </div>
            <CardDescription className="text-xs text-slate-500">
              Auditoría de integridad, continuidad histórica y cobertura en Firestore
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-slate-900">
                {baselineData?.dataQualityScore ?? 75}
              </span>
              <span className="text-slate-400 font-semibold text-base">/ 100</span>
              <Badge 
                variant="outline" 
                className={`ml-auto font-semibold ${
                  (baselineData?.dataQualityScore ?? 75) >= 80 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : (baselineData?.dataQualityScore ?? 75) >= 60 
                      ? "bg-amber-50 text-amber-700 border-amber-300"
                      : "bg-rose-50 text-rose-700 border-rose-300"
                }`}
              >
                {(baselineData?.dataQualityScore ?? 75) >= 80 ? "Alta Cobertura" : "Cobertura Moderada"}
              </Badge>
            </div>

            <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
              <div className="flex justify-between">
                <span>Meses analizados:</span>
                <strong className="text-slate-800">{baselineData?.sampleMonthsCount ?? 6} meses</strong>
              </div>
              <div className="flex justify-between">
                <span>Sucursales activas detectadas:</span>
                <strong className="text-slate-800">{baselineData?.detectedLocations.length ?? 1}</strong>
              </div>
              <div className="flex justify-between">
                <span>Fórmulas BOM registradas:</span>
                <strong className="text-slate-800">{baselineData?.detectedFormulasCount ?? 0}</strong>
              </div>
              <div className="flex justify-between">
                <span>Saldo disponible en bancos:</span>
                <strong className="text-slate-800">{formatMoney(realCash)}</strong>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advertencias y Limitaciones */}
        <Card className="border-slate-200 shadow-sm bg-white lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold text-slate-900">
                Observaciones y Fuentes Faltantes
              </CardTitle>
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <CardDescription className="text-xs text-slate-500">
              Variables no encontradas que son tratadas como supuestos explícitos editables
            </CardDescription>
          </CardHeader>
          <CardContent>
            {baselineData?.dataQualityNotes && baselineData.dataQualityNotes.length > 0 ? (
              <div className="space-y-2.5">
                {baselineData.dataQualityNotes.map((note, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Todas las fuentes requeridas del ERP fueron consultadas satisfactoriamente sin anomalías detectadas.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla Comparativa: Referencia Reportada vs Real del ERP */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Contraste: Referencias Iniciales vs Datos Reales del ERP
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Muestra la diferencia entre los valores reportados en el planteamiento y lo observado en el sistema
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onRestoreErpBaseline}
              className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Adoptar Datos Reales en el Escenario
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700">Dimensión Operativa</TableHead>
                  <TableHead className="font-bold text-slate-700">Referencia Inicial Reportada</TableHead>
                  <TableHead className="font-bold text-slate-700">Dato Real Calculado en ERP</TableHead>
                  <TableHead className="font-bold text-slate-700">Varianza</TableHead>
                  <TableHead className="font-bold text-slate-700">Alcance y Fuente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-sm">
                {/* Ventas */}
                <TableRow>
                  <TableCell className="font-semibold text-slate-800">
                    Ventas Mensuales Tienda Actual
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {formatMoney(reportedSales)} mensuales
                  </TableCell>
                  <TableCell className="font-bold text-indigo-700">
                    {realSales > 0 ? formatMoney(realSales) : "Sin histórico suficiente"}
                  </TableCell>
                  <TableCell>
                    {realSales > 0 ? (
                      <span className={realSales >= reportedSales ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                        {((realSales - reportedSales) / reportedSales * 100).toFixed(1)}%
                      </span>
                    ) : "N/A"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    Promedio mensual dedup. en <code className="bg-slate-100 px-1 py-0.5 rounded">remisiones</code> y <code className="bg-slate-100 px-1 py-0.5 rounded">facturas</code>
                  </TableCell>
                </TableRow>

                {/* Gastos Operativos */}
                <TableRow>
                  <TableCell className="font-semibold text-slate-800">
                    Gastos Operativos (OPEX)
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {formatMoney(reportedOpex)} mensuales
                  </TableCell>
                  <TableCell className="font-bold text-indigo-700">
                    {realOpex > 0 ? formatMoney(realOpex) : "Sin histórico estructurado"}
                  </TableCell>
                  <TableCell>
                    {realOpex > 0 ? (
                      <span className={realOpex <= reportedOpex ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                        {((realOpex - reportedOpex) / reportedOpex * 100).toFixed(1)}%
                      </span>
                    ) : "N/A"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    Costos indirectos y nómina en <code className="bg-slate-100 px-1 py-0.5 rounded">expenses</code> excluyendo passthrough de balance
                  </TableCell>
                </TableRow>

                {/* Margen Bruto */}
                <TableRow>
                  <TableCell className="font-semibold text-slate-800">
                    Margen Bruto de Fabricación
                  </TableCell>
                  <TableCell className="text-slate-600">
                    Por calcular (pendiente de validar)
                  </TableCell>
                  <TableCell className="font-bold text-indigo-700">
                    {realMargin > 0 ? `${realMargin}%` : "45.0% (Estimado de gestión)"}
                  </TableCell>
                  <TableCell>
                    <span className="text-slate-500">Línea base</span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    (Ventas Netas - Insumos y Costos Directos) / Ventas Netas
                  </TableCell>
                </TableRow>

                {/* Saldo de Bancos */}
                <TableRow>
                  <TableCell className="font-semibold text-slate-800">
                    Efectivo en Bancos al Corte
                  </TableCell>
                  <TableCell className="text-slate-600">
                    Presupuesto $1,000,000 (A o B)
                  </TableCell>
                  <TableCell className="font-bold text-indigo-700">
                    {formatMoney(realCash)}
                  </TableCell>
                  <TableCell>
                    <span className="text-slate-500">Independiente</span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    Suma de saldos en colección <code className="bg-slate-100 px-1 py-0.5 rounded">bankAccounts</code>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Historial Mensual del Periodo de Referencia */}
      {baselineData?.monthlyHistory && baselineData.monthlyHistory.length > 0 && (
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Detalle Mensual Observado en el ERP (Últimos {baselineData.monthlyHistory.length} Meses)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Fotografía real de los meses previos a la fecha de corte ({scenario.cutoffDate})
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700">Mes Calendario</TableHead>
                    <TableHead className="font-bold text-slate-700 text-right">Ventas Reales</TableHead>
                    <TableHead className="font-bold text-slate-700 text-right">Costo de Ventas</TableHead>
                    <TableHead className="font-bold text-slate-700 text-right">Utilidad Bruta</TableHead>
                    <TableHead className="font-bold text-slate-700 text-right">OPEX Total</TableHead>
                    <TableHead className="font-bold text-slate-700 text-right">EBITDA Real</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-sm">
                  {baselineData.monthlyHistory.map((m, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium text-slate-800">{m.monthKey}</TableCell>
                      <TableCell className="text-right font-semibold text-slate-900">{formatMoney(m.sales)}</TableCell>
                      <TableCell className="text-right text-slate-600">{formatMoney(m.costOfSales)}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-700">{formatMoney(m.grossProfit)}</TableCell>
                      <TableCell className="text-right text-slate-600">{formatMoney(m.opex)}</TableCell>
                      <TableCell className={`text-right font-bold ${m.ebitda >= 0 ? "text-indigo-600" : "text-rose-600"}`}>
                        {formatMoney(m.ebitda)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
