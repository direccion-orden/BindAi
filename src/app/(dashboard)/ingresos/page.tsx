"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, DollarSign, ArrowUpRight, Search, FileText, PlusCircle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { NewIncomeModal } from "@/components/payments/NewIncomeModal";

export default function IngresosPage() {
  const { companyId } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isNewIncomeModalOpen, setIsNewIncomeModalOpen] = useState(false);

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

    const q = query(
      collection(db, "companies", companyId, "payments"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPayments(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching payments:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const filteredPayments = payments.filter((p) => {
    // 1. Search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchClient = p.clientName?.toLowerCase().includes(term);
      const matchDoc = p.documentNumber?.toLowerCase().includes(term);
      const matchRef = p.reference?.toLowerCase().includes(term);
      const matchMethod = p.method?.toLowerCase().includes(term);
      if (!matchClient && !matchDoc && !matchRef && !matchMethod) return false;
    }
    // 2. Status filter
    if (statusFilter !== "all") {
      const isCancelled = p.status === "cancelado";
      if (statusFilter === "activo" && isCancelled) return false;
      if (statusFilter === "cancelado" && !isCancelled) return false;
    }
    // 3. Date filter
    if (dateFrom || dateTo) {
      const localDate = (() => {
        if (p.date) return p.date;
        const d = p.createdAt ? new Date(p.createdAt) : null;
        if (!d || isNaN(d.getTime())) return "";
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

  const totalIngresos = filteredPayments
    .filter(p => p.status !== "cancelado")
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  const getDocumentLink = (type: string, id: string) => {
    switch (type) {
      case "pedido": return `/ventas/pedidos/${id}`;
      case "remision": return `/ventas/remisiones/${id}`;
      case "factura": return `/ventas/facturas/${id}`;
      case "pos": return null; // No detail page for POS sales yet
      default: return null;
    }
  };

  const getDocumentLabel = (type: string, number: string) => {
    const num = number || "N/A";
    switch (type) {
      case "pedido": return `PED-${num}`;
      case "remision": return `REM-${num}`;
      case "factura": return `FAC-${num}`;
      case "pos": return `POS-${num}`;
      default: return `DOC-${num}`;
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-emerald-600" />
            Ingresos Recibidos
          </h1>
          <p className="text-muted-foreground mt-1">Historial de pagos registrados contra documentos comerciales y Punto de Venta.</p>
        </div>
        
        <Button onClick={() => setIsNewIncomeModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <PlusCircle className="w-4 h-4" />
          Registrar Ingreso
        </Button>
      </div>

      {/* Modern Filter Panel */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-end flex-1 w-full">
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Buscar
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Cliente, folio, referencia..."
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
              <option value="activo">Activos</option>
              <option value="cancelado">Cancelados</option>
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

        <div className="text-right whitespace-nowrap bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2 self-center flex flex-col justify-center ml-auto">
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Total Ingresos Filtrados</span>
          <span className="text-lg font-black text-emerald-800">${totalIngresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Fecha</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Cliente</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Documento</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Método</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Referencia</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Estatus</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No se encontraron pagos.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => {
                  const docLink = getDocumentLink(payment.documentType, payment.documentId);
                  
                  return (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {payment.date}
                        {payment.createdAt && <div className="text-[10px] text-muted-foreground">{new Date(payment.createdAt).toLocaleTimeString()}</div>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {payment.clientName}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold capitalize border">
                            {payment.documentType}
                          </span>
                          {docLink ? (
                            <Link href={docLink} target="_blank" className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center font-medium">
                              {getDocumentLabel(payment.documentType, payment.documentNumber)} <ArrowUpRight className="w-3 h-3 ml-0.5" />
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-700">
                              {getDocumentLabel(payment.documentType, payment.documentNumber)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize font-medium text-slate-700">
                        {payment.method}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {payment.reference || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {payment.status === "cancelado" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold border border-red-200">
                            Cancelado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${payment.status === "cancelado" ? "line-through text-slate-400" : "text-emerald-600"}`}>
                        ${(parseFloat(payment.amount) || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewIncomeModal 
        isOpen={isNewIncomeModalOpen} 
        onClose={() => setIsNewIncomeModalOpen(false)} 
        companyId={companyId || ""} 
      />
    </div>
  );
}
