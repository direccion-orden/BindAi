"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, limit, Timestamp, doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, Banknote, Download, Search, RefreshCcw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AbrirTurnoForm } from "@/components/caja/AbrirTurnoForm";
import { TransaccionCajaModal } from "@/components/caja/TransaccionCajaModal";
import { CerrarTurnoModal } from "@/components/caja/CerrarTurnoModal";


const DENOMINATIONS = [
  { value: 1000, label: "$1000" },
  { value: 500, label: "$500" },
  { value: 200, label: "$200" },
  { value: 100, label: "$100" },
  { value: 50, label: "$50" },
  { value: 20, label: "$20" },
  { value: 10, label: "$10" },
  { value: 5, label: "$5" },
  { value: 2, label: "$2" },
  { value: 1, label: "$1" },
  { value: 0.5, label: "50¢" },
];

export default function CajaPage() {
  const { user, companyId } = useAuth();
  const [allOpenSessions, setAllOpenSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<'operacion' | 'reportes'>('operacion');

  // Reportes State
  const [reportStartDate, setReportStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA');
  });
  const [reportEndDate, setReportEndDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA');
  });
  const [historySessions, setHistorySessions] = useState<any[]>([]);
  const [historyTransactions, setHistoryTransactions] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  const fetchSession = async () => {
    if (!user || !companyId) return;
    try {
      const q = query(
        collection(db, "companies", companyId, "cash_sessions"),
        where("status", "==", "open")
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllOpenSessions(sessions);
        
        // Mantener la sesión activa seleccionada si sigue abierta, si no, tomar la primera
        setActiveSession((current: any) => {
          if (current && sessions.some(s => s.id === current.id)) {
            return sessions.find(s => s.id === current.id);
          }
          return sessions[0];
        });
      } else {
        setAllOpenSessions([]);
        setActiveSession(null);
      }
    } catch (error) {
      console.error("Error fetching session:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, [user, companyId]);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [bindSales, setBindSales] = useState(0);
  const [isFetchingErp, setIsFetchingErp] = useState(false);

  const [totalDailySales, setTotalDailySales] = useState<number | null>(null);
  const [isFetchingDailySales, setIsFetchingDailySales] = useState(false);
  
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);

  const [liveCardSales, setLiveCardSales] = useState("");
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});

  
  const [syncStatus, setSyncStatus] = useState<'idle'|'syncing'|'saved'>('idle');
  const hasMounted = useRef(false);

  useEffect(() => {
    if (activeSession?.liveAudit && !hasMounted.current) {
        setLiveCardSales(activeSession.liveAudit.cardSales || "");
        setLiveCounts(activeSession.liveAudit.counts || {});
        hasMounted.current = true;
    } else if (activeSession && !hasMounted.current) {
        if (activeSession.openingDenominations) {
            setLiveCounts(activeSession.openingDenominations);
        }
        hasMounted.current = true;
    }
  }, [activeSession]);

  useEffect(() => {
     if (!activeSession?.id || !hasMounted.current) return;
     
     setSyncStatus('syncing');
     const timerId = setTimeout(async () => {
         try {
            if (!companyId) return;
            const ref = doc(db, "companies", companyId, "cash_sessions", activeSession.id);
            await updateDoc(ref, {
                liveAudit: {
                    cardSales: liveCardSales,
                    counts: liveCounts,
                    updatedAt: new Date()
                }
            });
            setSyncStatus('saved');
            setTimeout(() => setSyncStatus('idle'), 2000);
         } catch(err) {
            console.error("Sync live audit err:", err);
         }
     }, 1500);

     return () => clearTimeout(timerId);
  }, [liveCounts, liveCardSales, activeSession?.id]);

  const handleLiveCountChange = (valStr: string, qtyStr: string) => {
    const qty = parseInt(qtyStr, 10) || 0;
    setLiveCounts(prev => ({ ...prev, [valStr]: Math.max(0, qty) }));
  };


  const fetchTransactions = async (sessionId: string) => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "cash_transactions"), where("sessionId", "==", sessionId));
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setTransactions(docs);
  };

  // Listen to local sales (remisiones) since shift open in real-time
  useEffect(() => {
    if (!companyId || !activeSession?.openedAt || !activeSession?.locationId) {
      setBindSales(0);
      setTotalDailySales(null);
      return;
    }

    setIsFetchingErp(true);
    setIsFetchingDailySales(true);

    let openedAtDate;
    if (activeSession.openedAt?.seconds) {
      openedAtDate = new Date(activeSession.openedAt.seconds * 1000);
    } else if (activeSession.openedAt?.toDate) {
      openedAtDate = activeSession.openedAt.toDate();
    } else {
      openedAtDate = new Date(activeSession.openedAt);
    }
    const openedAtIso = openedAtDate.toISOString();

    // Query remisiones created since shift opened
    const q = query(
      collection(db, "companies", companyId, "remisiones"),
      where("createdAt", ">=", openedAtIso)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const docs = snapshot.docs.map(doc => doc.data());
        
        // Filter in memory for status and location
        const filtered = docs.filter((rem: any) => 
          rem.locationId === activeSession.locationId && 
          rem.status === "activa"
        );

        // Sum cash sales
        let cashSales = 0;
        filtered.forEach((rem: any) => {
          if (rem.payments) {
            rem.payments.forEach((p: any) => {
              if (p.method?.toLowerCase() === "efectivo") {
                cashSales += p.amount || 0;
              }
            });
          }
        });
        setBindSales(cashSales);

        // Sum total overall sales
        let totalSales = 0;
        filtered.forEach((rem: any) => {
          totalSales += rem.totalAmount || rem.financials?.total || 0;
        });
        setTotalDailySales(totalSales);
      } catch (err) {
        console.error("Error computing sales from Firestore:", err);
      } finally {
        setIsFetchingErp(false);
        setIsFetchingDailySales(false);
      }
    }, (error) => {
      console.error("Error listening to remisiones in page.tsx:", error);
      setIsFetchingErp(false);
      setIsFetchingDailySales(false);
    });

    return () => unsubscribe();
  }, [companyId, activeSession?.id, activeSession?.openedAt, activeSession?.locationId]);

  useEffect(() => {
    if (activeSession?.id) {
      fetchTransactions(activeSession.id);
    }
  }, [activeSession?.id]);

  const fetchReportData = async () => {
    if (!user || !companyId) return;
    setLoadingReport(true);
    try {
      const start = new Date(reportStartDate + "T00:00:00");
      const end = new Date(reportEndDate + "T23:59:59.999");
      
      const qSess = query(
        collection(db, "companies", companyId, "cash_sessions"),
        where("closedAt", ">=", Timestamp.fromDate(start)),
        where("closedAt", "<=", Timestamp.fromDate(end))
      );
      const snapSess = await getDocs(qSess);
      let docsSess = snapSess.docs.map(d => ({id: d.id, ...d.data()})) as any[];
      docsSess = docsSess.filter(s => s.status === 'closed');
      docsSess.sort((a,b) => (b.closedAt?.seconds || 0) - (a.closedAt?.seconds || 0));
      setHistorySessions(docsSess);
      
      const qTx = query(
        collection(db, "companies", companyId, "cash_transactions"),
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end))
      );
      const snapTx = await getDocs(qTx);
      const docsTx = snapTx.docs.map(d => ({id: d.id, ...d.data()})) as any[];
      docsTx.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setHistoryTransactions(docsTx);
      
    } catch (error) {
      console.error("Error fetching report:", error);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reportes') {
      fetchReportData();
    }
  }, [activeTab]);

  const handleExportCSV = () => {
    const headers = ["Fecha", "Hora", "ID Turno", "Tipo", "Clasificacion", "Persona", "Referencia", "Monto"];
    
    const rows = historyTransactions.map(tx => {
       const date = tx.createdAt?.seconds ? new Date(tx.createdAt.seconds * 1000) : new Date();
       return [
          date.toLocaleDateString('es-MX'),
          date.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'}),
          tx.sessionId,
          tx.type,
          tx.category,
          `"${(tx.person || '').replace(/"/g, '""')}"`,
          `"${(tx.reference || '').replace(/"/g, '""')}"`,
          tx.amount
       ].join(',');
    });
    
    const csvContent = "\uFEFF" + headers.join(',') + "\n" + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Reporte_Caja_${reportStartDate}_al_${reportEndDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Cálculos del turno activo
  const totalFondo = activeSession?.initialFloat || 0;
  const totalIngresos = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
  const totalCancelaciones = transactions.filter(t => t.type === "EXPENSE" && t.category === "RETIRO_CANCELACION").reduce((acc, t) => acc + t.amount, 0);
  const totalRetiros = transactions.filter(t => t.type === "EXPENSE" && t.category !== "RETIRO_CANCELACION").reduce((acc, t) => acc + t.amount, 0);
  
  const liveCardVouchers = parseFloat(liveCardSales) || 0;
  const estimatedCashSales = Math.max(0, bindSales - totalCancelaciones);

  const expectedCash = totalFondo + totalIngresos + estimatedCashSales - totalRetiros;

  const countedCash = DENOMINATIONS.reduce((acc, denom) => {
    const qty = liveCounts[denom.value.toString()] || 0;
    return acc + (qty * denom.value);
  }, 0);

  const liveDiscrepancy = countedCash - expectedCash;

  const handleTxSuccess = () => {
    if (activeSession) fetchTransactions(activeSession.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Control de Caja</h1>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground">
              Gestión del fondo, arqueos de ingresos por venta y retiros.
            </p>
            {allOpenSessions.length > 1 && (
              <select 
                className="ml-4 h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={activeSession?.id || ""}
                onChange={(e) => setActiveSession(allOpenSessions.find(s => s.id === e.target.value))}
              >
                {allOpenSessions.map(session => (
                  <option key={session.id} value={session.id}>
                    Caja Activa: {session.locationName || 'Sin sucursal'}
                  </option>
                ))}
              </select>
            )}
            {allOpenSessions.length === 1 && activeSession?.locationName && (
               <span className="ml-4 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                 {activeSession.locationName}
               </span>
            )}
          </div>
        </div>
        
        <div className="flex bg-muted p-1 rounded-lg w-fit">
          <button 
            onClick={() => setActiveTab('operacion')} 
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'operacion' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Operación Diaria
          </button>
          <button 
            onClick={() => setActiveTab('reportes')} 
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'reportes' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Reportes e Historial
          </button>
        </div>
      </div>

      {activeTab === 'operacion' ? (
        activeSession ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-card border rounded-lg p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></span>
                  Turno Abierto
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Responsable: <span className="font-medium text-foreground">{activeSession.openedByEmail}</span></p>
                <p className="text-sm text-muted-foreground mt-1">Sucursal: <span className="font-medium text-foreground">{activeSession.locationName || 'Nacional'}</span></p>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-xs text-muted-foreground">Apertura: {activeSession.openedAt?.seconds ? new Date(activeSession.openedAt.seconds * 1000).toLocaleString('es-MX') : 'Reciente'}</p>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-700 font-semibold select-none">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Base de Datos Sincronizada
                  </div>
                </div>
              </div>
              <div className="flex gap-8 text-right">
                 <div>
                   <p className="text-sm text-muted-foreground flex items-center gap-1 justify-end" title="Total de ventas del día en la sucursal (Efectivo + Tarjeta + Transferencias)">
                     Venta Total del Día {isFetchingDailySales && <Loader2 className="w-3 h-3 animate-spin"/>}
                   </p>
                   <p className="text-3xl font-bold text-foreground">
                     {totalDailySales !== null ? totalDailySales.toLocaleString('es-MX', {style:'currency', currency:'MXN'}) : '...'}
                   </p>
                 </div>
                 <div className="border-l pl-8">
                   <p className="text-sm text-muted-foreground">Fondo Inicial</p>
                   <p className="text-3xl font-bold text-primary">
                     {totalFondo.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                   </p>
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <p className="text-sm text-muted-foreground whitespace-nowrap">Entradas Manuales</p>
                  <p className="text-2xl font-bold text-foreground">
                   + {totalIngresos.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-card border rounded-lg p-5 shadow-sm relative">
                  <p className="text-sm text-muted-foreground flex justify-between whitespace-nowrap" title="Total exacto de ventas en efectivo extraído de los diarios contables de Bind ERP.">Efectivo Mínimo x Ventas {isFetchingErp && <Loader2 className="w-4 h-4 animate-spin text-primary"/>}</p>
                  <p className="text-2xl font-bold text-foreground">
                   + {estimatedCashSales.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-card border rounded-lg p-5 shadow-sm">
                  <p className="text-sm text-muted-foreground whitespace-nowrap">Salidas / Retiros</p>
                  <p className="text-2xl font-bold text-destructive">
                   - {totalRetiros.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
               <div className="bg-primary/5 border border-primary/20 rounded-lg p-5 shadow-sm">
                  <p className="text-sm text-primary font-semibold whitespace-nowrap">Esperado en Caja</p>
                  <p className="text-2xl font-bold text-primary">
                   = {expectedCash.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                 </p>
               </div>
            </div>

            
            {/* Arqueo en Caliente */}
            <div className="bg-card border rounded-lg shadow-sm p-4 animate-in fade-in">
               <div className="flex items-center justify-between border-b pb-2 mb-4">
                 <h3 className="font-semibold text-lg">Arqueo Físico Simultáneo (Sin Cerrar)</h3>
                 {syncStatus === 'syncing' && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Sincronizando...</span>}
                 {syncStatus === 'saved' && <span className="text-xs text-green-600 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3 h-3"/> Activo en la Nube</span>}
               </div>
               <div className="flex flex-col xl:flex-row gap-6">
                 
                 <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-4 bg-muted/50 p-3 rounded border">
                       <label className="text-sm font-semibold flex-1">Vouchers / Cobro con Tarjeta</label>
                       <Input 
                         type="number" 
                         placeholder="0.00"
                         value={liveCardSales}
                         onChange={(e) => setLiveCardSales(e.target.value)}
                         className="w-32 text-right bg-background"
                       />
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {DENOMINATIONS.map((denom) => {
                        const qty = liveCounts[denom.value.toString()] || '';
                        return (
                          <div key={denom.value} className="flex items-center gap-2 border p-2 rounded bg-muted/20">
                            <span className="text-xs font-semibold w-12 text-muted-foreground">{denom.label}</span>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              className="h-7 text-center flex-1 px-1"
                              value={qty}
                              onChange={(e) => handleLiveCountChange(denom.value.toString(), e.target.value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                 </div>

                 <div className={`xl:w-64 p-5 rounded-lg border flex flex-col justify-center items-center shadow-sm transition-colors ${Math.abs(liveDiscrepancy) > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-green-500/10 border-green-500/30'}`}>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1 text-center">Efectivo Físico Contado</p>
                    <p className="text-3xl font-black mb-4">{(countedCash).toLocaleString('es-MX', {style:'currency', currency:'MXN'})}</p>
                    
                    <div className="border-t border-foreground/10 pt-4 text-center w-full">
                       <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Descuadre Actual</p>
                       <p className={`text-xl font-bold ${liveDiscrepancy === 0 ? 'text-green-600' : 'text-destructive'}`}>
                         {liveDiscrepancy === 0 ? 'CUADRADO' : `${liveDiscrepancy > 0 ? '+' : ''}${(liveDiscrepancy).toLocaleString('es-MX', {style:'currency', currency:'MXN'})}`}
                       </p>
                    </div>
                 </div>

               </div>
            </div>

            <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                <h3 className="font-semibold text-lg">Movimientos Físicos (Caja)</h3>
                <div className="flex gap-2">
                   <Button onClick={() => setIsTxModalOpen(true)} variant="secondary" size="sm" className="gap-1">
                     <Plus className="h-4 w-4" /> Registrar Movimiento
                   </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 font-medium">Hora</th>
                        <th className="px-4 py-3 font-medium">Clasificación</th>
                        <th className="px-4 py-3 font-medium">Persona</th>
                        <th className="px-4 py-3 font-medium">Referencia</th>
                        <th className="px-4 py-3 font-medium text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                       {transactions.length === 0 ? (
                         <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No hay movimientos registrados en este turno.</td></tr>
                       ) : (
                         transactions.map(tx => (
                           <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                             <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                               {tx.createdAt?.seconds ? new Date(tx.createdAt.seconds * 1000).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'}) : '...'}
                             </td>
                             <td className="px-4 py-3">
                               <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${tx.type === 'INCOME' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'}`}>
                                 {tx.category.replace(/_/g, ' ')}
                               </span>
                             </td>
                             <td className="px-4 py-3 font-medium">{tx.person}</td>
                             <td className="px-4 py-3 max-w-[200px] truncate" title={tx.reference}>{tx.reference || '-'}</td>
                             <td className={`px-4 py-3 text-right font-medium ${tx.type === 'INCOME' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                               {tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                             </td>
                           </tr>
                         ))
                       )}
                    </tbody>
                 </table>
              </div>
              <div className="p-4 bg-muted/20 border-t flex justify-end">
                 <Button variant="default" size="lg" className="w-full sm:w-auto" onClick={() => setIsClosingModalOpen(true)}>
                   Realizar Arqueo y Cerrar Turno
                 </Button>
              </div>
            </div>
            
            <TransaccionCajaModal 
              isOpen={isTxModalOpen} 
              onClose={() => setIsTxModalOpen(false)} 
              sessionId={activeSession.id}
              onSuccess={handleTxSuccess}
            />

            <CerrarTurnoModal
              isOpen={isClosingModalOpen}
              onClose={() => setIsClosingModalOpen(false)}
              session={activeSession}
              transactions={transactions}
              initialCounts={liveCounts}
              initialCardSales={liveCardSales}
              onClosed={() => {
                 setIsClosingModalOpen(false);
                 setActiveSession(null);
              }}
            />
          </div>
        ) : isOpening ? (
          <div className="bg-card border rounded-lg p-6 shadow-sm animate-in fade-in">
             <AbrirTurnoForm 
              onOpened={(session) => {
                setActiveSession(session);
                setIsOpening(false);
              }} 
              onCancel={() => setIsOpening(false)} 
             />
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in">
            <div className="bg-card border rounded-lg p-12 flex flex-col items-center justify-center text-center space-y-5 shadow-sm">
              <div className="p-4 bg-muted/50 rounded-full">
                <Banknote className="h-10 w-10 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-xl font-medium">Caja Cerrada</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-2 mx-auto">
                  No hay ningún turno activo. Inicia el turno de hoy declarando de forma exacta el fondo inicial con el que comienza la caja.
                </p>
              </div>
              <Button onClick={() => setIsOpening(true)} size="lg" className="gap-2 mt-4 text-base font-semibold">
                <Plus className="h-5 w-5" />
                Abrir Nuevo Turno
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          {/* Header Reportes */}
          <div className="bg-card border rounded-lg p-4 shadow-sm flex flex-col sm:flex-row sm:items-end gap-4">
             <div className="flex-1 flex gap-4">
                <div className="space-y-1.5 flex-1 max-w-[200px]">
                  <label className="text-xs font-semibold text-muted-foreground">Fecha Inicial</label>
                  <Input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5 flex-1 max-w-[200px]">
                  <label className="text-xs font-semibold text-muted-foreground">Fecha Final</label>
                  <Input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} />
                </div>
             </div>
             <div className="flex gap-2">
                <Button variant="outline" onClick={fetchReportData} disabled={loadingReport} className="gap-2">
                   {loadingReport ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4" />}
                   Consultar
                </Button>
                <Button variant="default" onClick={handleExportCSV} disabled={historyTransactions.length === 0} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                   <Download className="w-4 h-4" /> Exportar CSV
                </Button>
             </div>
          </div>

          <div className="flex flex-col gap-8 mt-6">
             {/* Listado de Cierres (Historial de Turnos) */}
             <div className="space-y-4">
               <h3 className="text-lg font-semibold flex items-center gap-2 text-muted-foreground">
                 <RefreshCcw className="w-5 h-5"/> Arqueos / Cierres
               </h3>
               <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">
                 <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left">
                     <thead className="bg-muted text-muted-foreground text-xs uppercase">
                       <tr>
                         <th className="px-4 py-3 font-medium">Cierre</th>
                         <th className="px-4 py-3 font-medium">Efectivo Real</th>
                         <th className="px-4 py-3 font-medium text-right">Descuadre</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y">
                       {loadingReport ? (
                         <tr><td colSpan={3} className="px-4 py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></td></tr>
                       ) : historySessions.length === 0 ? (
                         <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No se encontraron cierres en estas fechas.</td></tr>
                       ) : historySessions.map(sess => (
                         <tr key={sess.id} className="hover:bg-muted/50 transition-colors">
                           <td className="px-4 py-3">
                             <div className="font-medium whitespace-nowrap">{sess.closedAt?.seconds ? new Date(sess.closedAt.seconds * 1000).toLocaleString('es-MX', {dateStyle:'short', timeStyle:'short'}) : '...'}</div>
                             <div className="text-xs text-muted-foreground">{sess.closedByEmail}</div>
                           </td>
                           <td className="px-4 py-3">
                             {(sess.countedCash || 0).toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                           </td>
                           <td className="px-4 py-3 text-right">
                             <span className={`font-bold ${sess.discrepancy === 0 ? 'text-green-600' : 'text-destructive'}`}>
                               {sess.discrepancy === 0 ? 'OK' : sess.discrepancy.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                             </span>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             </div>

             {/* Tabulador de Movimientos */}
             <div className="space-y-4">
               <h3 className="text-lg font-semibold flex items-center gap-2 text-muted-foreground">
                 <Banknote className="w-5 h-5"/> Todos los Movimientos
               </h3>
               <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                       <thead className="bg-muted text-muted-foreground text-[10px] tracking-wider uppercase">
                         <tr>
                           <th className="px-4 py-3 font-medium">Fecha/Hora</th>
                           <th className="px-4 py-3 font-medium">Tipo</th>
                           <th className="px-4 py-3 font-medium text-right">Monto</th>
                           <th className="px-4 py-3 font-medium">Referencia</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y relative">
                          {loadingReport ? (
                            <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto"/></td></tr>
                          ) : historyTransactions.length === 0 ? (
                            <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No hay movimientos en este rango.</td></tr>
                          ) : historyTransactions.map(tx => (
                            <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                                {tx.createdAt?.seconds ? new Date(tx.createdAt.seconds * 1000).toLocaleString('es-MX', {dateStyle:'short', timeStyle:'short'}) : '...'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-[9px] font-semibold uppercase ${tx.type === 'INCOME' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'}`}>
                                  {tx.category.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-right font-medium text-xs ${tx.type === 'INCOME' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {tx.type === 'INCOME' ? '+' : '-'}{tx.amount.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
                              </td>
                              <td className="px-4 py-3 text-xs max-w-[150px] truncate" title={`${tx.person || ''} ${tx.reference || ''}`}>
                                <span className="font-medium mr-1">{tx.person}</span> 
                                <span className="text-muted-foreground">{tx.reference}</span>
                              </td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
