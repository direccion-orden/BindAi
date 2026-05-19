"use client";

import { useEffect, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { collection, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { usePOS } from "@/context/POSContext";

export function BranchSelector() {
  const { branchId, setBranchId } = usePOS();
  const [branches, setBranches] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);

  const { companyId } = useAuth();
  
  useEffect(() => {
    async function fetchLocations() {
      if (!companyId) return;
      try {
        const q = query(collection(db, "companies", companyId, "locations"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
        
        if (Array.isArray(data)) {
          setBranches(data);
          
          // Auto-select the first branch if branchId is empty
          if (!branchId && data.length > 0) {
              setBranchId(data[0].id);
          }
        }
      } catch (e) {
        console.error("Error cargando sucursales:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchLocations();
  }, [branchId, setBranchId, companyId]);

  return (
    <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-md border border-border/50 shrink-0">
      {loading ? (
        <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
      ) : (
        <MapPin className="w-4 h-4 text-muted-foreground" />
      )}
      <select 
        value={branchId} 
        onChange={(e) => setBranchId(e.target.value)}
        disabled={loading}
        className="bg-transparent text-sm font-medium border-none outline-none cursor-pointer text-foreground appearance-none focus:ring-0 disabled:opacity-50"
      >
        <option value="" disabled>Seleccionar Sucursal</option>
        {branches.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  );
}
