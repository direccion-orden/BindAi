"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy, doc, getDoc, setDoc, getDocs, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Receipt, CloudDownload, RefreshCw, Loader2, AlertCircle, FileText, DollarSign, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Eye, Search } from "lucide-react";
import Link from "next/link";
import { ExpensePaymentModal } from "@/components/payments/ExpensePaymentModal";

import { SatRequestsModal } from "@/components/features/sat/SatRequestsModal";
import { UploadSatFilesModal } from "@/components/features/sat/UploadSatFilesModal";

export default function GastosPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [fielConfigured, setFielConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

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
      (inv.uuid || "").toLowerCase().includes(searchTerm.toLowerCase());
      
    const isPaid = (inv.paidAmount || 0) >= (inv.total || 0) - 0.01;
    let matchesStatus = true;
    if (statusFilter === "pendientes") {
      matchesStatus = !isPaid;
    } else if (statusFilter === "pagados") {
      matchesStatus = isPaid;
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
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        throw new Error("FIEL no configurada.");
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

      if (!reqRes.ok) throw new Error(reqData.error || "Error al solicitar descarga");

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

          // Update request
          await setDoc(doc(db, "companies", companyId, "sat_requests", requestId), {
            status: "finished",
            invoicesCount: verData.invoices?.length || 0,
            updatedAt: new Date().toISOString()
          }, { merge: true });

          setSyncStatus(`¡Listo! Se extrajeron ${verData.invoices?.length || 0} facturas.`);
        } else if (verRes.ok && verData.status === 'rejected') {
          throw new Error("El SAT rechazó la solicitud.");
        } else {
          setSyncStatus(`El SAT sigue procesando... (Intento ${attempts}/12)`);
        }
      }

      if (!finished) {
        setSyncStatus("El SAT está demorando. La solicitud quedó pendiente en segundo plano.");
      }

    } catch (error: any) {
      console.error(error);
      setSyncStatus(`Error: ${error.message}`);
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
      if (!satDoc.exists()) throw new Error("FIEL no configurada.");
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
      console.error(error);
      setSyncStatus(`Error: ${error.message}`);
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
        <div className="flex flex-col md:flex-row items-center gap-4 bg-muted/30 p-2 rounded-lg border">
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
            
            <div className="flex items-center gap-2 md:border-l md:pl-4">
              {!fielConfigured ? (
                <Button variant="destructive" className="gap-2 cursor-not-allowed h-9" disabled>
                  <AlertCircle className="w-4 h-4" /> FIEL No Configurada
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setIsUploadModalOpen(true)} className="gap-2 h-9">
                    <FileText className="w-4 h-4" />
                    Carga Manual
                  </Button>
                  <Button variant="outline" onClick={() => setIsRequestsModalOpen(true)} className="gap-2 h-9">
                    <RefreshCw className="w-4 h-4" />
                    Revisar Pendientes
                  </Button>
                  <Button onClick={handleSyncSAT} disabled={syncing} className="gap-2 h-9">
                    <CloudDownload className="w-4 h-4" />
                    Sincronizar con SAT
                  </Button>
                </>
              )}
            </div>
        </div>
      </div>

      {syncStatus && (
        <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm border border-blue-200 font-medium flex items-center gap-2">
          {syncing && <Loader2 className="w-4 h-4 animate-spin" />}
          {syncStatus}
        </div>
      )}

      <div className="bg-card border rounded-xl shadow-sm flex flex-col h-[600px]">
          <div className="p-4 border-b flex items-center justify-between gap-4 bg-muted/20 rounded-t-xl shrink-0">
              <h3 className="font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  Facturas SAT (Bandeja de Entrada)
              </h3>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b bg-slate-50/50 shrink-0">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por emisor, RFC o UUID..." 
                className="pl-9 bg-background h-9 text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado:</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
              >
                <option value="todos">Todos</option>
                <option value="pendientes">Pendientes</option>
                <option value="pagados">Pagados / Registrados</option>
              </select>
              
              <span className="text-xs font-semibold text-slate-500 bg-white border px-3 py-1.5 rounded-full shadow-sm ml-2">
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
                      <thead className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                          <tr>
                              <th 
                                className="px-4 py-3 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("date")}
                              >
                                <div className="flex items-center">
                                  Fecha
                                  {renderSortIcon("date")}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("emisorName")}
                              >
                                <div className="flex items-center">
                                  Emisor
                                  {renderSortIcon("emisorName")}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("emisorRfc")}
                              >
                                <div className="flex items-center">
                                  RFC
                                  {renderSortIcon("emisorRfc")}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3 text-left font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("uuid")}
                              >
                                <div className="flex items-center">
                                  UUID
                                  {renderSortIcon("uuid")}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-3 text-right font-semibold text-muted-foreground cursor-pointer select-none hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => handleSort("total")}
                              >
                                <div className="flex items-center justify-end">
                                  Total
                                  {renderSortIcon("total")}
                                </div>
                              </th>
                              <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Acción</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y">
                          {sortedInvoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="px-4 py-3 whitespace-nowrap">{inv.date}</td>
                                  <td className="px-4 py-3 font-medium">{inv.emisorName}</td>
                                  <td className="px-4 py-3">{inv.emisorRfc}</td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                                    <Link href={`/gastos/${inv.id}`} target="_blank" className="text-indigo-600 hover:text-indigo-800 hover:underline">
                                      {inv.uuid}
                                    </Link>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                      <div className="font-bold">{formatMoney(inv.total)}</div>
                                      {(inv.paidAmount || 0) > 0 && (
                                        <div className="text-xs text-rose-600 font-medium">Pagado: {formatMoney(inv.paidAmount || 0)}</div>
                                      )}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        {(!inv.paidAmount || inv.paidAmount < inv.total - 0.01) ? (
                                          <>
                                            <Button 
                                              variant="outline" 
                                              size="icon" 
                                              className="h-8 w-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 shrink-0"
                                              onClick={() => {
                                                setSelectedInvoice(inv);
                                                setIsPaymentModalOpen(true);
                                              }}
                                              title="Registrar Pago"
                                            >
                                              <DollarSign className="w-4 h-4" />
                                            </Button>
                                            <Link href={`/compras/gastos/nuevo?satId=${inv.id}`}>
                                              <Button 
                                                variant="outline" 
                                                size="icon" 
                                                className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 shrink-0"
                                                title="Registrar Gasto"
                                              >
                                                <Receipt className="w-4 h-4" />
                                              </Button>
                                            </Link>
                                            <Link href={`/gastos/${inv.id}`} target="_blank">
                                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-800 hover:bg-slate-50 shrink-0" title="Ver Detalles">
                                                <Eye className="w-4 h-4 text-indigo-600" />
                                              </Button>
                                            </Link>
                                          </>
                                        ) : (
                                          <>
                                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                                              <CheckCircle2 className="w-3 h-3" /> Pagado
                                            </span>
                                            <Link href={`/gastos/${inv.id}`} target="_blank">
                                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-800 hover:bg-slate-50 shrink-0" title="Ver Detalles">
                                                <Eye className="w-4 h-4 text-indigo-600" />
                                              </Button>
                                            </Link>
                                          </>
                                        )}
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              )}
          </div>
      </div>

      {selectedInvoice && (
        <ExpensePaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
          }}
          document={selectedInvoice}
          documentType="gasto"
          companyId={companyId || ""}
        />
      )}

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
