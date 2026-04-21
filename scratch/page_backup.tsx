"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AbrirTurnoForm } from "@/components/caja/AbrirTurnoForm";
import { TransaccionCajaModal } from "@/components/caja/TransaccionCajaModal";
import { CerrarTurnoModal } from "@/components/caja/CerrarTurnoModal";

export default function CajaPage() {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => {
    async function fetchSession() {
      if (!user) return;
      try {
        const q = query(
          collection(db, "cash_sessions"),
          where("status", "==", "open"),
          limit(1)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setActiveSession({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
        } else {
          setActiveSession(null);
        }
      } catch (error) {
        console.error("Error fetching session:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [user]);

  useEffect(() => {
    async function fetchClosedSessions() {
      if (!user) return;
      try {
        const q = query(
          collection(db, "cash_sessions"), 
          where("status", "==", "closed")
        );
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
        docs.sort((a, b) => (b.closedAt?.seconds || 0) - (a.closedAt?.seconds || 0));
        setClosedSessions(docs.slice(0, 10));
      } catch (error) {
        console.error("Error fetching history:", error);
      }
    }
    fetchClosedSessions();
  }, [user, activeSession]);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [erpCashSales, setErpCashSales] = useState(0);
  const [isFetchingErp, setIsFetchingErp] = useState(false);
  
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closedSessions, setClosedSessions] = useState<any[]>([]);

  const fetchTransactions = async (sessionId: string) => {
    const q = query(collection(db, "cash_transactions"), where("sessionId", "==", sessionId));
    const snapshot = await getDocs(q);
    // Sort client-side if no index is available yet
    const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setTransactions(docs);
  };

  const fetchErpCashSales = async (openedAt: any) => {
    if (!openedAt) return;
    setIsFetchingErp(true);
    try {
      const date = new Date(openedAt.seconds * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const res = await fetch(`/api/erp/cash-sales?date=${dateStr}`);
      if (res.ok) {
         const data = await res.json();
         setErpCashSales(data.totalCashSales || 0);
      }
    } catch (e) {
      console.error("Failed to fetch ERP Cash Sales", e);
    } finally {
      setIsFetchingErp(false);
    }
  }

  useEffect(() => {
    if (activeSession?.id) {
      fetchTransactions(activeSession.id);
      fetchErpCashSales(activeSession.openedAt);
    }
  }, [activeSession?.id, activeSession?.openedAt]);

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
  const totalRetiros = transactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + t.amount, 0);
  
  const expectedCash = totalFondo + totalIngresos + erpCashSales - totalRetiros;

  const handleTxSuccess = () => {
    if (activeSession) fetchTransactions(activeSession.id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Control de Caja</h1>
        <p className="text-muted-foreground">
          Gestión del fondo, arqueos de ingresos por venta y retiros.
        </p>
      </div>

      {activeSession ? (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-card border rounded-lg p-6 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></span>
                Turno Abierto
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Responsable: <span className="font-medium text-foreground">{activeSession.openedByEmail}</span></p>
              <p className="text-sm text-muted-foreground mt-1">Sucursal: <span className="font-medium text-foreground">{activeSession.locationName || 'Nacional'}</span></p>
              <p className="text-xs text-muted-foreground mt-1">Apertura: {activeSession.openedAt?.seconds ? new Date(activeSession.openedAt.seconds * 1000).toLocaleString('es-MX') : 'Reciente'}</p>
            </div>
            <div className="text-right">
               <p className="text-sm text-muted-foreground">Fondo Inicial</p>
               <p className="text-3xl font-bold text-primary">
                 {totalFondo.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
               </p>
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
                <p className="text-sm text-muted-foreground flex justify-between whitespace-nowrap">Ventas Efectivo (Bind) {isFetchingErp && <Loader2 className="w-4 h-4 animate-spin text-primary"/>}</p>
                <p className="text-2xl font-bold text-foreground">
                 + {erpCashSales.toLocaleString('es-MX', {style:'currency', currency:'MXN'})}
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
            onClosed={() => {
               setIsClosingModalOpen(false);
               setActiveSession(null); // Return to default page state
            }}
          />
        </div>
      ) : isOpening ? (
        <div className="bg-card border rounded-lg p-6 shadow-sm">
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

          {closedSessions.length > 0 && (
            <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                <h3 className="font-semibold text-lg text-muted-foreground">Historial de Turnos</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">Cierre</th>
                      <th className="px-4 py-3 font-medium">Responsable</th>
                      <th className="px-4 py-3 font-medium text-right">Efectivo Real</th>
                      <th className="px-4 py-3 font-medium text-right">Descuadre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {closedSessions.map(sess => (
                      <tr key={sess.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium">
                          {sess.closedAt?.seconds ? new Date(sess.closedAt.seconds * 1000).toLocaleString('es-MX', {dateStyle: 'medium', timeStyle: 'short'}) : '...'}
                        </td>
                        <td className="px-4 py-3">{sess.closedByEmail}</td>
                        <td className="px-4 py-3 text-right">
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
          )}
        </div>
      )}
    </div>
  );
}
