"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, DollarSign, PlusCircle, Search, Calendar, FileText, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Wallet, Clock, Eye, X } from "lucide-react";
import { ExpensePaymentModal } from "@/components/payments/ExpensePaymentModal";
import Link from "next/link";

export default function GastosManualesPage() {
  const { companyId } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modals State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);

  // Sorting state
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

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
    } else if (option === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setDateFrom(getLocalDateString(thirtyDaysAgo));
      setDateTo(getLocalDateString(now));
    } else if (option === "this_year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setDateFrom(getLocalDateString(startOfYear));
      setDateTo(getLocalDateString(now));
    }
  };

  // Realtime listener for manual expenses
  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "expenses"),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenses(data);
      setLoading(false);
    }, (error) => {
      console.error("Error loading manual expenses:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "date" || field === "amount" ? "desc" : "asc");
    }
  };

  const handleCancelExpense = async (expenseId: string, currentStatus: string) => {
    if (!companyId) return;

    const confirmCancel = window.confirm(
      currentStatus === "paid"
        ? "¿Estás seguro de que deseas cancelar este gasto? Ya tiene egresos registrados."
        : "¿Estás seguro de que deseas cancelar este gasto operativo?"
    );

    if (!confirmCancel) return;

    try {
      await updateDoc(doc(db, "companies", companyId, "expenses", expenseId), {
        status: "cancelado"
      });
      alert("Gasto cancelado exitosamente.");
    } catch (error) {
      console.error("Error canceling expense:", error);
      alert("Hubo un error al cancelar el gasto.");
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

  // Filter logic
  const filteredExpenses = expenses.filter(exp => {
    // 1. Search term (provider, concept or folio)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchProvider = (exp.vendorName || "").toLowerCase().includes(term);
      const matchConcept = (exp.concept || "").toLowerCase().includes(term);
      const matchFolio = (exp.documentNumber || "").toLowerCase().includes(term);
      if (!matchProvider && !matchConcept && !matchFolio) return false;
    }
    // 2. Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "paid" && exp.status !== "paid") return false;
      if (statusFilter === "pending" && exp.status !== "pending") return false;
      if (statusFilter === "cancelado" && exp.status !== "cancelado") return false;
    }
    // 3. Date range filter
    if (dateFrom || dateTo) {
      if (dateFrom && exp.date < dateFrom) return false;
      if (dateTo && exp.date > dateTo) return false;
    }
    return true;
  });

  // Sort logic
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    let aVal = a[sortField] || "";
    let bVal = b[sortField] || "";

    if (sortField === "amount") {
      const aNum = parseFloat(aVal) || 0;
      const bNum = parseFloat(bVal) || 0;
      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    }

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc"
        ? aVal.localeCompare(bVal, "es")
        : bVal.localeCompare(aVal, "es");
    }

    return 0;
  });

  // Financial Metrics
  const totalGastado = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalPagado = filteredExpenses.reduce((sum, e) => sum + (e.paidAmount || 0), 0);
  const totalPendiente = Math.max(0, totalGastado - totalPagado);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 text-indigo-950">
            <DollarSign className="w-8 h-8 text-indigo-600" />
            Gastos Operativos
          </h1>
          <p className="text-muted-foreground mt-1">Registra y administra todos los gastos operativos manuales de la empresa.</p>
        </div>

        <Link href="/compras/gastos/nuevo" target="_blank">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
            <PlusCircle className="w-4 h-4" />
            Registrar Gasto
          </Button>
        </Link>
      </div>

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Gastado</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(totalGastado)}</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Pagado</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(totalPagado)}</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saldo Pendiente</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(totalPendiente)}</p>
          </div>
        </div>
      </div>

      {/* Filters Header Panel */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end justify-between bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-end flex-1 w-full">
          {/* Búsqueda */}
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buscar</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Proveedor o concepto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Estatus */}
          <div className="space-y-1 w-full sm:w-40">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estatus</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="paid">Pagados</option>
              <option value="pending">Pendientes</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>

          {/* Fecha */}
          <div className="space-y-1 w-full sm:w-44">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rango de Fecha</span>
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

      {/* Main Expenses Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-4 py-3 w-24 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("date")}>
                  <div className="flex items-center">Fecha {renderSortIcon("date")}</div>
                </th>
                <th className="px-4 py-3 w-28 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("documentNumber")}>
                  <div className="flex items-center">Folio {renderSortIcon("documentNumber")}</div>
                </th>
                <th className="px-4 py-3 max-w-[150px] cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("vendorName")}>
                  <div className="flex items-center">Proveedor {renderSortIcon("vendorName")}</div>
                </th>
                <th className="px-4 py-3 max-w-[180px] cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("concept")}>
                  <div className="flex items-center">Concepto {renderSortIcon("concept")}</div>
                </th>
                <th className="px-4 py-3 w-32">Sucursal</th>
                <th className="px-4 py-3 w-24">Estatus</th>
                <th className="px-4 py-3 w-28 text-right cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("amount")}>
                  <div className="flex items-center justify-end">Monto {renderSortIcon("amount")}</div>
                </th>
                <th className="px-4 py-3 w-28 text-right">Pagado</th>
                <th className="px-4 py-3 w-28 text-right">Pendiente</th>
                <th className="px-4 py-3 w-24 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No se encontraron gastos operativos registrados.
                  </td>
                </tr>
              ) : (
                sortedExpenses.map((exp) => {
                  const saldo = Math.max(0, exp.amount - (exp.paidAmount || 0));
                  return (
                     <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                       <td className="px-4 py-3 whitespace-nowrap">
                         {exp.date}
                       </td>
                       <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                         {exp.documentNumber || "-"}
                       </td>
                       <td className="px-4 py-3 font-medium text-slate-900 max-w-[150px] truncate" title={exp.vendorName}>
                         {exp.vendorName}
                       </td>
                       <td className="px-4 py-3 text-slate-700 max-w-[180px] truncate" title={exp.concept}>
                         {exp.concept}
                       </td>
                       <td className="px-4 py-3 text-slate-500 font-medium">
                         {exp.locationName}
                       </td>
                       <td className="px-4 py-3">
                         {exp.status === "paid" ? (
                           <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                             Pagado
                           </span>
                         ) : exp.status === "cancelado" ? (
                           <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200">
                             Cancelado
                           </span>
                         ) : (
                           <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                             Pendiente
                           </span>
                         )}
                       </td>
                       <td className="px-4 py-3 text-right font-bold text-slate-900">
                         {formatMoney(exp.amount)}
                       </td>
                       <td className="px-4 py-3 text-right text-emerald-600 font-semibold">
                         {formatMoney(exp.paidAmount || 0)}
                       </td>
                       <td className={`px-4 py-3 text-right font-bold ${saldo > 0 && exp.status !== "cancelado" ? "text-amber-600" : "text-slate-400"}`}>
                         {formatMoney(saldo)}
                       </td>
                       <td className="px-4 py-3 text-center">
                         <div className="flex items-center justify-center gap-2">
                           <Link href={`/gastos/${exp.id}`} target="_blank">
                             <Button 
                               variant="outline" 
                               size="icon"
                               className="h-8 w-8 bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-800 shrink-0"
                               title="Ver Detalle"
                             >
                               <Eye className="w-4 h-4 text-indigo-600" />
                             </Button>
                           </Link>
                           {saldo > 0.01 && exp.status !== "cancelado" && (
                             <Button 
                               variant="outline" 
                               size="icon" 
                               onClick={() => {
                                   setSelectedExpense(exp);
                                   setIsPaymentModalOpen(true);
                               }}
                               className="h-8 w-8 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 shrink-0"
                               title="Registrar Pago"
                             >
                               <DollarSign className="w-4 h-4 font-bold" />
                             </Button>
                           )}
                           {exp.status !== "cancelado" && (
                             <Button 
                               variant="outline" 
                               size="icon" 
                               onClick={() => handleCancelExpense(exp.id, exp.status)}
                               className="h-8 w-8 bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 hover:text-rose-800 shrink-0"
                               title="Cancelar Gasto"
                             >
                               <X className="w-4 h-4 font-bold" />
                             </Button>
                           )}
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

      {/* Register New Expense Page Link */}

      {/* Pay Pending Expense Modal */}
      {selectedExpense && (
        <ExpensePaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedExpense(null);
          }}
          document={selectedExpense}
          documentType="gasto_manual"
          companyId={companyId || ""}
        />
      )}
    </div>
  );
}
