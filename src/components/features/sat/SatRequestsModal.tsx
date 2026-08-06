"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";

interface SatRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

const SAT_STATUS_MAP: Record<number, { label: string; icon: React.ElementType; color: string }> = {
  1: { label: "Aceptada", icon: CheckCircle2, color: "text-blue-600 bg-blue-50" },
  2: { label: "En Proceso", icon: Clock, color: "text-amber-600 bg-amber-50" },
  3: { label: "Terminada", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  4: { label: "Error", icon: AlertCircle, color: "text-rose-600 bg-rose-50" },
  5: { label: "Rechazada", icon: XCircle, color: "text-rose-600 bg-rose-50" },
  6: { label: "Vencida", icon: Clock, color: "text-gray-600 bg-gray-50" },
};

export function SatRequestsModal({ isOpen, onClose, companyId }: SatRequestsModalProps) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !companyId) return;

    setLoading(true);
    const q = query(
      collection(db, "companies", companyId, "sat_requests"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, companyId]);

  const verifyRequest = async (requestId: string) => {
    if (!companyId) return;
    setVerifyingId(requestId);

    try {
      const satDoc = await getDoc(doc(db, "companies", companyId, "credentials", "sat"));
      if (!satDoc.exists()) throw new Error("FIEL no configurada.");
      const fielData = satDoc.data();

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
      
      // Actualizar el documento en Firestore
      const requestRef = doc(db, "companies", companyId, "sat_requests", requestId);
      
      if (verRes.ok && verData.status === 'finished') {
        const newInvoices = verData.invoices?.length || 0;
        
        if (newInvoices > 0) {
          const batch = import("firebase/firestore").then(mod => mod.writeBatch(db));
          const b = await batch;
          verData.invoices.slice(0, 400).forEach((inv: any) => {
             const docRef = doc(db, "companies", companyId, "expenses_inbox", inv.uuid);
             b.set(docRef, inv);
          });
          await b.commit();
        }

        await setDoc(requestRef, {
          status: "finished",
          satCode: 3, // Terminada
          satMessage: "Descarga completada",
          invoicesCount: newInvoices,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
      } else if (verRes.ok && verData.status === 'rejected') {
        await setDoc(requestRef, {
          status: "rejected",
          satCode: verData.code ?? 5, // Rechazada
          satMessage: verData.message || "Solicitud rechazada",
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else if (verRes.ok && verData.status === 'pending') {
        await setDoc(requestRef, {
          satCode: verData.code ?? 1,
          satMessage: verData.message || "En proceso",
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

    } catch (error: any) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      setVerifyingId(null);
    }
  };

  const verifyAllPending = async () => {
    const pendingRequests = requests.filter(r => r.status === 'pending');
    for (const req of pendingRequests) {
        await verifyRequest(req.requestId);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">Estado de Solicitudes SAT</DialogTitle>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={verifyAllPending}
                disabled={verifyingId !== null || requests.filter(r => r.status === 'pending').length === 0}
            >
                <RefreshCw className={`w-4 h-4 mr-2 ${verifyingId ? 'animate-spin' : ''}`} />
                Verificar Pendientes
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : requests.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              No hay solicitudes previas registradas.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Fecha Solicitud</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Periodo</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Estatus SAT</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Facturas</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.map((req) => {
                  const satInfo = req.satCode ? SAT_STATUS_MAP[req.satCode] : null;
                  const Icon = satInfo?.icon || Clock;
                  const statusLabel = satInfo?.label || (req.status === 'pending' ? 'Pendiente' : req.status === 'finished' ? 'Terminada' : 'Rechazada');
                  const colorClass = satInfo?.color || (req.status === 'pending' ? 'text-amber-600 bg-amber-50' : req.status === 'finished' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50');

                  return (
                    <tr key={req.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {new Date(req.createdAt).toLocaleString('es-MX')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {req.start && req.end ? (
                          <span className="text-xs">{req.start.split('T')[0]} a {req.end.split('T')[0]}</span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold w-fit ${colorClass}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {statusLabel}
                          </span>
                          {req.satMessage && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={req.satMessage}>
                              {req.satMessage}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">
                        {req.status === 'finished' ? req.invoicesCount || 0 : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {req.status === 'pending' ? (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => verifyRequest(req.requestId)}
                            disabled={verifyingId === req.requestId}
                          >
                            {verifyingId === req.requestId ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ) : (
                              <RefreshCw className="w-4 h-4 text-muted-foreground hover:text-primary" />
                            )}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
