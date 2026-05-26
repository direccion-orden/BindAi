"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Truck, User, FileText, CheckCircle2, XCircle, Receipt, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface Remission {
  id: string;
  remissionNumber: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  totalAmount: number;
  status: string; // 'activa', 'facturada', 'cancelada'
  createdAt: string;
  createdBy: string;
}

export default function RemisionesPage() {
  const { companyId } = useAuth();
  const [remissions, setRemissions] = useState<Remission[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!companyId) return;

    const unsubQ = onSnapshot(query(collection(db, "companies", companyId, "remisiones"), orderBy("createdAt", "desc")), (snap) => {
      setRemissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Remission)));
      setLoading(false);
    });

    return () => unsubQ();
  }, [companyId]);

  const filteredRemissions = remissions.filter(remission => {
    // 1. Search text
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchesFolio = remission.remissionNumber?.toLowerCase().includes(term);
      const matchesClient = remission.clientName?.toLowerCase().includes(term);
      if (!matchesFolio && !matchesClient) return false;
    }
    // 2. Status filter
    if (statusFilter !== "all" && remission.status !== statusFilter) {
      return false;
    }
    // 3. Date range
    if (dateFrom) {
      const remissionDate = remission.createdAt.substring(0, 10);
      if (remissionDate < dateFrom) return false;
    }
    if (dateTo) {
      const remissionDate = remission.createdAt.substring(0, 10);
      if (remissionDate > dateTo) return false;
    }
    return true;
  });

  const totalFilteredAmount = filteredRemissions.reduce((sum, rem) => sum + (rem.totalAmount || 0), 0);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Remisiones (Entregas)</h1>
          <p className="text-muted-foreground">
            Visualiza y gestiona las remisiones de salida de mercancía.
          </p>
        </div>
        <Link href="/ventas/remisiones/nueva">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
            <Plus className="w-4 h-4" /> Nueva Remisión (Directa)
          </Button>
        </Link>
      </div>

      {/* Modern Filter Panel */}
      <div className="flex flex-col md:flex-row gap-4 items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-end flex-1 w-full">
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Buscar
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Folio o nombre del cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-1 w-full sm:w-40">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Estatus
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="activa">Activa</option>
              <option value="facturada">Facturada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>

          <div className="space-y-1 w-full sm:w-36">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desde</span>
            <Input
              type="date"
              className="h-9"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="space-y-1 w-full sm:w-36">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hasta</span>
            <Input
              type="date"
              className="h-9"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div className="text-right whitespace-nowrap bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2 self-stretch flex flex-col justify-center">
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Monto Total Filtrado</span>
          <span className="text-lg font-black text-indigo-800">${totalFilteredAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">No. Remisión</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Pedido Ref.</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRemissions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No se encontraron remisiones con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredRemissions.map((remission) => (
                  <tr key={remission.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{remission.remissionNumber}</td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        {remission.clientName}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {remission.orderId ? (
                        <Link href={`/ventas/pedidos/${remission.orderId}`} className="hover:underline text-indigo-600 font-medium">
                          {remission.orderNumber}
                        </Link>
                      ) : (
                        <span className="text-slate-400 font-medium">{remission.orderNumber || 'Punto de Venta'}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-700">
                      ${remission.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {new Date(remission.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4">
                      {remission.status === 'activa' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200"><CheckCircle2 className="w-3 h-3" /> Activa</span>}
                      {remission.status === 'facturada' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200"><Receipt className="w-3 h-3" /> Facturada</span>}
                      {remission.status === 'cancelada' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold border border-red-200"><XCircle className="w-3 h-3" /> Cancelada</span>}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <Link href={`/ventas/remisiones/${remission.id}`}>
                          <Button variant="outline" size="sm" className="h-8 gap-2 text-xs">
                            <FileText className="w-4 h-4" /> Ver Detalles
                          </Button>
                        </Link>
                      </div>
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
