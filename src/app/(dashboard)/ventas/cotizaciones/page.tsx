"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, FileText, MoreHorizontal, Calendar, User, DollarSign, Package, Table, LayoutGrid, Search, Copy, Eye, FileDown, Ban, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getNextSequence } from "@/lib/firebase/counters";

interface QuoteItem {
  productId: string;
  productName: string;
  variantTitle?: string;
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  clientName: string;
  totalAmount: number;
  status: string; // 'Nueva', 'Enviada', 'En Negociación', 'Ganada', 'Perdida'
  createdAt: string;
  createdBy: string;
  items?: QuoteItem[];
  imageUrl?: string;
  imagePrompt?: string;
  subtotal?: number;
  tax?: number;
  notes?: string;
  projectId?: string | null;
  projectName?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  clientId?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
}

const CRM_STAGES = [
  { id: "nueva", name: "Nueva / Prospecto", color: "#94a3b8" }, // slate-400
  { id: "enviada", name: "Enviada al Cliente", color: "#3b82f6" }, // blue-500
  { id: "negociacion", name: "En Negociación", color: "#f59e0b" }, // amber-500
  { id: "ganada", name: "Ganada (Crear Pedido)", color: "#10b981" }, // emerald-500
  { id: "perdida", name: "Perdida", color: "#ef4444" } // red-500
];

export default function CotizacionesCRMPage() {
  const { companyId } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedQuoteId, setDraggedQuoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const router = useRouter();

  const handleCopyQuote = async (quote: Quote) => {
    if (!companyId) return;
    const confirm = window.confirm("¿Deseas duplicar esta cotización?");
    if (!confirm) return;
    try {
      const newId = crypto.randomUUID();
      const quoteNumber = await getNextSequence(companyId, 'cotizaciones');
      const newQuote = {
        ...quote,
        id: newId,
        quoteNumber,
        status: 'nueva',
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "companies", companyId, "quotes", newId), newQuote);
      alert(`Cotización duplicada con éxito bajo el folio ${quoteNumber}`);
    } catch (error) {
      console.error("Error duplicating quote:", error);
      alert("Hubo un error al duplicar la cotización.");
    }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!companyId) return;
    const confirm = window.confirm("¿Estás seguro de que deseas eliminar esta cotización?");
    if (!confirm) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "quotes", quoteId));
      alert("Cotización eliminada con éxito");
    } catch (error) {
      console.error("Error deleting quote:", error);
      alert("Hubo un error al eliminar la cotización.");
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

    const unsubQ = onSnapshot(query(collection(db, "companies", companyId, "quotes"), orderBy("createdAt", "desc")), (snap) => {
      setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote)));
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

  const filteredQuotes = quotes.filter(quote => {
    // 1. Search text
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchesFolio = quote.quoteNumber ? String(quote.quoteNumber).toLowerCase().includes(term) : false;
      const matchesClient = quote.clientName ? String(quote.clientName).toLowerCase().includes(term) : false;
      if (!matchesFolio && !matchesClient) return false;
    }
    // 2. Status filter
    if (statusFilter !== "all" && quote.status !== statusFilter) {
      return false;
    }
    // 2.5. Sucursal filter
    if (sucursalFilter !== "all" && quote.locationId !== sucursalFilter) {
      return false;
    }
    // 3. Date range
    if (dateFrom || dateTo) {
      const localDate = (() => {
        const d = new Date(quote.createdAt);
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

  const sortedQuotes = [...filteredQuotes].sort((a, b) => {
    let aVal = a[sortField as keyof Quote] || "";
    let bVal = b[sortField as keyof Quote] || "";

    if (typeof aVal === "string" && typeof bVal === "string") {
      if (sortField === "quoteNumber") {
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

  const totalCotizaciones = filteredQuotes.reduce((sum, q) => sum + (q.totalAmount || 0), 0);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedQuoteId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatusId: string) => {
    e.preventDefault();
    if (!draggedQuoteId || !companyId) return;

    const quote = quotes.find(q => q.id === draggedQuoteId);
    if (!quote || quote.status === targetStatusId) return;

    // Optimistic Update
    setQuotes(prev => prev.map(q => q.id === draggedQuoteId ? { ...q, status: targetStatusId } : q));

    if (targetStatusId === "ganada") {
      // Trigger conversion to Order (Pedido)
      if (window.confirm("¡Felicidades! ¿Deseas generar el Pedido de Venta de inmediato?")) {
        try {
          const orderId = crypto.randomUUID();
          const orderNumber = await getNextSequence(companyId, 'pedidos');
          
          await setDoc(doc(db, "companies", companyId, "pedidos", orderId), {
            id: orderId,
            orderNumber,
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            clientId: quote.clientId || null,
            clientName: quote.clientName,
            items: quote.items || [],
            subtotal: quote.subtotal || 0,
            tax: quote.tax || 0,
            totalAmount: quote.totalAmount,
            projectId: quote.projectId || null,
            projectName: quote.projectName || null,
            locationId: quote.locationId || null,
            locationName: quote.locationName || "",
            warehouseId: quote.warehouseId || null,
            warehouseName: quote.warehouseName || "",
            status: "por_surtir", // 'por_surtir', 'surtido', 'entregado', 'remisionado'
            createdAt: new Date().toISOString(),
            createdBy: quote.createdBy,
          });

          await updateDoc(doc(db, "companies", companyId, "quotes", draggedQuoteId), {
            status: targetStatusId,
            orderId: orderId
          });

          alert(`Pedido ${orderNumber} creado exitosamente.`);
          router.push("/ventas/pedidos");
          return;
        } catch (error) {
          console.error("Error creating order:", error);
          alert("Hubo un error al generar el pedido.");
          return; // Abort if order creation fails
        }
      }
    }

    if (targetStatusId === "perdida") {
      const markAsCanceled = window.confirm("¿Deseas marcar esta cotización como Cancelada?\n\n- [Aceptar]: Cancelar la cotización (se removerá del tablero)\n- [Cancelar]: Dejar activa en la columna de Perdida");
      const finalStatus = markAsCanceled ? "cancelada" : "perdida";
      
      if (markAsCanceled) {
        setQuotes(prev => prev.map(q => q.id === draggedQuoteId ? { ...q, status: "cancelada" } : q));
      }
      
      try {
        await updateDoc(doc(db, "companies", companyId, "quotes", draggedQuoteId), {
          status: finalStatus
        });
        return;
      } catch (e) {
        console.error(e);
        alert("Error al actualizar la cotización.");
        setQuotes(prev => prev.map(q => q.id === draggedQuoteId ? { ...q, status: quote.status } : q));
        return;
      }
    }

    try {
      await updateDoc(doc(db, "companies", companyId, "quotes", draggedQuoteId), {
        status: targetStatusId
      });
    } catch (e) {
      console.error(e);
      alert("Error al actualizar la cotización.");
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const renderQuoteCard = (quote: Quote) => (
    <div 
      key={quote.id}
      draggable
      onDragStart={(e) => handleDragStart(e, quote.id)}
      onClick={() => window.open(`/ventas/cotizaciones/${quote.id}`, "_blank")}
      className="bg-white border rounded-lg p-4 shadow-sm cursor-pointer hover:border-blue-300 transition-colors group relative"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
          {quote.quoteNumber}
        </span>
        <Link href={`/pdf/cotizacion/${quote.id}`} target="_blank" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-50 hover:bg-indigo-100">
            PDF
          </Button>
        </Link>
      </div>
      
      <div className="flex items-start gap-2 mb-3 mt-3">
        <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <p className="font-bold text-sm leading-snug text-slate-900">
          {quote.clientName}
        </p>
      </div>

      <div className="flex justify-between items-end border-t pt-2 mt-2">
        <div className="flex items-center text-xs text-muted-foreground gap-1">
          <Calendar className="w-3 h-3" />
          {new Date(quote.createdAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
        </div>
        <div className="text-right">
          <p className="font-bold text-emerald-700 text-sm">${quote.totalAmount.toLocaleString('es-MX')}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className={viewMode === "table" ? "h-[calc(100vh-8rem)] flex flex-col space-y-6" : "flex flex-col space-y-6"}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 border-b pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Cotizaciones (CRM)</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona el embudo de ventas y da seguimiento a prospectos.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 border rounded-lg p-1 bg-slate-50 shrink-0">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold px-3 shadow-none transition-all"
              onClick={() => setViewMode("table")}
            >
              <Table className="w-4 h-4 text-slate-500" />
              Tabla
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold px-3 shadow-none transition-all"
              onClick={() => setViewMode("kanban")}
            >
              <LayoutGrid className="w-4 h-4 text-slate-500" />
              Tablero Kanban
            </Button>
          </div>
          <Link href="/ventas/cotizaciones/nueva" target="_blank">
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold h-10 px-4 text-xs shadow-md">
              <Plus className="w-4 h-4" /> Nueva Cotización
            </Button>
          </Link>
        </div>
      </div>

      {/* Modern Filter Panel */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end flex-1 w-full">
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
              {CRM_STAGES.map(stage => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
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

        {viewMode === "table" && (
          <div className="text-right whitespace-nowrap bg-blue-50 border border-blue-100 rounded-lg px-4 py-2 self-center flex flex-col justify-center ml-auto">
            <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Total Cotizaciones</span>
            <span className="text-lg font-black text-blue-800">${totalCotizaciones.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>


      {viewMode === "kanban" ? (
        <div className="flex-1 overflow-x-auto pb-4">
          <div className="flex gap-4 pb-4 px-1" style={{ width: 'max-content', minWidth: '100%' }}>
            {CRM_STAGES.map((stage) => {
              const stageQuotes = filteredQuotes.filter(q => q.status === stage.id);
              const totalStageAmount = stageQuotes.reduce((sum, q) => sum + q.totalAmount, 0);

              return (
                <div 
                  key={stage.id} 
                  className={`flex flex-col w-80 shrink-0 border rounded-xl overflow-hidden shadow-sm h-fit ${stage.id === 'ganada' ? 'bg-emerald-50/50 border-emerald-200' : stage.id === 'perdida' ? 'bg-red-50/50 border-red-200' : 'bg-slate-50 border-slate-200'}`}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  <div 
                    className="p-3 border-b bg-white flex flex-col gap-2 sticky top-0"
                    style={{ borderTop: `4px solid ${stage.color}` }}
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">{stage.name}</h3>
                      <div className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {stageQuotes.length}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>Valor del embudo:</span>
                      <span className="font-bold text-slate-700">${totalStageAmount.toLocaleString('es-MX')}</span>
                    </div>
                  </div>

                  <div className="p-3 space-y-3">
                    {stageQuotes.map(renderOrderCard => renderQuoteCard(renderOrderCard))}
                    {stageQuotes.length === 0 && (
                      <div className="h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400 font-medium">
                        Arrastra cotizaciones aquí
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold sticky top-0 z-10">
                <tr>
                  <th 
                    className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    onClick={() => handleSort("quoteNumber")}
                  >
                    <div className="flex items-center">
                      No. Cotización
                      {renderSortIcon("quoteNumber")}
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
                    className="px-6 py-4 text-right cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    onClick={() => handleSort("totalAmount")}
                  >
                    <div className="flex items-center justify-end">
                      Total
                      {renderSortIcon("totalAmount")}
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
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedQuotes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      No se encontraron cotizaciones con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  sortedQuotes.map((quote) => {
                    const stage = CRM_STAGES.find(s => s.id === quote.status);
                    return (
                      <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-indigo-700">{quote.quoteNumber}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(quote.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-400" />
                            {quote.clientName}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {quote.locationName || "N/A"}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-emerald-700">
                          ${quote.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}
                        </td>
                        <td className="px-6 py-4">
                          <span 
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border"
                            style={{ 
                              backgroundColor: `${stage?.color}15`, 
                              color: stage?.color,
                              borderColor: `${stage?.color}35`
                            }}
                          >
                            {stage?.name || quote.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-1">
                            <Link href={`/ventas/cotizaciones/${quote.id}`} target="_blank">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 shrink-0"
                                title="Abrir Detalles"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Link href={`/pdf/cotizacion/${quote.id}`} target="_blank">
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
                              onClick={() => handleCopyQuote(quote)}
                              title="Copiar"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-600 hover:text-rose-800 hover:bg-rose-50 shrink-0"
                              onClick={() => handleDeleteQuote(quote.id)}
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
      )}
    </div>
  );
}
