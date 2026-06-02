"use client";

import { useState, useEffect, useRef } from "react";
import { collection, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { User, X, Loader2, UserPlus, Gift, AlignLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePOS } from "@/context/POSContext";
import { useAuth } from "@/context/AuthContext";
import { QuickClientModal } from "@/components/pos/QuickClientModal";

export interface Client {
  id: string;
  name: string;
  rfc: string;
  email?: string;
  phone?: string;
  points?: number;
  walletBalance?: number;
  preferences?: string;
}

export function ClientSelector() {
  const { activeAccount, setClient } = usePOS();
  const { companyId } = useAuth();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Default Client (Publico en General)
  const defaultClient: Client = {
    id: "public",
    name: "Público en General",
    rfc: "XAXX010101000",
    email: ""
  };

  const [allClients, setAllClients] = useState<Client[]>([]);

  useEffect(() => {
    if (!companyId) return;
    
    // Escuchar cambios en la colección de clientes en tiempo real
    const unsubscribe = onSnapshot(collection(db, "companies", companyId, "clients"), (snapshot) => {
      setAllClients(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Client)));
    }, (error) => {
      console.error("Error cargando clientes en tiempo real:", error);
    });
    
    return () => unsubscribe();
  }, [companyId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // Debounced search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (search.length >= 2) {
        performSearch(search);
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [search, allClients]);

  const performSearch = (queryText: string) => {
    setLoading(true);
    setIsOpen(true);
    try {
      const lowerQ = queryText.toLowerCase();
      const filtered = allClients.filter(c => {
        const clientNameStr = c.name || "";
        return (clientNameStr.toLowerCase().includes(lowerQ)) || 
        (c.rfc && c.rfc.toLowerCase().includes(lowerQ)) ||
        (c.email && c.email.toLowerCase().includes(lowerQ)) ||
        (c.phone && c.phone.includes(lowerQ))
      });
      
      setResults(filtered.slice(0, 10)); // Show top 10
    } catch (e) {
      console.error("Error searching clients", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (client: Client) => {
    setClient(client);
    setSearch("");
    setIsOpen(false);
  };

  const handleClientCreated = (client: Client) => {
    setAllClients(prev => [client, ...prev]);
    setClient(client);
    setShowQuickClient(false);
    setSearch("");
  };

  return (
    <>
      <div className="p-3 border-b space-y-1.5 shrink-0 bg-background" ref={wrapperRef}>
        <h3 className="text-xs font-semibold uppercase text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1"><User className="w-3 h-3"/> Cliente Asignado</span>
          {activeAccount.selectedClient && activeAccount.selectedClient.id !== "public" && (
             <button 
               onClick={() => setClient(defaultClient)}
               className="text-[10px] text-destructive hover:underline"
             >
               Quitar Cliente
             </button>
          )}
        </h3>
        
        {activeAccount.selectedClient && activeAccount.selectedClient.id !== "public" ? (
          <div className="border rounded-md bg-primary/5 border-primary/20 overflow-hidden">
            <div className="p-2 flex flex-col gap-0.5 border-b border-primary/10">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm leading-tight text-primary truncate" title={activeAccount.selectedClient.name}>
                  {activeAccount.selectedClient.name}
                </span>
                <span className="text-xs font-bold text-orange-600 flex items-center gap-1 shrink-0 bg-orange-100 px-1.5 py-0.5 rounded-full">
                  <Gift className="w-3 h-3 text-orange-500"/> {activeAccount.selectedClient.points?.toFixed(0) || '0'} pts
                </span>
              </div>

            </div>
            
            {/* Dashboard de Lealtad Minificado */}
            {activeAccount.selectedClient.preferences && (
              <div className="p-2 bg-background flex flex-col gap-1.5">
                <div className="text-[10px] bg-muted/50 p-1.5 rounded flex gap-1 items-start text-muted-foreground">
                  <AlignLeft className="w-3 h-3 shrink-0 mt-0.5" />
                  <span className="leading-tight">{activeAccount.selectedClient.preferences}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="flex gap-1">
              <Input 
                placeholder="Buscar cliente..." 
                className="h-10 text-sm bg-muted/20" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => { if(results.length > 0 || search.length >= 2) setIsOpen(true); }}
              />
              <button
                onClick={() => setShowQuickClient(true)}
                title="Nuevo Cliente Rápido"
                className="h-10 w-10 shrink-0 bg-primary/10 text-primary hover:bg-primary/20 rounded-md flex items-center justify-center transition-colors"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
            {loading && (
               <Loader2 className="w-4 h-4 absolute right-12 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {!search && !loading && (
                <span className="absolute right-14 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded pointer-events-none">
                    Público
                </span>
            )}

            {/* Dropdown */}
            {isOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border shadow-md rounded-md z-50 max-h-60 overflow-y-auto flex flex-col">
                {results.length === 0 && !loading ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    No se encontraron clientes.
                  </div>
                ) : (
                  results.map(client => (
                    <div 
                      key={client.id}
                      className="p-2 border-b last:border-0 hover:bg-muted cursor-pointer transition-colors z-50 relative"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(client);
                      }}
                    >
                      <p className="font-medium text-sm flex items-center justify-between">
                        {client.name}
                        {client.points !== undefined && (
                          <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 rounded-full flex items-center font-bold">
                            ★ {client.points.toFixed(0)}
                          </span>
                        )}
                      </p>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {client.phone && <span>📞 {client.phone}</span>}
                        {client.email && <span className="truncate max-w-[120px]">✉ {client.email}</span>}
                      </div>
                    </div>
                  ))
                )}
                
                {search.length >= 2 && (
                  <div className="p-2 bg-muted/50 border-t sticky bottom-0">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowQuickClient(true); setIsOpen(false); }}
                      className="w-full text-xs font-semibold text-primary py-1 hover:underline flex items-center justify-center gap-1"
                    >
                      <UserPlus className="w-3 h-3" /> Crear "{search}"
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showQuickClient && (
        <QuickClientModal 
          initialSearch={search}
          onClose={() => setShowQuickClient(false)}
          onClientCreated={handleClientCreated}
        />
      )}
    </>
  );
}
