"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { usePOS } from "@/context/POSContext";
import { Loader2, Plus, Banknote, RefreshCcw, User, Calendar, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AbrirTurnoForm } from "@/components/caja/AbrirTurnoForm";
import { TransaccionCajaModal } from "@/components/caja/TransaccionCajaModal";
import { CerrarTurnoModal } from "@/components/caja/CerrarTurnoModal";

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

  // Financial Computations for summary card display
  const totalFondo = activeSession?.initialFloat || 0;
  const totalIngresos = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
  const totalCancelaciones = transactions.filter(t => t.type === "EXPENSE" && t.category === "RETIRO_CANCELACION").reduce((acc, t) => acc + t.amount, 0);
  const totalRetiros = transactions.filter(t => t.type === "EXPENSE" && t.category !== "RETIRO_CANCELACION").reduce((acc, t) => acc + t.amount, 0);
  const estimatedCashSales = Math.max(0, bindSales - totalCancelaciones);
  const expectedCash = totalFondo + totalIngresos + estimatedCashSales - totalRetiros;

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

              {/* Actions footer */}
              <div className="flex flex-col sm:flex-row gap-3 justify-between items-center border-t pt-4">
                <Button variant="ghost" onClick={onClose}>
                  Cerrar Ventana
                </Button>
                <Button variant="default" size="default" onClick={() => setIsClosingModalOpen(true)} className="w-full sm:w-auto font-semibold">
                  Realizar Arqueo y Cerrar Turno <ArrowRight className="w-4 h-4 ml-1.5" />
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
