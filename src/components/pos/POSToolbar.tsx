"use client";

import { useState } from "react";
import { Search, Printer, RotateCcw } from "lucide-react";
import { ReturnsModal } from "@/components/pos/ReturnsModal";
import { ReprintTicketModal } from "@/components/pos/ReprintTicketModal";
import { usePOS } from "@/context/POSContext";
import { BranchSelector } from "@/components/pos/BranchSelector";

export function POSToolbar() {
  const [isReturnsOpen, setIsReturnsOpen] = useState(false);
  const [isReprintOpen, setIsReprintOpen] = useState(false);

  const { cashMode, setCashMode } = usePOS();

  return (
    <>
      <div className="w-full bg-card border rounded-xl px-4 py-2 flex items-center justify-between shadow-sm mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold">Punto de Venta</h2>
          <div className="h-6 w-px bg-border mx-2"></div>
          <BranchSelector />
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-muted-foreground">Efectivo:</span>
            <select 
              value={cashMode}
              onChange={(e) => setCashMode(e.target.value as 'manual' | 'recycler')}
              className="bg-muted text-foreground rounded border-0 text-sm py-1 pl-2 pr-6 h-8 outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="manual">Manual</option>
              <option value="recycler">Reciclador</option>
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsReturnsOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-md transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Devoluciones
          </button>
          
          <button 
            onClick={() => setIsReprintOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-md transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir Tickets
          </button>
        </div>
      </div>

      {isReturnsOpen && <ReturnsModal onClose={() => setIsReturnsOpen(false)} />}
      {isReprintOpen && <ReprintTicketModal onClose={() => setIsReprintOpen(false)} />}
    </>
  );
}
