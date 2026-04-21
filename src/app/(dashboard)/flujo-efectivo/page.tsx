"use client";

import React, { useState } from "react";
import { CashFlowBoard } from "@/components/features/cash-flow/CashFlowBoard";

export default function CashFlowPage() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const months = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Flujo de Efectivo</h1>
          <p className="text-muted-foreground">
            Control y proyección de la liquidez diaria basada en Bind ERP.
          </p>
        </div>
        
        <div className="flex bg-card border rounded-md p-1 shadow-sm px-2 gap-2">
          <select
            className="bg-transparent border-none text-sm outline-none font-medium text-foreground py-1 focus:ring-0"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <div className="w-px h-5 bg-border self-center" />
          <select
            className="bg-transparent border-none text-sm outline-none font-medium text-foreground py-1 focus:ring-0"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <CashFlowBoard month={selectedMonth} year={selectedYear} />
    </div>
  );
}
