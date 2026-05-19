"use client";

import { useState } from "react";
import { collection, doc, getDoc, updateDoc, increment, addDoc, serverTimestamp, query, getDocs, where, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { X, Search, Loader2, RotateCcw, CheckCircle2, Banknote, CreditCard, Wallet, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DenominationCapture, DenominationCounts } from "@/components/pos/DenominationCapture";

interface ReturnsModalProps {
  onClose: () => void;
}

export function ReturnsModal({ onClose }: ReturnsModalProps) {
  const { user, companyId } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [sale, setSale] = useState<any>(null);
  const [error, setError] = useState("");

  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<'efectivo' | 'tarjeta' | 'saldoFavor' | null>(null);
  const [denominationsOut, setDenominationsOut] = useState<DenominationCounts>({});
  
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    setError("");
    setSale(null);
    setSearchResults([]);
    setReturnQuantities({});
    setRefundMethod(null);

    try {
      const term = searchTerm.trim().toLowerCase();
      
      if (!companyId) throw new Error("No company ID");
      
      // Intentar búsqueda directa por ID si parece un ID de Firebase válido (sin espacios y largo)
      if (term.length > 15 && !term.includes(" ")) {
        const saleRef = doc(db, "companies", companyId, "sales", searchTerm.trim());
        const saleSnap = await getDoc(saleRef);
        
        if (saleSnap.exists()) {
          setSale({ id: saleSnap.id, ...saleSnap.data() });
          setLoading(false);
          return;
        }
      }

      // Intentar búsqueda directa por Folio Consecutivo (si es puramente numérico)
      if (/^\d+$/.test(term)) {
        const folioQuery = query(collection(db, "companies", companyId, "sales"), where("folio", "==", term));
        const folioSnap = await getDocs(folioQuery);
        
        if (!folioSnap.empty) {
          setSale({ id: folioSnap.docs[0].id, ...folioSnap.docs[0].data() });
          setLoading(false);
          return;
        }
      }

      // Si no es un ID/Folio directo o no se encontró, buscar en los últimos 100 tickets por cliente
      const q = query(collection(db, "companies", companyId, "sales"), orderBy("createdAt", "desc"), limit(100));
      const snap = await getDocs(q);
      
      const matches = snap.docs.map(d => ({ id: d.id, ...d.data() }) as any).filter(s => {
         const name = (s.client?.name || "").toLowerCase();
         const email = (s.client?.email || "").toLowerCase();
         const phone = (s.client?.phone || "");
         return s.folio === term || s.id.toLowerCase() === term || name.includes(term) || email.includes(term) || phone.includes(term);
      });

      if (matches.length === 0) {
        setError("No se encontraron ventas para esta búsqueda en los registros recientes.");
      } else if (matches.length === 1) {
        setSale(matches[0]);
      } else {
        setSearchResults(matches);
      }
    } catch (err) {
      console.error(err);
      setError("Error al buscar las ventas.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResult = (selectedSale: any) => {
    setSearchResults([]);
    setSale(selectedSale);
  };

  const handleQtyChange = (itemId: string, maxQty: number, val: string) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 0) return;
    if (qty > maxQty) return;

    setReturnQuantities(prev => ({
      ...prev,
      [itemId]: qty
    }));
  };

  // Calculate refund amount
  let totalRefund = 0;
  if (sale) {
    sale.items.forEach((item: any) => {
      const returning = returnQuantities[item.id] || 0;
      const finalPrice = item.unitPrice * (1 - (item.discountPercentage || 0) / 100);
      totalRefund += returning * finalPrice;
    });
    // Add tax
    totalRefund = totalRefund * 1.16;
  }

  const handleProcessReturn = async () => {
    if (totalRefund <= 0) {
      alert("Debes seleccionar al menos un artículo para devolver.");
      return;
    }
    if (!refundMethod) {
      alert("Selecciona un método de reembolso.");
      return;
    }

    if (refundMethod === 'efectivo') {
      const denomSum = Object.entries(denominationsOut).reduce((acc, [k, v]) => acc + parseFloat(k) * (v || 0), 0);
      if (Math.abs(denomSum - totalRefund) > 0.01) {
        alert(`Las denominaciones ($${denomSum}) no coinciden con el monto a devolver ($${totalRefund}).`);
        return;
      }
    }

    setProcessing(true);
    try {
      // 1. Actualizar Venta Original
      const updatedItems = sale.items.map((item: any) => {
        const returning = returnQuantities[item.id] || 0;
        return {
          ...item,
          returnedQuantity: (item.returnedQuantity || 0) + returning
        };
      });

      if (!companyId) throw new Error("No company ID");
      const saleRef = doc(db, "companies", companyId, "sales", sale.id);
      await updateDoc(saleRef, {
        items: updatedItems,
        "financials.refundedAmount": increment(totalRefund),
        status: totalRefund >= sale.financials.total ? 'refunded' : 'partially_refunded'
      });

      // 2. Afectar Inventario
      for (const item of sale.items) {
        const returning = returnQuantities[item.id] || 0;
        if (returning > 0) {
          const productRef = doc(db, "companies", companyId, "products", item.id);
          const pSnap = await getDoc(productRef);
          if (pSnap.exists()) {
             await updateDoc(productRef, {
               bindCurrentInventory: increment(returning)
             });
          }
        }
      }

      // 3. Método de Reembolso
      if (refundMethod === 'efectivo') {
        let sessionId = null;
        
        // Find open session for the sale's branch
        const sessionQuery = query(
          collection(db, "companies", companyId, "cash_sessions"),
          where("status", "==", "open"),
          where("locationId", "==", sale.branchId)
        );
        const sessionSnap = await getDocs(sessionQuery);
        
        if (!sessionSnap.empty) {
          sessionId = sessionSnap.docs[0].id;
        } else {
          // Fallback
          const fallbackQuery = query(collection(db, "companies", companyId, "cash_sessions"), where("status", "==", "open"));
          const fallbackSnap = await getDocs(fallbackQuery);
          if (!fallbackSnap.empty) {
              sessionId = fallbackSnap.docs[0].id;
          }
        }

        if (sessionId) {
          await addDoc(collection(db, "companies", companyId, "cash_transactions"), {
            sessionId,
            type: "EXPENSE",
            category: "RETIRO_CANCELACION",
            amount: totalRefund,
            reference: `Devolución Ticket ${sale.id}`,
            paymentMethod: "CASH",
            denominations: denominationsOut,
            createdAt: serverTimestamp(),
            createdBy: user?.email,
          });
        } else {
           throw new Error("No hay un turno de caja abierto para registrar la salida de efectivo.");
        }
      } else if (refundMethod === 'saldoFavor' && sale.client?.id) {
        const clientRef = doc(db, "companies", companyId, "clients", sale.client.id);
        await updateDoc(clientRef, {
          walletBalance: increment(totalRefund)
        });
      }

      setSuccess(true);

    } catch (err) {
      console.error(err);
      alert("Error al procesar la devolución.");
    } finally {
      setProcessing(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border rounded-xl shadow-xl w-full max-w-md p-8 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Devolución Exitosa</h2>
            <p className="text-muted-foreground">Se ha procesado el reembolso por {formatMoney(totalRefund)}.</p>
            <Button className="w-full mt-4" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-4">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row animate-in fade-in zoom-in duration-200 max-h-screen">
        
        {/* Panel Izquierdo: Búsqueda y Detalles */}
        <div className="w-full md:w-1/2 bg-muted/30 p-6 border-b md:border-b-0 md:border-r flex flex-col overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2"><RotateCcw className="w-5 h-5"/> Devoluciones</h2>
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-full md:hidden"><X className="w-5 h-5"/></button>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2 mb-6 shrink-0">
            <Input 
              placeholder="ID de Ticket, Nombre, Teléfono o Correo..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="bg-background"
              autoFocus
            />
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </form>

          {error && <p className="text-destructive text-sm bg-destructive/10 p-3 rounded mb-4 shrink-0">{error}</p>}

          {searchResults.length > 0 && (
            <div className="space-y-2 flex-1 overflow-y-auto">
              <p className="font-semibold text-sm mb-2">Ventas Recientes Encontradas</p>
              {searchResults.map(res => (
                <div 
                  key={res.id} 
                  onClick={() => handleSelectResult(res)}
                  className="bg-background border rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors group"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-primary">{formatMoney(res.financials.total)}</span>
                    <span className="text-xs text-muted-foreground">{res.createdAt?.toDate().toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span className="truncate">{res.client?.name || "Público en General"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 uppercase">ID: {res.id}</p>
                </div>
              ))}
            </div>
          )}

          {sale && (
            <div className="space-y-4 flex-1">
              <div className="bg-background p-4 rounded-lg border">
                <p className="text-sm font-semibold mb-1">Detalles de Venta</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Cliente: {sale.client?.name || "Público en General"}</p>
                  <p>Fecha: {sale.createdAt?.toDate().toLocaleString()}</p>
                  <p>Total Original: {formatMoney(sale.financials.total)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-sm">Artículos para Devolver</p>
                {sale.items.map((item: any) => {
                  const alreadyReturned = item.returnedQuantity || 0;
                  const availableToReturn = item.quantity - alreadyReturned;
                  const returning = returnQuantities[item.id] || 0;

                  return (
                    <div key={item.id} className="bg-background border rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium leading-tight">{item.title}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{formatMoney(item.unitPrice)} c/u</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-muted-foreground">Disponibles: {availableToReturn}</span>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold">Devolver:</label>
                          <Input 
                            type="number" 
                            min="0" 
                            max={availableToReturn} 
                            value={returning === 0 ? "" : returning}
                            onChange={(e) => handleQtyChange(item.id, availableToReturn, e.target.value)}
                            className="w-16 h-7 text-xs text-center"
                            disabled={availableToReturn === 0}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Panel Derecho: Reembolso */}
        <div className="w-full md:w-1/2 p-6 flex flex-col relative overflow-y-auto custom-scrollbar bg-background">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full hidden md:block text-muted-foreground">
              <X className="w-5 h-5"/>
          </button>

          {!sale ? (
            <div className="flex-1 flex items-center justify-center text-center p-6 text-muted-foreground">
              Busca un ticket para comenzar.
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-6 text-center mb-6">
                <p className="text-sm font-semibold uppercase text-muted-foreground mb-1">Monto a Reembolsar</p>
                <p className="text-4xl font-black text-primary">{formatMoney(totalRefund)}</p>
              </div>

              {totalRefund > 0 && (
                <>
                  <h3 className="font-semibold mb-4 text-muted-foreground">Método de Reembolso</h3>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                      <button 
                        onClick={() => setRefundMethod('efectivo')}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${refundMethod === 'efectivo' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                      >
                          <Banknote className="w-6 h-6 mb-2" />
                          <span className="text-xs font-semibold">Efectivo</span>
                      </button>
                      <button 
                        onClick={() => setRefundMethod('tarjeta')}
                        className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${refundMethod === 'tarjeta' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                      >
                          <CreditCard className="w-6 h-6 mb-2" />
                          <span className="text-xs font-semibold">Tarjeta</span>
                      </button>
                      {sale.client?.id && sale.client.id !== 'public' && (
                        <button 
                          onClick={() => setRefundMethod('saldoFavor')}
                          className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${refundMethod === 'saldoFavor' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'}`}
                        >
                            <Wallet className="w-6 h-6 mb-2" />
                            <span className="text-xs font-semibold text-center leading-tight">Monedero</span>
                        </button>
                      )}
                  </div>

                  {refundMethod === 'efectivo' && (
                    <div className="mb-6 animate-in fade-in zoom-in">
                      <p className="text-xs text-muted-foreground mb-2">Captura los billetes/monedas que vas a retirar de la caja.</p>
                      <DenominationCapture 
                        title="Billetes a Entregar"
                        onChange={(sum, denoms) => setDenominationsOut(denoms)}
                      />
                    </div>
                  )}

                  {refundMethod === 'tarjeta' && (
                    <p className="text-sm text-muted-foreground mb-6 text-center border p-4 rounded bg-muted/20">
                      Debes procesar la devolución manualmente en tu Terminal Bancaria.
                    </p>
                  )}

                  {refundMethod === 'saldoFavor' && (
                    <p className="text-sm text-blue-700 mb-6 text-center border border-blue-200 p-4 rounded bg-blue-50 font-medium">
                      El monto se añadirá como Saldo a Favor al cliente {sale.client.name}.
                    </p>
                  )}

                  <div className="mt-auto pt-4">
                    <Button 
                      size="lg" 
                      className="w-full h-14 text-lg font-bold"
                      disabled={!refundMethod || processing}
                      onClick={handleProcessReturn}
                    >
                        {processing && <Loader2 className="w-5 h-5 animate-spin mr-2"/>}
                        Procesar Devolución
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
