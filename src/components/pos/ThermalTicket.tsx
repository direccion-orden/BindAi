import React from 'react';

interface ThermalTicketProps {
  saleId: string;
  saleData: any;
}

export function ThermalTicket({ saleId, saleData }: ThermalTicketProps) {
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const client = saleData.client || { name: "Público en General" };
  
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
      // Si es un FieldValue (recién guardado), mantendrá new Date()
  }
  const dateStr = dateObj.toLocaleString('es-MX');

  const folioText = saleData.folio || saleId.slice(0, 8).toUpperCase();
  const barcodeValue = saleData.folio || saleId;

  return (
    <div className="print-only thermal-ticket">
      <div className="text-center mb-4">
        {/* Usamos el logo en la ruta pública */}
        <img src="/logo.svg" alt="El Orden de las Cosas" className="w-48 mx-auto mb-2 grayscale" />
        <h1 className="text-lg font-bold uppercase tracking-widest mt-2">Ticket de Venta</h1>
        <p className="text-xs mt-1">{dateStr}</p>
        <p className="text-xs">Ticket: #{folioText}</p>
        <p className="text-xs">Cliente: {client.name}</p>
      </div>

      <div className="border-t border-b border-black py-2 mb-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="font-normal pb-1">CANT</th>
              <th className="font-normal pb-1">ARTÍCULO</th>
              <th className="font-normal pb-1 text-right">IMPORTE</th>
            </tr>
          </thead>
          <tbody>
            {saleData.items.map((item: any, i: number) => (
              <tr key={i} className="align-top">
                <td className="py-1">{item.quantity}</td>
                <td className="py-1 pr-2">{item.title}</td>
                <td className="py-1 text-right">{formatMoney(item.quantity * item.unitPrice * (1 - (item.discountPercentage || 0) / 100))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs space-y-1 mb-4">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatMoney(saleData.financials.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>IVA (16%):</span>
          <span>{formatMoney(saleData.financials.tax)}</span>
        </div>
        <div className="flex justify-between font-bold text-sm mt-1 pt-1 border-t border-dashed border-black">
          <span>TOTAL:</span>
          <span>{formatMoney(saleData.financials.total)}</span>
        </div>
      </div>

      {saleData.pointsEarned > 0 && (
        <div className="text-center text-xs border border-black p-2 mb-4 rounded-sm">
          <p className="font-bold">¡Acumulaste {saleData.pointsEarned} puntos!</p>
          <p>Úsalos en tu próxima visita.</p>
        </div>
      )}

      <div className="text-center mt-6 flex flex-col items-center">
        <p className="text-xs mb-2">Para cambios y devoluciones:</p>
        <img 
          src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${barcodeValue}&scale=2&height=10&includetext=true`} 
          alt="Código de Barras" 
          className="w-full max-w-[200px]"
        />
        <p className="text-[10px] mt-4 uppercase">¡Gracias por su compra!</p>
        <p className="text-[10px] mt-1">Este documento es un comprobante simplificado</p>
      </div>

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
            width: 100% !important;
            margin: 0 !important;
            padding: 4mm !important; /* Añadir márgenes internos en todos los lados */
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
             font-size: 15px !important;
             line-height: 1.3 !important;
             text-shadow: none !important;
             box-shadow: none !important;
             -webkit-print-color-adjust: exact !important;
             print-color-adjust: exact !important;
             text-rendering: crispEdges !important;
          }
          .print-only .text-lg { font-size: 20px !important; font-weight: 900 !important; }
          .print-only .text-[10px] { font-size: 12px !important; }
          
          /* Quitar márgenes de impresión del navegador */
          @page {
            margin: 0;
            size: 80mm auto;
          }
        }
        @media screen {
          .print-only {
            display: none;
          }
        }
      `}} />
    </div>
  );
}
