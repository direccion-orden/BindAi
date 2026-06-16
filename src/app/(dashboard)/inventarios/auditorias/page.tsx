"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, Calculator, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface InventoryCount {
  id: string;
  name: string;
  warehouseName: string;
  itemsCount: number;
  totalDiscrepancy: number; // Value of the difference (can be negative)
  createdAt: string;
  createdBy: string;
}

export default function AuditoriasPage() {
  const { companyId } = useAuth();
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "inventory_counts"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d
        } as InventoryCount;
      });
      setCounts(data);
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
          <h1 className="text-3xl font-bold tracking-tight">Auditorías de Inventario</h1>
          <p className="text-muted-foreground">
            Conteos cíclicos e inventarios físicos generales para conciliar existencias.
          </p>
        </div>
        <Link href="/inventarios/auditorias/nueva" target="_blank">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Nueva Auditoría
          </Button>
        </Link>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Referencia</th>
                <th className="px-6 py-4">Almacén</th>
                <th className="px-6 py-4 text-center">SKUs Auditados</th>
                <th className="px-6 py-4 text-right">Diferencia Neta (Valor)</th>
                <th className="px-6 py-4 text-right">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {counts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <ClipboardCheck className="w-6 h-6" />
                      </div>
                      <p className="font-medium text-foreground">Aún no has realizado conteos físicos.</p>
                      <p className="text-sm">Realiza auditorías periódicas para cuadrar tu inventario del sistema con la realidad.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                counts.map((count) => (
                  <tr key={count.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {new Date(count.createdAt).toLocaleString('es-MX')}
                    </td>
                    <td className="px-6 py-4 font-medium text-indigo-600">
                      {count.name}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {count.warehouseName}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold">{count.itemsCount}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {count.totalDiscrepancy === 0 ? (
                        <span className="text-muted-foreground">Cuadrado exacto</span>
                      ) : count.totalDiscrepancy > 0 ? (
                        <span className="text-emerald-600 font-medium">+${count.totalDiscrepancy.toLocaleString('es-MX', {minimumFractionDigits: 2})} (Sobrante)</span>
                      ) : (
                        <span className="text-destructive font-medium">-${Math.abs(count.totalDiscrepancy).toLocaleString('es-MX', {minimumFractionDigits: 2})} (Faltante)</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {count.createdBy}
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
