"use client";

import React, { useState } from "react";
import { CashFlowBoard } from "@/components/features/cash-flow/CashFlowBoard";

export default function CashFlowPage() {
  const [weeks, setWeeks] = useState<number>(4); // Default to 4 weeks
  const [includeOrders, setIncludeOrders] = useState<boolean>(true); // Default to true

  return (
    <div className="space-y-6 p-1">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent dark:from-slate-100 dark:to-slate-300">
            Flujo de Efectivo Proyectado
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Análisis de liquidez proyectada y control de cuentas por pagar a proveedores.
          </p>
        </div>
      </div>

      <CashFlowBoard 
        weeks={weeks} 
        setWeeks={setWeeks} 
        includeOrders={includeOrders} 
        setIncludeOrders={setIncludeOrders} 
      />
    </div>
  );
}
