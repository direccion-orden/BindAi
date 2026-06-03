"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, serverTimestamp, query, getDocs, where, onSnapshot } from "firebase/firestore";
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
  
  // Locations state
  const [locations, setLocations] = useState<Array<{id: string, name: string}>>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [loadingLocs, setLoadingLocs] = useState(false);

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

  const handleCountChange = (valStr: string, qtyStr: string) => {
    const qty = parseInt(qtyStr, 10) || 0;
    setCounts(prev => ({ ...prev, [valStr]: Math.max(0, qty) }));
  };

  const calculateTotal = () => {
    return DENOMINATIONS.reduce((acc, denom) => {
      const qty = counts[denom.value.toString()] || 0;
      return acc + (qty * denom.value);
    }, 0);
  };

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
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold">Declarar Fondo Inicial</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configura tu sucursal e ingresa la cantidad exacta de billetes y monedas con los que inicia el turno.
        </p>
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
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleOpenShift} disabled={loading || !selectedLocationId} className="gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Abrir Turno
        </Button>
      </div>
    </div>
  );
}
