"use client";

import React from "react";
import Link from "next/link";
import { Printer, Receipt, Download, Heart, ShoppingBag, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TicketPrintViewProps {
  remission: any;
  companyProfile: any;
  ticketConfig: any;
  companyId: string;
}

const DEFAULT_CONFIG = {
  showLogo: true,
  logoWidth: 80,
  showCompanyName: true,
  customCompanyName: "",
  showAddress: true,
  customAddress: "",
  showRfc: true,
  customRfc: "",
  showPhone: true,
  customPhone: "",
  showDate: true,
  showBarcode: true,
  showPoints: true,
  showPaymentMethod: true,
  showPaymentReference: true,
  showBillingInfo: true,
  showBillingQr: true,
  billingUrl: "",
  billingInstructions: "Para facturar en línea, escanea el código QR o ingresa a nuestro portal. Tienes 30 días naturales a partir de la fecha de compra.",
  headerText: "",
  footerText: "Este documento es un comprobante simplificado.\n¡Gracias por su compra!",
  ticketWidth: "80mm",
  fontSize: "base"
};

export default function TicketPrintView({
  remission,
  companyProfile,
  ticketConfig,
  companyId
}: TicketPrintViewProps) {
  
  const config = {
    ...DEFAULT_CONFIG,
    ...ticketConfig
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN"
    }).format(amount);
  };

  // Resolve values
  const clientName = remission.clientName || "Público en General";
  const folioText = remission.orderNumber?.replace("POS-", "") || remission.remissionNumber || remission.id.slice(0, 8).toUpperCase();
  const dateObj = remission.createdAt ? new Date(remission.createdAt) : new Date();
  const dateStr = dateObj.toLocaleString("es-MX");

  const subtotal = remission.financials?.subtotal !== undefined 
    ? remission.financials.subtotal 
    : (remission.subtotal || 0);
  const tax = remission.financials?.tax !== undefined 
    ? remission.financials.tax 
    : (remission.tax || 0);
  const total = remission.financials?.total !== undefined 
    ? remission.financials.total 
    : (remission.totalAmount || 0);

  const previewName = config.showCompanyName
    ? (config.customCompanyName || companyProfile.name)
    : "";
  const previewAddress = config.showAddress
    ? (config.customAddress || companyProfile.address)
    : "";
  const previewRfc = config.showRfc
    ? (config.customRfc || companyProfile.rfc)
    : "";
  const previewPhone = config.showPhone
    ? (config.customPhone || companyProfile.phone)
    : "";

  const logoSrc = config.showLogo
    ? (config.logoBase64 || config.logoUrl || "/logo.svg")
    : null;

  // Construct Billing URL for Autofactura
  const formattedTotal = Number(total).toFixed(2);
  const billingUrl = `/autofactura?companyId=${companyId}&folio=${encodeURIComponent(folioText)}&total=${encodeURIComponent(formattedTotal)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            body {
              background-color: white !important;
              color: black !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .no-print {
              display: none !important;
            }
            .print-container {
              width: ${config.ticketWidth === "80mm" ? "80mm" : "58mm"} !important;
              max-width: ${config.ticketWidth === "80mm" ? "80mm" : "58mm"} !important;
              box-shadow: none !important;
              border: none !important;
              padding: 4mm !important;
              margin: 0 auto !important;
              background-color: white !important;
              color: black !important;
            }
          }
        `
      }} />

      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 min-h-screen text-slate-100 flex flex-col items-center justify-start p-4 sm:p-6 md:p-8">
        
        {/* Top Header / Actions - Hidden during print */}
        <div className="no-print w-full max-w-4xl flex flex-col md:flex-row items-center justify-between gap-4 mb-8 bg-slate-900/60 backdrop-blur-md border border-slate-800 p-4 rounded-2xl shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Tu Ticket de Compra</h2>
              <p className="text-xs text-slate-400">Folio: #{folioText} | Total: {formatMoney(total)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <Button
              onClick={handlePrint}
              className="flex-1 md:flex-initial gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold border border-slate-700 transition-all duration-200"
            >
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </Button>
            
            <Link href={billingUrl} className="flex-1 md:flex-initial">
              <Button className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 transition-all duration-200">
                <Receipt className="w-4 h-4" /> Facturar Compra
              </Button>
            </Link>
          </div>
        </div>

        {/* Main Grid: Ticket Container & Info Box */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Info message & next steps */}
          <div className="no-print md:col-span-6 space-y-6">
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-850 p-6 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <Heart className="w-5 h-5 fill-indigo-400/20" />
                <span className="font-bold text-sm tracking-wider uppercase">¡Gracias por tu compra!</span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Aquí tienes tu recibo de {previewName || "nuestra tienda"}.
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Este es el comprobante digital oficial de tu compra. Puedes imprimirlo o guardarlo como PDF usando el botón superior.
              </p>

              <div className="border-t border-slate-800 pt-4 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded bg-indigo-500/10 flex items-center justify-center text-indigo-400 mt-0.5">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-200">Fecha de compra</p>
                    <p className="text-xs text-slate-400 mt-0.5">{dateStr}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Facturación Quick Promotion Card */}
            <div className="bg-gradient-to-r from-indigo-900/40 to-slate-900/40 backdrop-blur-md border border-indigo-500/20 p-6 rounded-2xl space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
              <h3 className="font-bold text-white text-lg">¿Necesitas Factura Fiscal?</h3>
              <p className="text-sm text-indigo-200/90 leading-relaxed">
                Factura este ticket de compra en línea de forma fácil y al instante. Solo necesitas tus datos fiscales (RFC).
              </p>
              <Link href={billingUrl} className="block pt-1">
                <Button className="w-full gap-2 bg-white hover:bg-slate-100 text-indigo-950 font-bold shadow-md transition-all duration-200">
                  <Receipt className="w-4 h-4" /> Ir a Facturación en Línea
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Column: Thermal Ticket rendering */}
          <div className="md:col-span-6 flex justify-center w-full">
            <div 
              className="print-container bg-white text-black p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-200 flex flex-col font-mono"
              style={{
                width: config.ticketWidth === "80mm" ? "320px" : "260px",
                maxWidth: "100%"
              }}
            >
              {/* Header Info */}
              <div className="text-center mb-4">
                {logoSrc && (
                  <img
                    src={logoSrc}
                    alt="Logo"
                    style={{ width: `${config.logoWidth}px` }}
                    className="mx-auto mb-2 grayscale object-contain max-h-16"
                  />
                )}
                
                {previewName && (
                  <h1 className="text-xs font-bold uppercase tracking-tight leading-tight">{previewName}</h1>
                )}
                
                <div className="text-[9px] space-y-0.5 mt-1 leading-tight text-slate-800">
                  {previewAddress && <p className="whitespace-pre-wrap">{previewAddress}</p>}
                  {previewRfc && <p>RFC: {previewRfc.toUpperCase()}</p>}
                  {previewPhone && <p>TEL: {previewPhone}</p>}
                </div>

                {config.headerText && (
                  <p className="text-[9px] border-t border-dashed border-black pt-1.5 mt-1.5 text-center italic whitespace-pre-wrap leading-tight">
                    {config.headerText}
                  </p>
                )}

                <div className="border-t border-black mt-2 pt-2 text-[9px] text-left space-y-0.5">
                  {config.showDate && <p>Fecha: {dateStr}</p>}
                  <p>Ticket: #{folioText}</p>
                  <p>Cliente: {clientName}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="border-t border-b border-black py-1.5 mb-2">
                <table className="w-full text-[9px] leading-tight">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="font-bold pb-1 text-left" style={{ width: "15%" }}>CANT</th>
                      <th className="font-bold pb-1 text-left" style={{ width: "55%" }}>ARTÍCULO</th>
                      <th className="font-bold pb-1 text-right" style={{ width: "30%" }}>IMPORTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remission.items?.map((item: any, i: number) => {
                      const itemTitle = item.productName || item.title || "";
                      return (
                        <tr key={i} className="align-top">
                          <td className="py-1">{item.quantity}</td>
                          <td className="py-1 pr-1">{itemTitle}</td>
                          <td className="py-1 text-right">
                            {formatMoney(item.quantity * item.unitPrice * (1 - (item.discountPercentage || 0) / 100))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="text-[9px] space-y-0.5 mb-3">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA (16%):</span>
                  <span>{formatMoney(tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-xs mt-1 pt-1 border-t border-dashed border-black">
                  <span>TOTAL:</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>

              {/* Payment Details */}
              {(config.showPaymentMethod || config.showPaymentReference) && remission.payments && remission.payments.length > 0 && (
                <div className="text-[9px] border-t border-dashed border-black pt-2 pb-1 mb-2 space-y-0.5">
                  {remission.payments.map((p: any, idx: number) => (
                    <div key={idx} className="flex justify-between leading-tight text-[9px]">
                      <span>
                        {config.showPaymentMethod ? `PAGO (${p.method?.toUpperCase()}):` : "PAGO:"}
                      </span>
                      <span>
                        {formatMoney(p.amount)}
                        {config.showPaymentReference && p.reference ? ` [${p.reference}]` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Loyalty Points */}
              {config.showPoints && remission.pointsEarned > 0 && (
                <div className="text-center text-[9px] border border-black p-1.5 mb-3 rounded-sm leading-tight">
                  <p className="font-bold">¡Acumulaste {remission.pointsEarned} puntos!</p>
                  <p>Úsalos en tu próxima visita.</p>
                </div>
              )}

              {/* Billing Info */}
              {config.showBillingInfo && (
                <div className="text-[9px] border-t border-dashed border-black pt-2 text-center space-y-1 leading-tight">
                  <p className="font-bold tracking-tight">INFORMACIÓN DE FACTURACIÓN</p>
                  {config.billingInstructions && (
                    <p className="text-[8px] text-slate-800 whitespace-pre-wrap">{config.billingInstructions}</p>
                  )}
                  <div className="text-[8px] text-left space-y-0.5 bg-slate-50 p-1.5 border border-slate-200 rounded-sm">
                    <p className="break-all">
                      <span className="font-bold">Portal:</span> https://bind-ai-6f1fc.web.app/autofactura
                    </p>
                    <p><span className="font-bold">Folio:</span> {folioText}</p>
                    <p><span className="font-bold">Total:</span> {formatMoney(total)}</p>
                  </div>

                  {config.showBillingQr && (
                    <div className="flex flex-col items-center pt-1">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`https://bind-ai-6f1fc.web.app/autofactura?companyId=${companyId}&folio=${encodeURIComponent(folioText)}&total=${encodeURIComponent(formattedTotal)}`)}`} 
                        alt="QR Facturación" 
                        className="w-20 h-20 object-contain grayscale mx-auto"
                      />
                      <span className="text-[7px] text-slate-500 mt-1">Escanear para facturar</span>
                    </div>
                  )}
                </div>
              )}

              {/* Footer text */}
              {config.footerText && (
                <p className="text-[9px] border-t border-dashed border-black pt-2 mt-2 text-center whitespace-pre-wrap leading-tight">
                  {config.footerText}
                </p>
              )}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
