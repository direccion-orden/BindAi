"use client";

import { useAuth } from "@/context/AuthContext";
import { POSProvider } from "@/context/POSContext";
import { POSCatalogPanel } from "@/components/pos/POSCatalogPanel";
import { POSCartPanel } from "@/components/pos/POSCartPanel";
import { POSTotalsPanel } from "@/components/pos/POSTotalsPanel";
import { POSToolbar } from "@/components/pos/POSToolbar";

export default function PuntoDeVentaPage() {
  const { user, companyId } = useAuth();

  if (!user) return <p className="p-8">Inicia sesión para continuar.</p>;

  return (
    <POSProvider companyId={companyId || undefined}>
      <div className="-m-6 md:-m-8 lg:-m-10 flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-background">
        <div className="px-4 pt-4 shrink-0">
          <POSToolbar />
        </div>
        
        <div className="flex flex-1 gap-4 overflow-x-auto overflow-y-hidden custom-scrollbar px-4 pb-4">
          {/* 1. COLUMNA IZQUIERDA: CATÁLOGO */}
          <POSCatalogPanel />

          {/* 2. COLUMNA CENTRAL: PRODUCTOS SELECCIONADOS */}
          <POSCartPanel />

          {/* 3. COLUMNA DERECHA: CUENTAS, CLIENTE Y TOTALES */}
          <POSTotalsPanel />
        </div>
      </div>
    </POSProvider>
  );
}
