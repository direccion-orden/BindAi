"use client";

import React, { useEffect, useState, use } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CotizacionPDFPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const { id } = unwrappedParams;
  const { companyId } = useAuth();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchQuote() {
      if (!companyId || !id) return;
      try {
        const docRef = doc(db, "companies", companyId, "quotes", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setQuote(snap.data());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchQuote();
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

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          .no-print { display: none !important; }
          body { background-color: white !important; }
          @page { margin: 0; size: letter; }
        }
      `}} />
      
      <div className="no-print bg-slate-900 text-white p-4 flex justify-between items-center fixed top-0 left-0 right-0 z-50">
        <p className="text-sm font-medium">Vista Previa de Impresión - {quote.quoteNumber}</p>
        <Button onClick={handlePrint} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="bg-white min-h-screen pt-20 pb-10 px-4 flex justify-center">
        {/* Hoja Tamaño Carta: 8.5 x 11 pulgadas = 816 x 1056 px aprox */}
        <div className="w-full max-w-[800px] bg-white shadow-2xl print:shadow-none print:max-w-none print:w-full mx-auto relative overflow-hidden text-slate-800" style={{ minHeight: '1056px' }}>
          
          {/* Header */}
          <div className="p-10 pb-6 flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter">COTIZACIÓN</h1>
              <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">{quote.quoteNumber}</p>
              
              <div className="mt-8 space-y-1 text-sm">
                <p className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Preparado Para:</p>
                <p className="font-bold text-lg text-slate-900">{quote.clientName}</p>
              </div>
            </div>
            <div className="text-right">
              {/* Logo Placeholder */}
              <div className="text-2xl font-black tracking-tighter text-indigo-900 mb-6">EL ORDEN DE LAS COSAS</div>
              <div className="text-sm text-slate-500 space-y-1">
                <p>Fecha: {new Date(quote.createdAt).toLocaleDateString('es-MX')}</p>
                <p>Válido hasta: {new Date(quote.validUntil).toLocaleDateString('es-MX')}</p>
              </div>
            </div>
          </div>

          {/* AI Generated Image Cover */}
          {quote.imageUrl && (
            <div className="px-10 py-6">
              <div className="w-full h-64 rounded-xl overflow-hidden relative shadow-inner border border-slate-100 bg-slate-50">
                <img 
                  src={quote.imageUrl} 
                  alt="Concepto de Diseño" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded shadow-sm text-xs font-semibold text-slate-700">
                  Concepto Visual: {quote.imagePrompt}
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="px-10 py-6">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b-2 border-slate-800 text-slate-900">
                  <th className="py-3 font-bold uppercase tracking-wider text-xs">Descripción</th>
                  <th className="py-3 font-bold uppercase tracking-wider text-xs text-center w-20">Cant.</th>
                  <th className="py-3 font-bold uppercase tracking-wider text-xs text-right w-28">Precio Unit.</th>
                  <th className="py-3 font-bold uppercase tracking-wider text-xs text-center w-20">Desc.</th>
                  <th className="py-3 font-bold uppercase tracking-wider text-xs text-right w-32">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quote.items?.map((item: any, idx: number) => (
                  <tr key={idx} className="group">
                    <td className="py-4 flex items-center gap-3">
                      {item.imageUrl && (
                        <div className="w-10 h-10 rounded bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
                          <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-900">{item.productName}</p>
                        {item.variantTitle && <p className="text-xs text-slate-500 mt-0.5">{item.variantTitle}</p>}
                      </div>
                    </td>
                    <td className="py-4 text-center font-medium">{item.quantity}</td>
                    <td className="py-4 text-right">${item.unitPrice.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                    <td className="py-4 text-center text-emerald-600 font-semibold">{item.discountPercentage > 0 ? `${item.discountPercentage}%` : '-'}</td>
                    <td className="py-4 text-right font-bold text-slate-900">
                      ${(item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-10 flex justify-end">
            <div className="w-72 bg-slate-50 p-6 rounded-xl border border-slate-100">
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-500 font-medium">Subtotal</span>
                <span className="font-semibold">${quote.subtotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between text-sm mb-4">
                <span className="text-slate-500 font-medium">IVA (16%)</span>
                <span className="font-semibold">${quote.tax?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-200 pt-4">
                <span className="font-black text-slate-900 tracking-tight">TOTAL</span>
                <span className="text-xl font-black text-indigo-900">${quote.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quote.notes && (
            <div className="px-10 py-10 mt-10 border-t border-slate-100">
              <h4 className="font-bold text-xs uppercase tracking-widest text-slate-400 mb-2">Términos y Condiciones</h4>
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{quote.notes}</p>
            </div>
          )}

          {/* Footer Signature */}
          <div className="px-10 mt-20 pb-10">
            <div className="border-t border-slate-300 w-64 pt-2">
              <p className="text-xs font-bold text-slate-800 text-center">Firma de Aceptación</p>
              <p className="text-[10px] text-slate-400 text-center mt-1">{quote.clientName}</p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
