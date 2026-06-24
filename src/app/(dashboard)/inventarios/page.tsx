"use client";

import { useAuth } from "@/context/AuthContext";
import { Boxes, ArrowRightLeft, Target, TrendingUp, Warehouse } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function InventariosDashboardPage() {
  const { companyId } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inventarios</h1>
        <p className="text-muted-foreground">
          Gestión integral de la cadena de suministro.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link href="/inventarios/existencias" className="block">
          <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-primary transition-colors cursor-pointer group h-full">
            <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
              <Warehouse className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold">Existencias</h3>
            <p className="text-xs text-muted-foreground">Stock actual por sucursal</p>
          </div>
        </Link>

        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-primary transition-colors cursor-pointer group">
          <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
            <ArrowRightLeft className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold">Transferencias</h3>
          <p className="text-xs text-muted-foreground">Movimientos entre almacenes</p>
        </div>
        
        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-primary transition-colors cursor-pointer group">
          <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
            <Target className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold">Conteos Físicos</h3>
          <p className="text-xs text-muted-foreground">Cíclicos y Generales</p>
        </div>

        <Link href="/inventarios/etiquetas" target="_blank" className="block">
          <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-primary transition-colors cursor-pointer group h-full">
            <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
              <Boxes className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold">Imprimir Etiquetas</h3>
            <p className="text-xs text-muted-foreground">Códigos de barras masivos</p>
          </div>
        </Link>

        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center text-center space-y-2 hover:border-primary transition-colors cursor-pointer group">
          <div className="p-3 bg-primary/10 rounded-full group-hover:bg-primary/20 transition-colors">
            <TrendingUp className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold">Buffer Management</h3>
          <p className="text-xs text-muted-foreground">DDMRP Analytics (Próximamente)</p>
        </div>
      </div>
      
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-4">Últimos Movimientos (Ledger)</h3>
        <p className="text-sm text-muted-foreground">El historial de transacciones se mostrará aquí.</p>
      </div>
    </div>
  );
}
