"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Receipt, FileText, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function FacturasPage() {
  const { companyId } = useAuth();
  const [facturas, setFacturas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const q = query(collection(db, "companies", companyId, "facturas"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setFacturas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [companyId]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturas y CFDI</h1>
          <p className="text-muted-foreground">
            Consulta facturas timbradas y pre-facturas pendientes de timbrado.
          </p>
        </div>
        <Link href="/ventas/facturas/nueva">
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4" /> Nueva Factura (Directa)
          </Button>
        </Link>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        {facturas.length === 0 ? (
          <div className="text-center py-20">
            <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No hay facturas registradas</h3>
            <p className="text-slate-500">Genera tu primera factura desde un Pedido o Remisión.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                <tr>
                  <th className="px-6 py-4">Folio</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Estatus</th>
                  <th className="px-6 py-4 text-right">Total</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {facturas.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-bold text-indigo-700">FAC-{inv.invoiceNumber}</td>
                    <td className="px-6 py-4 text-slate-600">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{inv.clientName}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        inv.status === 'timbrada' ? 'bg-emerald-100 text-emerald-700' : 
                        inv.status === 'cancelada' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {inv.status === 'timbrada' ? 'Timbrada' : 
                         inv.status === 'cancelada' ? 'Cancelada' :
                         'Por Timbrar'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold">${inv.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/ventas/facturas/${inv.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50">
                          Ver Detalles
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
