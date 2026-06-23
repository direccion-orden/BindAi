"use client";

import { useState, useEffect } from "react";
import { doc, updateDoc, serverTimestamp, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const DENOMINATIONS = [
  { value: 1000, label: "Billetes de $1000" },
  { value: 500, label: "Billetes de $500" },
  { value: 200, label: "Billetes de $200" },
  { value: 100, label: "Billetes de $100" },
  { value: 50, label: "Billetes de $50" },
  { value: 20, label: "Billetes de $20" },
  { value: 10, label: "Monedas de $10" },
  { value: 5, label: "Monedas de $5" },
  { value: 2, label: "Monedas de $2" },
  { value: 1, label: "Monedas de $1" },
  { value: 0.5, label: "Monedas de 50¢" },
];

export function CerrarTurnoModal({ 
  isOpen, 
  onClose, 
  session, 
  transactions,
  initialCounts,
  initialCardSales,
  onClosed 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  session: any;
  transactions: any[];
  initialCounts?: Record<string, number>;
  initialCardSales?: string;
  onClosed: () => void;
}) {
  const { user, companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [cardSales, setCardSales] = useState(initialCardSales || "");
  const [recyclerConnected, setRecyclerConnected] = useState(false);
  const [loadingRecycler, setLoadingRecycler] = useState(false);
  
  // Bind Sales
  const [bindSales, setBindSales] = useState(0);
  const [fetchingBind, setFetchingBind] = useState(false);

  // Denomination counts
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts || {});

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const ping = await fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(1000) });
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
  }, []);

  const handleLoadFromRecycler = async () => {
    setLoadingRecycler(true);
    try {
      const res = await fetch('http://localhost:3001/api/system');
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
        setCounts(newCounts);
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo obtener el inventario del Reciclador de Efectivo.");
    } finally {
      setLoadingRecycler(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCounts(initialCounts || {});
      setCardSales(initialCardSales || "");
      setStep(1);
    }
  }, [isOpen, initialCounts, initialCardSales]);

  // Listen to sales (remisiones) since shift open in real-time
  useEffect(() => {
    if (!isOpen || !companyId || !session?.openedAt || !session?.locationId) {
      setBindSales(0);
      return;
    }

    setFetchingBind(true);
    let dateObj;
    if (session.openedAt?.seconds) {
      dateObj = new Date(session.openedAt.seconds * 1000);
    } else if (session.openedAt?.toDate) {
      dateObj = session.openedAt.toDate();
    } else {
      dateObj = new Date(session.openedAt);
    }
    const openedAtIso = dateObj.toISOString();

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
          rem.locationId === session.locationId && 
          rem.status === "activa"
        );

        // Sum total overall sales
        let totalSales = 0;
        filtered.forEach((rem: any) => {
          totalSales += rem.totalAmount || rem.financials?.total || 0;
        });
        setBindSales(totalSales);
      } catch (err) {
        console.error("Error computing sales totals in CerrarTurnoModal:", err);
      } finally {
        setFetchingBind(false);
      }
    }, (error) => {
      console.error("Error listening to remisiones in CerrarTurnoModal:", error);
      setFetchingBind(false);
    });

    return () => unsubscribe();
  }, [isOpen, companyId, session?.id, session?.openedAt, session?.locationId]);

  // Derived financial computations
  const totalFondo = session?.initialFloat || 0;
  const totalIngresosManuales = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + t.amount, 0);
  const totalRetirosManuales = transactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);

  const cardVouchers = parseFloat(cardSales) || 0;
  const estimatedCashSales = Math.max(0, bindSales - cardVouchers);

  const expectedCash = totalFondo + totalIngresosManuales - totalRetirosManuales + estimatedCashSales;

  // Real physical counted cash
  const countedCash = DENOMINATIONS.reduce((acc, denom) => {
    const qty = counts[denom.value.toString()] || 0;
    return acc + (qty * denom.value);
  }, 0);

  const discrepancy = countedCash - expectedCash; // positive = sobrante, negative = faltante

  const handleCountChange = (valStr: string, qtyStr: string) => {
    const qty = parseInt(qtyStr, 10) || 0;
    setCounts(prev => ({ ...prev, [valStr]: Math.max(0, qty) }));
  };

  const handleCloseShift = async () => {
    if (!confirm("Atención: El arqueo final será registrado y el turno cerrado. Los descuadres no podrán modificarse. ¿Confirmas el cierre?")) {
      return;
    }

    setLoading(true);
    try {
      if (!companyId) return;
      const sessionRef = doc(db, "companies", companyId, "cash_sessions", session.id);
      await updateDoc(sessionRef, {
        status: "closed",
        closedAt: serverTimestamp(),
        closedByEmail: user?.email,
        closedByUid: user?.uid,
        bindTotalSales: bindSales,
        cardTotalSales: cardVouchers,
        expectedCash: expectedCash,
        countedCash: countedCash,
        discrepancy: discrepancy,
        closingDenominations: counts
      });
      onClosed();
    } catch (error) {
      console.error(error);
      alert("Error al cerrar el turno");
    } finally {
      setLoading(false);
    }
  };

  const fmt = (val: number) => val.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Arqueo y Cierre de Turno</DialogTitle>
          <DialogDescription>
            Concilia el efectivo real en la caja para finalizar el turno operativo de hoy.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6 py-4">
            <div className="bg-muted/50 p-4 rounded-lg flex flex-col sm:flex-row gap-4 items-center justify-between border">
               <div>
                 <p className="text-sm text-muted-foreground">Ventas Totales en Bind ERP (Desde apertura)</p>
                 <div className="flex items-center gap-2">
                    {fetchingBind ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    <p className="text-2xl font-bold text-foreground">{fmt(bindSales)}</p>
                 </div>
               </div>
               <div className="text-center sm:text-right">
                 <p className="text-xs text-muted-foreground mb-1">Para aislar el efectivo,<br/> ingresa el total cobrado por terminal:</p>
                 <div className="flex items-center gap-2">
                    <span className="text-lg font-medium text-muted-foreground">-</span>
                    <Input 
                      type="number" 
                      placeholder="Total Vouchers"
                      value={cardSales}
                      onChange={(e) => setCardSales(e.target.value)}
                      className="w-32 text-right"
                    />
                 </div>
               </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg bg-card">
               <div>
                  <p className="text-xs text-muted-foreground uppercase">Fondo</p>
                  <p className="font-semibold text-primary">{fmt(totalFondo)}</p>
               </div>
               <div>
                  <p className="text-xs text-muted-foreground uppercase">+ Ingresos Manuales</p>
                  <p className="font-semibold text-green-600">{fmt(totalIngresosManuales)}</p>
               </div>
               <div>
                  <p className="text-xs text-muted-foreground uppercase">- Retiros Manuales</p>
                  <p className="font-semibold text-red-600">{fmt(totalRetirosManuales)}</p>
               </div>
               <div>
                  <p className="text-xs text-muted-foreground uppercase">+ Efectivo x Ventas</p>
                  <p className="font-semibold text-green-600">{fmt(estimatedCashSales)}</p>
               </div>
            </div>

            <div className="flex items-center justify-between bg-primary/10 p-5 rounded-lg border border-primary/20">
               <div>
                 <h4 className="text-lg font-bold text-primary">Efectivo Esperado en Caja</h4>
                 <p className="text-sm text-primary/80">Esta cantidad es lo que el sistema espera matemáticamente</p>
               </div>
               <div className="text-3xl font-black text-primary">
                 {fmt(expectedCash)}
               </div>
            </div>
            
            <DialogFooter>
               <Button onClick={() => setStep(2)}>Siguiente: Conteo Ciego</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 py-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-lg">Arqueo Físico de Billetes y Monedas</h3>
              {recyclerConnected && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLoadFromRecycler}
                  disabled={loadingRecycler}
                  className="border-indigo-500/30 text-indigo-600 hover:bg-indigo-50 font-bold text-xs gap-1.5 h-8"
                >
                  {loadingRecycler ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Arqueando...
                    </>
                  ) : (
                    "Arqueo Automático (Reciclador)"
                  )}
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-rows-6 md:grid-flow-col gap-x-8 gap-y-3 pl-2">
              {DENOMINATIONS.map((denom) => {
                const qty = counts[denom.value.toString()] || '';
                const subtotal = (Number(qty) * denom.value) || 0;
                return (
                  <div key={denom.value} className="flex items-center gap-3">
                    <div className="w-32 text-sm font-medium text-muted-foreground whitespace-nowrap">
                      {denom.label}
                    </div>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      className="w-20 h-8 text-center"
                      value={qty}
                      onChange={(e) => handleCountChange(denom.value.toString(), e.target.value)}
                    />
                    <div className="text-sm text-foreground font-medium w-20 text-right">
                      {fmt(subtotal)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`p-5 rounded-lg border flex flex-col sm:flex-row items-center justify-between shadow-sm transition-colors ${Math.abs(discrepancy) > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-green-500/10 border-green-500/30'}`}>
               <div className="text-center sm:text-left mb-4 sm:mb-0">
                 <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Total Físico Contado</p>
                 <p className="text-3xl font-black">{fmt(countedCash)}</p>
               </div>
               
               <div className="text-center sm:text-right border-t sm:border-t-0 sm:border-l pt-4 sm:pt-0 sm:pl-6 border-foreground/10">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Diferencia / Descuadre</p>
                  <p className={`text-2xl font-bold ${discrepancy === 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {discrepancy === 0 ? '¡CAJA CUADRADA!' : `${discrepancy > 0 ? 'SOBRANTE +' : 'FALTANTE '}${fmt(discrepancy)}`}
                  </p>
               </div>
            </div>

            <DialogFooter className="flex items-center sm:justify-between w-full">
               <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
                 Volver
               </Button>
               <Button variant={discrepancy === 0 ? 'default' : 'destructive'} onClick={handleCloseShift} disabled={loading} className="gap-2">
                 {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                 Confirmar Arqueo y Cerrar Caja
               </Button>
            </DialogFooter>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
