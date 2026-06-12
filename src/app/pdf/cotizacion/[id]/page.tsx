"use client";

import React, { useEffect, useState, use } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/icons/logo";
import { useRouter } from "next/navigation";

export default function CotizacionPDFPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const { id } = unwrappedParams;
  const { companyId } = useAuth();
  const [quote, setQuote] = useState<any>(null);
  const [ticketConfig, setTicketConfig] = useState<any>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      if (!companyId || !id) return;
      try {
        // Fetch quote
        const docRef = doc(db, "companies", companyId, "quotes", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setQuote(snap.data());
        }

        // Fetch company profile
        const companyRef = doc(db, "companies", companyId);
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists()) {
          setCompanyName(companySnap.data().name || "");
        }

        // Fetch ticket config
        const configRef = doc(db, "companies", companyId, "ticketConfig", "settings");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setTicketConfig(configSnap.data());
        }
      } catch (e) {
        console.error("Error loading PDF report data:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [companyId, id]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-12 h-12 animate-spin text-muted-foreground" /></div>;
  }

  if (!quote) {
    return <div className="p-10 text-center font-bold text-red-500">Cotización no encontrada.</div>;
  }

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('es-MX') : "";
  const formattedValidUntil = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('es-MX') : "";

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          .no-print { display: none !important; }
          body { background-color: white !important; }
          @page { margin: 15mm; size: letter; }
        }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      `}} />
      
      <div className="no-print bg-slate-900 text-white p-4 flex justify-between items-center fixed top-0 left-0 right-0 z-50 shadow-md">
        <div className="flex items-center gap-4">
          <Button onClick={() => router.back()} variant="ghost" className="text-white hover:bg-slate-800 text-xs gap-2">
            <ArrowLeft className="h-4 w-4" /> Regresar
          </Button>
          <p className="text-sm font-medium">Vista Previa de Impresión - {quote.quoteNumber}</p>
        </div>
        <Button onClick={handlePrint} className="gap-2 bg-primary hover:bg-primary/90 text-white font-bold transition-all hover:scale-105 active:scale-95">
          <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="bg-slate-50/50 min-h-screen pt-24 pb-20 px-4 flex justify-center print:pt-0 print:pb-0 print:px-0">
        <div className="w-full max-w-[800px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.05)] print:shadow-none print:max-w-none print:w-full mx-auto relative overflow-hidden text-foreground p-8 sm:p-16 min-h-[1056px] flex flex-col justify-between rounded-sm">
          
          <div>
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              {companyId === "0cb93750-138e-4b7d-832e-3a37b95c5093" ? (
                <Logo className="h-8 sm:h-10 w-auto text-primary" />
              ) : (ticketConfig?.logoBase64 || ticketConfig?.logoUrl) ? (
                <img 
                  src={ticketConfig.logoBase64 || ticketConfig.logoUrl} 
                  alt="Logo" 
                  className="h-8 sm:h-10 object-contain max-w-[180px]" 
                />
              ) : (
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-primary uppercase">
                  {companyName || "ERP"}
                </h1>
              )}
              <div className="text-right">
                <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight mb-1">COTIZACIÓN</h2>
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.3em]">{quote.quoteNumber}</p>
              </div>
            </div>

            {/* AI Generated Image Cover */}
            {quote.imageUrl && (
              <div className="mb-6 overflow-hidden rounded-xl border border-muted/30 bg-muted/5 relative">
                <div 
                  className="w-full aspect-[2.4/1] bg-center bg-no-repeat bg-cover"
                  style={{ 
                    backgroundImage: `url(${quote.imageUrl})`,
                  }}
                  aria-label="Visualización de propuesta"
                />
                <div className="absolute bottom-3 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded shadow-sm text-[10px] font-semibold text-slate-700">
                  Concepto Visual: {quote.imagePrompt}
                </div>
              </div>
            )}

            {/* Client Details and Date */}
            <div className="flex justify-between items-end mb-8 border-b-2 border-primary/10 pb-4">
              <div>
                <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.25em] mb-1">Preparado para</h2>
                <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{quote.clientName || 'Cliente'}</p>
              </div>
              <div className="text-right flex flex-col items-end gap-1 text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                <p>EMITIDO: {formattedDate}</p>
                {formattedValidUntil && <p>VENCE: {formattedValidUntil}</p>}
              </div>
            </div>

            {/* Slogan */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-1.5 bg-primary rounded-full" />
              <h3 className="text-[11px] font-black text-foreground uppercase tracking-[0.25em]">
                {companyId === "0cb93750-138e-4b7d-832e-3a37b95c5093" 
                  ? "LA MEJOR DECORACIÓN ES EL ORDEN" 
                  : (ticketConfig?.customCompanyName || companyName || "DOCUMENTO OFICIAL")}
              </h3>
            </div>

            {/* Table */}
            <div className="mb-8">
              <table className="w-full border-t border-b border-muted/50 text-sm text-left">
                <thead>
                  <tr className="bg-muted/30 border-none">
                    <th className="py-3 px-2 text-foreground font-black uppercase text-[10px] tracking-widest">Conceptos</th>
                    <th className="py-3 px-2 text-center text-foreground font-black uppercase text-[10px] tracking-widest w-16">Cant.</th>
                    <th className="py-3 px-2 text-right text-foreground font-black uppercase text-[10px] tracking-widest w-28">Precio U.</th>
                    <th className="py-3 px-2 text-center text-foreground font-black uppercase text-[10px] tracking-widest w-16">Desc.</th>
                    <th className="py-3 px-2 text-right text-foreground font-black uppercase text-[10px] tracking-widest w-32">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted/30">
                  {quote.items?.map((item: any, idx: number) => (
                    <tr key={idx} className="border-muted/30 hover:bg-transparent">
                      <td className="py-3 px-2 flex items-center gap-3 pr-4 sm:pr-8">
                        {item.imageUrl && (
                          <div className="w-10 h-10 rounded bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                            <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-xs sm:text-sm leading-tight text-foreground/90 whitespace-pre-wrap">
                            {item.isService ? (item.description || item.productName) : item.productName}
                          </p>
                          {item.variantTitle && <p className="text-xs text-muted-foreground mt-0.5">{item.variantTitle}</p>}
                          {item.comment && (
                            <p className="text-[11px] text-indigo-600 mt-1 bg-indigo-50/50 px-2 py-1 rounded border border-indigo-100/30 whitespace-pre-wrap italic">
                              Nota: {item.comment}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center font-medium text-xs sm:text-sm">{item.quantity}</td>
                      <td className="py-3 px-2 text-right font-mono text-[10px] sm:text-xs">${(item.unitPrice / 1.16).toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                      <td className="py-3 px-2 text-center text-emerald-600 font-semibold text-xs sm:text-sm">{item.discountPercentage > 0 ? `${item.discountPercentage}%` : '-'}</td>
                      <td className="py-3 px-2 text-right font-mono font-black text-[10px] sm:text-xs">
                        ${(item.quantity * (item.unitPrice / 1.16) * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8" style={{ breakInside: 'avoid' }}>
              <div className="w-full max-w-full sm:max-w-[320px] bg-muted/5 py-3 px-6 rounded-2xl border-2 border-primary/20">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-black text-muted-foreground uppercase tracking-widest text-[9px]">Subtotal</span>
                  <span className="font-semibold text-foreground font-mono">${quote.subtotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between items-center text-xs mb-2 pb-2 border-b border-muted">
                  <span className="font-black text-muted-foreground uppercase tracking-widest text-[9px]">IVA (16%)</span>
                  <span className="font-semibold text-foreground font-mono">${quote.tax?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-black text-foreground uppercase text-[9px] sm:text-[11px] tracking-[0.25em]">Inversión Total</span>
                  <span className="font-black text-lg sm:text-xl text-primary font-mono tracking-tighter">${quote.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            {/* Notes */}
            {quote.notes && (
              <div className="text-[10px] text-muted-foreground border-t-2 border-muted/30 pt-6 mt-10" style={{ breakInside: 'avoid' }}>
                <div className="space-y-3 max-w-md">
                  <h4 className="font-black uppercase text-foreground tracking-widest border-b border-primary/20 pb-2">Políticas de Proyecto</h4>
                  <p className="opacity-90 leading-relaxed text-justify">{quote.notes}</p>
                </div>
              </div>
            )}

            {/* Signature Accept */}
            <div className="mt-16 pb-6" style={{ breakInside: 'avoid' }}>
              <div className="border-t border-slate-300 w-64 pt-2">
                <p className="text-xs font-bold text-slate-800">Firma de Aceptación</p>
                <p className="text-[10px] text-slate-400 mt-1">{quote.clientName}</p>
              </div>
            </div>

            {/* Footer Slogan */}
            <footer className="text-center border-t border-muted/10 pt-6">
              <p className="text-[10px] uppercase tracking-[0.5em] font-black text-muted-foreground/20">
                {companyId === "0cb93750-138e-4b7d-832e-3a37b95c5093" 
                  ? "El Orden de las Cosas | Siente la Paz" 
                  : `${companyName || "ERP"} | Documento Oficial`}
              </p>
            </footer>
          </div>

        </div>
      </div>
    </>
  );
}
