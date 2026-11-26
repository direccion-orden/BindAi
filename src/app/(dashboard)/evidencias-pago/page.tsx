"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera,
  Plus,
  PlusCircle,
  Search,
  Calendar,
  Building2,
  User,
  Filter,
  Eye,
  Link2,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  X,
  ExternalLink,
  DollarSign
} from "lucide-react";
import { collection, query, orderBy, onSnapshot, getDocs, doc, deleteDoc } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { formatMoney, getLocalDateString } from "@/lib/utils";
import { PaymentEvidenceUploadModal } from "@/components/evidencias-pago/PaymentEvidenceUploadModal";
import { PaymentEvidenceViewModal } from "@/components/evidencias-pago/PaymentEvidenceViewModal";
import { PaymentEvidenceEditModal } from "@/components/evidencias-pago/PaymentEvidenceEditModal";
import { PaymentEvidenceLinkModal } from "@/components/evidencias-pago/PaymentEvidenceLinkModal";

function EvidenciasPagoContent() {
  const { companyId } = useAuth();

  const [evidences, setEvidences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [clients, setClients] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClientFilter, setSelectedClientFilter] = useState("all");
  const [selectedLocationFilter, setSelectedLocationFilter] = useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const searchParams = useSearchParams();

  // Abrir modal si la URL contiene ?nueva=true o ?nuevo=true
  useEffect(() => {
    const isNew = searchParams?.get("nueva") || searchParams?.get("nuevo");
    if (isNew === "true" || isNew === "1") {
      setIsUploadOpen(true);
    }
  }, [searchParams]);

  const handleCloseUploadModal = () => {
    setIsUploadOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("nueva") || url.searchParams.has("nuevo")) {
        url.searchParams.delete("nueva");
        url.searchParams.delete("nuevo");
        const cleanUrl = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '');
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  };

  // Modales
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedEvidenceForView, setSelectedEvidenceForView] = useState<any | null>(null);
  const [selectedEvidenceForEdit, setSelectedEvidenceForEdit] = useState<any | null>(null);
  const [selectedEvidenceForLink, setSelectedEvidenceForLink] = useState<any | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Escuchar evidencias en tiempo real
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);

    const q = query(
      collection(db, "companies", companyId, "payment_evidences"),
      orderBy("date", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEvidences(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error al cargar evidencias:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [companyId]);

  // Cargar clientes y sucursales
  useEffect(() => {
    if (!companyId) return;

    const unsubLocs = onSnapshot(
      collection(db, "companies", companyId, "locations"),
      (snap) => {
        setLocations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    const unsubClients = onSnapshot(
      collection(db, "companies", companyId, "clients"),
      (snap) => {
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );

    return () => {
      unsubLocs();
      unsubClients();
    };
  }, [companyId]);

  // Manejo de rangos de fecha rápidos
  const handleDateFilterChange = (option: string) => {
    setDateFilterOption(option);
    const now = new Date();

    if (option === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (option === "today") {
      const todayStr = getLocalDateString(now);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (option === "last_7") {
      const past = new Date();
      past.setDate(now.getDate() - 7);
      setDateFrom(getLocalDateString(past));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_30") {
      const past = new Date();
      past.setDate(now.getDate() - 30);
      setDateFrom(getLocalDateString(past));
      setDateTo(getLocalDateString(now));
    } else if (option === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(getLocalDateString(start));
      setDateTo(getLocalDateString(now));
    }
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedClientFilter("all");
    setSelectedLocationFilter("all");
    setSelectedStatusFilter("all");
    setDateFilterOption("all");
    setDateFrom("");
    setDateTo("");
  };

  // Filtrado de evidencias
  const filteredEvidences = useMemo(() => {
    return evidences.filter((ev) => {
      // Búsqueda de texto
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const client = (ev.clientName || "").toLowerCase();
        const loc = (ev.locationName || "").toLowerCase();
        const notes = (ev.notes || "").toLowerCase();
        const user = (ev.createdBy || "").toLowerCase();
        if (!client.includes(q) && !loc.includes(q) && !notes.includes(q) && !user.includes(q)) {
          return false;
        }
      }

      // Cliente
      if (selectedClientFilter !== "all" && ev.clientId !== selectedClientFilter) {
        return false;
      }

      // Sucursal
      if (selectedLocationFilter !== "all" && ev.locationId !== selectedLocationFilter) {
        return false;
      }

      // Estado
      if (selectedStatusFilter !== "all" && ev.status !== selectedStatusFilter) {
        return false;
      }

      // Fecha
      if (dateFrom && ev.date && ev.date < dateFrom) return false;
      if (dateTo && ev.date && ev.date > dateTo) return false;

      return true;
    });
  }, [evidences, searchTerm, selectedClientFilter, selectedLocationFilter, selectedStatusFilter, dateFrom, dateTo]);

  // Contadores
  const stats = useMemo(() => {
    const total = evidences.length;
    const available = evidences.filter((e) => e.status === "available").length;
    const linked = evidences.filter((e) => e.status === "linked").length;
    return { total, available, linked };
  }, [evidences]);

  // Eliminar evidencia
  const handleDeleteEvidence = async (ev: any) => {
    if (!companyId) return;
    if (ev.status === "linked") {
      alert("No se puede eliminar una evidencia que ya está relacionada con un anticipo. Desvincula el anticipo primero.");
      return;
    }
    if (!confirm(`¿Estás seguro de eliminar el comprobante de ${ev.clientName}?`)) {
      return;
    }

    try {
      if (ev.imageUrl) {
        try {
          const imgRef = storageRef(storage, ev.imageUrl);
          await deleteObject(imgRef);
        } catch (e) {
          console.warn("No se pudo borrar el archivo de storage:", e);
        }
      }
      await deleteDoc(doc(db, "companies", companyId, "payment_evidences", ev.id));
    } catch (err) {
      console.error("Error al borrar evidencia:", err);
      alert("Ocurrió un error al eliminar la evidencia.");
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-sm">
              <Camera className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Evidencias de Pago
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Fotos de comprobantes de pago subidas por los usuarios. No son anticipos automáticos; se usan para respaldar anticipos o cobros.
          </p>
        </div>

        {/* Botón Nueva Evidencia */}
        <Button
          onClick={() => setIsUploadOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md gap-2 h-10 px-4 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva Evidencia
        </Button>
      </div>

      {/* BANNER DE ÉXITO AL CREAR ANTICIPO */}
      {successBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1 rounded-lg"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] sm:text-xs uppercase font-bold text-slate-400 tracking-wider">
              Total Evidencias
            </span>
            <p className="text-xl sm:text-2xl font-black text-slate-900">{stats.total}</p>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-slate-100 text-slate-700">
            <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-emerald-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] sm:text-xs uppercase font-bold text-emerald-600 tracking-wider">
              Disponibles
            </span>
            <p className="text-xl sm:text-2xl font-black text-emerald-700">{stats.available}</p>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] sm:text-xs uppercase font-bold text-indigo-600 tracking-wider">
              Relacionadas
            </span>
            <p className="text-xl sm:text-2xl font-black text-indigo-700">{stats.linked}</p>
          </div>
          <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              placeholder="Buscar cliente, sucursal o nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl"
            />
          </div>

          {/* Filtro Cliente */}
          <select
            value={selectedClientFilter}
            onChange={(e) => setSelectedClientFilter(e.target.value)}
            className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.legalName || c.LegalName || "Cliente"}
              </option>
            ))}
          </select>

          {/* Filtro Sucursal */}
          <select
            value={selectedLocationFilter}
            onChange={(e) => setSelectedLocationFilter(e.target.value)}
            className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todas las sucursales</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name || loc.Name || "Sucursal"}
              </option>
            ))}
          </select>

          {/* Filtro Estado */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="flex h-9 w-full rounded-xl border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos los estados</option>
            <option value="available">Disponibles (Sin relacionar)</option>
            <option value="linked">Relacionados a anticipo</option>
          </select>
        </div>

        {/* Filtros de Fecha */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Fecha:</span>
          {["all", "today", "last_7", "last_30", "this_month"].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => handleDateFilterChange(opt)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                dateFilterOption === opt
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {opt === "all" && "Cualquiera"}
              {opt === "today" && "Hoy"}
              {opt === "last_7" && "Últimos 7 días"}
              {opt === "last_30" && "Últimos 30 días"}
              {opt === "this_month" && "Este Mes"}
            </button>
          ))}

          <div className="flex items-center gap-1.5 ml-auto">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setDateFilterOption("custom");
              }}
              className="h-8 text-xs rounded-lg w-32"
            />
            <span className="text-slate-400">-</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setDateFilterOption("custom");
              }}
              className="h-8 text-xs rounded-lg w-32"
            />

            {(searchTerm || selectedClientFilter !== "all" || selectedLocationFilter !== "all" || selectedStatusFilter !== "all" || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL: TABLA (DESKTOP) Y TARJETAS (MÓVIL) */}
      {loading ? (
        <div className="p-12 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          <span className="text-xs">Cargando evidencias...</span>
        </div>
      ) : filteredEvidences.length === 0 ? (
        <div className="p-12 bg-white rounded-xl border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">No hay evidencias de pago registradas</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Haz clic en &quot;Nueva Evidencia&quot; para subir tu primera foto de comprobante.
            </p>
          </div>
          <Button
            onClick={() => setIsUploadOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow gap-2 mt-2"
          >
            <Plus className="w-4 h-4" />
            Subir Evidencia
          </Button>
        </div>
      ) : (
        <>
          {/* VISTA ESCRITORIO (TABLA) */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-3">Foto</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Sucursal</th>
                  <th className="py-3 px-3 text-right">Monto</th>
                  <th className="py-3 px-3 text-center">Estatus</th>
                  <th className="py-3 px-4">Referencia / Creado por</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvidences.map((ev) => {
                  const isLinked = ev.status === "linked";
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Fecha */}
                      <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        {ev.date || "Sin fecha"}
                      </td>

                      {/* Miniatura Foto */}
                      <td className="py-2.5 px-3">
                        <div
                          onClick={() => setSelectedEvidenceForView(ev)}
                          className="w-12 h-12 rounded-lg bg-slate-950 overflow-hidden cursor-pointer relative group-hover:ring-2 group-hover:ring-indigo-500 transition shadow-sm shrink-0 flex items-center justify-center"
                          title="Hacer clic para ver foto"
                        >
                          <img
                            src={ev.imageUrl}
                            alt="Miniatura"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block truncate max-w-xs" title={ev.clientName}>
                          {ev.clientName}
                        </span>
                      </td>

                      {/* Sucursal */}
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {ev.locationName}
                        </span>
                      </td>

                      {/* Monto */}
                      <td className="py-3 px-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {ev.amount ? formatMoney(ev.amount) : <span className="text-slate-400 font-normal">-</span>}
                      </td>

                      {/* Estatus */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        {isLinked ? (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                            title={`Relacionado al Anticipo ANT-${ev.linkedTo?.anticipoFolio || ""}`}
                          >
                            <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                            ANT-{ev.linkedTo?.anticipoFolio || ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Clock className="w-3 h-3 text-emerald-600" />
                            Disponible
                          </span>
                        )}
                      </td>

                      {/* Referencia / Creado por */}
                      <td className="py-3 px-4 max-w-xs truncate text-slate-500">
                        {ev.notes && <p className="font-medium text-slate-700 truncate">{ev.notes}</p>}
                        <span className="text-[10px] text-slate-400 block truncate">
                          {ev.createdBy || "Usuario"}
                        </span>
                      </td>

                      {/* Acciones tipo icono */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* 1. Botón Ver */}
                          <button
                            type="button"
                            onClick={() => setSelectedEvidenceForView(ev)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition"
                            title="Ver Comprobante"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* 2. Botón Crear Anticipo */}
                          <button
                            type="button"
                            onClick={() => setSelectedEvidenceForLink(ev)}
                            disabled={isLinked}
                            className={`p-1.5 rounded-lg transition ${
                              isLinked
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            }`}
                            title={isLinked ? `Anticipo ANT-${ev.linkedTo?.anticipoFolio || ""} ya creado` : "Crear Anticipo con este comprobante"}
                          >
                            <PlusCircle className="w-4 h-4" />
                          </button>

                          {/* 3. Botón Editar */}
                          <button
                            type="button"
                            onClick={() => setSelectedEvidenceForEdit(ev)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-amber-600 hover:bg-amber-50 transition"
                            title="Editar Datos"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Botón Eliminar (solo si está libre) */}
                          {!isLinked && (
                            <button
                              type="button"
                              onClick={() => handleDeleteEvidence(ev)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Eliminar Comprobante"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* VISTA MÓVIL (TARJETAS TOUCH-FRIENDLY) */}
          <div className="block md:hidden space-y-3">
            {filteredEvidences.map((ev) => {
              const isLinked = ev.status === "linked";
              return (
                <div
                  key={ev.id}
                  className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm space-y-3"
                >
                  <div className="flex items-start gap-3">
                    {/* Miniatura */}
                    <div
                      onClick={() => setSelectedEvidenceForView(ev)}
                      className="w-16 h-16 rounded-xl bg-slate-950 overflow-hidden relative shrink-0 shadow-sm flex items-center justify-center cursor-pointer"
                    >
                      <img
                        src={ev.imageUrl}
                        alt="Foto"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-semibold text-slate-500">
                          {ev.date}
                        </span>
                        {isLinked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <CheckCircle2 className="w-3 h-3" />
                            ANT-{ev.linkedTo?.anticipoFolio || ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Clock className="w-3 h-3" />
                            Disponible
                          </span>
                        )}
                      </div>

                      <p className="font-bold text-slate-900 text-xs truncate" title={ev.clientName}>
                        {ev.clientName}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          {ev.locationName}
                        </span>
                        {ev.amount && (
                          <span className="font-bold text-slate-900 ml-1">
                            {formatMoney(ev.amount)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {ev.notes && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg italic">
                      {ev.notes}
                    </p>
                  )}

                  {/* Botones de acción en móvil */}
                  <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setSelectedEvidenceForView(ev)}
                      className="flex items-center justify-center gap-1.5 py-2 px-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ver
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedEvidenceForLink(ev)}
                      disabled={isLinked}
                      className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-semibold transition active:scale-95 ${
                        isLinked
                          ? "bg-slate-50 text-slate-400 cursor-not-allowed"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
                      }`}
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      {isLinked ? `ANT-${ev.linkedTo?.anticipoFolio || ""}` : "Crear Anticipo"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedEvidenceForEdit(ev)}
                      className="flex items-center justify-center gap-1.5 py-2 px-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition active:scale-95"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* BOTÓN FLOTANTE MÓVIL PARA CAPTURAR RÁPIDAMENTE */}
      <div className="fixed bottom-6 right-6 md:hidden z-30">
        <Button
          onClick={() => setIsUploadOpen(true)}
          className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl flex items-center justify-center active:scale-90 transition p-0"
          title="Tomar foto o subir comprobante"
        >
          <Camera className="w-6 h-6" />
        </Button>
      </div>

      {/* MODALES */}
      <PaymentEvidenceUploadModal
        isOpen={isUploadOpen}
        onClose={handleCloseUploadModal}
        clients={clients}
        locations={locations}
        onSuccess={() => {
          handleCloseUploadModal();
        }}
      />

      <PaymentEvidenceViewModal
        evidence={selectedEvidenceForView}
        isOpen={Boolean(selectedEvidenceForView)}
        onClose={() => setSelectedEvidenceForView(null)}
      />

      <PaymentEvidenceEditModal
        evidence={selectedEvidenceForEdit}
        isOpen={Boolean(selectedEvidenceForEdit)}
        clients={clients}
        locations={locations}
        onClose={() => setSelectedEvidenceForEdit(null)}
        onSuccess={() => setSelectedEvidenceForEdit(null)}
      />

      <PaymentEvidenceLinkModal
        evidence={selectedEvidenceForLink}
        isOpen={Boolean(selectedEvidenceForLink)}
        onClose={() => setSelectedEvidenceForLink(null)}
        onSuccess={(folio) => {
          setSelectedEvidenceForLink(null);
          if (folio) {
            setSuccessBanner(`¡Anticipo ANT-${folio} creado y relacionado exitosamente!`);
            setTimeout(() => setSuccessBanner(null), 6000);
          }
        }}
      />
    </div>
  );
}


export default function EvidenciasPagoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <EvidenciasPagoContent />
    </Suspense>
  );
}
