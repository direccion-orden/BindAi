"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Truck, User, FileText, CheckCircle2, XCircle, Receipt, Plus, Search, DollarSign, Copy, Eye, FileDown, Ban, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { getNextSequence } from "@/lib/firebase/counters";
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
  locationName?: string;
  paymentMethod?: string;
  payments?: any[];
}

export default function RemisionesPage() {
  const { companyId } = useAuth();
  const [remissions, setRemissions] = useState<Remission[]>([]);
  const [loading, setLoading] = useState(true);

  const handleCopyRemission = (remission: any) => {
    if (!remission?.id) return;
    window.open(`/ventas/remisiones/nueva?copyFrom=${remission.id}`, "_blank");
  };

  const handleCancelRemission = async (remissionId: string) => {
    if (!companyId) return;
    const confirm = window.confirm("¿Estás seguro de que deseas cancelar esta remisión?");
    if (!confirm) return;
    try {
      await updateDoc(doc(db, "companies", companyId, "remisiones", remissionId), {
        status: 'cancelada'
      });
      alert("Remisión cancelada con éxito");
    } catch (error) {
      console.error("Error cancelling remission:", error);
      alert("Hubo un error al cancelar la remisión.");
    }
  };

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sucursalFilter, setSucursalFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");

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

    const unsubQ = onSnapshot(query(collection(db, "companies", companyId, "remisiones"), orderBy("createdAt", "desc")), (snap) => {
      setRemissions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Remission)));
      setLoading(false);
    });

    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      })));
    });

    return () => { unsubQ(); unsubLoc(); };
  }, [companyId]);

  const filteredRemissions = remissions.filter(remission => {
    // 1. Search text
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchesFolio = remission.remissionNumber ? String(remission.remissionNumber).toLowerCase().includes(term) : false;
      const matchesClient = remission.clientName ? String(remission.clientName).toLowerCase().includes(term) : false;
      if (!matchesFolio && !matchesClient) return false;
    }
    // 2. Status filter
    if (statusFilter !== "all" && remission.status !== statusFilter) {
      return false;
    }
    // 2.5. Sucursal filter
    if (sucursalFilter !== "all" && (remission as any).locationId !== sucursalFilter) {
      return false;
    }
    // 3. Date range
    if (dateFrom || dateTo) {
      const localDate = (() => {
        const d = new Date(remission.createdAt);
        if (isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })();
      if (dateFrom && localDate < dateFrom) return false;
      if (dateTo && localDate > dateTo) return false;
    }
    // 4. Payment Method filter
    if (paymentMethodFilter !== "all") {
      const pm = remission.paymentMethod || (remission as any).payments?.[0]?.method || (remission.status === 'pagada' ? 'Desconocido' : 'Pendiente');
      if (pm !== paymentMethodFilter) return false;
    }
    return true;
  });

  // Sorting state
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "createdAt" || field === "totalAmount" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 ml-1.5 inline shrink-0" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    );
  };

  const sortedRemissions = [...filteredRemissions].sort((a, b) => {
    if (sortField === "paymentType") {
      const getPM = (r: Remission) => r.paymentMethod || r.payments?.[0]?.method || (r.status === 'pagada' ? 'Desconocido' : 'Pendiente');
      const pmA = getPM(a);
      const pmB = getPM(b);
      return sortDirection === "asc" ? pmA.localeCompare(pmB, "es") : pmB.localeCompare(pmA, "es");
    }

    let aVal = a[sortField as keyof Remission] || "";
    let bVal = b[sortField as keyof Remission] || "";

    if (typeof aVal === "string" && typeof bVal === "string") {
      if (sortField === "remissionNumber") {
        const aNum = parseInt(aVal.replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(bVal.replace(/\D/g, ""), 10) || 0;
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
      return sortDirection === "asc" 
        ? aVal.localeCompare(bVal, "es") 
        : bVal.localeCompare(aVal, "es");
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    return 0;
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
        <Link href="/ventas/remisiones/nueva" target="_blank">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
            <Plus className="w-4 h-4" /> Nueva Remisión (Directa)
          </Button>
        </Link>
      </div>

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monto Total Filtrado</p>
            <p className="text-xl font-bold text-slate-800">${totalFilteredAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Modern Filter Panel */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-stretch md:items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end flex-1">
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
              <option value="pagada">Pagada</option>
              <option value="facturada">Facturada</option>
              <option value="cancelada">Cancelada</option>
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

          <div className="space-y-1 w-full sm:w-40">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tipo de Pago
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
            >
              <option value="all">Cualquier método</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta de Débito">Tarjeta de Débito</option>
              <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Tarjeta de Regalo">Tarjeta de Regalo</option>
              <option value="Monedero Electrónico">Monedero Electrónico</option>
              <option value="Pendiente">Pendiente</option>
              <option value="Desconocido">Desconocido</option>
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
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("remissionNumber")}
                >
                  <div className="flex items-center">
                    No. Remisión
                    {renderSortIcon("remissionNumber")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("clientName")}
                >
                  <div className="flex items-center">
                    Cliente
                    {renderSortIcon("clientName")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("locationName")}
                >
                  <div className="flex items-center">
                    Sucursal
                    {renderSortIcon("locationName")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("totalAmount")}
                >
                  <div className="flex items-center">
                    Total
                    {renderSortIcon("totalAmount")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("createdAt")}
                >
                  <div className="flex items-center">
                    Fecha
                    {renderSortIcon("createdAt")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center">
                    Estatus
                    {renderSortIcon("status")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("paymentType")}
                >
                  <div className="flex items-center">
                    Tipo de Pago
                    {renderSortIcon("paymentType")}
                  </div>
                </th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedRemissions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                    <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No se encontraron remisiones con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                sortedRemissions.map((remission) => {
                  const paymentType = remission.paymentMethod || remission.payments?.[0]?.method || (remission.status === 'pagada' ? 'Desconocido' : 'Pendiente');
                  return (
                    <tr key={remission.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900">{remission.remissionNumber}</td>
                      <td className="px-6 py-4 font-medium text-slate-700">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          {remission.clientName}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {remission.locationName || "N/A"}
                      </td>
                      <td className="px-6 py-4 font-bold text-emerald-700">
                        ${remission.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {new Date(remission.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        {remission.status === 'activa' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200"><CheckCircle2 className="w-3 h-3" /> Activa</span>}
                        {remission.status === 'pagada' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200"><DollarSign className="w-3 h-3" /> Pagada</span>}
                        {remission.status === 'facturada' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200"><Receipt className="w-3 h-3" /> Facturada</span>}
                        {remission.status === 'cancelada' && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 text-xs font-bold border border-red-200"><XCircle className="w-3 h-3" /> Cancelada</span>}
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-600">
                        {paymentType}
                      </td>
                      <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        <Link href={`/ventas/remisiones/${remission.id}`} target="_blank">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 shrink-0"
                            title="Abrir Detalles"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Link href={`/pdf/remision/${remission.id}`} target="_blank">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:text-slate-800 hover:bg-slate-50 shrink-0"
                            title="Descargar PDF"
                          >
                            <FileDown className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 shrink-0"
                          onClick={() => handleCopyRemission(remission)}
                          title="Copiar"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-600 hover:text-rose-800 hover:bg-rose-50 shrink-0"
                          onClick={() => handleCancelRemission(remission.id)}
                          disabled={remission.status === 'cancelada'}
                          title="Cancelar"
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
