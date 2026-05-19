"use client";

import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, Unlock, Vault, Coins, Banknote, History, Loader2, PlusCircle, ArrowDownToLine, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
            const statusRes = await fetch('http://localhost:3001/api/status');
            if (statusRes.ok) {
                const data = await statusRes.json();
                setCashStatus(data.cashStatus);
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
                    // Ordenar por valor ascendente
                    setDenominations(allDenoms.sort((a: any, b: any) => a.value - b.value));
                }
            }
        } catch (err) {
            console.error("Error cargando datos:", err);
        }
        setLoading(false);
    };

    const formatMoney = (amount: number) => {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
    };

    const startSession = async (requestType: string, message: string) => {
        setActionLoading(true);
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
                        
                        // Buscamos si hay un evento de "Refill" o si la transacción tiene cash_in
                        const refillEvent = currentTxEvents.find((e: any) => e.transaction && e.transaction.cash_in !== undefined);
                        if (refillEvent) {
                            setSessionAmount(refillEvent.transaction.cash_in / 100);
                        } else if (statusData.transaction && statusData.transaction.transaction_id === txId) {
                            setSessionAmount((statusData.transaction.cash_in || 0) / 100);
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
            await fetch('http://localhost:3001/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request: 'CloseSession' })
            });
            setActiveSession(null);
            setSessionMessage("");
            // Recargar datos para ver el nuevo inventario
            setTimeout(loadData, 1000);
        } catch (err) {
            console.error(err);
            alert("Error al cerrar la sesión.");
        }
        setActionLoading(false);
    };

    const updateFloatLevels = async () => {
        setActionLoading(true);
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

            </div>
        </div>
    );
}
