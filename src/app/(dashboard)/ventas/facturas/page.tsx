"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Receipt, FileText, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function FacturasPage() {
  const { companyId } = useAuth();
  const [facturas, setFacturas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sucursalFilter, setSucursalFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locations, setLocations] = useState<any[]>([]);

  const handleDateFilterChange = (option: string) => {
    setDateFilterOption(option);
    
    const getLocalDateString = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    
    if (option === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (option === "today") {
      const todayStr = getLocalDateString(now);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (option === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setDateFrom(yesterdayStr);
      setDateTo(yesterdayStr);
    } else if (option === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(getLocalDateString(startOfMonth));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(getLocalDateString(startOfLastMonth));
      setDateTo(getLocalDateString(endOfLastMonth));
    } else if (option === "this_year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setDateFrom(getLocalDateString(startOfYear));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setDateFrom(getLocalDateString(thirtyDaysAgo));
      setDateTo(getLocalDateString(now));
    }
  };

  useEffect(() => {
    if (!companyId) return;

    const q = query(collection(db, "companies", companyId, "facturas"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setFacturas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      })));
    });

    return () => { unsub(); unsubLoc(); };
  }, [companyId]);

  const filteredFacturas = facturas.filter(inv => {
    // 1. Search text
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchesFolio = inv.invoiceNumber?.toLowerCase().includes(term);
      const matchesClient = inv.clientName?.toLowerCase().includes(term);
      if (!matchesFolio && !matchesClient) return false;
    }
    // 2. Status filter
    if (statusFilter !== "all" && inv.status !== statusFilter) {
      return false;
    }
    // 2.5. Sucursal filter
    if (sucursalFilter !== "all" && (inv as any).locationId !== sucursalFilter) {
      return false;
    }
    // 3. Date range
    if (dateFrom || dateTo) {
      const localDate = (() => {
        const d = new Date(inv.createdAt);
        if (isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })();
      if (dateFrom && localDate < dateFrom) return false;
      if (dateTo && localDate > dateTo) return false;
    }
    return true;
  });

  const totalFilteredAmount = filteredFacturas.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

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
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md">
            <Plus className="w-4 h-4" /> Nueva Factura (Directa)
          </Button>
        </Link>
      </div>

      {/* Modern Filter Panel */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-end flex-1">
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
              <option value="timbrada">Timbrada</option>
              <option value="cancelada">Cancelada</option>
              <option value="por_timbrar">Por Timbrar</option>
            </select>
          </div>

          <div className="space-y-1 w-full sm:w-40">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sucursal
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={sucursalFilter}
              onChange={(e) => setSucursalFilter(e.target.value)}
            >
              <option value="all">Todas</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1 w-full sm:w-44">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Fecha
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={dateFilterOption}
              onChange={(e) => handleDateFilterChange(e.target.value)}
            >
              <option value="all">Cualquier fecha</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="this_month">Este Mes</option>
              <option value="last_month">Mes Anterior</option>
              <option value="last_30_days">Últimos 30 Días</option>
              <option value="this_year">Este Año</option>
              <option value="custom">Rango Personalizado</option>
            </select>
          </div>

          {dateFilterOption === "custom" && (
            <>
              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desde</span>
                <Input
                  type="date"
                  className="h-9 bg-background"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hasta</span>
                <Input
                  type="date"
                  className="h-9 bg-background"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="text-right whitespace-nowrap bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2 self-center flex flex-col justify-center ml-auto">
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Monto Total Filtrado</span>
          <span className="text-lg font-black text-indigo-800">${totalFilteredAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        {filteredFacturas.length === 0 ? (
          <div className="text-center py-20">
            <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No se encontraron facturas</h3>
            <p className="text-slate-500">Intenta cambiar los términos de búsqueda o filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                <tr>
                  <th className="px-6 py-4">Folio</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Sucursal</th>
                  <th className="px-6 py-4">Estatus</th>
                  <th className="px-6 py-4 text-right">Total</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredFacturas.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-bold text-indigo-700">FAC-{inv.invoiceNumber}</td>
                    <td className="px-6 py-4 text-slate-600">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{inv.clientName}</td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {(inv as any).locationName || "N/A"}
                    </td>
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
