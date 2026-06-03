"use client";

import { useState, useRef, useEffect } from "react";
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, query, getDocs, where, runTransaction, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { usePOS } from "@/context/POSContext";
import { getNextSequence } from "@/lib/firebase/counters";
import { useAuth } from "@/context/AuthContext";
import { X, Banknote, CreditCard, Landmark, Loader2, CheckCircle2, MessageCircle, Mail, Gift, Wallet, Trash2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DenominationCapture, DenominationCounts } from "@/components/pos/DenominationCapture";
import { ThermalTicket } from "@/components/pos/ThermalTicket";

interface CheckoutModalProps {
  onClose: () => void;
}

export type PaymentMethodType = 'efectivo' | 'tarjeta' | 'transferencia' | 'puntos' | 'saldoFavor';

interface PaymentEntry {
  method: PaymentMethodType;
  amount: number;
  denominationsIn?: DenominationCounts;
  denominationsOut?: DenominationCounts; // Para el cambio
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

export function CheckoutModal({ onClose }: CheckoutModalProps) {
  const { user, companyId } = useAuth();
  const { activeAccount, subtotal, tax, totalDiscount, total, clearAccount, branchId, cashMode } = usePOS();
  
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [currentMethod, setCurrentMethod] = useState<PaymentMethodType | null>(null);
  
  // States for adding a new payment
  const [currentAmount, setCurrentAmount] = useState<string>("");
  const [currentDenomsIn, setCurrentDenomsIn] = useState<DenominationCounts>({});
  
  // States for change (cambio) when cash exceeds remaining
  const [changeDenoms, setChangeDenoms] = useState<DenominationCounts>({});

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [savedSaleId, setSavedSaleId] = useState<string | null>(null);
  const [savedSaleData, setSavedSaleData] = useState<any>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [companySettings, setCompanySettings] = useState<any>(null);

  useEffect(() => {
    if (!companyId) return;
    const fetchCompanySettings = async () => {
      try {
        const snap = await getDoc(doc(db, "companies", companyId));
        if (snap.exists()) {
          setCompanySettings(snap.data());
          console.log("[POS Checkout] Company settings loaded:", snap.data().name);
        }
      } catch (e) {
        console.error("Error loading company settings in POS:", e);
      }
    };
    fetchCompanySettings();
  }, [companyId]);

  // Recycler states
  const [recyclerStatus, setRecyclerStatus] = useState<'idle'|'waiting'|'completed'|'error'>('idle');
  const [recyclerInserted, setRecyclerInserted] = useState<number>(0);
  const [recyclerEventMessage, setRecyclerEventMessage] = useState<string>('');
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recyclerStatusRef = useRef(recyclerStatus);
  useEffect(() => {
    recyclerStatusRef.current = recyclerStatus;
  }, [recyclerStatus]);

  const [agentConnected, setAgentConnected] = useState<boolean | null>(null); // null = checking
  const [agentStarting, setAgentStarting] = useState(false);

  useEffect(() => {
      if (currentMethod === 'efectivo' && cashMode === 'recycler') {
          let active = true;
          const checkConnection = async () => {
              try {
                  const ping = await fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(1000) });
                  if (ping.ok && active) {
                      setAgentConnected(true);
                      return;
                  }
              } catch (e) {}
              if (active) setAgentConnected(false);
          };
          
          checkConnection();
          const interval = setInterval(checkConnection, 3000);
          return () => {
              active = false;
              clearInterval(interval);
          };
      }
  }, [currentMethod, cashMode]);

  const startLocalAgent = async () => {
    try {
      setRecyclerEventMessage('Iniciando agente de hardware local...');
      const startRes = await fetch('/api/hardware-agent/start', { method: 'POST' });
      if (startRes.ok) {
        setRecyclerEventMessage('Agente iniciado. Conectando al reciclador...');
        return true;
      }
    } catch (e) {
      console.warn("Failed to auto-start local hardware agent via API", e);
    }
    return false;
  };

  const autoCheckAndStartAgent = async () => {
      try {
          const ping = await fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(1000) });
          if (ping.ok) {
              setAgentConnected(true);
              return;
          }
      } catch (e) {
          setAgentStarting(true);
          try {
              const res = await fetch('/api/hardware-agent/start', { method: 'POST' });
              if (res.ok) {
                  console.log("[POS Checkout] Local hardware agent started automatically.");
                  setAgentConnected(true);
              }
          } catch (err) {
              console.error("[POS Checkout] Failed to auto-start agent:", err);
          } finally {
              setAgentStarting(false);
          }
      }
  };

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      // Auto-cancel and close session if unmounted while waiting for payment
      if (recyclerStatusRef.current === 'waiting') {
          fetch('http://localhost:3001/api/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ request: 'CancelPayment' })
          }).then(() => {
              // Wait 1 second for physical transition before closing global session
              setTimeout(() => {
                  fetch('http://localhost:3001/api/session', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ request: 'CloseSession' })
                  }).catch(() => {});
              }, 1000);
          }).catch(() => {});
      }
    };
  }, []);

  const client = activeAccount.selectedClient;
  const isPublic = !client || client.id === "public";
  
  const clientPoints = client?.points || 0;
  const clientWallet = client?.walletBalance || 0;

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  // Restante real de la cuenta
  const remaining = Math.max(0, total - totalPaid);
  
  // Amount entered in the current payment input
  const inputAmount = parseFloat(currentAmount) || 0;
  // If they are paying with cash, and inputAmount > remaining, the change is inputAmount - remaining
  const changeToGive = (currentMethod === 'efectivo' && inputAmount > remaining) ? inputAmount - remaining : 0;

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const startRecyclerPayment = async () => {
      setRecyclerStatus('waiting');
      setRecyclerInserted(0);
      setRecyclerEventMessage('Iniciando sesión en reciclador...');
      
      let isConnected = false;
      try {
          // 1. Proactively test agent status
          const ping = await fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(1500) });
          if (ping.ok) isConnected = true;
      } catch (e) {
          // 2. If connection failed, trigger start agent
          setRecyclerEventMessage('Agente local fuera de línea. Intentando iniciar...');
          try {
              const startRes = await fetch('/api/hardware-agent/start', { method: 'POST' });
              if (startRes.ok) {
                  setRecyclerEventMessage('Agente iniciado. Conectando al reciclador...');
                  // Wait 1.5 seconds for agent to start listening
                  await new Promise(resolve => setTimeout(resolve, 1500));
                  const ping2 = await fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(1500) });
                  if (ping2.ok) isConnected = true;
              }
          } catch (err) {
              console.error("Auto-start failed:", err);
          }
      }

      if (!isConnected) {
          setRecyclerStatus('error');
          setRecyclerEventMessage('Error: No se pudo conectar con el Agente Local en http://localhost:3001. Verifica que esté encendido.');
          return;
      }

      try {
          // Reset proactivo: Intentar cancelar y cerrar cualquier sesión previa stuck
          try {
              await fetch('http://localhost:3001/api/session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ request: 'CancelPayment' }),
                  signal: AbortSignal.timeout(2000)
              }).catch(() => {});
              
              await fetch('http://localhost:3001/api/session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ request: 'CloseSession' }),
                  signal: AbortSignal.timeout(2000)
              }).catch(() => {});

              await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e) {
              console.log("Error during proactive reset:", e);
          }

          const response = await fetch('http://localhost:3001/api/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ request: 'PayAmount', value: Math.round(remaining * 100) }),
              signal: AbortSignal.timeout(5000)
          });
          
          if (!response.ok) {
              let errMsg = "Error iniciando sesión en hardware";
              try {
                  const errData = await response.json();
                  if (errData && errData.error) {
                      errMsg = `${errData.error} (${errData.details || ''})`;
                  }
              } catch (e) {}
              throw new Error(errMsg);
          }
          
          const sessionData = await response.json();
          const txId = sessionData?.responseData; // Capture the transaction ID
          
          setRecyclerEventMessage('Por favor, inserte el efectivo...');
          
          pollIntervalRef.current = setInterval(async () => {
              try {
                  const statusRes = await fetch('http://localhost:3001/api/status', {
                      signal: AbortSignal.timeout(3000)
                  });
                  if (!statusRes.ok) return;
                  const data = await statusRes.json();
                  
                  const events = data.events || [];
                  // Only process events that belong to the current transaction to avoid reading cached past events
                  const currentTxEvents = txId ? events.filter((e: any) => e.transaction?.transaction_id === txId || e.transaction?.transaction_id === "") : events;
                  
                  if (data.transaction && data.transaction.payinReceived !== undefined) {
                      setRecyclerInserted(data.transaction.payinReceived / 100);
                  } else {
                      const latestEvent = currentTxEvents[currentTxEvents.length - 1];
                      if (latestEvent && latestEvent.transaction && latestEvent.transaction.cash_in !== undefined) {
                          setRecyclerInserted(latestEvent.transaction.cash_in / 100);
                      }
                  }
                  
                  const isCompleted = currentTxEvents.some((e: any) => e.EventName === 'PaymentComplete' || e.event === 'PaymentComplete');
                  const isCanceled = currentTxEvents.some((e: any) => 
                      e.EventName === 'CancelComplete' || e.event === 'CancelComplete' || 
                      e.EventName === 'StopComplete' || e.event === 'StopComplete'
                  );
                  
                  if (isCompleted) {
                      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                      setRecyclerStatus('completed');
                      setRecyclerEventMessage('Pago completado. Cerrando sesión...');
                      
                      try {
                          await fetch('http://localhost:3001/api/session', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ request: 'CloseSession' }),
                              signal: AbortSignal.timeout(3000)
                          });
                          setRecyclerEventMessage('Sesión cerrada exitosamente. Añadiendo pago...');
                      } catch (err) {
                          setRecyclerEventMessage('Pago completado (error al cerrar sesión)');
                      }
                      
                      // Set amount
                      const completedEvent = currentTxEvents.find((e: any) => e.EventName === 'PaymentComplete' || e.event === 'PaymentComplete');
                      let inserted = remaining;
                      
                      if (completedEvent?.transaction?.cash_in !== undefined) {
                          inserted = completedEvent.transaction.cash_in / 100;
                      } else if (data.transaction?.payinReceived !== undefined) {
                          inserted = data.transaction.payinReceived / 100;
                      }
                      
                      setCurrentAmount(inserted.toString());
                      
                      // Automatically add the payment after a brief delay
                      setTimeout(() => {
                          const changeToGive = (inserted > remaining) ? inserted - remaining : 0;
                          const appliedAmount = inserted - changeToGive;
                          
                          setPayments(prev => [...prev, {
                            method: 'efectivo',
                            amount: appliedAmount
                          }]);
                          
                          setCurrentMethod(null);
                          setCurrentAmount("");
                      }, 2000);
                      
                  } else if (isCanceled) {
                      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                      setRecyclerStatus('idle');
                      setRecyclerEventMessage('Pago cancelado');
                      
                      // Wait 1 second for physical transition before closing global session
                      setTimeout(async () => {
                          try {
                              await fetch('http://localhost:3001/api/session', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ request: 'CloseSession' }),
                                  signal: AbortSignal.timeout(3000)
                              });
                          } catch (e) {}
                      }, 1000);
                  }
                  
              } catch (err) {
                  console.error("Polling error", err);
              }
          }, 1000);
      } catch (error: any) {
          console.error("Recycler error:", error);
          setRecyclerStatus('error');
          
          if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
              setRecyclerEventMessage('Error: Tiempo de espera agotado al conectar con el hardware.');
          } else if (error.message.includes('Failed to fetch') || error.message.includes('fetch')) {
              setRecyclerEventMessage('Error: No se pudo conectar con el Agente Local en http://localhost:3001. Verifica que esté encendido.');
          } else {
              setRecyclerEventMessage(`Error: ${error.message || 'Error de conexión con el hardware.'}`);
          }
      }
  };

  const cancelRecyclerPayment = async () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setRecyclerStatus('idle');
      try {
          await fetch('http://localhost:3001/api/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ request: 'CancelPayment' }),
              signal: AbortSignal.timeout(3000)
          });
          
          // Wait 1 second for physical transition before closing global session
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await fetch('http://localhost:3001/api/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ request: 'CloseSession' }),
              signal: AbortSignal.timeout(3000)
          });
      } catch (e) {}
  };

  const handleSelectMethod = (method: PaymentMethodType) => {
    if (isPublic && (method === 'puntos' || method === 'saldoFavor')) {
      alert("Debes seleccionar un cliente registrado para usar Puntos o Saldo a Favor.");
      return;
    }
    setCurrentMethod(method);
    setCurrentDenomsIn({});
    setChangeDenoms({});
    
    // Default the amount to the remaining balance or max available
    let defaultAmount = remaining;
    if (method === 'puntos') defaultAmount = Math.min(remaining, clientPoints);
    if (method === 'saldoFavor') defaultAmount = Math.min(remaining, clientWallet);
    
    // Round to 2 decimal places to avoid floating point precision issues
    const roundedAmount = Number(Math.round(Number(defaultAmount + 'e2')) + 'e-2');
    setCurrentAmount(method === 'efectivo' ? "" : roundedAmount.toString());

    // Auto-trigger local agent check and startup
    if (method === 'efectivo' && cashMode === 'recycler') {
      autoCheckAndStartAgent();
    }
  };

  const handleAddPayment = () => {
    if (!currentMethod || inputAmount <= 0) return;
    
    if (currentMethod === 'puntos' && inputAmount > clientPoints) {
      alert("El cliente no tiene suficientes puntos.");
      return;
    }
    if (currentMethod === 'saldoFavor' && inputAmount > clientWallet) {
      alert("El cliente no tiene suficiente saldo a favor.");
      return;
    }

    // Efectivo specific validations
    if (currentMethod === 'efectivo') {
      if (cashMode === 'manual') {
        const denomSum = Object.entries(currentDenomsIn).reduce((acc, [k, v]) => acc + parseFloat(k) * (v || 0), 0);
        if (Math.abs(denomSum - inputAmount) > 0.01) {
          alert(`Las denominaciones ingresadas ($${denomSum}) no coinciden con el monto declarado ($${inputAmount}).`);
          return;
        }
        
        if (changeToGive > 0) {
          const changeSum = Object.entries(changeDenoms).reduce((acc, [k, v]) => acc + parseFloat(k) * (v || 0), 0);
          if (Math.abs(changeSum - changeToGive) > 0.01) {
            alert(`Las denominaciones de cambio ($${changeSum}) no coinciden con el cambio a entregar ($${changeToGive}).`);
            return;
          }
        }
      }
      // Si es recycler, inputAmount lo dicta el reciclador, asumimos que está bien validado.
    }

    // El pago real aplicado a la cuenta no puede exceder el restante
    const appliedAmount = currentMethod === 'efectivo' ? inputAmount - changeToGive : inputAmount;

    setPayments(prev => [...prev, {
      method: currentMethod,
      amount: appliedAmount,
      denominationsIn: currentMethod === 'efectivo' ? currentDenomsIn : undefined,
      denominationsOut: currentMethod === 'efectivo' && changeToGive > 0 ? changeDenoms : undefined,
    }]);

    setCurrentMethod(null);
    setCurrentAmount("");
    setCurrentDenomsIn({});
    setChangeDenoms({});
  };

  const handleRemovePayment = (index: number) => {
    setPayments(prev => prev.filter((_, i) => i !== index));
  };

  const canComplete = remaining === 0;

  // Cálculo de Puntos de Lealtad (1% del subtotal pagado con métodos que no son puntos/saldo)
  const calculateEarnedPoints = () => {
    if (isPublic) return 0;
    const paidWithRealMoney = payments
      .filter(p => p.method !== 'puntos' && p.method !== 'saldoFavor')
      .reduce((sum, p) => sum + p.amount, 0);
    // Solo ganas puntos por el dinero real pagado
    return parseFloat((paidWithRealMoney * 0.01).toFixed(2));
  };

  const pointsEarned = calculateEarnedPoints();

  const handleCheckout = async () => {
    if (!canComplete || loading) return;
    if (!branchId) {
      alert("Por favor selecciona una sucursal en la parte superior antes de cobrar.");
      return;
    }
    if (!companyId) {
      alert("Error de sesión: No se encontró la empresa");
      return;
    }
    
    setLoading(true);
    try {
      // Find open cash session for this branch
      const sessionQuery = query(
        collection(db, "companies", companyId, "cash_sessions"),
        where("status", "==", "open"),
        where("locationId", "==", branchId)
      );
      const sessionSnap = await getDocs(sessionQuery);
      
      let sessionId = null;
      if (!sessionSnap.empty) {
        sessionId = sessionSnap.docs[0].id;
      } else {
        // Fallback: Check if there's any open session at all
        const fallbackQuery = query(collection(db, "companies", companyId, "cash_sessions"), where("status", "==", "open"));
        const fallbackSnap = await getDocs(fallbackQuery);
        if (!fallbackSnap.empty) {
            sessionId = fallbackSnap.docs[0].id;
        } else {
            alert("No hay un turno de caja abierto en esta sucursal. Ve al módulo de Caja para abrir un turno.");
            setLoading(false);
            return;
        }
      }

      // 1. Generar Remisión a partir de la Venta del POS e impactar Inventario
      const remId = crypto.randomUUID();
      const remNumber = await getNextSequence(companyId, 'remisiones');
      
      const remissionData = sanitizeFirestoreData({
        id: remId,
        remissionNumber: remNumber,
        orderId: null,
        orderNumber: `POS-${remNumber}`,
        clientId: client?.id || "public",
        clientName: client?.name || "Público en General",
        items: activeAccount.items.map(item => {
          const matchingVariant = item.product.variants?.find((v: any) => v.sku === item.product.sku) || item.product.variants?.[0];
          const variantId = matchingVariant?.id || item.product.id || "";
          const variantTitle = matchingVariant?.title && matchingVariant.title !== "Default Title" ? matchingVariant.title : "";
          
          return {
            productId: item.product.id || "",
            variantId: variantId,
            productName: item.product.title || "",
            variantTitle: variantTitle,
            quantity: item.quantity || 1,
            unitPrice: item.product.price || 0,
            discountPercentage: item.discountPercentage || 0,
            imageUrl: item.product.images?.[0]?.src || item.product.imageUrl || "",
            categoryIds: [
              ...(item.product.productType ? [item.product.productType] : []),
              ...(item.product.tags || [])
            ]
          };
        }),
        totalAmount: total || 0,
        subtotal: subtotal || 0,
        tax: tax || 0,
        paidAmount: total || 0,
        projectId: null,
        projectName: null,
        locationId: branchId || null,
        status: 'activa',
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "POS",
        isPosSale: true,
        posSaleId: remId,
        cashier: {
            uid: user?.uid || null,
            email: user?.email || null
        },
        financials: {
            subtotal: subtotal || 0,
            totalDiscount: totalDiscount || 0,
            tax: tax || 0,
            total: total || 0,
        },
        payments: payments.map(p => ({
            method: p.method || "",
            amount: p.amount || 0,
            denominationsIn: p.denominationsIn || null,
            denominationsOut: p.denominationsOut || null
        }))
      });

      await setDoc(doc(db, "companies", companyId, "remisiones", remId), remissionData);

      setSavedSaleId(remId);
      setSavedSaleData(remissionData);

      // Descontar Inventario físico de los productos vendidos
      for (const item of activeAccount.items) {
        const productRef = doc(db, "companies", companyId, "products", item.product.id);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          const updatedVariants = productData.variants?.map((v: any) => {
            const isMatch = v.sku === item.product.sku || v.id === item.product.id || productData.variants.length === 1;
            if (isMatch) {
              return { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) };
            }
            return v;
          });
          
          await updateDoc(productRef, { variants: updatedVariants });
          
          // Registrar movimiento de salida del kárdex
          const matchingVariant = productData.variants?.find((v: any) => v.sku === item.product.sku || v.id === item.product.id || productData.variants.length === 1);
          const variantId = matchingVariant?.id || item.product.id;
          
          const movId = crypto.randomUUID();
          await setDoc(doc(db, "companies", companyId, "inventory_movements", movId), sanitizeFirestoreData({
            id: movId,
            productId: item.product.id,
            variantId: variantId,
            type: "OUT",
            quantity: item.quantity,
            reason: `Venta POS ${remNumber}`,
            referenceId: remId,
            createdAt: new Date().toISOString()
          }));
        }
      }

      // 2. Registrar Movimientos de Caja (Solo Efectivo)
      for (const p of payments) {
        if (p.method === 'efectivo') {
          // Movimiento de entrada (lo que nos entregó el cliente)
          // Monto original sin restar el cambio
          const cashReceived = p.amount + (p.denominationsOut ? Object.entries(p.denominationsOut).reduce((acc, [k,v])=>acc+parseFloat(k)*v,0) : 0);
          
          await addDoc(collection(db, "companies", companyId, "cash_transactions"), sanitizeFirestoreData({
            sessionId,
            type: "INCOME",
            category: "VENTA_EFECTIVO",
            amount: cashReceived,
            reference: `Venta ${remNumber}`,
            paymentMethod: "CASH",
            denominations: p.denominationsIn || {},
            createdAt: serverTimestamp(),
            createdBy: user?.email || null,
          }));

          // Movimiento de salida (el cambio)
          if (p.denominationsOut && Object.keys(p.denominationsOut).length > 0) {
            const changeAmount = Object.entries(p.denominationsOut).reduce((acc, [k,v])=>acc+parseFloat(k)*v,0);
            if (changeAmount > 0) {
              await addDoc(collection(db, "companies", companyId, "cash_transactions"), sanitizeFirestoreData({
                sessionId,
                type: "EXPENSE",
                category: "CAMBIO_VENTA",
                amount: changeAmount,
                reference: `Cambio Venta ${remNumber}`,
                paymentMethod: "CASH",
                denominations: p.denominationsOut,
                createdAt: serverTimestamp(),
                createdBy: user?.email || null,
              }));
            }
          }
        }

        // Registrar pago en la colección global de Ingresos (payments)
        await addDoc(collection(db, "companies", companyId, "payments"), sanitizeFirestoreData({
          amount: p.amount,
          date: new Date().toISOString().split("T")[0],
          method: p.method === 'efectivo' ? 'Efectivo' : p.method === 'tarjeta' ? 'Tarjeta' : p.method === 'transferencia' ? 'Transferencia' : p.method,
          reference: `Venta POS ${remNumber}`,
          documentId: remId,
          documentType: "remision",
          documentNumber: remNumber,
          clientId: client?.id || "public",
          clientName: client?.name || "Público en General",
          createdAt: new Date().toISOString()
        }));
      }

      // 3. Actualizar Perfil del Cliente
      if (!isPublic && client) {
         let pointsDeducted = payments.filter(p => p.method === 'puntos').reduce((sum, p) => sum + p.amount, 0);
         let walletDeducted = payments.filter(p => p.method === 'saldoFavor').reduce((sum, p) => sum + p.amount, 0);
         
         const clientRef = doc(db, "companies", companyId, "clients", client.id);
         
         // Ganancia neta de puntos = Puntos ganados - Puntos gastados
         const netPoints = pointsEarned - pointsDeducted;
         
         await updateDoc(clientRef, {
             points: increment(netPoints),
             walletBalance: increment(-walletDeducted)
         });
      }

      setSuccess(true);

    } catch (e) {
      console.error("Error saving sale:", e);
      alert("Hubo un error al guardar la venta.");
      setLoading(false);
    }
  };

  const finishAndClose = () => {
      clearAccount(activeAccount.id);
      onClose();
  };

  const handleWhatsApp = () => {
    if (!activeAccount.selectedClient?.phone) {
        alert("El cliente no tiene un teléfono registrado.");
        return;
    }
    let text = `¡Hola ${activeAccount.selectedClient.name}! 👋\n\nGracias por tu compra por *${formatMoney(total)}*.`;
    if (pointsEarned > 0) {
        text += `\nCon esta compra acumulaste *${pointsEarned} puntos* de lealtad. 🎁`;
    }
    text += `\n\nTicket: ${savedSaleId}`;
    if (companySettings?.name) {
        text += `\n\nAtentamente,\n*${companySettings.name}*`;
    }
    if (companySettings?.whatsappPhone) {
        text += `\nWhatsApp de contacto: ${companySettings.whatsappPhone}`;
    }
    const url = `https://wa.me/52${activeAccount.selectedClient.phone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleEmail = async () => {
      if (!activeAccount.selectedClient?.email) {
          alert("El cliente no tiene un correo registrado.");
          return;
      }
      
      setEmailStatus('loading');
      try {
          const res = await fetch('/api/notifications/send-ticket', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  saleId: savedSaleId, 
                  saleData: savedSaleData,
                  companyId: companyId
              })
          });
          
          if (!res.ok) throw new Error('Error al enviar correo');
          setEmailStatus('success');
      } catch (e) {
          console.error(e);
          setEmailStatus('error');
          alert("Error al enviar el correo. Revisa la configuración SMTP.");
      }
  };

  // Renderizado del caso de éxito
  if (success) {
      const changePaid = payments.find(p => p.denominationsOut)?.denominationsOut;
      const changeAmount = changePaid ? Object.entries(changePaid).reduce((acc, [k,v])=>acc+parseFloat(k)*v,0) : 0;

      return (
          <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card border rounded-xl shadow-xl w-full max-w-md p-8 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-2">
                      <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">¡Venta Completada!</h2>
                  
                  {changeAmount > 0 && (
                      <div className="bg-muted w-full p-4 rounded-lg mt-4 border border-dashed">
                          <p className="text-muted-foreground text-sm uppercase font-semibold">Cambio a entregar</p>
                          <p className="text-4xl font-black text-primary mt-1">{formatMoney(changeAmount)}</p>
                      </div>
                  )}

                  {pointsEarned > 0 && (
                      <div className="bg-orange-50 text-orange-800 w-full p-3 rounded-lg border border-orange-200 mt-2">
                          <p className="font-semibold text-sm">✨ El cliente ganó {pointsEarned} puntos</p>
                      </div>
                  )}

                  <div className="w-full flex gap-2 mt-6">
                      <Button variant="outline" className="flex-1 flex gap-2" onClick={() => window.print()}>
                          <Printer className="w-4 h-4" /> Imprimir
                      </Button>
                      <Button variant="outline" className="flex-1 flex gap-2 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 border-[#25D366]/20" onClick={handleWhatsApp}>
                          <MessageCircle className="w-4 h-4" /> WhatsApp
                      </Button>
                      <Button 
                        variant="outline" 
                        className={`flex-1 flex gap-2 ${emailStatus === 'success' ? 'bg-green-100 text-green-700 border-green-200' : ''}`}
                        onClick={handleEmail}
                        disabled={emailStatus === 'loading' || emailStatus === 'success'}
                      >
                          {emailStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                           emailStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : 
                           <Mail className="w-4 h-4" />} 
                          {emailStatus === 'success' ? 'Enviado' : 'Correo'}
                      </Button>
                  </div>
                  
                  <Button className="w-full mt-4" onClick={finishAndClose}>Nueva Venta</Button>
              </div>

              {/* Renderizar componente de impresión oculto */}
              {savedSaleId && savedSaleData && (
                  <ThermalTicket saleId={savedSaleId} saleData={savedSaleData} />
              )}
          </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-4">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row animate-in fade-in zoom-in duration-200 max-h-screen">
        
        {/* Panel Izquierdo: Resumen y Pagos Agregados */}
        <div className="w-full md:w-1/3 bg-muted/30 p-6 border-b md:border-b-0 md:border-r flex flex-col justify-between overflow-y-auto custom-scrollbar">
          <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Cobrar Ticket</h2>
                <button onClick={onClose} className="p-2 hover:bg-muted rounded-full md:hidden"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Cliente</span>
                    <span className="font-medium text-right truncate max-w-[150px]">{client?.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatMoney(subtotal)}</span>
                </div>
                {totalDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Descuento</span>
                        <span className="font-medium text-green-600">-{formatMoney(totalDiscount)}</span>
                    </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-2">
                    <span>TOTAL</span>
                    <span>{formatMoney(total)}</span>
                </div>
            </div>

            {/* Pagos Agregados */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Pagos Recibidos</h3>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 bg-muted/50 rounded-lg border border-dashed">No hay pagos agregados.</p>
              ) : (
                payments.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-background border p-2 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                      <span className="uppercase text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {p.method}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{formatMoney(p.amount)}</span>
                      <button onClick={() => handleRemovePayment(idx)} className="text-destructive hover:bg-destructive/10 p-1 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t">
              <p className="text-sm text-muted-foreground uppercase font-semibold mb-1">Restante por Pagar</p>
              <p className={`text-4xl font-black ${remaining === 0 ? 'text-green-600' : 'text-primary'}`}>
                {formatMoney(remaining)}
              </p>
          </div>
        </div>

        {/* Panel Derecho: Selección de Método y Captura */}
        <div className="w-full md:w-2/3 p-6 flex flex-col relative overflow-y-auto custom-scrollbar bg-background">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full hidden md:block text-muted-foreground">
              <X className="w-5 h-5"/>
          </button>

          {!currentMethod ? (
            <div className="flex-1">
              <h3 className="font-semibold mb-4 text-muted-foreground">Agregar Pago</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <button 
                    onClick={() => handleSelectMethod('efectivo')}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                  >
                      <Banknote className="w-8 h-8 mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm font-semibold">
                        {cashMode === 'recycler' ? 'Efectivo (Reciclador)' : 'Efectivo'}
                      </span>
                  </button>
                  <button 
                    onClick={() => handleSelectMethod('tarjeta')}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                  >
                      <CreditCard className="w-8 h-8 mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm font-semibold">Tarjeta / Terminal</span>
                  </button>
                  <button 
                    onClick={() => handleSelectMethod('transferencia')}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                  >
                      <Landmark className="w-8 h-8 mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-sm font-semibold">Transferencia</span>
                  </button>
                  
                  {!isPublic && (
                    <>
                      <button 
                        onClick={() => handleSelectMethod('puntos')}
                        className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-border hover:border-orange-500/50 hover:bg-orange-50 transition-all group relative"
                      >
                          <div className="absolute top-2 right-2 text-[10px] bg-orange-100 text-orange-700 font-bold px-1.5 rounded-full">
                            ${clientPoints.toFixed(2)}
                          </div>
                          <Gift className="w-8 h-8 mb-2 text-muted-foreground group-hover:text-orange-500 transition-colors" />
                          <span className="text-sm font-semibold">Puntos</span>
                      </button>
                      <button 
                        onClick={() => handleSelectMethod('saldoFavor')}
                        className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-border hover:border-blue-500/50 hover:bg-blue-50 transition-all group relative"
                      >
                          <div className="absolute top-2 right-2 text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 rounded-full">
                            ${clientWallet.toFixed(2)}
                          </div>
                          <Wallet className="w-8 h-8 mb-2 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                          <span className="text-sm font-semibold">Saldo a Favor</span>
                      </button>
                    </>
                  )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col animate-in slide-in-from-right-4 duration-200">
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setCurrentMethod(null)} className="text-muted-foreground hover:text-foreground text-sm font-medium">
                  ← Volver
                </button>
                <h3 className="font-semibold text-lg uppercase tracking-wider text-primary">
                  Pago en {currentMethod}
                </h3>
              </div>

              <div className="space-y-6 flex-1">
                {currentMethod === 'efectivo' ? (
                  cashMode === 'recycler' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl bg-muted/10 animate-in zoom-in text-center">
                      <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <Banknote className="w-8 h-8 text-primary animate-pulse" />
                      </div>
                      <h4 className="text-lg font-bold mb-2">Reciclador de Billetes</h4>
                      
                      {recyclerStatus === 'idle' && (
                        <>
                          <div className="mb-4 flex items-center justify-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${
                                  agentConnected === true ? 'bg-green-500 animate-pulse' :
                                  agentConnected === null || agentStarting ? 'bg-amber-500 animate-bounce' : 'bg-red-500'
                              }`} />
                              <span className="text-xs font-semibold text-muted-foreground">
                                  {agentConnected === true ? 'Agente Conectado (Puerto 3001)' :
                                   agentConnected === null || agentStarting ? 'Iniciando Agente...' : 'Agente Desconectado'}
                              </span>
                          </div>

                          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                              Conecta con el hardware local para cobrar {formatMoney(remaining)} automáticamente.
                          </p>

                          <div className="w-full max-w-xs flex flex-col gap-2">
                              <Button 
                                  onClick={startRecyclerPayment} 
                                  size="lg" 
                                  className="w-full"
                                  disabled={agentStarting}
                              >
                                  Iniciar Cobro ({formatMoney(remaining)})
                              </Button>
                          </div>
                        </>
                      )}

                      {recyclerStatus === 'waiting' && (
                        <div className="w-full max-w-xs space-y-4">
                          <div className="flex items-center justify-center gap-2 text-primary font-medium">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {recyclerEventMessage || 'Esperando efectivo...'}
                          </div>
                          
                          <div className="bg-background border rounded-lg p-4">
                            <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Efectivo Insertado</p>
                            <p className="text-3xl font-black">{formatMoney(recyclerInserted)}</p>
                            <p className="text-xs text-muted-foreground mt-2">Restante: {formatMoney(Math.max(0, remaining - recyclerInserted))}</p>
                          </div>
                          
                          <Button variant="destructive" onClick={cancelRecyclerPayment} className="w-full">
                            Cancelar Operación
                          </Button>
                        </div>
                      )}

                      {recyclerStatus === 'completed' && (
                        <div className="w-full max-w-xs space-y-4">
                          <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
                            <CheckCircle2 className="w-5 h-5" />
                            {recyclerEventMessage}
                          </div>
                          <div className="bg-background border rounded-lg p-4 border-green-200">
                            <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Total Ingresado</p>
                            <p className="text-3xl font-black text-green-700">{formatMoney(inputAmount || recyclerInserted)}</p>
                          </div>
                        </div>
                      )}

                      {recyclerStatus === 'error' && (
                        <div className="w-full max-w-xs space-y-4">
                          <p className="text-red-600 font-medium">{recyclerEventMessage}</p>
                          <Button variant="outline" onClick={startRecyclerPayment} className="w-full">
                            Reintentar Conexión
                          </Button>
                          
                          {/* Simulación de Respaldo */}
                          <div className="mt-8 bg-background p-4 rounded-lg shadow-sm border space-y-4">
                            <p className="text-xs font-semibold text-orange-600 uppercase">Modo Respaldo (Simulación)</p>
                            <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                step="0.01"
                                placeholder="Monto a simular"
                                value={currentAmount}
                                onChange={(e) => setCurrentAmount(e.target.value)}
                              />
                              <Button 
                                variant="secondary"
                                onClick={() => {
                                  if (!currentAmount) setCurrentAmount(remaining.toString());
                                }}
                              >
                                Max
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <DenominationCapture 
                        title="1. Dinero que Recibes (Efectivo Entregado por el Cliente)"
                        onChange={(sum, denoms) => {
                          setCurrentAmount(sum.toString());
                          setCurrentDenomsIn(denoms);
                        }}
                      />
                      
                      {changeToGive > 0 && (
                        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg animate-in fade-in zoom-in">
                          <h4 className="font-bold text-orange-800 mb-2">2. Cambio a Entregar: {formatMoney(changeToGive)}</h4>
                          <p className="text-xs text-orange-700 mb-4">Captura los billetes/monedas que estás sacando de la caja para dar cambio.</p>
                          <DenominationCapture 
                            title="Desglose del Cambio"
                            onChange={(sum, denoms) => setChangeDenoms(denoms)}
                          />
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase">Monto a cobrar con {currentMethod}</label>
                    <div className="relative mt-1 max-w-sm">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">$</span>
                        <Input 
                            type="number" 
                            step="0.01"
                            className="pl-8 h-14 text-2xl font-bold bg-muted/20"
                            value={currentAmount}
                            onChange={(e) => setCurrentAmount(e.target.value)}
                            autoFocus
                        />
                    </div>
                    {(currentMethod === 'puntos' || currentMethod === 'saldoFavor') && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Disponible: {formatMoney(currentMethod === 'puntos' ? clientPoints : clientWallet)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-6 mt-4 border-t flex justify-end gap-3">
                <Button variant="outline" onClick={() => setCurrentMethod(null)}>Cancelar</Button>
                <Button onClick={handleAddPayment} disabled={inputAmount <= 0} className="px-8">
                  Añadir Pago
                </Button>
              </div>
            </div>
          )}

          {/* Confirm Checkout Button area */}
          {!currentMethod && (
            <div className="pt-6 mt-auto border-t">
              <Button 
                size="lg" 
                className="w-full h-14 text-lg font-bold"
                disabled={!canComplete || loading}
                onClick={handleCheckout}
              >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2"/> : null}
                  {canComplete ? "Completar Venta" : "Falta Pago para Completar"}
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
