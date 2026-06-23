"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, onSnapshot, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { usePOS } from "@/context/POSContext";
import { Loader2, Plus, Banknote, RefreshCcw, User, Calendar, MapPin, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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

interface CajaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CajaModal({ isOpen, onClose }: CajaModalProps) {
  const { user, companyId } = useAuth();
  const { branchId } = usePOS();
  
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [bindSales, setBindSales] = useState(0);
  const [totalDailySales, setTotalDailySales] = useState<number | null>(null);
  const [isFetchingErp, setIsFetchingErp] = useState(false);
  const [isFetchingDailySales, setIsFetchingDailySales] = useState(false);

  // Sub-modal toggle states
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);

  // Tabs and Live Audit States
  const [activeTab, setActiveTab] = useState<'resumen' | 'arqueo'>('resumen');
  const [liveCardSales, setLiveCardSales] = useState("");
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [recyclerConnected, setRecyclerConnected] = useState(false);
  const [loadingRecycler, setLoadingRecycler] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'saved'>('idle');
  const hasMounted = useRef(false);

  // 1. Subscribe to active session for current branch
  useEffect(() => {
    if (!isOpen || !companyId || !branchId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "companies", companyId, "cash_sessions"),
      where("status", "==", "open"),
      where("locationId", "==", branchId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        // Get the first active session for this branch
        const sess = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setActiveSession(sess);
      } else {
        setActiveSession(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to active cash session:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, companyId, branchId]);

  // 2. Subscribe to transactions for the active session
  useEffect(() => {
    if (!companyId || !activeSession?.id) {
      setTransactions([]);
      return;
    }

    const q = query(
      collection(db, "companies", companyId, "cash_transactions"),
      where("sessionId", "==", activeSession.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      // Sort in memory by createdAt desc (or timestamp) since compound query would require complex indexes
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTransactions(docs);
    }, (error) => {
      console.error("Error listening to transactions:", error);
    });

    return () => unsubscribe();
  }, [companyId, activeSession?.id]);

  // 3. Listen to sales (remisiones) since shift open in real-time
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
        console.error("Error computing sales from Firestore in modal:", err);
      } finally {
        setIsFetchingErp(false);
        setIsFetchingDailySales(false);
      }
    }, (error) => {
      console.error("Error listening to remisiones in CajaModal:", error);
      setIsFetchingErp(false);
      setIsFetchingDailySales(false);
    });

    return () => unsubscribe();
  }, [companyId, activeSession?.id, activeSession?.openedAt, activeSession?.locationId]);

  // Recycler connection check
  useEffect(() => {
    if (!isOpen || !activeSession) return;
    const checkConnection = async () => {
      try {
        const ping = await fetch("http://localhost:3001/api/status", { signal: AbortSignal.timeout(1000) });
        if (ping.ok) {
          setRecyclerConnected(true);
        } else {
          setRecyclerConnected(false);
        }
      } catch (e) {
        setRecyclerConnected(false);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [isOpen, activeSession]);

  // Fetch count from recycler
  const handleLoadFromRecycler = async () => {
    setLoadingRecycler(true);
    try {
      const res = await fetch("http://localhost:3001/api/system");
      if (!res.ok) throw new Error("Error fetching system info");
      const systemData = await res.json();
      if (systemData.paymentDevices) {
        const newCounts: Record<string, number> = {};
        systemData.paymentDevices.forEach((device: any) => {
          if (device.denominations) {
            device.denominations.forEach((denom: any) => {
              if (denom.enabled && denom.storedLevel !== undefined) {
                const valPesos = denom.value / 100;
                newCounts[valPesos.toString()] = denom.storedLevel;
              }
            });
          }
        });
        setLiveCounts(newCounts);
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo obtener el inventario del Reciclador de Efectivo.");
    } finally {
      setLoadingRecycler(false);
    }
  };

  // Populate live counts initially when modal opens or session loads
  useEffect(() => {
    if (!isOpen) {
      hasMounted.current = false;
      return;
    }
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
  }, [activeSession, isOpen]);

  // Auto-sync counts to Firestore
  useEffect(() => {
     if (!activeSession?.id || !hasMounted.current || !isOpen) return;
     
     setSyncStatus("syncing");
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
            setSyncStatus("saved");
            setTimeout(() => setSyncStatus("idle"), 2000);
         } catch(err) {
            console.error("Sync live audit err in modal:", err);
         }
     }, 1500);

     return () => clearTimeout(timerId);
  }, [liveCounts, liveCardSales, activeSession?.id, isOpen, companyId]);

  const handleLiveCountChange = (valStr: string, qtyStr: string) => {
    const qty = parseInt(qtyStr, 10) || 0;
    setLiveCounts(prev => ({ ...prev, [valStr]: Math.max(0, qty) }));
  };

  // Financial Computations for summary card display
  const totalFondo = activeSession?.initialFloat || 0;
  const totalIngresos = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
  const totalCancelaciones = transactions.filter(t => t.type === "EXPENSE" && t.category === "RETIRO_CANCELACION").reduce((acc, t) => acc + t.amount, 0);
  const totalRetiros = transactions.filter(t => t.type === "EXPENSE" && t.category !== "RETIRO_CANCELACION").reduce((acc, t) => acc + t.amount, 0);
  const estimatedCashSales = Math.max(0, bindSales - totalCancelaciones);
  const expectedCash = totalFondo + totalIngresos + estimatedCashSales - totalRetiros;

  // Real physical counted cash
  const countedCash = DENOMINATIONS.reduce((acc, denom) => {
    const qty = liveCounts[denom.value.toString()] || 0;
    return acc + (qty * denom.value);
  }, 0);

  const liveDiscrepancy = countedCash - expectedCash;

  const fmt = (val: number) => val.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Banknote className="h-6 w-6 text-primary" />
              Control de Caja
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeSession ? (
            /* Active Shift Operations View */
            <div className="space-y-6 py-2">
              <div className="flex border-b gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('resumen')}
                  className={`pb-2 px-1 font-bold text-sm border-b-2 transition-all ${
                    activeTab === 'resumen'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Resumen y Movimientos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('arqueo')}
                  className={`pb-2 px-1 font-bold text-sm border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === 'arqueo'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Arqueo en Vivo / Reciclador
                  {recyclerConnected && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />}
                </button>
              </div>

              {activeTab === 'resumen' ? (
                <>
                  <div className="bg-muted/30 border border-border/80 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse"></span>
                        <h3 className="font-bold text-lg text-foreground">Turno Activo</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {activeSession.openedByEmail}</span>
                        <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {activeSession.locationName || "Sin Sucursal"}</span>
                        <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {activeSession.openedAt?.seconds ? new Date(activeSession.openedAt.seconds * 1000).toLocaleString('es-MX') : 'Reciente'}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">Ventas del Día</p>
                      <p className="text-2xl font-extrabold text-foreground">
                        {totalDailySales !== null ? fmt(totalDailySales) : "..."}
                      </p>
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-700 font-semibold select-none mt-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Sincronizado
                      </div>
                    </div>
                  </div>

                  {/* Financial calculations */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-card border rounded-lg p-3.5 shadow-sm">
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Fondo Inicial</p>
                      <p className="text-lg font-bold text-foreground mt-0.5">{fmt(totalFondo)}</p>
                    </div>
                    <div className="bg-card border rounded-lg p-3.5 shadow-sm">
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Ingresos Manuales</p>
                      <p className="text-lg font-bold text-green-600 mt-0.5">+ {fmt(totalIngresos)}</p>
                    </div>
                    <div className="bg-card border rounded-lg p-3.5 shadow-sm">
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Salidas / Retiros</p>
                      <p className="text-lg font-bold text-destructive mt-0.5">- {fmt(totalRetiros)}</p>
                    </div>
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3.5 shadow-sm">
                      <p className="text-xs text-primary uppercase font-bold">Esperado en Caja</p>
                      <p className="text-lg font-extrabold text-primary mt-0.5">{fmt(expectedCash)}</p>
                    </div>
                  </div>

                  {/* Movements history */}
                  <div className="border rounded-lg overflow-hidden bg-card">
                    <div className="p-3 border-b bg-muted/20 flex items-center justify-between">
                      <h4 className="font-semibold text-sm">Movimientos Recientes de Caja</h4>
                      <div className="flex gap-2">
                        <Button onClick={() => setIsTxModalOpen(true)} size="sm" variant="outline" className="h-8 text-xs font-semibold px-2.5 py-1">
                          <Plus className="w-3.5 h-3.5 mr-1" /> Movimiento
                        </Button>
                      </div>
                    </div>

                    <div className="max-h-[220px] overflow-y-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-muted text-muted-foreground uppercase text-[10px] sticky top-0">
                          <tr>
                            <th className="px-3 py-2">Hora</th>
                            <th className="px-3 py-2">Categoría</th>
                            <th className="px-3 py-2">Persona</th>
                            <th className="px-3 py-2 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {transactions.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground italic">
                                No hay movimientos manuales en este turno.
                              </td>
                            </tr>
                          ) : (
                            transactions.map((tx) => (
                              <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                  {tx.createdAt?.seconds ? new Date(tx.createdAt.seconds * 1000).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'}) : '...'}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${tx.type === 'INCOME' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {tx.category.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-medium truncate max-w-[120px]" title={tx.person}>{tx.person}</td>
                                <td className={`px-3 py-2 text-right font-semibold ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                                  {tx.type === 'INCOME' ? '+' : '-'}{fmt(tx.amount)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                /* Live Audit/Recycler View */
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-base text-foreground">Inventario en Vivo de Caja</h3>
                      {recyclerConnected && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleLoadFromRecycler}
                          disabled={loadingRecycler}
                          className="border-indigo-500/30 text-indigo-600 hover:bg-indigo-50 font-bold text-xs gap-1.5 h-8 px-2.5 rounded-md"
                        >
                          {loadingRecycler ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Escaneando...
                            </>
                          ) : (
                            "Escanear Reciclador"
                          )}
                        </Button>
                      )}
                    </div>
                    {syncStatus === 'syncing' && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Sincronizando...</span>}
                    {syncStatus === 'saved' && <span className="text-xs text-green-600 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3 h-3"/> Guardado en Firestore</span>}
                  </div>

                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {DENOMINATIONS.map((denom) => {
                          const qty = liveCounts[denom.value.toString()] || '';
                          return (
                            <div key={denom.value} className="flex items-center gap-2 border p-2 rounded bg-muted/20">
                              <span className="text-xs font-semibold w-12 text-muted-foreground whitespace-nowrap">{denom.label}</span>
                              <Input
                                type="number"
                                min="0"
                                placeholder="0"
                                className="h-7 text-center flex-1 px-1 bg-background"
                                value={qty}
                                onChange={(e) => handleLiveCountChange(denom.value.toString(), e.target.value)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className={`md:w-56 p-4 rounded-lg border flex flex-col justify-center items-center shadow-sm shrink-0 transition-colors ${Math.abs(liveDiscrepancy) > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-green-500/10 border-green-500/30'}`}>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 text-center">Efectivo Físico Contado</p>
                      <p className="text-2xl font-black mb-3">{fmt(countedCash)}</p>
                      
                      <div className="border-t border-foreground/10 pt-3 text-center w-full">
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Descuadre Actual</p>
                        <p className={`text-lg font-bold ${liveDiscrepancy === 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {liveDiscrepancy === 0 ? 'CUADRADO' : `${liveDiscrepancy > 0 ? '+' : ''}${fmt(liveDiscrepancy)}`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions footer */}
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center border-t pt-4">
                <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto text-slate-500 font-semibold hover:bg-slate-100 rounded-lg">
                  Cerrar Ventana
                </Button>
                <Button 
                  onClick={() => setIsClosingModalOpen(true)} 
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-5 rounded-lg shadow-md hover:shadow-lg transition-all gap-2"
                >
                  Realizar Arqueo y Cerrar Turno <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            /* Open Shift Form View */
            <div className="py-2 animate-in fade-in">
              <AbrirTurnoForm
                defaultLocationId={branchId}
                onOpened={(session) => {
                  setActiveSession(session);
                }}
                onCancel={onClose}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Embedded Sub-Modals (rendering only when session is loaded) */}
      {activeSession && (
        <>
          <TransaccionCajaModal
            isOpen={isTxModalOpen}
            onClose={() => setIsTxModalOpen(false)}
            sessionId={activeSession.id}
            onSuccess={() => {}}
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
              onClose(); // Automatically close POS drawer control after closing shift
            }}
          />
        </>
      )}
    </>
  );
}
