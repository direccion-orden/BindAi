import React, { useState, useEffect } from 'react';
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

interface ThermalTicketProps {
  saleId: string;
  saleData: any;
}

interface TicketConfig {
  showLogo: boolean;
  logoBase64: string;
  logoUrl: string;
  logoWidth: number;
  showCompanyName: boolean;
  customCompanyName: string;
  showAddress: boolean;
  customAddress: string;
  showRfc: boolean;
  customRfc: string;
  showPhone: boolean;
  customPhone: string;
  showDate: boolean;
  showBarcode: boolean;
  showPoints: boolean;
  showPaymentMethod: boolean;
  showPaymentReference: boolean;
  showBillingInfo: boolean;
  showBillingQr: boolean;
  billingUrl: string;
  billingInstructions: string;
  headerText: string;
  footerText: string;
  ticketWidth: "80mm" | "58mm";
  fontSize: "sm" | "base" | "lg";
}

const DEFAULT_CONFIG: TicketConfig = {
  showLogo: true,
  logoBase64: "",
  logoUrl: "",
  logoWidth: 160,
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
  showBillingInfo: false,
  showBillingQr: false,
  billingUrl: "",
  billingInstructions: "Para facturar en línea, escanea el código QR o ingresa a nuestro portal. Tienes 30 días naturales a partir de la fecha de compra.",
  headerText: "",
  footerText: "Este documento es un comprobante simplificado.\n¡Gracias por su compra!",
  ticketWidth: "80mm",
  fontSize: "base"
};

export function ThermalTicket({ saleId, saleData }: ThermalTicketProps) {
  const { companyId } = useAuth();
  const [config, setConfig] = useState<TicketConfig>(DEFAULT_CONFIG);
  const [companyProfile, setCompanyProfile] = useState<any>({
    name: "El Orden de las Cosas",
    address: "",
    rfc: "",
    phone: ""
  });

  // Load configuration & company profile
  useEffect(() => {
    if (!companyId) return;

    const loadData = async () => {
      try {
        // Fetch standard company details
        const companyRef = doc(db, "companies", companyId);
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists()) {
          const profileData = companySnap.data();
          setCompanyProfile({
            name: profileData.name || "El Orden de las Cosas",
            address: profileData.address || "",
            rfc: profileData.rfc || "",
            phone: profileData.phone || profileData.whatsappPhone || ""
          });
        }

        // Fetch custom ticket config
        const configRef = doc(db, "companies", companyId, "ticketConfig", "settings");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setConfig({
            ...DEFAULT_CONFIG,
            ...configSnap.data()
          });
        }
      } catch (err) {
        console.error("Error loading ticket configuration in ThermalTicket:", err);
      }
    };

    loadData();
  }, [companyId]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const clientName = saleData.clientName || saleData.client?.name || "Público en General";
  
  // Manejar Timestamp de Firestore, Date string, o FieldValue (serverTimestamp)
  let dateObj = new Date();
  if (saleData.createdAt) {
      if (typeof saleData.createdAt.toDate === 'function') {
          dateObj = saleData.createdAt.toDate();
      } else if (saleData.createdAt.seconds) {
          dateObj = new Date(saleData.createdAt.seconds * 1000);
      } else if (typeof saleData.createdAt === 'string' || typeof saleData.createdAt === 'number') {
          const parsed = new Date(saleData.createdAt);
          if (!isNaN(parsed.getTime())) {
              dateObj = parsed;
          }
      }
  }
  const dateStr = dateObj.toLocaleString('es-MX');

  const folioText = saleData.orderNumber?.replace("POS-", "") || saleData.remissionNumber || saleData.folio || saleId.slice(0, 8).toUpperCase();
  const barcodeValue = saleData.orderNumber || saleData.folio || saleId;

  const subtotal = saleData.financials?.subtotal !== undefined ? saleData.financials.subtotal : (saleData.subtotal || 0);
  const tax = saleData.financials?.tax !== undefined ? saleData.financials.tax : (saleData.tax || 0);
  const total = saleData.financials?.total !== undefined ? saleData.financials.total : (saleData.totalAmount || 0);

  // Dynamic overrides
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

  // Print fonts and widths
  const widthValue = config.ticketWidth || "80mm";
  const sizeValue = config.fontSize || "base";
  
  let printFontSize = "14px";
  let titleFontSize = "18px";
  let smallFontSize = "11px";
  
  if (sizeValue === "sm") {
    printFontSize = "12px";
    titleFontSize = "15px";
    smallFontSize = "9px";
  } else if (sizeValue === "lg") {
    printFontSize = "16px";
    titleFontSize = "22px";
    smallFontSize = "13px";
  }

  return (
    <div 
      className="print-only thermal-ticket mx-auto bg-white text-black p-1"
      style={{ width: widthValue === "80mm" ? "100%" : "280px" }} // Screen size control
    >
      <div className="text-center mb-3">
        {/* Logo rendering */}
        {logoSrc && (
          <img 
            src={logoSrc} 
            alt="Business Logo" 
            style={{ width: `${config.logoWidth}px` }} 
            className="mx-auto mb-2 grayscale object-contain max-h-20" 
          />
        )}
        
        {previewName && (
          <h1 className="text-sm font-bold uppercase tracking-tight">{previewName}</h1>
        )}
        
        <div className="text-[10px] space-y-0.5 mt-1 leading-tight text-slate-800">
          {previewAddress && <p className="whitespace-pre-wrap">{previewAddress}</p>}
          {previewRfc && <p>RFC: {previewRfc.toUpperCase()}</p>}
          {previewPhone && <p>TEL: {previewPhone}</p>}
        </div>

        {/* Custom Header Text */}
        {config.headerText && (
          <p className="text-[10px] border-t border-dashed border-black pt-1.5 mt-1.5 text-center italic whitespace-pre-wrap leading-tight">
            {config.headerText}
          </p>
        )}

        <div className="border-t border-black mt-2 pt-2 text-[10px] text-left space-y-0.5">
          {config.showDate && <p>Fecha: {dateStr}</p>}
          <p>Ticket: #{folioText}</p>
          <p>Cliente: {clientName}</p>
        </div>
      </div>

      <div className="border-t border-b border-black py-2 mb-2">
        <table className="w-full text-[10px] leading-tight">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="font-bold pb-1 text-left" style={{ width: "15%" }}>CANT</th>
              <th className="font-bold pb-1 text-left" style={{ width: "55%" }}>ARTÍCULO</th>
              <th className="font-bold pb-1 text-right" style={{ width: "30%" }}>IMPORTE</th>
            </tr>
          </thead>
          <tbody>
            {saleData.items.map((item: any, i: number) => {
              const itemTitle = item.productName || item.title || "";
              return (
                <tr key={i} className="align-top">
                  <td className="py-1">{item.quantity}</td>
                  <td className="py-1 pr-1">{itemTitle}</td>
                  <td className="py-1 text-right">{formatMoney(item.quantity * item.unitPrice * (1 - (item.discountPercentage || 0) / 100))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] space-y-1 mb-3">
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
      {(config.showPaymentMethod || config.showPaymentReference) && saleData.payments && saleData.payments.length > 0 && (
        <div className="text-[10px] border-t border-dashed border-black pt-2 pb-1 mb-2 space-y-0.5">
          {saleData.payments.map((p: any, idx: number) => (
            <div key={idx} className="flex justify-between leading-tight">
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

      {/* Payment Details Fallback */}
      {(config.showPaymentMethod || config.showPaymentReference) && (!saleData.payments || saleData.payments.length === 0) && (saleData.paymentMethod || saleData.paymentReference) && (
        <div className="text-[10px] border-t border-dashed border-black pt-2 pb-1 mb-2 space-y-0.5 flex justify-between leading-tight">
          <span>
            {config.showPaymentMethod && saleData.paymentMethod ? `PAGO (${saleData.paymentMethod.toUpperCase()}):` : "PAGO:"}
          </span>
          <span>
            {formatMoney(total)}
            {config.showPaymentReference && saleData.paymentReference ? ` [${saleData.paymentReference}]` : ""}
          </span>
        </div>
      )}

      {/* Points Acumulados */}
      {config.showPoints && saleData.pointsEarned > 0 && (
        <div className="text-center text-[10px] border border-black p-1.5 mb-3 rounded-sm">
          <p className="font-bold">¡Acumulaste {saleData.pointsEarned} puntos!</p>
          <p>Úsalos en tu próxima visita.</p>
        </div>
      )}

      {/* Datos de Facturación (Autofactura) */}
      {config.showBillingInfo && (
        <div className="text-[10px] border-t border-b border-dashed border-black py-2 mb-3 text-center space-y-1.5 leading-tight">
          <p className="font-bold tracking-tight">INFORMACIÓN DE FACTURACIÓN</p>
          {config.billingInstructions && (
            <p className="text-[9px] text-slate-800 whitespace-pre-wrap">{config.billingInstructions}</p>
          )}
          <div className="text-[9px] text-left space-y-0.5 font-mono bg-slate-50 p-1.5 border border-slate-200 rounded-sm">
            {config.billingUrl && (
              <p className="break-all font-sans">
                <span className="font-bold">Portal:</span> {config.billingUrl.replace('{folio}', '').replace('{total}', '')}
              </p>
            )}
            <p><span className="font-bold">Folio:</span> {folioText}</p>
            <p><span className="font-bold">Total:</span> {formatMoney(total)}</p>
          </div>
          {config.showBillingQr && config.billingUrl && (() => {
            let qrUrl = config.billingUrl;
            
            // Auto-append companyId to the QR URL if it points to our autofactura portal and is missing
            if (qrUrl.includes('/autofactura') && !qrUrl.includes('companyId=') && companyId) {
              const separator = qrUrl.includes('?') ? '&' : '?';
              qrUrl = `${qrUrl}${separator}companyId=${companyId}`;
            }

            if (qrUrl.includes('{folio}') || qrUrl.includes('{total}')) {
              qrUrl = qrUrl.replace('{folio}', encodeURIComponent(folioText))
                           .replace('{total}', encodeURIComponent(total.toString()));
            } else {
              const separator = qrUrl.includes('?') ? '&' : '?';
              qrUrl = `${qrUrl}${separator}folio=${encodeURIComponent(folioText)}&total=${encodeURIComponent(total.toString())}`;
            }
            return (
              <div className="flex flex-col items-center pt-1.5">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}`} 
                  alt="QR Facturación" 
                  className="w-24 h-24 object-contain grayscale mx-auto"
                />
                <span className="text-[8px] text-slate-500 mt-1">Escanear para facturar</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Custom Footer Text */}
      {config.footerText && (
        <div className="text-center text-[9px] mb-3 whitespace-pre-wrap leading-tight text-slate-800">
          {config.footerText}
        </div>
      )}

      {/* Barcode block */}
      {config.showBarcode && (
        <div className="text-center mt-5 flex flex-col items-center">
          <p className="text-[9px] mb-2 text-slate-500">Para cambios y devoluciones:</p>
          <img 
            src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${barcodeValue}&scale=2&height=10&includetext=true`} 
            alt="Código de Barras" 
            className="w-full max-w-[180px] object-contain"
          />
        </div>
      )}

      {/* Estilos específicos para la impresora térmica */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          html, body {
            width: 100%;
            margin: 0;
            padding: 0;
            background-color: white;
          }
          body * {
            visibility: hidden;
          }
          .print-only, .print-only * {
            visibility: visible;
          }
          .print-only {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: ${widthValue} !important;
            max-width: ${widthValue} !important;
            margin: 0 !important;
            padding: 4mm !important;
            background-color: white;
            filter: grayscale(100%) contrast(1000) !important;
          }
          .print-only img {
            image-rendering: pixelated !important;
          }
          .print-only, .print-only * {
             color: #000 !important;
             font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
             font-weight: 700 !important;
             font-size: ${printFontSize} !important;
             line-height: 1.3 !important;
             text-shadow: none !important;
             box-shadow: none !important;
             -webkit-print-color-adjust: exact !important;
             print-color-adjust: exact !important;
             text-rendering: crispEdges !important;
          }
          .print-only .text-sm { font-size: ${titleFontSize} !important; font-weight: 900 !important; }
          .print-only .text-[10px], .print-only .text-[9px] { font-size: ${smallFontSize} !important; }
          
          /* Quitar márgenes de impresión del navegador */
          @page {
            margin: 0;
            size: ${widthValue} auto;
          }
        }
        @media screen {
          .print-only {
            display: block; /* Muestra en pantalla en modals */
          }
        }
      `}} />
    </div>
  );
}
