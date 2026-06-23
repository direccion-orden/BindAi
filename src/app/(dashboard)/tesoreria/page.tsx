"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Unlock, Vault, Coins, Banknote, History, Loader2, PlusCircle, ArrowDownToLine, Trash2, Save, CheckCircle2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/client';
import { collection, query, where, addDoc, onSnapshot, serverTimestamp, getDocs, doc, updateDoc, limit, orderBy } from 'firebase/firestore';

export default function TesoreriaPage() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    
    const [cashStatus, setCashStatus] = useState<any>(null);
    const [denominations, setDenominations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [sessionMessage, setSessionMessage] = useState("");
    const [sessionAmount, setSessionAmount] = useState(0);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const { user, companyId } = useAuth();
    const [mockMode, setMockMode] = useState(false);

    // Cash Sessions Integration
    const [openSessions, setOpenSessions] = useState<any[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string>("");
    const activeCashSession = openSessions.find(s => s.id === selectedSessionId) || openSessions[0] || null;

    // Mock Recycler Inventory Levels (pesos)
    const [mockSystemCash, setMockSystemCash] = useState(157500); // $1,575.00
    const [mockCollectableCash, setMockCollectableCash] = useState(42000); // $420.00
    const [mockBillsStored, setMockBillsStored] = useState(85000); // $850.00
    const [mockCoinsStored, setMockCoinsStored] = useState(30500); // $305.00
    const [mockBillsCashbox, setMockBillsCashbox] = useState(32000); // $320.00
    const [mockCoinsCashbox, setMockCoinsCashbox] = useState(10000); // $100.00

    useEffect(() => {
        if (!companyId) return;
        
        const q = query(
            collection(db, "companies", companyId, "cash_sessions"),
            where("status", "==", "open")
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOpenSessions(data);
            if (data.length > 0 && !selectedSessionId) {
                setSelectedSessionId(data[0].id);
            }
        }, (err) => {
            console.error("Error fetching open sessions:", err);
        });
        
        return () => unsubscribe();
    }, [companyId]);

    // Withdrawal Authorization Integration
    const [locations, setLocations] = useState<any[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState("");
    const [withdrawalAmount, setWithdrawalAmount] = useState("");
    const [generatedCode, setGeneratedCode] = useState("");
    const [withdrawals, setWithdrawals] = useState<any[]>([]);
    const [generatingCode, setGeneratingCode] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!companyId) return;

        // Fetch locations
        const qLoc = query(collection(db, "companies", companyId, "locations"));
        const unsubLoc = onSnapshot(qLoc, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLocations(data);
            if (data.length > 0 && !selectedLocationId) {
                setSelectedLocationId(data[0].id);
            }
        });

        // Fetch withdrawals
        const qWith = query(
            collection(db, "companies", companyId, "cash_withdrawals"),
            orderBy("createdAt", "desc"),
            limit(50)
        );
        const unsubWith = onSnapshot(qWith, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWithdrawals(data);
        }, (err) => {
            console.error("Error fetching withdrawals:", err);
        });

        return () => {
            unsubLoc();
            unsubWith();
        };
    }, [companyId]);

    const generateUniqueCode = async (): Promise<string> => {
        let attempts = 0;
        while (attempts < 10) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const q = query(
                collection(db, "companies", companyId!, "cash_withdrawals"),
                where("code", "==", code),
                where("status", "==", "pending")
            );
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                return code;
            }
            attempts++;
        }
        throw new Error("No se pudo generar un código único después de varios intentos.");
    };

    const handleGenerateWithdrawalCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId) return;
        const amount = parseFloat(withdrawalAmount);
        if (isNaN(amount) || amount <= 0) {
            alert("Por favor ingrese un monto válido mayor a 0.");
            return;
        }
        if (!selectedLocationId) {
            alert("Por favor seleccione una sucursal.");
            return;
        }

        setGeneratingCode(true);
        try {
            const code = await generateUniqueCode();
            const selectedLoc = locations.find(l => l.id === selectedLocationId);
            const locationName = selectedLoc ? selectedLoc.name || selectedLoc.Name || selectedLoc.nombre || "Sucursal" : "Sucursal";

            await addDoc(collection(db, "companies", companyId, "cash_withdrawals"), {
                code,
                amount,
                locationId: selectedLocationId,
                locationName,
                status: "pending",
                createdAt: serverTimestamp(),
                createdBy: user?.email || "Tesorero"
            });

            setGeneratedCode(code);
            setWithdrawalAmount("");
        } catch (err: any) {
            console.error("Error generating code:", err);
            alert(err.message || "Error al generar el código.");
        } finally {
            setGeneratingCode(false);
        }
    };

    const handleCancelWithdrawal = async (id: string) => {
        if (!companyId) return;
        if (!confirm("¿Estás seguro de que deseas cancelar este código de retiro?")) {
            return;
        }

        try {
            const ref = doc(db, "companies", companyId, "cash_withdrawals", id);
            await updateDoc(ref, {
                status: "cancelled",
                cancelledAt: serverTimestamp(),
                cancelledBy: user?.email || "Tesorero"
            });
        } catch (err) {
            console.error("Error cancelling withdrawal:", err);
            alert("No se pudo cancelar el retiro.");
        }
    };

    const TREASURER_PIN = process.env.NEXT_PUBLIC_TREASURER_PIN || "123456";

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin === TREASURER_PIN) {
            setIsAuthenticated(true);
            setError("");
            loadData();
        } else {
            setError("PIN incorrecto. Intente de nuevo.");
            setPin("");
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            // Check connection to hardware agent
            const statusRes = await fetch('http://localhost:3001/api/status');
            if (statusRes.ok) {
                const data = await statusRes.json();
                setCashStatus(data.cashStatus);
                setMockMode(false);
            } else {
                throw new Error("Local agent not responding");
            }
            
            const systemRes = await fetch('http://localhost:3001/api/system');
            if (systemRes.ok) {
                const systemData = await systemRes.json();
                if (systemData.paymentDevices) {
                    let allDenoms: any[] = [];
                    systemData.paymentDevices.forEach((device: any) => {
                        if (device.denominations) {
                            allDenoms = [...allDenoms, ...device.denominations];
                        }
                    });
                    setDenominations(allDenoms.sort((a: any, b: any) => a.value - b.value));
                }
            }
        } catch (err) {
            console.warn("[Treasury Page] Recycler hardware offline. Falling back to simulation mode.", err);
            setMockMode(true);
            
            // Populate mock denominations
            setDenominations([
                { value: 100000, label: "Billetes de $1000", enabled: true, floatLevel: 10 },
                { value: 50000, label: "Billetes de $500", enabled: true, floatLevel: 15 },
                { value: 20000, label: "Billetes de $200", enabled: true, floatLevel: 20 },
                { value: 10000, label: "Billetes de $100", enabled: true, floatLevel: 25 },
                { value: 5000, label: "Billetes de $50", enabled: true, floatLevel: 30 },
                { value: 2000, label: "Billetes de $20", enabled: true, floatLevel: 30 },
                { value: 1000, label: "Monedas de $10", enabled: true, floatLevel: 50 },
                { value: 500, label: "Monedas de $5", enabled: true, floatLevel: 50 },
                { value: 200, label: "Monedas de $2", enabled: true, floatLevel: 50 },
                { value: 100, label: "Monedas de $1", enabled: true, floatLevel: 100 },
                { value: 50, label: "Monedas de 50¢", enabled: true, floatLevel: 100 }
            ]);
            
            // Set mock cash status
            setCashStatus({
                totalSystemCash: mockSystemCash,
                totalCollectableCash: mockCollectableCash,
                billsStored: mockBillsStored,
                coinsStored: mockCoinsStored,
                billsCashbox: mockBillsCashbox,
                coinsCashbox: mockCoinsCashbox
            });
        }
        setLoading(false);
    };

    const formatMoney = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    const startSession = async (requestType: string, message: string) => {
        setActionLoading(true);
        if (mockMode) {
            // Simulated Recycler Session
            setActiveSession(requestType);
            setSessionMessage(message);
            setSessionAmount(0);
            
            let simulatedCount = 0;
            let targetAmount = 0;
            if (requestType === 'RefillCash') {
                targetAmount = 1250;
            } else if (requestType === 'CollectAllCash') {
                targetAmount = mockCollectableCash / 100;
            } else if (requestType === 'EmptyAllCash') {
                targetAmount = mockSystemCash / 100;
            }
            
            pollIntervalRef.current = setInterval(() => {
                if (requestType === 'RefillCash') {
                    simulatedCount += 100;
                    if (simulatedCount >= targetAmount) {
                        setSessionAmount(targetAmount);
                        clearInterval(pollIntervalRef.current!);
                    } else {
                        setSessionAmount(simulatedCount);
                    }
                } else {
                    // Cuts and Empties dispense quickly
                    simulatedCount += 250;
                    if (simulatedCount >= targetAmount) {
                        setSessionAmount(targetAmount);
                        clearInterval(pollIntervalRef.current!);
                    } else {
                        setSessionAmount(simulatedCount);
                    }
                }
            }, 1000);
            
            setActionLoading(false);
            return;
        }

        // Real Hardware Session
        try {
            const res = await fetch('http://localhost:3001/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request: requestType })
            });
            
            if (!res.ok) throw new Error("Error iniciando sesión");
            const data = await res.json();
            
            if (data.responseCode !== 0) {
                alert("Error de máquina: " + data.responseData);
                setActionLoading(false);
                return;
            }
            
            const txId = data.responseData;
            setActiveSession(requestType);
            setSessionMessage(message);
            setSessionAmount(0);
            
            // Iniciar Polling
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch('http://localhost:3001/api/status');
                    if (!statusRes.ok) return;
                    const statusData = await statusRes.json();
                    
                    if (requestType === 'RefillCash') {
                        const events = statusData.events || [];
                        const currentTxEvents = txId ? events.filter((e: any) => e.transaction?.transaction_id === txId) : events;
                        const refillEvent = currentTxEvents.find((e: any) => e.transaction && e.transaction.cash_in !== undefined);
                        if (refillEvent) {
                            setSessionAmount(refillEvent.transaction.cash_in / 100);
                        } else if (statusData.transaction && statusData.transaction.transaction_id === txId) {
                            setSessionAmount((statusData.transaction.cash_in || 0) / 100);
                        }
                    } else if (requestType === 'CollectAllCash' || requestType === 'EmptyAllCash') {
                        if (statusData.transaction && statusData.transaction.transaction_id === txId) {
                            setSessionAmount((statusData.transaction.cash_out || 0) / 100);
                        }
                    }
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 1000);
        } catch (err) {
            console.error(err);
            alert("No se pudo conectar con el agente de hardware.");
        }
        setActionLoading(false);
    };

    const closeSession = async () => {
        setActionLoading(true);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        
        try {
            if (mockMode) {
                // Mock State updates
                if (activeSession === 'RefillCash') {
                    const newSystem = mockSystemCash + (sessionAmount * 100);
                    const newBills = mockBillsStored + (sessionAmount * 80);
                    const newCoins = mockCoinsStored + (sessionAmount * 20);
                    setMockSystemCash(newSystem);
                    setMockBillsStored(newBills);
                    setMockCoinsStored(newCoins);
                    setCashStatus({
                        totalSystemCash: newSystem,
                        totalCollectableCash: mockCollectableCash,
                        billsStored: newBills,
                        coinsStored: newCoins,
                        billsCashbox: mockBillsCashbox,
                        coinsCashbox: mockCoinsCashbox
                    });
                } else if (activeSession === 'CollectAllCash') {
                    const newSystem = Math.max(0, mockSystemCash - (sessionAmount * 100));
                    setMockSystemCash(newSystem);
                    setMockCollectableCash(0);
                    setCashStatus({
                        totalSystemCash: newSystem,
                        totalCollectableCash: 0,
                        billsStored: mockBillsStored,
                        coinsStored: mockCoinsStored,
                        billsCashbox: mockBillsCashbox,
                        coinsCashbox: mockCoinsCashbox
                    });
                } else if (activeSession === 'EmptyAllCash') {
                    setMockSystemCash(0);
                    setMockCollectableCash(0);
                    setMockBillsStored(0);
                    setMockCoinsStored(0);
                    setMockBillsCashbox(0);
                    setMockCoinsCashbox(0);
                    setCashStatus({
                        totalSystemCash: 0,
                        totalCollectableCash: 0,
                        billsStored: 0,
                        coinsStored: 0,
                        billsCashbox: 0,
                        coinsCashbox: 0
                    });
                }
            } else {
                // Real Hardware close
                await fetch('http://localhost:3001/api/session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ request: 'CloseSession' })
                });
            }

            // --- Control de Caja Integration ---
            if (sessionAmount > 0 && companyId && activeCashSession) {
                const isIncome = activeSession === 'RefillCash';
                const txPayload = {
                    sessionId: activeCashSession.id,
                    type: isIncome ? "INCOME" : "EXPENSE",
                    category: isIncome ? "INGRESO_FONDO" : "RETIRO_FONDO",
                    amount: sessionAmount,
                    reference: activeSession === 'RefillCash' 
                        ? "Refill Reciclador (Tesorería)"
                        : activeSession === 'CollectAllCash'
                            ? "Corte Parcial Reciclador (Tesorería)"
                            : "Retiro Total Reciclador (Tesorería)",
                    paymentMethod: "CASH",
                    createdAt: serverTimestamp(),
                    createdBy: user?.email || "Tesorero"
                };

                await addDoc(collection(db, "companies", companyId, "cash_transactions"), txPayload);
                console.log("[Treasury] Cash transaction registered in Control de Caja:", txPayload);
            }

            setActiveSession(null);
            setSessionMessage("");
            
            // Recargar datos para ver el nuevo inventario
            if (!mockMode) {
                setTimeout(loadData, 1000);
            }
        } catch (err) {
            console.error(err);
            alert("Error al cerrar la sesión.");
        }
        setActionLoading(false);
    };

    const updateFloatLevels = async () => {
        setActionLoading(true);
        if (mockMode) {
            alert("Niveles base (Float) actualizados en modo simulación.");
            setActionLoading(false);
            return;
        }

        try {
            const res = await fetch('http://localhost:3001/api/denomination', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    request: 'PaymentDeviceOptions',
                    denominations: denominations
                })
            });
            
            if (res.ok) {
                alert("Niveles base (Float) actualizados correctamente.");
            } else {
                alert("Error al guardar la configuración.");
            }
        } catch (err) {
            console.error(err);
            alert("Error de conexión al actualizar denominaciones.");
        }
        setActionLoading(false);
    };

    const handleFloatChange = (index: number, newLevel: number) => {
        const updated = [...denominations];
        updated[index].floatLevel = newLevel;
        setDenominations(updated);
    };

    if (!isAuthenticated) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-6rem)]">
                <div className="bg-card border rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-6">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                        <ShieldAlert className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight">Acceso Tesorería</h2>
                    <p className="text-sm text-muted-foreground">
                        Ingrese el PIN de seguridad para gestionar el hardware de efectivo.
                    </p>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <Input 
                            type="password" 
                            inputMode="numeric"
                            placeholder="PIN de Tesorero" 
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            className="text-center text-lg tracking-[0.5em] font-mono h-12"
                            autoFocus
                        />
                        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                        <Button type="submit" className="w-full h-12 text-md font-semibold">
                            <Unlock className="w-4 h-4 mr-2" />
                            Desbloquear
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-8 animate-in fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Vault className="w-8 h-8 text-primary" />
                        Tesorería
                    </h1>
                    <p className="text-muted-foreground mt-1">Gestión remota de bóveda y reciclador CashGenic</p>
                </div>
                <Button variant="outline" onClick={loadData} disabled={loading}>
                    Actualizar Estado
                </Button>
            </div>

            {/* Banners de Estado y Conexión */}
            <div className="space-y-4">
                {mockMode && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top duration-300">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500 shrink-0">
                                <ShieldAlert className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-amber-700 dark:text-amber-400">Agente de Hardware Fuera de Línea</h4>
                                <p className="text-sm text-amber-600 dark:text-amber-500 mt-0.5">
                                    No se pudo establecer conexión con el reciclador en el puerto 3001. El sistema está operando en <strong>Modo Simulación</strong>.
                                </p>
                            </div>
                        </div>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={loadData} 
                            disabled={loading}
                            className="border-amber-500/30 hover:bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-2 font-medium shrink-0"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reintentar Conexión"}
                        </Button>
                    </div>
                )}
                {activeCashSession ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top duration-300">
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 shrink-0">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div className="space-y-0.5">
                                <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">Turno de Caja Vinculado</h4>
                                <p className="text-sm text-emerald-600 dark:text-emerald-500">
                                    Sucursal activa: <strong className="text-emerald-800 dark:text-emerald-300">{activeCashSession.locationName}</strong> ({activeCashSession.openedByEmail})
                                </p>
                            </div>
                        </div>
                        {openSessions.length > 1 && (
                            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                                <span className="text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">Cambiar Caja:</span>
                                <select 
                                    value={selectedSessionId} 
                                    onChange={(e) => setSelectedSessionId(e.target.value)}
                                    className="bg-background border border-border rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                                >
                                    {openSessions.map((session) => (
                                        <option key={session.id} value={session.id}>
                                            {session.locationName} ({session.openedByEmail?.split('@')[0]})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top duration-300">
                        <div className="w-10 h-10 bg-rose-500/20 rounded-full flex items-center justify-center text-rose-500 shrink-0">
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-rose-700 dark:text-rose-400">Sin Turno de Caja Activo</h4>
                            <p className="text-sm text-rose-600 dark:text-rose-500 mt-0.5">
                                No hay un turno de caja abierto en ninguna sucursal. Las operaciones de bóveda se realizarán físicamente, pero <strong>no se registrarán contablemente</strong> en el control de caja.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Sesión Activa */}
            {activeSession && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-card border rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-6 animate-in zoom-in-95">
                        <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                        <h3 className="text-2xl font-bold">{sessionMessage}</h3>
                        
                        {activeSession === 'RefillCash' && (
                            <div className="bg-muted/30 p-6 rounded-xl border">
                                <p className="text-sm font-semibold uppercase text-muted-foreground mb-2">Ingresado hasta ahora</p>
                                <p className="text-5xl font-black text-green-600">{formatMoney(sessionAmount)}</p>
                                <p className="text-xs text-muted-foreground mt-4">Inserte billetes/monedas en la máquina.</p>
                            </div>
                        )}

                        <Button onClick={closeSession} size="lg" className="w-full h-14 text-lg" disabled={actionLoading}>
                            Terminar y Cerrar Sesión
                        </Button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Inventario */}
                <div className="bg-card border rounded-2xl p-6 shadow-sm">
                    <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                        <Coins className="w-5 h-5 text-primary" />
                        Inventario del Sistema
                    </h2>
                    
                    {loading && !cashStatus ? (
                        <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                    ) : cashStatus ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-primary/5 border rounded-xl p-4">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Total en Sistema</p>
                                    <p className="text-3xl font-black mt-1">{formatMoney(cashStatus.totalSystemCash / 100)}</p>
                                </div>
                                <div className="bg-primary/5 border rounded-xl p-4">
                                    <p className="text-xs font-semibold text-muted-foreground uppercase">Para Recolección</p>
                                    <p className="text-3xl font-black mt-1 text-orange-600">{formatMoney(cashStatus.totalCollectableCash / 100)}</p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                                <div>
                                    <p className="text-sm font-semibold mb-2">Dispensador</p>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between"><span className="text-muted-foreground">Billetes:</span> <span className="font-medium">{formatMoney(cashStatus.billsStored / 100)}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">Monedas:</span> <span className="font-medium">{formatMoney(cashStatus.coinsStored / 100)}</span></div>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold mb-2">Caja Fuerte</p>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between"><span className="text-muted-foreground">Billetes:</span> <span className="font-medium">{formatMoney(cashStatus.billsCashbox / 100)}</span></div>
                                        <div className="flex justify-between"><span className="text-muted-foreground">Monedas:</span> <span className="font-medium">{formatMoney(cashStatus.coinsCashbox / 100)}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-sm">No se pudo cargar el inventario.</p>
                    )}
                </div>

                {/* Acciones Rápidas */}
                <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col">
                    <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                        <History className="w-5 h-5 text-primary" />
                        Acciones de Bóveda
                    </h2>
                    
                    <div className="flex-1 flex flex-col justify-center gap-4">
                        <Button 
                            variant="default" 
                            size="lg" 
                            className="w-full h-14 bg-green-600 hover:bg-green-700"
                            onClick={() => startSession('RefillCash', 'Ingreso de Efectivo (Refill)')}
                            disabled={actionLoading || activeSession !== null}
                        >
                            <PlusCircle className="w-5 h-5 mr-2" />
                            Ingresar Efectivo (Refill)
                        </Button>
                        
                        <Button 
                            variant="secondary" 
                            size="lg" 
                            className="w-full h-14 bg-orange-100 text-orange-700 hover:bg-orange-200"
                            onClick={() => startSession('CollectAllCash', 'Retirando excedente...')}
                            disabled={actionLoading || activeSession !== null}
                        >
                            <ArrowDownToLine className="w-5 h-5 mr-2" />
                            Corte Parcial (Dejar Nivel Base)
                        </Button>
                        
                        <Button 
                            variant="destructive" 
                            size="lg" 
                            className="w-full h-14"
                            onClick={() => {
                                if (confirm("¿Estás seguro de que deseas VACIAR completamente la máquina? Esto removerá todo el efectivo para dar cambio.")) {
                                    startSession('EmptyAllCash', 'Vaciando máquina por completo...');
                                }
                            }}
                            disabled={actionLoading || activeSession !== null}
                        >
                            <Trash2 className="w-5 h-5 mr-2" />
                            Vaciar Máquina (Retiro Total)
                        </Button>
                    </div>
                </div>
                
                {/* Configuración de Nivel Base (Float) */}
                <div className="bg-card border rounded-2xl p-6 shadow-sm md:col-span-2">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Banknote className="w-5 h-5 text-primary" />
                            Configuración de Nivel Base (Float)
                        </h2>
                        <Button onClick={updateFloatLevels} disabled={actionLoading || denominations.length === 0}>
                            <Save className="w-4 h-4 mr-2" />
                            Guardar Niveles
                        </Button>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mb-6">
                        El Nivel Base (Float) es la cantidad de billetes/monedas que la máquina mantendrá en su dispensador de cambios después de hacer un "Corte Parcial".
                    </p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {denominations.filter(d => d.enabled).map((denom, idx) => (
                            <div key={`${denom.country}-${denom.value}`} className="border rounded-lg p-3 bg-muted/10">
                                <p className="text-xs uppercase font-semibold text-muted-foreground mb-2 flex justify-between">
                                    <span>Valor: {formatMoney(denom.value / 100)}</span>
                                </p>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Cantidad (Piezas)</label>
                                    <Input 
                                        type="number" 
                                        min="0"
                                        value={denom.floatLevel}
                                        onChange={(e) => handleFloatChange(idx, parseInt(e.target.value) || 0)}
                                        className="h-8 font-mono text-center"
                                    />
                                    <p className="text-xs text-right mt-1 font-semibold text-primary">
                                        = {formatMoney((denom.value / 100) * denom.floatLevel)}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {denominations.length === 0 && !loading && (
                            <p className="text-sm text-muted-foreground col-span-full">No hay denominaciones configuradas disponibles.</p>
                        )}
                    </div>
                </div>

                {/* Autorización de Retiros */}
                <div className="bg-card border rounded-2xl p-6 shadow-sm md:col-span-2 space-y-6">
                    <div className="flex justify-between items-center border-b pb-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <ArrowDownToLine className="w-5 h-5 text-primary" />
                            Autorización de Retiros Especiales
                        </h2>
                    </div>

                    <form onSubmit={handleGenerateWithdrawalCode} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">Sucursal Destino</label>
                            <select
                                value={selectedLocationId}
                                onChange={(e) => setSelectedLocationId(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                                required
                            >
                                <option value="">Seleccionar Sucursal...</option>
                                {locations.map((loc) => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.name || loc.Name || loc.nombre || loc.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold">Monto a Retirar (MXN)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">$</span>
                                <Input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={withdrawalAmount}
                                    onChange={(e) => setWithdrawalAmount(e.target.value)}
                                    className="pl-7 h-10"
                                    required
                                />
                            </div>
                        </div>
                        <Button type="submit" disabled={generatingCode || !selectedLocationId || !withdrawalAmount} className="h-10">
                            {generatingCode ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Generando...
                                </>
                            ) : (
                                "Generar Código de Retiro"
                            )}
                        </Button>
                    </form>

                    {generatedCode && (
                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in zoom-in-95">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/15 rounded-full flex items-center justify-center text-primary shrink-0">
                                    <Unlock className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-primary">Código Generado Correctamente</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Proporcione este código al personal de la tienda seleccionada.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 bg-card border px-4 py-2 rounded-lg shadow-sm">
                                <span className="font-mono text-2xl font-bold tracking-widest text-primary">{generatedCode}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        navigator.clipboard.writeText(generatedCode);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }}
                                    className="h-8 w-8 p-0"
                                >
                                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                            <History className="w-4 h-4 text-muted-foreground" />
                            Historial de Retiros Autorizados
                        </h3>
                        <div className="border rounded-xl overflow-hidden bg-card">
                            <table className="w-full border-collapse text-left text-sm text-muted-foreground">
                                <thead className="bg-muted/55 text-foreground font-semibold text-xs uppercase border-b">
                                    <tr>
                                        <th className="px-4 py-3">Código</th>
                                        <th className="px-4 py-3">Sucursal</th>
                                        <th className="px-4 py-3">Monto</th>
                                        <th className="px-4 py-3">Estado</th>
                                        <th className="px-4 py-3">Creado por</th>
                                        <th className="px-4 py-3">Fecha</th>
                                        <th className="px-4 py-3 text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {withdrawals.map((withdrawal) => {
                                        const dateStr = withdrawal.createdAt?.toDate 
                                            ? withdrawal.createdAt.toDate().toLocaleString('es-MX') 
                                            : "...";
                                        return (
                                            <tr key={withdrawal.id} className="hover:bg-muted/30">
                                                <td className="px-4 py-3 font-mono font-bold text-foreground">{withdrawal.code}</td>
                                                <td className="px-4 py-3 font-medium text-foreground">{withdrawal.locationName}</td>
                                                <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(withdrawal.amount)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                        withdrawal.status === 'pending' 
                                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' 
                                                            : withdrawal.status === 'completed'
                                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                                : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'
                                                    }`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full ${
                                                            withdrawal.status === 'pending' 
                                                                ? 'bg-amber-500' 
                                                                : withdrawal.status === 'completed'
                                                                    ? 'bg-emerald-500'
                                                                    : 'bg-rose-500'
                                                        }`} />
                                                        {withdrawal.status === 'pending' ? 'Pendiente' : withdrawal.status === 'completed' ? 'Completado' : 'Cancelado'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs">{withdrawal.createdBy?.split('@')[0] || "Tesorero"}</td>
                                                <td className="px-4 py-3 text-xs">{dateStr}</td>
                                                <td className="px-4 py-3 text-right">
                                                    {withdrawal.status === 'pending' && (
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            onClick={() => handleCancelWithdrawal(withdrawal.id)}
                                                            className="h-8 px-2"
                                                        >
                                                            Cancelar
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {withdrawals.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                                No hay retiros autorizados registrados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
