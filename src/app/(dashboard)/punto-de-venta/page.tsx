"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { POSProvider } from "@/context/POSContext";
import { POSCatalogPanel } from "@/components/pos/POSCatalogPanel";
import { POSCartPanel } from "@/components/pos/POSCartPanel";
import { POSTotalsPanel } from "@/components/pos/POSTotalsPanel";
import { POSToolbar } from "@/components/pos/POSToolbar";

export default function PuntoDeVentaPage() {
  const { user, companyId } = useAuth();
  const [catalogWidth, setCatalogWidth] = useState<number>(550); // Ancho inicial en px
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left - 16; // 16px de padding del contenedor
      
      // Permitir ajustar entre 320px (2 columnas) y 950px (4 columnas)
      setCatalogWidth(Math.max(320, Math.min(950, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  if (!user) return <p className="p-8">Inicia sesión para continuar.</p>;

  return (
    <POSProvider companyId={companyId || undefined}>
      <div className="-m-6 md:-m-8 lg:-m-10 flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-background">
        <div className="px-4 pt-4 shrink-0">
          <POSToolbar />
        </div>
        
        <div 
          ref={containerRef} 
          className={`flex flex-1 gap-4 overflow-hidden px-4 pb-4 ${
            isResizing ? "select-none cursor-col-resize" : ""
          }`}
        >
          {/* 1. COLUMNA IZQUIERDA: CATÁLOGO (Resizable) */}
          <POSCatalogPanel width={catalogWidth} />

          {/* Divisor arrastrable con área de contacto ampliada */}
          <div 
            onMouseDown={handleMouseDown}
            className="w-3 hover:w-4 flex items-center justify-center cursor-col-resize self-stretch select-none group transition-all duration-150"
            title="Arrastra para ajustar columnas"
          >
            <div className={`w-1 h-full bg-border group-hover:bg-primary transition-colors rounded-full ${isResizing ? 'bg-primary w-1.5' : ''}`} />
          </div>

          {/* 2. COLUMNA CENTRAL: PRODUCTOS SELECCIONADOS */}
          <POSCartPanel />

          {/* 3. COLUMNA DERECHA: CUENTAS, CLIENTE Y TOTALES */}
          <POSTotalsPanel />
        </div>
      </div>
    </POSProvider>
  );
}
