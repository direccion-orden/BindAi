"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { usePOS } from "@/context/POSContext";
import { X, Loader2, CheckCircle2, Lock, ArrowDownToLine, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RetiroCodigoModalProps {
  onClose: () => void;
}

export function RetiroCodigoModal({ onClose }: RetiroCodigoModalProps) {
  const { user, companyId } = useAuth();
  const { branchId, cashMode } = usePOS();

  const [step, setStep] = useState<"input" | "confirm" | "dispensing" | "success" | "request_form" | "request_success">("input");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [withdrawalData, setWithdrawalData] = useState<any>(null);
  const [reqAmount, setReqAmount] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  
  // Active shift cash session
  const [activeSession, setActiveSession] = useState<any>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const [availableCodes, setAvailableCodes] = useState<any[]>([]);

  useEffect(() => {
    if (!companyId || !branchId) return;

    const q = query(
      collection(db, "companies", companyId, "cash_withdrawals"),
      where("locationId", "==", branchId),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      docs.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAvailableCodes(docs);
    }, (err) => {
      console.error("Error listening to available codes:", err);
    });

    return () => unsubscribe();
  }, [companyId, branchId]);

  // Recycler session polling states
  const [dispenseProgress, setDispenseProgress] = useState("");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
  };

  // Check active cash session for this branch on mount or step changes
  const checkActiveSession = async () => {
    if (!companyId || !branchId) return;
    setCheckingSession(true);
    try {
      const q = query(
        collection(db, "companies", companyId, "cash_sessions"),
        where("status", "==", "open"),
        where("locationId", "==", branchId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setActiveSession({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.error("Error checking cash session:", err);
    } finally {
      setCheckingSession(false);
    }
  };

  useEffect(() => {
    checkActiveSession();
  }, [companyId, branchId]);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.length !== 6) {
      setError("Por favor ingrese un código válido de 6 dígitos.");
      return;
    }
    if (!companyId) return;

    setLoading(true);
    setError("");
    try {
      const q = query(
        collection(db, "companies", companyId, "cash_withdrawals"),
        where("code", "==", code.trim()),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError("Código inválido, expirado o ya procesado.");
        setLoading(false);
        return;
      }

      const docData = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;

      // Validate location
      if (docData.locationId !== branchId) {
        setError(`Este código está autorizado para la sucursal "${docData.locationName || docData.locationId}", no para esta sucursal.`);
        setLoading(false);
        return;
      }

      setWithdrawalData(docData);
      setStep("confirm");
    } catch (err) {
      console.error("Error verifying code:", err);
      setError("Error de conexión al verificar el código.");
    } finally {
      setLoading(false);
    }
  };

  const handleStartDispense = async () => {
    if (!withdrawalData || !companyId) return;
    
    // Check if there is an active session
    if (!activeSession) {
      alert("No hay un turno de caja abierto en esta sucursal. Debe abrir un turno en el POS primero.");
      return;
    }

    setStep("dispensing");
    setDispenseProgress("Iniciando conexión con el reciclador...");

    const isRecycler = cashMode === "recycler";
    let isMock = !isRecycler;

    if (isRecycler) {
      try {
        // Ping recycler agent to see if it's responding
        const ping = await fetch("http://localhost:3001/api/status", { signal: AbortSignal.timeout(1000) });
        if (!ping.ok) {
          isMock = true; // Fallback to simulated dispenser
        }
      } catch (err) {
        isMock = true; // Fallback to simulated dispenser
      }
    }

    if (isMock) {
      // Simulation mode
      setDispenseProgress("Dispensando efectivo (Simulado)...");
      let count = 0;
      pollIntervalRef.current = setInterval(async () => {
        count++;
        if (count >= 3) {
          clearInterval(pollIntervalRef.current!);
          await handleCompleteWithdrawal();
        }
      }, 1000);
      return;
    }

    // Real Recycler Mode
    try {
      // Revertir a centavos: la máquina interpreta el valor en centavos (comprobado en la prueba física)
      const amountInCents = Math.round(withdrawalData.amount * 100);
      const res = await fetch("http://localhost:3001/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: "RefundAmount", value: amountInCents })
      });

      if (!res.ok) {
        throw new Error("El agente de hardware no respondió correctamente.");
      }

      const data = await res.json();
      if (data.responseCode !== 0) {
        throw new Error(data.responseData || "Error al iniciar dispensación en la máquina.");
      }

      const txId = data.responseData;
      setDispenseProgress("Entregando dinero. Por favor espere...");

      // Poll status
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch("http://localhost:3001/api/status");
          if (!statusRes.ok) return;

          const statusData = await statusRes.json();
          // Check if session has ended or returned to idle
          const isIdle = statusData.cashStatus?.state === "Idle" || statusData.state === "Idle" || !statusData.transaction;
          
          // Verify if the transaction is finished
          if (isIdle) {
            clearInterval(pollIntervalRef.current!);
            await handleCompleteWithdrawal();
          }
        } catch (err) {
          console.error("Error polling recycler status:", err);
        }
      }, 1000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al conectar con el reciclador.");
      setStep("confirm");
    }
  };

  const handleCompleteWithdrawal = async () => {
    if (!withdrawalData || !companyId || !activeSession) return;

    try {
      const isDevolucion = withdrawalData.type === "devolucion";
      const category = isDevolucion ? "RETIRO_CANCELACION" : "RETIRO_FONDO";
      const reference = withdrawalData.reference || `Retiro Autorizado (Código: ${withdrawalData.code})`;

      // 1. Create cash transaction expense
      const txRef = await addDoc(collection(db, "companies", companyId, "cash_transactions"), {
        sessionId: activeSession.id,
        type: "EXPENSE",
        category,
        amount: withdrawalData.amount,
        reference,
        paymentMethod: "CASH",
        createdAt: serverTimestamp(),
        createdBy: user?.email || "Cajero"
      });

      // 2. Mark withdrawal code as completed in Firestore
      const docRef = doc(db, "companies", companyId, "cash_withdrawals", withdrawalData.id);
      await updateDoc(docRef, {
        status: "completed",
        completedAt: serverTimestamp(),
        completedBy: user?.email || "Cajero",
        sessionId: activeSession.id,
        cashTransactionId: txRef.id
      });

      setStep("success");
    } catch (err) {
      console.error("Error completing withdrawal record:", err);
      setError("El dinero fue entregado pero ocurrió un error al registrar el movimiento en el sistema.");
      setStep("confirm");
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(reqAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Por favor ingrese un monto válido.");
      return;
    }
    if (!reqDescription.trim()) {
      alert("Por favor proporcione un motivo o descripción.");
      return;
    }
    if (!companyId) return;

    setLoading(true);
    try {
      await addDoc(collection(db, "companies", companyId, "cash_withdrawals"), {
        amount,
        locationId: branchId || "",
        locationName: activeSession?.locationName || "Sucursal",
        status: "requested",
        type: "retiro_caja",
        reference: reqDescription.trim(),
        createdAt: serverTimestamp(),
        createdBy: user?.email || "Cajero",
        code: null
      });
      setStep("request_success");
    } catch (err: any) {
      console.error("Error creating withdrawal request from POS:", err);
      alert(err.message || "Error al enviar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col p-6 animate-in fade-in zoom-in duration-200 relative">
        
        {step !== "dispensing" && step !== "success" && (
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-1.5 hover:bg-muted rounded-full text-muted-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {step === "input" && (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Retiro con Código</h3>
              <p className="text-sm text-muted-foreground">
                Ingrese el código único de 6 dígitos proporcionado por Tesorería para activar el retiro.
              </p>
            </div>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setCode(val);
                }}
                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                disabled={loading}
                autoFocus
              />

              {error && (
                <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-12 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white hover:text-white" disabled={loading || code.length !== 6}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Validar Código"}
              </Button>
            </form>

            {availableCodes.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-left">Códigos Disponibles en Sucursal</p>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                  {availableCodes.map((c) => (
                    <div 
                      key={c.id} 
                      onClick={() => {
                        setCode(c.code);
                        setError("");
                      }}
                      className="flex items-center justify-between p-2.5 border rounded-lg hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-all group"
                    >
                      <div className="space-y-0.5 text-left">
                        <p className="font-mono text-sm font-bold text-primary flex items-center gap-1.5">
                          {c.code}
                          {c.type === "devolucion" && (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-semibold uppercase">
                              Devolución
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[200px]" title={c.reference}>
                          {c.reference || "Retiro"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold text-foreground text-sm">{formatMoney(c.amount)}</p>
                        <p className="text-[9px] text-muted-foreground">Clic para usar</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2">
              <Button 
                type="button" 
                variant="outline" 
                className="w-full text-xs font-semibold h-9"
                onClick={() => {
                  setStep("request_form");
                  setReqAmount("");
                  setReqDescription("");
                }}
              >
                Solicitar Retiro
              </Button>
            </div>
          </div>
        )}

        {step === "confirm" && withdrawalData && (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 mb-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Código de Retiro Válido</h3>
              <p className="text-xs text-muted-foreground">
                Verifique los detalles del retiro antes de proceder.
              </p>
            </div>

            <div className="bg-muted/30 border rounded-xl p-4 space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Sucursal:</span>
                <span className="font-semibold text-foreground">{withdrawalData.locationName}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Autorizado por:</span>
                <span className="font-semibold text-foreground truncate max-w-[200px]" title={withdrawalData.createdBy}>
                  {withdrawalData.createdBy?.split("@")[0]}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground font-semibold">Cantidad a dispensar:</span>
                <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                  {formatMoney(withdrawalData.amount)}
                </span>
              </div>
            </div>

            {!activeSession ? (
              <div className="bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs p-3 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Atención:</strong> No hay un turno de caja abierto para esta sucursal. Debe abrir un turno para poder registrar este egreso.
                </span>
              </div>
            ) : null}

            {error && (
              <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => {
                  setStep("input");
                  setError("");
                }} 
                className="w-1/2 h-12"
              >
                Volver
              </Button>
              <Button 
                onClick={handleStartDispense} 
                className="w-1/2 h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold hover:text-white"
                disabled={!activeSession || checkingSession}
              >
                Confirmar y Dispensar
              </Button>
            </div>
          </div>
        )}

        {step === "dispensing" && (
          <div className="space-y-6 py-4 flex flex-col items-center text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <h3 className="text-xl font-bold text-foreground">Retiro en Proceso</h3>
            <p className="text-sm text-muted-foreground">{dispenseProgress}</p>
            <p className="text-xs text-amber-500 font-semibold animate-pulse mt-2">
              Por favor no desconecte la máquina ni cierre esta ventana.
            </p>
          </div>
        )}

        {step === "success" && withdrawalData && (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 mb-2">
                <ArrowDownToLine className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-foreground">Retiro Completado</h3>
              <p className="text-sm text-muted-foreground">
                El dinero ha sido dispensado correctamente por el reciclador.
              </p>
            </div>

            <div className="bg-muted/30 border rounded-xl p-4 text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Monto Retirado</p>
              <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {formatMoney(withdrawalData.amount)}
              </p>
            </div>

            <Button onClick={onClose} className="w-full h-12 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white hover:text-white">
              Terminar
            </Button>
          </div>
        )}

        {step === "request_form" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Solicitar Retiro a Tesorería</h3>
              <p className="text-sm text-muted-foreground">
                Proporcione el monto y el motivo para que el tesorero lo autorice.
              </p>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Monto a Retirar (MXN)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">$</span>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={reqAmount}
                    onChange={(e) => setReqAmount(e.target.value)}
                    className="pl-7 h-10 bg-background"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Descripción / Motivo</label>
                <Input
                  type="text"
                  placeholder="Ej: Pago de proveedores, caja chica..."
                  value={reqDescription}
                  onChange={(e) => setReqDescription(e.target.value)}
                  className="h-10 bg-background"
                  required
                  disabled={loading}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => {
                    setStep("input");
                    setError("");
                  }} 
                  className="w-1/2 h-11"
                  disabled={loading}
                >
                  Volver
                </Button>
                <Button 
                  type="submit" 
                  className="w-1/2 h-11 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white hover:text-white"
                  disabled={loading || !reqAmount || !reqDescription}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Enviar Solicitud"}
                </Button>
              </div>
            </form>
          </div>
        )}

        {step === "request_success" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 mb-2">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold text-foreground">Solicitud Enviada</h3>
              <p className="text-sm text-muted-foreground">
                La solicitud de retiro por <strong>{formatMoney(parseFloat(reqAmount) || 0)}</strong> ha sido enviada al tesorero.
              </p>
              <p className="text-xs text-muted-foreground bg-muted p-3 rounded-lg border mt-2">
                Una vez autorizada, el código correspondiente aparecerá en la pantalla principal de "Retirar con Código".
              </p>
            </div>

            <Button 
              onClick={() => setStep("input")} 
              className="w-full h-12 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white hover:text-white"
            >
              Volver al Inicio
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
