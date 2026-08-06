"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy, doc, getDoc, setDoc, getDocs, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Receipt, CloudDownload, RefreshCw, Loader2, AlertCircle, FileText, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Eye, Search, Truck } from "lucide-react";
import Link from "next/link";

import { SatRequestsModal } from "@/components/features/sat/SatRequestsModal";
import { UploadSatFilesModal } from "@/components/features/sat/UploadSatFilesModal";

const decodeBase64Utf8 = (str: string) => {
  try {
    return decodeURIComponent(
      atob(str)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch (e) {
    return atob(str);
  }
};

export default function GastosPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fielConfigured, setFielConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [invoices, setInvoices] = useState<any[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  // Date Filters State
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  // Sorting state
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "date" || field === "total" ? "desc" : "asc");
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
  const filteredInvoices = invoices.filter(inv => {
    const matchesSearch = 
      (inv.emisorName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.emisorRfc || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.uuid || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inv.folio || "").toLowerCase().includes(searchTerm.toLowerCase());
      
    const isPaid = (inv.paidAmount || 0) >= (inv.total || 0) - 0.01;
    const isProcessed = inv.status === "processed" || inv.status === "received" || isPaid;
    let matchesStatus = true;
    if (statusFilter === "pendientes") {
      matchesStatus = !isProcessed;
    } else if (statusFilter === "pagados") {
      matchesStatus = isProcessed;
    }
    
    // Date range filter
    if (dateFrom || dateTo) {
      if (dateFrom && inv.date < dateFrom) return false;
      if (dateTo && inv.date > dateTo) return false;
    }
    
    return matchesSearch && matchesStatus;
  });

  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    let aVal = a[sortField] || "";
    let bVal = b[sortField] || "";

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc" 
        ? aVal.localeCompare(bVal, "es") 
        : bVal.localeCompare(aVal, "es");
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const defaultStartDate = new Date();
  defaultStartDate.setDate(1);
  const [startDate, setStartDate] = useState(defaultStartDate.toISOString().split('T')[0]);

  useEffect(() => {
    if (!companyId) return;

    const checkFiel = async () => {
      const satDoc = await getDoc(doc(db, "companies", companyId, "credentials", "sat"));
      setFielConfigured(satDoc.exists());
    };
    checkFiel();

    const q = query(
      collection(db, "companies", companyId, "expenses_inbox"),
      orderBy("date", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const inv = { id: doc.id, ...doc.data() } as any;
        let computedFolio = inv.folio || inv.invoiceNumber || "";
        if (!computedFolio && inv.xmlBase64) {
          try {
            const xmlText = decodeBase64Utf8(inv.xmlBase64);
            const folioMatch = xmlText.match(/Folio="([^"]+)"/i);
            const serieMatch = xmlText.match(/Serie="([^"]+)"/i);
            const folioVal = folioMatch ? folioMatch[1] : "";
            const serieVal = serieMatch ? serieMatch[1] : "";
            computedFolio = serieVal ? `${serieVal}-${folioVal}` : folioVal;
          } catch (e) {
            console.error("Error parsing folio in onSnapshot:", e);
          }
        }
        return {
          ...inv,
          folio: computedFolio
        };
      });
      setInvoices(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const handleSyncSAT = async () => {
    if (!companyId) return;
    setSyncing(true);
    setSyncStatus("Obteniendo credenciales FIEL...");

    try {
      const satDoc = await getDoc(doc(db, "companies", companyId, "credentials", "sat"));
      if (!satDoc.exists()) {
        setSyncStatus("Error: FIEL no configurada.");
        return;
      }
      const fielData = satDoc.data();

      setSyncStatus("Iniciando conexión con el SAT...");
      
      const reqRes = await fetch('/api/sat/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cerBase64: fielData.cerBase64,
          keyBase64: fielData.keyBase64,
          password: fielData.password,
          startDate
        })
      });
      const reqData = await reqRes.json();

      if (!reqRes.ok) {
        setSyncStatus(`Error: ${reqData.error || "Error al solicitar descarga al SAT."}`);
        return;
      }

      const requestId = reqData.requestId;
      setSyncStatus(`Solicitud aceptada (ID: ${requestId}). Esperando al SAT...`);

      // Guardar request localmente
      await setDoc(doc(db, "companies", companyId, "sat_requests", requestId), {
          requestId,
          start: reqData.start,
          end: reqData.end,
          status: "pending",
          createdAt: new Date().toISOString()
      });

      let attempts = 0;
      let finished = false;

      while (!finished && attempts < 12) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const verRes = await fetch('/api/sat/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            requestId,
            cerBase64: fielData.cerBase64,
            keyBase64: fielData.keyBase64,
            password: fielData.password 
          })
        });
        const verData = await verRes.json();

        if (verRes.ok && verData.status === 'finished') {
          finished = true;
          setSyncStatus(`¡Descarga completada! Guardando ${verData.invoices?.length || 0} facturas...`);
          
          // Guardar facturas
          if (verData.invoices && verData.invoices.length > 0) {
            const batch = import("firebase/firestore").then(mod => mod.writeBatch(db));
            const b = await batch;
            
            // Limit to 500 for safety, though typically less per batch
            verData.invoices.slice(0, 400).forEach((inv: any) => {
               const normalizedUuid = inv.uuid.toUpperCase();
               const docRef = doc(db, "companies", companyId, "expenses_inbox", normalizedUuid);
               const exists = invoices.some((x: any) => x.uuid.toUpperCase() === normalizedUuid);
               if (exists) {
                 b.update(docRef, { xmlBase64: inv.xmlBase64 });
               } else {
                 b.set(docRef, { ...inv, uuid: normalizedUuid });
               }
            });
            await b.commit();
          }

          // Update request
          await setDoc(doc(db, "companies", companyId, "sat_requests", requestId), {
            status: "finished",
            invoicesCount: verData.invoices?.length || 0,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          setSyncStatus(`¡Listo! Se extrajeron ${verData.invoices?.length || 0} facturas.`);
        } else if (verRes.ok && verData.status === 'rejected') {
          await setDoc(doc(db, "companies", companyId, "sat_requests", requestId), {
            status: "rejected",
            satCode: verData.code ?? 5,
            satMessage: verData.message || "Solicitud rechazada",
            updatedAt: new Date().toISOString()
          }, { merge: true });
          const reason = verData.message ? `El SAT rechazó la solicitud: ${verData.message}` : "El SAT rechazó la solicitud.";
          setSyncStatus(`Error: ${reason}`);
          finished = true;
        } else {
          setSyncStatus(`El SAT sigue procesando... (Intento ${attempts}/12)`);
        }
      }

      if (!finished) {
        setSyncStatus("El SAT está demorando. La solicitud quedó pendiente en segundo plano.");
      }

    } catch (error: any) {
      console.warn("Sync SAT:", error?.message || error);
      setSyncStatus(`Error: ${error.message || "Error al sincronizar con el SAT"}`);
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  };

  const handleCheckPending = async () => {
    if (!companyId) return;
    setSyncing(true);
    setSyncStatus("Buscando solicitudes pendientes...");

    try {
      const q = query(collection(db, "companies", companyId, "sat_requests"), where("status", "==", "pending"));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setSyncStatus("No hay solicitudes pendientes en el SAT.");
        setTimeout(() => setSyncing(false), 3000);
        return;
      }
      const satDoc = await getDoc(doc(db, "companies", companyId, "credentials", "sat"));
      if (!satDoc.exists()) {
        setSyncStatus("Error: FIEL no configurada.");
        setTimeout(() => setSyncing(false), 3000);
        return;
      }
      const fielData = satDoc.data();

      setSyncStatus(`Verificando ${querySnapshot.size} solicitudes pendientes...`);

      let totalInvoices = 0;
      let finishedCount = 0;

      for (const docSnap of querySnapshot.docs) {
        const { requestId } = docSnap.data();
        
        const verRes = await fetch('/api/sat/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            requestId,
            cerBase64: fielData.cerBase64,
            keyBase64: fielData.keyBase64,
            password: fielData.password 
          })
        });
        
        const verData = await verRes.json();

        if (verRes.ok && verData.status === 'finished') {
          finishedCount++;
          const newInvoices = verData.invoices?.length || 0;
          totalInvoices += newInvoices;
          
          if (newInvoices > 0) {
            const batch = import("firebase/firestore").then(mod => mod.writeBatch(db));
            const b = await batch;
            verData.invoices.slice(0, 400).forEach((inv: any) => {
               const docRef = doc(db, "companies", companyId, "expenses_inbox", inv.uuid);
               const exists = invoices.some((x: any) => x.uuid === inv.uuid);
               if (exists) {
                 b.update(docRef, { xmlBase64: inv.xmlBase64 });
               } else {
                 b.set(docRef, inv);
               }
            });
            await b.commit();
          }

          await setDoc(doc(db, "companies", companyId, "sat_requests", requestId), {
            status: "finished",
            invoicesCount: newInvoices,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          
        } else if (verRes.ok && verData.status === 'rejected') {
          await setDoc(doc(db, "companies", companyId, "sat_requests", requestId), {
            status: "rejected",
            satCode: verData.code ?? 5,
            satMessage: verData.message || "Solicitud rechazada",
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }

      if (finishedCount > 0) {
        setSyncStatus(`¡Listo! Se completaron ${finishedCount} solicitudes y se extrajeron ${totalInvoices} facturas.`);
      } else {
        setSyncStatus("El SAT sigue procesando las solicitudes. Intenta más tarde.");
      }

    } catch (error: any) {
      console.warn("Check pending SAT:", error?.message || error);
      setSyncStatus(`Error: ${error.message || "Error al verificar solicitudes"}`);
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Receipt className="w-8 h-8 text-primary" />
            Gastos Recibidos
          </h1>
          <p className="text-muted-foreground mt-1">Bandeja de entrada de facturas recibidas (XMLs del SAT)</p>
        </div>
        <div className="flex flex-col gap-2.5 bg-muted/30 p-2.5 rounded-lg border w-full md:w-auto">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 px-2">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Buscar a partir de:</span>
                <Input 
                  type="date" 
                  value={startDate} 
                  onChange={(e) => setStartDate(e.target.value)} 
                  className="w-[140px] h-9 text-sm bg-background"
                  disabled={syncing || !fielConfigured}
                />
            </div>
            
            <div className="flex items-center gap-2 sm:border-l sm:pl-4">
              {!fielConfigured ? (
                <Button variant="destructive" className="gap-2 cursor-not-allowed h-9 w-full" disabled>
                  <AlertCircle className="w-4 h-4" /> FIEL No Configurada
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setIsRequestsModalOpen(true)} className="gap-2 h-9">
                    <RefreshCw className="w-4 h-4" />
                    Revisar Pendientes
                  </Button>
                  <Button onClick={handleSyncSAT} disabled={syncing} className="gap-2 h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
                    <CloudDownload className="w-4 h-4" />
                    Sincronizar con SAT
                  </Button>
                </>
              )}
            </div>
          </div>
          {fielConfigured && (
            <div className="flex justify-end border-t pt-2">
              <Button onClick={() => setIsUploadModalOpen(true)} className="gap-2 h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md w-full sm:w-auto">
                <FileText className="w-4 h-4" />
                Carga Manual
              </Button>
            </div>
          )}
        </div>
      </div>

      {syncStatus && (
        <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border border-blue-200 font-medium flex items-center gap-2">
          {syncing && <Loader2 className="w-4 h-4 animate-spin" />}
          {syncStatus}
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm flex flex-col h-[900px]">
          <div className="p-4 border-b flex items-center justify-between gap-4 bg-muted/20 rounded-t-xl shrink-0">
              <h3 className="font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  Facturas SAT (Bandeja de Entrada)
              </h3>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-4 border-b bg-slate-50/50 shrink-0">
            <div className="flex flex-col sm:flex-row flex-wrap items-end gap-3 flex-1 w-full">
              {/* Búsqueda */}
              <div className="flex flex-col gap-1 w-full sm:w-64">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Buscar</span>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por emisor, RFC o UUID..." 
                    className="pl-9 bg-background h-9 text-sm"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              {/* Estado */}
              <div className="flex flex-col gap-1 w-full sm:w-40">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none font-medium"
                >
                  <option value="todos">Todos</option>
                  <option value="pendientes">Pendientes</option>
                  <option value="pagados">Pagados / Registrados</option>
                </select>
              </div>

              {/* Fecha */}
              <div className="flex flex-col gap-1 w-full sm:w-44">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rango de Fecha</span>
                <select
                  value={dateFilterOption}
                  onChange={e => handleDateFilterChange(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none font-medium"
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

              {/* Rango Personalizado */}
              {dateFilterOption === "custom" && (
                <>
                  <div className="flex flex-col gap-1 w-full sm:w-36 animate-in fade-in slide-in-from-left-2 duration-200">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Desde</span>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="h-9 bg-background text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-full sm:w-36 animate-in fade-in slide-in-from-left-2 duration-200">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Hasta</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="h-9 bg-background text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Contador de facturas */}
            <div className="shrink-0 flex items-center md:pb-1">
              <span className="text-xs font-semibold text-slate-500 bg-white border px-3 py-1.5 rounded-full shadow-sm">
                {filteredInvoices.length} facturas
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
              {invoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground opacity-60">
                      <FileText className="w-12 h-12 mb-3 opacity-20" />
                      <p>No hay facturas pendientes.</p>
                      <p className="text-sm">Haz clic en Sincronizar con SAT para descargar tus gastos recientes.</p>
                  </div>
              ) : filteredInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[300px] text-center text-muted-foreground opacity-60">
                      <Search className="w-12 h-12 mb-3 opacity-20" />
                      <p className="font-bold text-slate-800">No se encontraron facturas</p>
                      <p className="text-sm">Intenta buscando con otro término o cambiando el filtro de estado.</p>
                  </div>
              ) : (
                  <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold sticky top-0 z-10 backdrop-blur-sm">
                          <tr>
                              <th 
                                className="px-4 py-3 w-24 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("date")}
                              >
                                <div className="flex items-center">
                                  Fecha
                                  {renderSortIcon("date")}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3 max-w-[200px] text-left font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("emisorName")}
                              >
                                <div className="flex items-center">
                                  Emisor
                                  {renderSortIcon("emisorName")}
                                </div>
                              </th>

                              <th 
                                className="px-4 py-3 w-28 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("folio")}
                              >
                                <div className="flex items-center">
                                  Folio
                                  {renderSortIcon("folio")}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3 w-28 text-right font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("total")}
                              >
                                <div className="flex items-center justify-end">
                                  Total
                                  {renderSortIcon("total")}
                                </div>
                              </th>
                              <th className="px-4 py-3 w-24 text-center font-semibold text-muted-foreground">Estado</th>
                              <th className="px-4 py-3 w-24 text-center font-semibold text-muted-foreground">Acción</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y">
                          {sortedInvoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="px-4 py-3 whitespace-nowrap">{inv.date ? inv.date.substring(0, 10) : ""}</td>
                                  <td className="px-4 py-3 font-medium max-w-[200px] truncate" title={inv.emisorName}>{inv.emisorName}</td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                                    {inv.folio ? (
                                      <Link href={`/gastos/${inv.id}`} target="_blank" className="text-indigo-600 hover:text-indigo-800 hover:underline">
                                        {inv.folio}
                                      </Link>
                                    ) : (
                                      ""
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                      <div className="font-bold">{formatMoney(inv.total)}</div>
                                      {(inv.paidAmount || 0) > 0 && (
                                        <div className="text-xs text-rose-600 font-medium">Pagado: {formatMoney(inv.paidAmount || 0)}</div>
                                      )}
                                  </td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap">
                                      {(() => {
                                        const total = inv.total || 0;
                                        const paid = inv.paidAmount || 0;
                                        if (paid >= total - 0.01) {
                                          return (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200">
                                              Pagado
                                            </span>
                                          );
                                        } else if (paid > 0.01) {
                                          return (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-800 bg-indigo-100 px-2.5 py-1 rounded-full border border-indigo-200">
                                              Pago Parcial
                                            </span>
                                          );
                                        } else if (inv.status === "processed" || inv.status === "received") {
                                          return (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full border border-blue-200">
                                              Procesada
                                            </span>
                                          );
                                        } else {
                                          return (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-200">
                                              Pendiente
                                            </span>
                                          );
                                        }
                                      })()}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        {(!inv.paidAmount || inv.paidAmount < inv.total - 0.01) && inv.status !== "processed" && inv.status !== "received" && (
                                          <>
                                            <Button 
                                              asChild
                                              variant="outline" 
                                              size="icon" 
                                              className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 shrink-0"
                                            >
                                              <Link href={`/compras/gastos/nuevo?satId=${inv.id}`} target="_blank" title="Registrar Gasto">
                                                <Receipt className="w-4 h-4" />
                                              </Link>
                                            </Button>
                                            <Button 
                                              asChild
                                              variant="outline" 
                                              size="icon" 
                                              className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50 shrink-0"
                                            >
                                              <Link href={`/compras/recepciones/nueva?satId=${inv.id}`} target="_blank" title="Registrar Recepción">
                                                <Truck className="w-4 h-4" />
                                              </Link>
                                            </Button>
                                          </>
                                        )}
                                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-800 hover:bg-slate-50 shrink-0">
                                          <Link href={`/gastos/${inv.id}`} target="_blank" title="Ver Detalles">
                                            <Eye className="w-4 h-4 text-indigo-600" />
                                          </Link>
                                        </Button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              )}
          </div>
      </div>



      <SatRequestsModal
        isOpen={isRequestsModalOpen}
        onClose={() => setIsRequestsModalOpen(false)}
        companyId={companyId || ""}
      />

      <UploadSatFilesModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        companyId={companyId || ""}
      />

    </div>
  );
}
