"use client";

import React from "react";
import { Receipt, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FacturacionPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturación (CFDI)</h1>
          <p className="text-muted-foreground">
            Emisión de comprobantes fiscales y facturación de remisiones o tickets.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <FileText className="w-4 h-4" /> Global Diaria
          </Button>
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Receipt className="w-4 h-4" /> Nueva Factura
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed rounded-xl bg-slate-50">
        <Receipt className="w-12 h-12 text-slate-300 mb-4" />
        <h3 className="text-xl font-semibold mb-2">Módulo de Timbrado Fiscal</h3>
        <p className="text-muted-foreground max-w-md">
          Próximamente: Integración con PAC para timbrado de facturas CFDI 4.0 directamente desde tus remisiones o ventas de mostrador.
        </p>
      </div>
    </div>
  );
}
