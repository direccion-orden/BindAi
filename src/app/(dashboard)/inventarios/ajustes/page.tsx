"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, ArrowLeft, ArrowDown, ArrowUp, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface InventoryAdjustment {
  id: string;
  warehouseId: string;
  warehouseName: string;
  reason: string;
  type: 'IN' | 'OUT';
  itemsCount: number;
  createdAt: string;
  createdBy: string;
}

export default function AjustesPage() {
  const { companyId } = useAuth();
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "inventory_adjustments"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d
        } as InventoryAdjustment;
      });
      setAdjustments(data);
      setLoading(false);
    });

    return () => unsub();
  }, [companyId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ajustes de Inventario</h1>
          <p className="text-muted-foreground">
            Registra mermas, caducidades, robos o ajustes positivos por conteo físico.
          </p>
        </div>
        <Link href="/inventarios/ajustes/nuevo">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Nuevo Ajuste
          </Button>
        </Link>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Almacén</th>
                <th className="px-6 py-4">Motivo</th>
                <th className="px-6 py-4">Productos</th>
                <th className="px-6 py-4 text-right">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <p className="font-medium text-foreground">No hay ajustes registrados.</p>
                      <p className="text-sm">Mantén tu inventario al día registrando las mermas o diferencias detectadas.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => (
                  <tr key={adj.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {new Date(adj.createdAt).toLocaleString('es-MX')}
                    </td>
                    <td className="px-6 py-4">
                      {adj.type === 'OUT' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium">
                          <ArrowDown className="w-3.5 h-3.5" /> Salida (Merma)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                          <ArrowUp className="w-3.5 h-3.5" /> Entrada (Ajuste)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {adj.warehouseName}
                    </td>
                    <td className="px-6 py-4">
                      {adj.reason}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium">{adj.itemsCount}</span> items
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {adj.createdBy}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
