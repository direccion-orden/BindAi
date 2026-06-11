"use client";

import { useState } from "react";
import { collection, doc, getDoc, updateDoc, increment, addDoc, serverTimestamp, query, getDocs, where, orderBy, limit, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { X, Search, Loader2, RotateCcw, CheckCircle2, Banknote, CreditCard, Wallet, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DenominationCapture, DenominationCounts } from "@/components/pos/DenominationCapture";

interface ReturnsModalProps {
  onClose: () => void;
}

function sanitizeFirestoreData<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeFirestoreData(item)) as any;
  }
  if (typeof data === "object") {
    const proto = Object.getPrototypeOf(data);
    const isPlain = proto === null || proto === Object.prototype;
    if (!isPlain) {
      return data;
    }
    const cleanObj: any = {};
    for (const [key, value] of Object.entries(data)) {
      cleanObj[key] = sanitizeFirestoreData(value);
    }
    return cleanObj;
  }
  return data;
}

const mapRemissionToSale = (r: any) => {
  if (!r) return null;
  return {
    ...r,
    folio: r.orderNumber?.replace("POS-", "") || r.remissionNumber,
    client: { 
      id: r.clientId || "public",
      name: r.clientName || "Público en General"
    },
    financials: {
      subtotal: r.subtotal || 0,
      tax: r.tax || 0,
      total: r.totalAmount || 0,
      refundedAmount: r.refundedAmount || 0
    },
    items: r.items?.map((item: any) => {
      let rawTitle = item.productName || item.title || "";
      try {
        if (rawTitle.includes("Ã") || rawTitle.includes("Â")) {
          rawTitle = decodeURIComponent(escape(rawTitle));
        }
      } catch (e) {}
      
      return {
        id: item.variantId || item.productId || "",
        title: rawTitle,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercentage: item.discountPercentage || 0,
        returnedQuantity: item.returnedQuantity || 0
      };
    }) || []
  };
};

const parseSafeDate = (createdAt: any): Date => {
  if (!createdAt) return new Date();
  if (typeof createdAt.toDate === "function") {
    return createdAt.toDate();
  }
  if (createdAt.seconds) {
    return new Date(createdAt.seconds * 1000);
  }
  if (typeof createdAt === "string" || typeof createdAt === "number") {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

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
      const originalTerm = searchTerm.trim().toLowerCase();
      const term = originalTerm.replace(/'/g, "-");
      
      if (!companyId) throw new Error("No company ID");
      
      // Intentar búsqueda directa por ID de Remisión
      if (term.length > 15 && !term.includes(" ")) {
        const remissionRef = doc(db, "companies", companyId, "remisiones", term);
        const remissionSnap = await getDoc(remissionRef);
        
        if (remissionSnap.exists()) {
          setSale(mapRemissionToSale({ id: remissionSnap.id, ...remissionSnap.data() }));
          setLoading(false);
          return;
        }
      }

      // 1. Buscar clientes por teléfono o email exacto
      const cleanPhone = term.replace(/\D/g, "");
      const clientQueries = [
        getDocs(query(collection(db, "companies", companyId, "clients"), where("phone", "==", searchTerm.trim()))),
        getDocs(query(collection(db, "companies", companyId, "clients"), where("email", "==", searchTerm.trim().toLowerCase())))
      ];
      if (cleanPhone && cleanPhone !== originalTerm && cleanPhone.length >= 8) {
        clientQueries.push(
          getDocs(query(collection(db, "companies", companyId, "clients"), where("phone", "==", cleanPhone)))
        );
      }

      const clientSnaps = await Promise.all(clientQueries);
      const clientIds: string[] = [];
      clientSnaps.forEach(snap => {
        snap.docs.forEach(d => {
          if (!clientIds.includes(d.id)) {
            clientIds.push(d.id);
          }
        });
      });

      // Buscar en las últimas remisiones del POS
      const formattedTerm = term.startsWith("rem-") ? term.toUpperCase() : term;
      const formattedPosTerm = term.startsWith("pos-") ? term.toUpperCase() : `POS-${term.toUpperCase()}`;
      
      const promises = [];

      // Consulta 1: Coincidencia exacta en orderNumber (ej: POS-1002)
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("orderNumber", "==", formattedPosTerm)
        ))
      );

      // Consulta 2: Coincidencia exacta en remissionNumber (ej: 1002)
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("remissionNumber", "==", formattedTerm)
        ))
      );

      // Consulta 3: Coincidencia exacta en clientName
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("clientName", "==", searchTerm.trim())
        ))
      );

      // Consulta 4: Por clientIds encontrados (por teléfono o email)
      clientIds.forEach(cId => {
        promises.push(
          getDocs(query(
            collection(db, "companies", companyId, "remisiones"),
            where("clientId", "==", cId)
          ))
        );
      });

      // Consulta 5: Obtener ventas generales del POS recientes para filtrado en memoria
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("isPosSale", "==", true),
          limit(200)
        ))
      );

      const snaps = await Promise.all(promises);
      const docMap = new Map<string, any>();

      snaps.forEach(snap => {
        snap.docs.forEach(d => {
          const data = d.data();
          docMap.set(d.id, { id: d.id, ...data });
        });
      });

      const matches = Array.from(docMap.values())
        .map(mapRemissionToSale)
        .filter((s: any) => {
          const folio = (s.folio || "").toUpperCase();
          const remNum = (s.remissionNumber || "").toUpperCase();
          const orderNum = (s.orderNumber || "").toUpperCase();
          const name = (s.client?.name || "").toLowerCase();
          
          return folio === term.toUpperCase() || 
                 folio === originalTerm.toUpperCase() ||
                 remNum === formattedTerm || 
                 remNum === originalTerm.toUpperCase() ||
                 orderNum === formattedPosTerm ||
                 orderNum === `POS-${originalTerm.toUpperCase()}` ||
                 s.id.toLowerCase() === term || 
                 s.id.toLowerCase() === originalTerm ||
                 name.includes(originalTerm) ||
                 name.includes(term) ||
                 clientIds.includes(s.clientId);
        });

      // Ordenar por fecha de creación desc
      matches.sort((a, b) => {
        const timeA = parseSafeDate(a.createdAt).getTime();
        const timeB = parseSafeDate(b.createdAt).getTime();
        return timeB - timeA;
      });

      if (matches.length === 0) {
        setError("No se encontraron remisiones de POS recientes para esta búsqueda.");
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
      if (!companyId) throw new Error("No company ID");
      
      // 1. Obtener Remisión Original y Actualizarla
      const remissionRef = doc(db, "companies", companyId, "remisiones", sale.id);
      const remissionSnap = await getDoc(remissionRef);
      if (!remissionSnap.exists()) throw new Error("Remisión no encontrada en la base de datos");
      
      const remissionData = remissionSnap.data();
      const updatedRemissionItems = remissionData.items.map((item: any) => {
        const itemId = item.variantId || item.productId || "";
        const returning = returnQuantities[itemId] || 0;
        return {
          ...item,
          returnedQuantity: (item.returnedQuantity || 0) + returning
        };
      });

      const isFullyRefunded = (remissionData.refundedAmount || 0) + totalRefund >= remissionData.totalAmount - 0.01;

      await updateDoc(remissionRef, sanitizeFirestoreData({
        items: updatedRemissionItems,
        refundedAmount: increment(totalRefund),
        status: isFullyRefunded ? 'cancelada' : 'activa'
      }));

      // 2. Afectar Inventario Físico (Sumar Stock Devuelto en la Variante Correcta)
      for (const item of sale.items) {
        const returning = returnQuantities[item.id] || 0;
        if (returning > 0) {
          const origItem = remissionData.items.find((oi: any) => (oi.variantId || oi.productId) === item.id);
          if (origItem) {
            const productRef = doc(db, "companies", companyId, "products", origItem.productId);
            const pSnap = await getDoc(productRef);
            if (pSnap.exists()) {
              const productData = pSnap.data();
              const updatedVariants = productData.variants?.map((v: any) => {
                if (v.id === (origItem.variantId || origItem.id)) {
                  return { ...v, stock: (v.stock || 0) + returning };
                }
                return v;
              });
              await updateDoc(productRef, { variants: updatedVariants });
              
              // Registrar movimiento de Entrada (IN) al Kárdex
              const movId = crypto.randomUUID();
              await setDoc(doc(db, "companies", companyId, "inventory_movements", movId), sanitizeFirestoreData({
                id: movId,
                productId: origItem.productId,
                variantId: origItem.variantId || origItem.id || "",
                type: "IN",
                quantity: returning,
                reason: `Devolución POS (Remisión ${sale.remissionNumber})`,
                referenceId: sale.id,
                createdAt: new Date().toISOString()
              }));
            }
          }
        }
      }

      // 3. Método de Reembolso
      if (refundMethod === 'efectivo') {
        let sessionId = null;
        
        // Buscar turno de caja abierto en la sucursal de la remisión
        const sessionQuery = query(
          collection(db, "companies", companyId, "cash_sessions"),
          where("status", "==", "open"),
          where("locationId", "==", sale.locationId || "")
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
          await addDoc(collection(db, "companies", companyId, "cash_transactions"), sanitizeFirestoreData({
            sessionId,
            type: "EXPENSE",
            category: "RETIRO_CANCELACION",
            amount: totalRefund,
            reference: `Devolución Ticket ${sale.remissionNumber}`,
            paymentMethod: "CASH",
            denominations: denominationsOut,
            createdAt: serverTimestamp(),
            createdBy: user?.email || null,
          }));
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
                    <span className="text-xs text-muted-foreground">{parseSafeDate(res.createdAt).toLocaleDateString('es-MX')}</span>
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
                  <p>Fecha: {parseSafeDate(sale.createdAt).toLocaleString('es-MX')}</p>
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
