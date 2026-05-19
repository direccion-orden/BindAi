"use client";

import React, { useEffect, useState, use } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FacturaPDFPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const { id } = unwrappedParams;
  const { companyId } = useAuth();
  const [factura, setFactura] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFactura() {
      if (!companyId || !id) return;
      try {
        const docRef = doc(db, "companies", companyId, "facturas", id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setFactura(snap.data());
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchFactura();
  }, [companyId, id]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="w-12 h-12 animate-spin text-muted-foreground" /></div>;
  }

  if (!factura) {
    return <div className="p-10 text-center font-bold text-red-500">Factura no encontrada.</div>;
  }

  const handlePrint = () => {
    window.print();
  };

  const subtotal = factura.items?.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)), 0) || 0;
  const tax = subtotal * 0.16;

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
        <p className="text-sm font-medium">Vista Previa de Impresión - FAC-{factura.invoiceNumber}</p>
        <Button onClick={handlePrint} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
        </Button>
      </div>

      <div className="bg-white min-h-screen pt-20 pb-10 px-4 flex justify-center">
        <div className="w-full max-w-[800px] bg-white shadow-2xl print:shadow-none print:max-w-none print:w-full mx-auto relative overflow-hidden text-slate-800" style={{ minHeight: '1056px' }}>
          
          {/* Header */}
          <div className="p-10 pb-6 flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tighter">FACTURA (CFDI)</h1>
              <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">FAC-{factura.invoiceNumber}</p>
              
              <div className="mt-8 space-y-1 text-sm">
                <p className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Facturado a:</p>
                <p className="font-bold text-lg text-slate-900">{factura.clientName}</p>
                <p>RFC: {factura.cfdiPayload?.Receiver?.Rfc || 'Por definir'}</p>
                <p>CP: {factura.cfdiPayload?.Receiver?.TaxZipCode || 'Por definir'}</p>
                <p>Régimen: {factura.cfdiPayload?.Receiver?.FiscalRegime || 'Por definir'}</p>
              </div>
            </div>
            <div className="text-right">
              {/* Logo Placeholder */}
              <div className="text-2xl font-black tracking-tighter text-indigo-900 mb-6">EL ORDEN DE LAS COSAS</div>
              <div className="text-sm text-slate-500 space-y-1 text-right">
                <p>Fecha Emisión: {new Date(factura.createdAt).toLocaleDateString('es-MX')}</p>
                {factura.orderNumber && <p>Ref. Pedido: {factura.orderNumber}</p>}
                <div className="mt-4 p-2 bg-slate-50 border rounded text-xs inline-block text-left">
                  <p><span className="font-semibold text-slate-700">Folio Fiscal (UUID):</span><br/>{factura.facturamaUuid || 'PENDIENTE'}</p>
                  <p className="mt-1"><span className="font-semibold text-slate-700">Uso CFDI:</span> {factura.cfdiPayload?.Receiver?.CfdiUse}</p>
                  <p><span className="font-semibold text-slate-700">Método de Pago:</span> {factura.cfdiPayload?.PaymentMethod}</p>
                  <p><span className="font-semibold text-slate-700">Forma de Pago:</span> {factura.cfdiPayload?.PaymentForm}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="px-10 py-6">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b-2 border-slate-800 text-slate-900">
                  <th className="py-3 font-bold uppercase tracking-wider text-xs">Clave SAT</th>
                  <th className="py-3 font-bold uppercase tracking-wider text-xs">Descripción</th>
                  <th className="py-3 font-bold uppercase tracking-wider text-xs text-center w-20">Cant.</th>
                  <th className="py-3 font-bold uppercase tracking-wider text-xs text-right w-28">Precio Unit.</th>
                  <th className="py-3 font-bold uppercase tracking-wider text-xs text-right w-32">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {factura.items?.map((item: any, idx: number) => {
                  const netPrice = item.unitPrice * (1 - item.discountPercentage / 100);
                  const amount = item.quantity * netPrice;
                  return (
                    <tr key={idx} className="group">
                      <td className="py-4 font-mono text-xs text-slate-500">01010101</td>
                      <td className="py-4">
                        <p className="font-bold text-slate-900">{item.productName}</p>
                        {item.variantTitle && <p className="text-xs text-slate-500 mt-0.5">{item.variantTitle}</p>}
                      </td>
                      <td className="py-4 text-center font-medium">{item.quantity}</td>
                      <td className="py-4 text-right">${netPrice.toLocaleString('es-MX', {minimumFractionDigits:2})}</td>
                      <td className="py-4 text-right font-bold text-slate-900">
                        ${amount.toLocaleString('es-MX', {minimumFractionDigits:2})}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-10 flex justify-end">
            <div className="w-72 bg-slate-50 p-6 rounded-xl border border-slate-100">
              <div className="flex justify-between text-sm mb-3">
                <span className="text-slate-500 font-medium">Subtotal</span>
                <span className="font-semibold">${subtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between text-sm mb-4">
                <span className="text-slate-500 font-medium">IVA (16%)</span>
                <span className="font-semibold">${tax.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-200 pt-4">
                <span className="font-black text-slate-900 tracking-tight">TOTAL</span>
                <span className="text-xl font-black text-indigo-900">${factura.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
            </div>
          </div>

          <div className="px-10 py-10 mt-10 text-center">
            <p className="text-[10px] text-slate-400">Este documento es una representación impresa de un CFDI.</p>
          </div>

        </div>
      </div>
    </>
  );
}
