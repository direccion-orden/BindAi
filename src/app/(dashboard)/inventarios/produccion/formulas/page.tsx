"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, ArrowLeft, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ProductionFormula {
  id: string;
  name: string;
  finishedProduct: string;
  materialsCount: number;
  createdAt: string;
}

export default function FormulasPage() {
  const { companyId } = useAuth();
  const [formulas, setFormulas] = useState<ProductionFormula[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "production_formulas"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name,
          finishedProduct: d.finishedProduct,
          materialsCount: (d.materials || []).length,
          createdAt: d.createdAt
        };
      });
      setFormulas(data as ProductionFormula[]);
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
        <div className="flex items-center gap-4">
          <Link href="/inventarios/produccion">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fórmulas de Producción</h1>
            <p className="text-muted-foreground">
              Define y gestiona tus listas de materiales (BOM) para ensambles recurrentes.
            </p>
          </div>
        </div>
        <Link href="/inventarios/produccion/formulas/nueva" target="_blank">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Nueva Fórmula
          </Button>
        </Link>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
                <th className="px-6 py-4">Nombre de la Fórmula</th>
                <th className="px-6 py-4">Producto Resultante</th>
                <th className="px-6 py-4 text-center">Componentes Requeridos</th>
                <th className="px-6 py-4">Fecha de Creación</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {formulas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                        <ClipboardList className="w-6 h-6 text-indigo-300" />
                      </div>
                      <p className="font-medium text-gray-900">Aún no hay fórmulas creadas.</p>
                      <p className="text-sm max-w-sm mx-auto">Crea una receta estandarizada para fabricar rápidamente tus productos.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                formulas.map((formula) => (
                  <tr key={formula.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-indigo-600">
                      {formula.name}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {formula.finishedProduct}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                        {formula.materialsCount} items
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {new Date(formula.createdAt).toLocaleDateString('es-MX')}
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
