"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, getDocs, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, DollarSign, MapPin } from "lucide-react";

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

export function AbrirTurnoForm({ 
  onOpened, 
  onCancel, 
  defaultLocationId 
}: { 
  onOpened: (session: any) => void; 
  onCancel: () => void; 
  defaultLocationId?: string;
}) {
  const { user, companyId } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [recyclerConnected, setRecyclerConnected] = useState(false);
  const [loadingRecycler, setLoadingRecycler] = useState(false);
  
  // Locations state
  const [locations, setLocations] = useState<Array<{id: string, name: string}>>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [loadingLocs, setLoadingLocs] = useState(false);

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
    if (defaultLocationId && locations.some(loc => loc.id === defaultLocationId)) {
      setSelectedLocationId(defaultLocationId);
    }
  }, [defaultLocationId, locations]);

  useEffect(() => {
    if (!companyId) {
      setLoadingLocs(false);
      return;
    }

    setLoadingLocs(true);
    const q = query(collection(db, "companies", companyId, "locations"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        const data = snapshot.docs.map(doc => {
          const d = doc.data();
          return { 
            id: doc.id, 
            name: d.name || d.Name || "Sucursal sin nombre" 
          };
        });
        setLocations(data);
      } catch (e) {
        console.error("Error cargando sucursales:", e);
      } finally {
        setLoadingLocs(false);
      }
    }, (error) => {
      console.error("Error en subscripción de sucursales:", error);
      setLoadingLocs(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  // Vault Adjustments state
  const [pendingVaultAdjustments, setPendingVaultAdjustments] = useState<any[]>([]);
  const [loadingVault, setLoadingVault] = useState(false);

  useEffect(() => {
    if (!companyId || !selectedLocationId) {
      setPendingVaultAdjustments([]);
      return;
    }

    setLoadingVault(true);
    const q = query(
      collection(db, "companies", companyId, "cash_transactions"),
      where("locationId", "==", selectedLocationId),
      where("isVaultAdjustment", "==", true),
      where("sessionId", "==", null)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingVaultAdjustments(data);
      setLoadingVault(false);
    }, (err) => {
      console.error("Error fetching vault adjustments:", err);
      setLoadingVault(false);
    });

    return () => unsubscribe();
  }, [companyId, selectedLocationId]);

  const handleCountChange = (valStr: string, qtyStr: string) => {
    const qty = parseInt(qtyStr, 10) || 0;
    setCounts(prev => ({ ...prev, [valStr]: Math.max(0, qty) }));
  };

  const calculateTotal = () => {
    const countsTotal = DENOMINATIONS.reduce((acc, denom) => {
      const qty = counts[denom.value.toString()] || 0;
      return acc + (qty * denom.value);
    }, 0);
    return countsTotal;
  };

  const vaultAdjustmentsTotal = pendingVaultAdjustments.reduce((acc, adj) => {
    return acc + (adj.type === "INCOME" ? adj.amount : -adj.amount);
  }, 0);

  const handleOpenShift = async () => {
    if (!selectedLocationId) {
       alert("Por favor selecciona la sucursal de donde estás abriendo la caja.");
       return;
    }

    const total = calculateTotal();
    if (total <= 0) {
        if (!confirm("El fondo inicial es $0.00. ¿Estás seguro de abrir la caja sin fondo?")) {
            return;
        }
    }

    const locName = locations.find(l => l.id === selectedLocationId)?.name || "Desconocida";

    setLoading(true);
    try {
      if (!companyId) return;
      // First, check if there's already an open session for this location
      const q = query(
        collection(db, "companies", companyId, "cash_sessions"),
        where("status", "==", "open"),
        where("locationId", "==", selectedLocationId)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        alert("Ya existe una caja abierta para esta sucursal. Por favor selecciona otra o cierra la actual primero.");
        setLoading(false);
        return;
      }

      const sessionData = {
        status: "open",
        openedAt: serverTimestamp(),
        openedByEmail: user?.email || "Usuario desconocido",
        openedByUid: user?.uid || "anon",
        locationId: selectedLocationId,
        locationName: locName,
        initialFloat: total,
        openingDenominations: counts,
        expectedCash: total, // Al inicio, el esperado es solo el fondo
        countedCash: 0,
        discrepancy: 0
      };

      const docRef = await addDoc(collection(db, "companies", companyId, "cash_sessions"), sessionData);
      
      // Link pending vault adjustments to this new session
      if (pendingVaultAdjustments.length > 0) {
        const batchPromises = pendingVaultAdjustments.map(adj => 
          updateDoc(doc(db, "companies", companyId, "cash_transactions", adj.id), {
            sessionId: docRef.id,
            isVaultAdjustment: false // No longer pending
          })
        );
        await Promise.all(batchPromises);
      }

      onOpened({ id: docRef.id, ...sessionData, openedAt: new Date() });
    } catch (error) {
      console.error("Error al abrir turno:", error);
      alert("Ocurrió un error al intentar abrir la caja.");
    } finally {
      setLoading(false);
    }
  };

  const totalFormat = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(calculateTotal());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex-1 space-y-1">
          <h2 className="text-xl font-bold">Declarar Fondo Inicial</h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Configura tu sucursal e ingresa la cantidad exacta de billetes y monedas con los que inicia el turno.
          </p>
        </div>
        {recyclerConnected && (
          <Button
            type="button"
            onClick={handleLoadFromRecycler}
            disabled={loadingRecycler}
            className="!bg-indigo-600 hover:!bg-indigo-700 text-white font-bold shrink-0 text-xs gap-1.5 h-9 px-4 rounded-lg shadow-md hover:shadow-lg transition-all"
          >
            {loadingRecycler ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Cargando...
              </>
            ) : (
              "Cargar del Reciclador"
            )}
          </Button>
        )}
      </div>

      <div className="space-y-3 bg-muted/20 p-4 rounded-lg border">
        <label className="text-sm font-medium flex items-center gap-2">
           <MapPin className="h-4 w-4 text-muted-foreground" />
           Sucursal Operativa
        </label>
        {loadingLocs ? (
           <div className="flex gap-2 items-center text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Cargando catálogo ERP...</div>
        ) : (
           <select 
             className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
             value={selectedLocationId}
             onChange={e => setSelectedLocationId(e.target.value)}
           >
             <option value="" disabled>-- Selecciona tu sucursal --</option>
             {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
             ))}
           </select>
        )}
      </div>

      {pendingVaultAdjustments.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 animate-in slide-in-from-top duration-300">
          <Loader2 className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-800">Ajustes de Tesorería Detectados</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              Se han detectado <strong>{pendingVaultAdjustments.length}</strong> movimientos realizados por Tesorería fuera de turno.
              Al abrir la caja, estos movimientos se vincularán automáticamente a tu historial.
            </p>
            <div className="pt-1">
               <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vaultAdjustmentsTotal >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                 Impacto en fondo: {vaultAdjustmentsTotal >= 0 ? '+' : ''}{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(vaultAdjustmentsTotal)}
               </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-rows-6 md:grid-flow-col gap-x-8 gap-y-4">
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
                className="w-24 text-center font-semibold"
                value={qty}
                onChange={(e) => handleCountChange(denom.value.toString(), e.target.value)}
              />
              <div className="text-sm text-foreground font-medium w-20 text-right">
                ${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-muted/30 p-4 rounded-lg flex items-center justify-between border">
        <div className="text-sm font-medium text-muted-foreground">Total Fondo Inicial</div>
        <div className="text-2xl font-bold flex items-center gap-2 text-primary">
          <DollarSign className="h-6 w-6 opacity-50" />
          {totalFormat}
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-2">
        <Button 
          variant="ghost" 
          onClick={onCancel} 
          disabled={loading}
          className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-bold h-10 px-4 rounded-lg transition-all"
        >
          Cancelar
        </Button>
        <Button 
          onClick={handleOpenShift} 
          disabled={loading || !selectedLocationId} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-5 rounded-lg shadow-md hover:shadow-lg transition-all gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Abrir Turno
        </Button>
      </div>
    </div>
  );
}
