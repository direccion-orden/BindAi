"use client";

import { useState, useEffect, useRef } from "react";
import { Printer, RotateCcw, ChevronDown, Banknote } from "lucide-react";
import { ReturnsModal } from "@/components/pos/ReturnsModal";
import { ReprintTicketModal } from "@/components/pos/ReprintTicketModal";
import { usePOS } from "@/context/POSContext";
import { BranchSelector } from "@/components/pos/BranchSelector";
import { useAuth } from "@/context/AuthContext";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { CajaModal } from "@/components/caja/CajaModal";

export function POSToolbar() {
  const [isReturnsOpen, setIsReturnsOpen] = useState(false);
  const [isReprintOpen, setIsReprintOpen] = useState(false);
  const [isCajaOpen, setIsCajaOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCajaActive, setIsCajaActive] = useState<boolean | null>(null);
  const [agentConnected, setAgentConnected] = useState(false);

  const { companyId } = useAuth();
  const { branchId, cashMode, setCashMode } = usePOS();
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check if there is an active session for the selected branch
  useEffect(() => {
    if (!companyId || !branchId) {
      setIsCajaActive(null);
      return;
    }
    const q = query(
      collection(db, "companies", companyId, "cash_sessions"),
      where("status", "==", "open"),
      where("locationId", "==", branchId)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIsCajaActive(!snapshot.empty);
    }, (err) => {
      console.error("Error checking session activity in toolbar:", err);
    });
    return () => unsubscribe();
  }, [companyId, branchId]);

  // Check connection to local recycler agent
  useEffect(() => {
    if (cashMode === 'recycler') {
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
    } else {
      setAgentConnected(false);
    }
  }, [cashMode]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <div className="w-full bg-card border rounded-xl px-4 py-2 flex items-center justify-between shadow-sm mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold">Punto de Venta</h2>
          <div className="h-6 w-px bg-border mx-2"></div>
          <BranchSelector />
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-muted-foreground flex items-center gap-1.5">
              Efectivo:
              {cashMode === 'recycler' && (
                <span 
                  className={`w-2 h-2 rounded-full ${agentConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} 
                  title={agentConnected ? 'Reciclador Conectado' : 'Reciclador Desconectado'} 
                />
              )}
            </span>
            <select 
              value={cashMode}
              onChange={async (e) => {
                const mode = e.target.value as 'manual' | 'recycler';
                setCashMode(mode);
                if (mode === 'recycler') {
                  try {
                    // Try to ping first
                    const ping = await fetch('http://localhost:3001/api/status', { signal: AbortSignal.timeout(1000) });
                    if (ping.ok) return;
                  } catch (err) {
                    console.log("[POSToolbar] Recycler selected. Auto-starting local agent...");
                    fetch('/api/hardware-agent/start', { method: 'POST' }).catch(() => {});
                  }
                }
              }}
              className="bg-muted text-foreground rounded border-0 text-sm py-1 pl-2 pr-6 h-8 outline-none focus:ring-1 focus:ring-primary font-medium"
            >
              <option value="manual">Manual</option>
              <option value="recycler">Reciclador</option>
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2" ref={dropdownRef}>
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-all shadow-sm focus:outline-none"
            >
              <span>Acciones POS</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-border bg-card shadow-lg z-50 py-1.5 animate-in fade-in slide-in-from-top-1">
                <button
                  onClick={() => {
                    setIsReturnsOpen(true);
                    setIsDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground transition-colors font-medium"
                >
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                  Devoluciones
                </button>
                <button
                  onClick={() => {
                    setIsReprintOpen(true);
                    setIsDropdownOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground transition-colors font-medium"
                >
                  <Printer className="w-4 h-4 text-muted-foreground" />
                  Imprimir Tickets
                </button>
                <div className="h-px bg-border my-1"></div>
                <button
                  onClick={() => {
                    setIsCajaOpen(true);
                    setIsDropdownOpen(false);
                  }}
                  className="flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-muted text-foreground transition-colors font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-muted-foreground" />
                    Caja
                  </span>
                  {isCajaActive !== null && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                      <span className={`h-2 w-2 rounded-full ${isCajaActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                      {isCajaActive ? 'Abierto' : 'Cerrado'}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isReturnsOpen && <ReturnsModal onClose={() => setIsReturnsOpen(false)} />}
      {isReprintOpen && <ReprintTicketModal onClose={() => setIsReprintOpen(false)} />}
      {isCajaOpen && <CajaModal isOpen={isCajaOpen} onClose={() => setIsCajaOpen(false)} />}
    </>
  );
}
