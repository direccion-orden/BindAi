"use client";

import React, { useEffect, useState, use } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/icons/logo";
import { useRouter } from "next/navigation";

export default function FacturaPDFPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const { id } = unwrappedParams;
  const { companyId } = useAuth();
  const [factura, setFactura] = useState<any>(null);
  const [ticketConfig, setTicketConfig] = useState<any>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      if (!companyId || !id) return;
      try {
        // Fetch invoice
        const docRef = doc(db, "companies", companyId, "facturas", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setFactura(snap.data());
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

  useEffect(() => {
    if (factura) {
      document.title = `${factura.clientName || 'Cliente'} FAC-${factura.invoiceNumber}`;
    }
  }, [factura]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-12 h-12 animate-spin text-muted-foreground" /></div>;
  }

  if (!factura) {
    return <div className="p-10 text-center font-bold text-red-500">Factura no encontrada.</div>;
  }

  const handlePrint = () => {
    window.print();
  };

  const displaySubtotal = factura.subtotal !== undefined 
    ? factura.subtotal 
    : (factura.items?.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0) || 0);

  const displayDiscount = factura.totalDiscount !== undefined 
    ? factura.totalDiscount 
    : (factura.items?.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice * ((item.discountPercentage || 0) / 100)), 0) || 0);

  const displayTax = factura.tax !== undefined ? factura.tax : (displaySubtotal - displayDiscount) * 0.16;

  const formattedDate = factura.createdAt ? new Date(factura.createdAt).toLocaleDateString('es-MX') : "";

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          .no-print { display: none !important; }
          body { background-color: white !important; }
          @page { margin: 15mm; size: letter; }
          .print-container {
            display: block !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-card {
            overflow: visible !important;
            min-height: 0 !important;
            height: auto !important;
            display: block !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
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
          <p className="text-sm font-medium">Vista Previa de Impresión - FAC-{factura.invoiceNumber}</p>
        </div>
        <Button onClick={handlePrint} className="gap-2 bg-primary hover:bg-primary/90 text-white font-bold transition-all hover:scale-105 active:scale-95">
          <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="print-container bg-slate-50/50 min-h-screen pt-24 pb-20 px-4 flex justify-center print:pt-0 print:pb-0 print:px-0">
        <div className="print-card w-full max-w-[800px] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.05)] print:shadow-none print:max-w-none print:w-full mx-auto relative overflow-hidden text-foreground p-8 sm:p-16 min-h-[1056px] flex flex-col justify-between rounded-sm">
          
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
                <h2 className="text-xl sm:text-2xl font-black text-foreground uppercase tracking-tight mb-1">FACTURA (CFDI)</h2>
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.3em]">FAC-{factura.invoiceNumber}</p>
              </div>
            </div>

            {/* Client Details and CFDI metadata */}
            <div className="flex flex-col sm:flex-row justify-between items-start mb-8 border-b-2 border-primary/10 pb-4 gap-4">
              <div className="flex-1">
                <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.25em] mb-1">Facturado a</h2>
                <p className="text-xl sm:text-2xl font-bold text-foreground tracking-tight mb-2">{factura.clientName || 'Cliente'}</p>
                <div className="text-xs text-muted-foreground space-y-0.5 font-medium">
                  <p><span className="font-bold text-foreground">RFC:</span> {factura.cfdiPayload?.Receiver?.Rfc || 'Por definir'}</p>
                  <p><span className="font-bold text-foreground">C.P.:</span> {factura.cfdiPayload?.Receiver?.TaxZipCode || 'Por definir'}</p>
                  <p><span className="font-bold text-foreground">Régimen Fiscal:</span> {factura.cfdiPayload?.Receiver?.FiscalRegime || 'Por definir'}</p>
                </div>
              </div>
              <div className="text-right flex flex-col items-end gap-2 text-[10px] text-muted-foreground font-bold uppercase tracking-widest min-w-[200px]">
                <p>FECHA EMISIÓN: {formattedDate}</p>
                {factura.orderNumber && <p>REF. PEDIDO: {factura.orderNumber}</p>}
                
                <div className="p-3 bg-muted/30 border border-muted/50 rounded-xl text-left text-[9px] leading-normal w-full mt-2 font-mono normal-case space-y-1 text-foreground">
                  <p><span className="font-black uppercase tracking-wider text-muted-foreground text-[8px]">Folio Fiscal (UUID):</span><br/><span className="break-all text-[9.5px] font-bold text-slate-800">{factura.facturamaUuid || 'PENDIENTE DE TIMBRAR'}</span></p>
                  <p><span className="font-black uppercase tracking-wider text-muted-foreground text-[8px]">Uso CFDI:</span> {factura.cfdiPayload?.Receiver?.CfdiUse || 'Por definir'}</p>
                  <p><span className="font-black uppercase tracking-wider text-muted-foreground text-[8px]">Método Pago:</span> {factura.cfdiPayload?.PaymentMethod || 'PUE'}</p>
                  <p><span className="font-black uppercase tracking-wider text-muted-foreground text-[8px]">Forma Pago:</span> {factura.cfdiPayload?.PaymentForm || '01'}</p>
                </div>
              </div>
            </div>

            {/* Slogan */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-6 w-1.5 bg-primary rounded-full" />
              <h3 className="text-[11px] font-black text-foreground uppercase tracking-[0.25em]">
                REPRESENTACIÓN IMPRESA DE CFDI - {companyName || "ERP"}
              </h3>
            </div>

            {/* Table */}
            <div className="mb-8">
              <table className="w-full border-t border-b border-muted/50 text-sm text-left">
                <thead>
                  <tr className="bg-muted/30 border-none">
                    <th className="py-3 px-2 text-foreground font-black uppercase text-[10px] tracking-widest w-24">Clave SAT</th>
                    <th className="py-3 px-2 text-foreground font-black uppercase text-[10px] tracking-widest">Conceptos</th>
                    <th className="py-3 px-2 text-center text-foreground font-black uppercase text-[10px] tracking-widest w-16">Cant.</th>
                    <th className="py-3 px-2 text-right text-foreground font-black uppercase text-[10px] tracking-widest w-28">Precio U.</th>
                    <th className="py-3 px-2 text-right text-foreground font-black uppercase text-[10px] tracking-widest w-32">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted/30">
                  {factura.items?.map((item: any, idx: number) => {
                    const netPrice = item.unitPrice * (1 - item.discountPercentage / 100);
                    const amount = item.quantity * netPrice;
                    return (
                      <tr key={idx} className="border-muted/30 hover:bg-transparent">
                        <td className="py-3 px-2 font-mono text-xs text-muted-foreground">01010101</td>
                        <td className="py-3 px-2 pr-4 sm:pr-8">
                          <p className="font-semibold text-xs sm:text-sm leading-tight text-foreground/90 whitespace-pre-wrap">
                            {item.isService ? (item.description || item.productName) : item.productName}
                          </p>
                          {item.variantTitle && <p className="text-xs text-muted-foreground mt-0.5">{item.variantTitle}</p>}
                          {item.comment && (
                            <p className="text-[11px] text-indigo-600 mt-1 bg-indigo-50/50 px-2 py-1 rounded border border-indigo-100/30 whitespace-pre-wrap italic">
                              Nota: {item.comment}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center font-medium text-xs sm:text-sm">{item.quantity}</td>
                        <td className="py-3 px-2 text-right font-mono text-[10px] sm:text-xs">${netPrice.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                        <td className="py-3 px-2 text-right font-mono font-black text-[10px] sm:text-xs">
                          ${amount.toLocaleString('es-MX', {minimumFractionDigits:2})}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8" style={{ breakInside: 'avoid' }}>
              <div className="w-full max-w-full sm:max-w-[320px] bg-muted/5 py-3 px-6 rounded-2xl border-2 border-primary/20">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-black text-muted-foreground uppercase tracking-widest text-[9px]">Subtotal</span>
                  <span className="font-semibold text-foreground font-mono">${displaySubtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                {displayDiscount > 0 && (
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-black text-emerald-600 uppercase tracking-widest text-[9px]">Descuento</span>
                    <span className="font-semibold text-emerald-600 font-mono">-${displayDiscount.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-xs mb-2 pb-2 border-b border-muted">
                  <span className="font-black text-muted-foreground uppercase tracking-widest text-[9px]">IVA (16%)</span>
                  <span className="font-semibold text-foreground font-mono">${displayTax.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-black text-foreground uppercase text-[9px] sm:text-[11px] tracking-[0.25em]">Total Factura</span>
                  <span className="font-black text-lg sm:text-xl text-primary font-mono tracking-tighter">${factura.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            {/* Stamp footer note */}
            <div className="text-[10px] text-muted-foreground border-t-2 border-muted/30 pt-6 mt-10 text-center" style={{ breakInside: 'avoid' }}>
              <p className="opacity-75">Este documento es una representación impresa de un CFDI (Comprobante Fiscal Digital por Internet) de conformidad con el SAT.</p>
            </div>

            {/* Footer Slogan */}
            <footer className="text-center border-t border-muted/10 pt-6 mt-8">
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
