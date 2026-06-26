"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, query as firestoreQuery, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Search,
  FileDown,
  Building2,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Receipt,
  FileText,
  Truck,
  Package,
  Calendar,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import Link from "next/link";

interface Client {
  id: string;
  legalName: string;
}

interface Location {
  id: string;
  name: string;
}

interface CuentasCobrarDoc {
  id: string;
  clientId: string;
  type: "pedido" | "remision" | "factura" | "anticipo";
  number: string;
  date: string;
  monto: number;
  pagos: number;
  saldo: number;
  status: string;
  locationId: string;
  locationName: string;
}

interface ClientDebt {
  clientId: string;
  clientName: string;
  totalMonto: number;
  totalPagos: number;
  totalSaldo: number;
  documents: CuentasCobrarDoc[];
}

export default function CuentasCobrarPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);

  // Raw Firestore data
  const [clients, setClients] = useState<Client[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [remisiones, setRemisiones] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [anticipos, setAnticipos] = useState<any[]>([]);

  // UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [sucursalFilter, setSucursalFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedClients, setExpandedClients] = useState<Record<string, boolean>>({});

  // Date utilities
  const extractDate = (val: any): string => {
    if (!val) return "";
    let d: Date;
    if (typeof val === "string") {
      d = new Date(val);
    } else if (val.seconds || val._seconds) {
      const secs = val.seconds || val._seconds;
      d = new Date(secs * 1000);
    } else if (val instanceof Date) {
      d = val;
    } else {
      return "";
    }
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  // Real-time Firestore Listeners
  useEffect(() => {
    if (!companyId) return;

    setLoading(true);

    const unsubClients = onSnapshot(collection(db, "companies", companyId, "clients"), (snap) => {
      setClients(snap.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          legalName: d.LegalName || d.CommercialName || d.ClientName || d.legalName || d.name || d.razonSocial || "Cliente sin nombre"
        };
      }));
    });

    const unsubLocations = onSnapshot(collection(db, "companies", companyId, "locations"), (snap) => {
      setLocations(snap.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name || docSnap.data().Name || "Sucursal sin nombre"
      })));
    });

    const unsubPedidos = onSnapshot(collection(db, "companies", companyId, "pedidos"), (snap) => {
      setPedidos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubRemisiones = onSnapshot(collection(db, "companies", companyId, "remisiones"), (snap) => {
      setRemisiones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubFacturas = onSnapshot(collection(db, "companies", companyId, "facturas"), (snap) => {
      setFacturas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubPayments = onSnapshot(collection(db, "companies", companyId, "payments"), (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubAnticipos = onSnapshot(collection(db, "companies", companyId, "anticipos"), (snap) => {
      setAnticipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubClients();
      unsubLocations();
      unsubPedidos();
      unsubRemisiones();
      unsubFacturas();
      unsubPayments();
      unsubAnticipos();
    };
  }, [companyId]);

  // Consolidate & Filter Documents
  const consolidatedDocs: CuentasCobrarDoc[] = useMemo(() => {
    const list: CuentasCobrarDoc[] = [];

    // 1. Pedidos (Activos)
    pedidos.forEach(p => {
      const status = String(p.status || "").trim().toLowerCase();
      // Omit canceled, delivered, remisioned or completed orders to avoid double counting
      if (status !== "cancelado" && status !== "cancelada" && status !== "surtido" && status !== "remisionado" && status !== "completado") {
        const docId = p.id;
        const activePayments = payments.filter(pm => pm.documentId === docId && pm.documentType === "pedido" && pm.status !== "cancelado");
        const paidAmount = activePayments.reduce((sum, pm) => sum + (parseFloat(pm.amount) || pm.amount || 0), 0);
        const total = parseFloat(p.totalAmount) || p.totalAmount || 0;
        const saldo = Math.max(0, total - paidAmount);

        if (saldo >= 1.00) {
          list.push({
            id: docId,
            clientId: p.clientId || "",
            type: "pedido",
            number: p.orderNumber || p.number || `PED-${docId.substring(0, 6)}`,
            date: extractDate(p.createdAt),
            monto: total,
            pagos: paidAmount,
            saldo: saldo,
            status: p.status || "por_surtir",
            locationId: p.locationId || "",
            locationName: p.locationName || locations.find(l => l.id === p.locationId)?.name || "N/A"
          });
        }
      }
    });

    // 2. Remisiones (Activas)
    remisiones.forEach(r => {
      const status = String(r.status || "").trim().toLowerCase();
      // Omit canceled or already invoiced remisiones
      if (status !== "cancelada" && status !== "cancelado" && status !== "facturada") {
        const docId = r.id;
        const activePayments = payments.filter(pm => pm.documentId === docId && pm.documentType === "remision" && pm.status !== "cancelado");
        const paidAmount = activePayments.reduce((sum, pm) => sum + (parseFloat(pm.amount) || pm.amount || 0), 0);
        const total = parseFloat(r.totalAmount) || r.totalAmount || 0;
        const saldo = Math.max(0, total - paidAmount);

        if (saldo >= 1.00) {
          list.push({
            id: docId,
            clientId: r.clientId || "",
            type: "remision",
            number: r.remissionNumber || r.number || `REM-${docId.substring(0, 6)}`,
            date: extractDate(r.createdAt),
            monto: total,
            pagos: paidAmount,
            saldo: saldo,
            status: r.status || "activo",
            locationId: r.locationId || "",
            locationName: r.locationName || locations.find(l => l.id === r.locationId)?.name || "N/A"
          });
        }
      }
    });

    // 3. Facturas (Activas)
    facturas.forEach(f => {
      const status = String(f.status || "").trim().toLowerCase();
      if (status !== "cancelada" && status !== "cancelado") {
        const docId = f.id;
        const activePayments = payments.filter(pm => pm.documentId === docId && pm.documentType === "factura" && pm.status !== "cancelado");
        const paidAmount = activePayments.reduce((sum, pm) => sum + (parseFloat(pm.amount) || pm.amount || 0), 0);
        const total = parseFloat(f.totalAmount) || f.totalAmount || 0;
        const saldo = Math.max(0, total - paidAmount);

        if (saldo >= 1.00) {
          list.push({
            id: docId,
            clientId: f.clientId || "",
            type: "factura",
            number: f.invoiceNumber ? `FAC-${f.invoiceNumber}` : `FAC-${docId.substring(0, 6)}`,
            date: extractDate(f.createdAt),
            monto: total,
            pagos: paidAmount,
            saldo: saldo,
            status: f.status || "timbrada",
            locationId: f.locationId || "",
            locationName: f.locationName || locations.find(l => l.id === f.locationId)?.name || "N/A"
          });
        }
      }
    });

    // 4. Anticipos (Activos - saldo a favor del cliente)
    anticipos.forEach(a => {
      const status = String(a.status || "").trim().toLowerCase();
      if (status !== "cancelado" && status !== "cancelada") {
        // Calculate remaining credit of the anticipo
        const totalApplied = a.applications ? a.applications.reduce((sum: number, app: any) => sum + (parseFloat(app.amount) || app.amount || 0), 0) : 0;
        const totalAmount = parseFloat(a.amount) || a.amount || 0;
        const remaining = Math.max(0, totalAmount - totalApplied);

        if (remaining >= 1.00) {
          const docId = a.id;
          const numberStr = a.folio ? `ANT-${String(a.folio).padStart(4, "0")}` : `ANT-${docId.substring(0, 5).toUpperCase()}`;
          list.push({
            id: docId,
            clientId: a.clientId || "",
            type: "anticipo",
            number: numberStr,
            date: extractDate(a.receivedAt || a.createdAt),
            monto: 0,
            pagos: remaining, // Show remaining as payments/applied credit
            saldo: -remaining, // Negative saldo represents credit balance
            status: a.status || "recibido",
            locationId: a.locationId || "",
            locationName: a.locationName || locations.find(l => l.id === a.locationId)?.name || "N/A"
          });
        }
      }
    });

    // Apply filters
    return list.filter(doc => {
      // 1. Sucursal Filter
      if (sucursalFilter !== "all" && doc.locationId !== sucursalFilter) {
        return false;
      }

      // 2. Date Filter
      if (dateFrom && doc.date < dateFrom) return false;
      if (dateTo && doc.date > dateTo) return false;

      return true;
    });
  }, [pedidos, remisiones, facturas, anticipos, payments, sucursalFilter, dateFrom, dateTo, locations]);

  // Group by client and sum up totals
  const clientDebts: ClientDebt[] = useMemo(() => {
    const clientsMap: Record<string, CuentasCobrarDoc[]> = {};

    consolidatedDocs.forEach(doc => {
      const cId = doc.clientId;
      if (!cId) return;
      if (!clientsMap[cId]) {
        clientsMap[cId] = [];
      }
      clientsMap[cId].push(doc);
    });

    const list: ClientDebt[] = [];
    Object.entries(clientsMap).forEach(([clientId, docs]) => {
      const client = clients.find(c => c.id === clientId);
      const clientName = client?.legalName || "Cliente sin nombre registrado";

      const totalMonto = docs.reduce((sum, d) => sum + (d.type === "anticipo" ? 0 : d.monto), 0);
      const totalPagos = docs.reduce((sum, d) => sum + (d.type === "anticipo" ? d.pagos : d.pagos), 0);
      const totalSaldo = docs.reduce((sum, d) => sum + d.saldo, 0);

      list.push({
        clientId,
        clientName,
        totalMonto,
        totalPagos,
        totalSaldo,
        documents: docs.sort((a, b) => b.date.localeCompare(a.date))
      });
    });

    // Apply search filter on clientName
    return list
      .filter(item => {
        const matchesClient = item.clientName.toLowerCase().includes(searchTerm.toLowerCase());
        // Only show client if they match search AND have a significant remaining debt/credit (at least $1.00)
        return matchesClient && Math.abs(item.totalSaldo) >= 1.00;
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName, "es"));
  }, [consolidatedDocs, clients, searchTerm]);

  // KPI Calculations
  const kpis = useMemo(() => {
    let totalCuentasCobrar = 0;
    let facturasPendientes = 0;
    let remisionesPedidos = 0;
    let anticiposCreditos = 0;

    consolidatedDocs.forEach(d => {
      totalCuentasCobrar += d.saldo;

      if (d.type === "factura") {
        facturasPendientes += d.saldo;
      } else if (d.type === "remision" || d.type === "pedido") {
        remisionesPedidos += d.saldo;
      } else if (d.type === "anticipo") {
        anticiposCreditos += d.pagos; // Remaining credit balance
      }
    });

    return {
      totalCuentasCobrar,
      facturasPendientes,
      remisionesPedidos,
      anticiposCreditos
    };
  }, [consolidatedDocs]);

  const toggleClient = (id: string) => {
    setExpandedClients(prev => ({
      ...prev,
      [id]: prev[id] === false ? true : false
    }));
  };

  const handleExpandAll = () => {
    const newState: Record<string, boolean> = {};
    clientDebts.forEach(c => {
      newState[c.clientId] = true;
    });
    setExpandedClients(newState);
  };

  const handleCollapseAll = () => {
    const newState: Record<string, boolean> = {};
    clientDebts.forEach(c => {
      newState[c.clientId] = false;
    });
    setExpandedClients(newState);
  };

  const handleDownloadCSV = () => {
    if (clientDebts.length === 0) return;

    try {
      const headers = ["Cliente", "Tipo Doc", "Folio", "Sucursal", "Fecha", "Monto Original", "Cobrado / Crédito", "Saldo Pendiente"];
      const escape = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${str}"`;
      };

      const rows: string[] = [];

      clientDebts.forEach(c => {
        // Summary Row for Client
        rows.push([
          escape(c.clientName),
          escape("RESUMEN CLIENTE"),
          escape("—"),
          escape("—"),
          escape("—"),
          c.totalMonto.toFixed(2),
          c.totalPagos.toFixed(2),
          c.totalSaldo.toFixed(2)
        ].join(","));

        // Document Rows
        c.documents.forEach(d => {
          let typeLabel = "Pedido";
          if (d.type === "remision") typeLabel = "Remisión";
          else if (d.type === "factura") typeLabel = "Factura";
          else if (d.type === "anticipo") typeLabel = "Anticipo";

          rows.push([
            escape(c.clientName),
            escape(typeLabel),
            escape(d.number),
            escape(d.locationName),
            escape(d.date),
            d.monto.toFixed(2),
            d.pagos.toFixed(2),
            d.saldo.toFixed(2)
          ].join(","));
        });
      });

      const csvContent = "\ufeff" + [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `cuentas_por_cobrar_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
      alert("Error al descargar el archivo CSV");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Receipt className="w-8 h-8 text-indigo-600" /> Cuentas por Cobrar
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Revisión general de saldos de clientes agrupados, incluyendo facturas, remisiones, pedidos y anticipos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleExpandAll}
            variant="outline"
            className="text-xs font-semibold border-slate-300 shadow-sm hover:bg-slate-50"
            disabled={clientDebts.length === 0}
          >
            Expandir Todo
          </Button>
          <Button
            onClick={handleCollapseAll}
            variant="outline"
            className="text-xs font-semibold border-slate-300 shadow-sm hover:bg-slate-50"
            disabled={clientDebts.length === 0}
          >
            Colapsar Todo
          </Button>
          <Button
            onClick={handleDownloadCSV}
            variant="outline"
            className="gap-2 font-semibold border-slate-300 shadow-sm hover:bg-slate-50"
            disabled={clientDebts.length === 0}
          >
            <FileDown className="w-4 h-4 text-emerald-600" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total por Cobrar</p>
            <p className="text-2xl font-black text-slate-800">${kpis.totalCuentasCobrar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Facturas Pendientes</p>
            <p className="text-2xl font-black text-slate-800">${kpis.facturasPendientes.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Remisiones y Pedidos</p>
            <p className="text-2xl font-black text-slate-800">${kpis.remisionesPedidos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Anticipos Disponibles</p>
            <p className="text-2xl font-black text-slate-800">${kpis.anticiposCreditos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-stretch md:items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end flex-1">
          {/* Client Search */}
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buscar Cliente</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Nombre del cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Sucursal Filter */}
          <div className="space-y-1 w-full sm:w-48">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sucursal</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={sucursalFilter}
              onChange={(e) => setSucursalFilter(e.target.value)}
            >
              <option value="all">Todas las sucursales</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Date Options Dropdown */}
          <div className="space-y-1 w-full sm:w-44">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fecha del Documento</span>
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

          {/* Custom Date Inputs */}
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

      {/* Main Grouped Table */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Documento / Cliente</th>
                <th className="px-6 py-4">Sucursal</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4 text-right">Monto Original</th>
                <th className="px-6 py-4 text-right">Cobrado / Crédito</th>
                <th className="px-6 py-4 text-right">Saldo Pendiente</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {clientDebts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-500" />
                    <p className="font-semibold text-slate-700">No hay saldos pendientes</p>
                    <p className="text-xs text-muted-foreground">Todos los clientes están al corriente con los filtros seleccionados.</p>
                  </td>
                </tr>
              ) : (
                clientDebts.map((client) => {
                  const isExpanded = expandedClients[client.clientId] !== false;
                  
                  return (
                    <React.Fragment key={client.clientId}>
                      {/* Client Header Row */}
                      <tr
                        onClick={() => toggleClient(client.clientId)}
                        className="bg-slate-50/50 hover:bg-slate-50 cursor-pointer border-y transition-colors"
                      >
                        <td colSpan={3} className="px-6 py-4 font-bold text-slate-800 text-sm">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-indigo-600 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-indigo-600 shrink-0" />
                            )}
                            <span>{client.clientName}</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {client.documents.length} {client.documents.length === 1 ? "documento" : "documentos"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-600 text-xs">
                          ${client.totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-600 text-xs">
                          ${client.totalPagos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`px-6 py-4 text-right font-black text-sm ${client.totalSaldo < -0.01 ? "text-emerald-700" : "text-indigo-800"}`}>
                          ${client.totalSaldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={2} className="px-6 py-4">
                          {client.totalSaldo < -0.01 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">Saldo a favor</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">Pendiente cobro</span>
                          )}
                        </td>
                      </tr>

                      {/* Client Documents desglosados */}
                      {isExpanded &&
                        client.documents.map((doc) => {
                          let typeLabel = "Pedido";
                          let path = `/ventas/pedidos/${doc.id}`;
                          let colorClass = "bg-amber-100 text-amber-800 border-amber-200";
                          let icon = <Package className="w-3.5 h-3.5" />;

                          if (doc.type === "remision") {
                            typeLabel = "Remisión";
                            path = `/ventas/remisiones/${doc.id}`;
                            colorClass = "bg-blue-100 text-blue-800 border-blue-200";
                            icon = <Truck className="w-3.5 h-3.5" />;
                          } else if (doc.type === "factura") {
                            typeLabel = "Factura";
                            path = `/ventas/facturas/${doc.id}`;
                            colorClass = "bg-purple-100 text-purple-800 border-purple-200";
                            icon = <FileText className="w-3.5 h-3.5" />;
                          } else if (doc.type === "anticipo") {
                            typeLabel = "Anticipo";
                            path = `/anticipos`; // redirects to anticipos overview page
                            colorClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
                            icon = <DollarSign className="w-3.5 h-3.5" />;
                          }

                          return (
                            <tr key={doc.id + "-" + doc.type} className="hover:bg-slate-50/30 transition-colors border-b last:border-b-0 text-slate-600 text-xs">
                              {/* Document Description */}
                              <td className="px-10 py-3.5 font-semibold text-slate-700">
                                <div className="flex items-center gap-2">
                                  {icon}
                                  <span>{typeLabel}</span>
                                  <span className="text-[10px] font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border">{doc.number}</span>
                                </div>
                              </td>

                              {/* Sucursal */}
                              <td className="px-6 py-3.5 text-slate-500">
                                {doc.locationName}
                              </td>

                              {/* Fecha */}
                              <td className="px-6 py-3.5 text-slate-500">
                                {new Date(doc.date + "T12:00:00").toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </td>

                              {/* Monto */}
                              <td className="px-6 py-3.5 text-right text-slate-700">
                                {doc.type === "anticipo" ? "—" : `$${doc.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                              </td>

                              {/* Pagos */}
                              <td className="px-6 py-3.5 text-right text-slate-700">
                                {doc.type === "anticipo" ? (
                                  <span className="text-emerald-700 font-medium">${doc.pagos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                ) : (
                                  `$${doc.pagos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                                )}
                              </td>

                              {/* Saldo */}
                              <td className={`px-6 py-3.5 text-right font-bold ${doc.saldo < -0.01 ? "text-emerald-700" : doc.saldo > 0.01 ? "text-slate-900" : "text-slate-400"}`}>
                                ${doc.saldo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </td>

                              {/* Estatus */}
                              <td className="px-6 py-3.5">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${colorClass}`}>
                                  {doc.status}
                                </span>
                              </td>

                              {/* Acciones */}
                              <td className="px-6 py-3.5 text-right">
                                {doc.type !== "anticipo" ? (
                                  <div className="flex justify-end gap-1.5">
                                    <Link href={path} target="_blank">
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 shrink-0" title="Ver Detalles">
                                        <FileText className="w-3.5 h-3.5" />
                                      </Button>
                                    </Link>
                                    <Link href={`/pdf/${doc.type}/${doc.id}`} target="_blank">
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:text-slate-700 hover:bg-slate-100 shrink-0" title="Descargar PDF">
                                        <FileDown className="w-3.5 h-3.5" />
                                      </Button>
                                    </Link>
                                  </div>
                                ) : (
                                  <Link href="/anticipos">
                                    <Button variant="link" className="text-emerald-600 hover:text-emerald-800 text-[10px] p-0 font-bold h-fit">
                                      Ver anticipos
                                    </Button>
                                  </Link>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
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
