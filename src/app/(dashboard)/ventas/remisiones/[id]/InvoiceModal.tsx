"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Receipt } from "lucide-react";
import { createCfdi } from "@/actions/facturama";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

export function InvoiceModal({ 
  isOpen, 
  onClose, 
  remission, 
  companyId 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  remission: any,
  companyId: string 
}) {
  const [loading, setLoading] = useState(false);
  
  // Facturama Required Fields
  const [rfc, setRfc] = useState("XAXX010101000"); // Generic default
  const [razonSocial, setRazonSocial] = useState(remission?.clientName || "");
  const [taxRegime, setTaxRegime] = useState("616"); // Sin obligaciones fiscales default
  const [zipCode, setZipCode] = useState("00000");
  const [companyZipCode, setCompanyZipCode] = useState("00000");
  const [cfdiUse, setCfdiUse] = useState("S01"); // Sin efectos fiscales default
  const [paymentForm, setPaymentForm] = useState("01"); // Efectivo default
  const [paymentMethod, setPaymentMethod] = useState("PUE"); // Pago en una sola exhibición

  useEffect(() => {
    // We try to find the client. If remission has an orderId, maybe we need the order's clientId.
    // If we only have clientName on remission, we try to query the client by name.
    // But let's assume we can add clientId to remissions or we fetch from order if possible.
    const fetchClient = async () => {
      if (!isOpen || !companyId || !remission) return;
      
      let clientId = remission.clientId;
      
      try {
        const companySnap = await getDoc(doc(db, "companies", companyId));
        if (companySnap.exists() && companySnap.data().zipCode) {
          setCompanyZipCode(companySnap.data().zipCode);
        }
      } catch(e) { console.error(e); }
      
      // If remission doesn't have clientId, but has orderId, fetch order first
      if (!clientId && remission.orderId) {
        try {
          const orderSnap = await getDoc(doc(db, "companies", companyId, "pedidos", remission.orderId));
          if (orderSnap.exists()) {
            clientId = orderSnap.data().clientId;
          }
        } catch(e) { console.error(e); }
      }

      if (clientId) {
        try {
          const clientSnap = await getDoc(doc(db, "companies", companyId, "clients", clientId));
          if (clientSnap.exists()) {
            const client = clientSnap.data();
            if (client.rfc) setRfc(client.rfc);
            if (client.razonSocial) setRazonSocial(client.razonSocial);
            else if (client.name) setRazonSocial(client.name);
            if (client.taxRegime) setTaxRegime(client.taxRegime);
            if (client.zipCode) setZipCode(client.zipCode);
            if (client.cfdiUse) setCfdiUse(client.cfdiUse);
          }
        } catch(e) { console.error(e); }
      }
    };
    
    fetchClient();
  }, [isOpen, remission, companyId]);

  if (!remission) return null;

  const handleGenerateInvoice = async () => {
    setLoading(true);
    try {
      // Build Facturama CFDI 4.0 Payload
      const facturamaPayload: any = {
        Receiver: {
          Name: razonSocial.toUpperCase(),
          CfdiUse: cfdiUse,
          Rfc: rfc.toUpperCase(),
          TaxZipCode: (rfc.toUpperCase() === "XAXX010101000" || rfc.toUpperCase() === "XEXX010101000") ? companyZipCode : zipCode,
          FiscalRegime: taxRegime
        },
        CfdiType: "I", // Ingreso
        Exportation: "01",
        PaymentForm: paymentForm,
        PaymentMethod: paymentMethod,
        Currency: "MXN",
        ExpeditionPlace: companyZipCode,
        Items: remission.items.map((item: any) => {
          const discountAmt = item.quantity * item.unitPrice * (item.discountPercentage / 100);
          const subtotalItem = (item.quantity * item.unitPrice) - discountAmt;
          
          return {
            ProductCode: item.satProductCode || "01010101",
            IdentificationNumber: item.variantId || "SKU",
            Description: item.productName,
            Unit: item.satUnitName || "PIEZA",
            UnitCode: item.satUnitCode || "H87",
            UnitPrice: Number(item.unitPrice.toFixed(4)),
            Quantity: item.quantity,
            Subtotal: Number(subtotalItem.toFixed(4)),
            Discount: Number(discountAmt.toFixed(4)),
            TaxObject: "02",
            Taxes: [
              {
                Total: Number((subtotalItem * 0.16).toFixed(4)),
                Name: "IVA",
                Base: Number(subtotalItem.toFixed(4)),
                Rate: 0.16,
                IsRetention: false
              }
            ],
            Total: Number((subtotalItem * 1.16).toFixed(4))
          };
        })
      };

      if (facturamaPayload.Receiver.Rfc === "XAXX010101000" && facturamaPayload.Receiver.Name === "PUBLICO EN GENERAL") {
        facturamaPayload.GlobalInformation = {
          Periodicity: "01",
          Months: new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`,
          Year: new Date().getFullYear()
        };
      }

      const result = await createCfdi(facturamaPayload);

      if (result.success) {
        // Save invoice relation to remission document
        await updateDoc(doc(db, "companies", companyId, "remisiones", remission.id), {
          status: "facturada",
          invoiceId: result.data.Id,
          invoiceUuid: result.data.Uuid,
          invoiceDate: result.data.Date
        });
        
        // Also update order to facturado if needed (optional)
        if (remission.orderId) {
          await updateDoc(doc(db, "companies", companyId, "pedidos", remission.orderId), {
            status: "facturado"
          });
        }

        alert("Factura timbrada exitosamente (Folio Fiscal: " + (result.data.Uuid || 'Pendiente') + ")");
        window.location.reload();
      } else {
        alert("Error de Facturama: " + result.error);
        console.error(result.details);
      }

    } catch (e) {
      console.error(e);
      alert("Error al intentar facturar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" /> 
            Timbrar Factura CFDI 4.0
          </DialogTitle>
          <DialogDescription>
            Revisa los datos fiscales del cliente para generar la factura. Remisión: {remission.remissionNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">RFC Receptor *</label>
              <Input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} maxLength={13} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Razón Social *</label>
              <Input value={razonSocial} onChange={e => setRazonSocial(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Código Postal Fiscal *</label>
              <Input value={zipCode} onChange={e => setZipCode(e.target.value)} maxLength={5} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Régimen Fiscal *</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={taxRegime}
                onChange={e => setTaxRegime(e.target.value)}
              >
                <option value="601">601 - General de Ley Personas Morales</option>
                <option value="606">606 - Arrendamiento</option>
                <option value="612">612 - Personas Físicas con Actividades Empresariales</option>
                <option value="616">616 - Sin obligaciones fiscales</option>
                <option value="626">626 - RESICO</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Uso de CFDI *</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={cfdiUse}
                onChange={e => setCfdiUse(e.target.value)}
              >
                <option value="G01">G01 - Adquisición de mercancias</option>
                <option value="G03">G03 - Gastos en general</option>
                <option value="P01">P01 - Por definir</option>
                <option value="S01">S01 - Sin efectos fiscales</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Método de Pago *</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
              >
                <option value="PUE">PUE - Pago en una sola exhibición</option>
                <option value="PPD">PPD - Pago en parcialidades o diferido</option>
              </select>
            </div>
            <div className="space-y-2 col-span-2">
              <label className="text-sm font-semibold text-slate-700">Forma de Pago *</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={paymentForm}
                onChange={e => setPaymentForm(e.target.value)}
                disabled={paymentMethod === 'PPD'}
              >
                <option value="01">01 - Efectivo</option>
                <option value="02">02 - Cheque nominativo</option>
                <option value="03">03 - Transferencia electrónica de fondos</option>
                <option value="04">04 - Tarjeta de crédito</option>
                <option value="28">28 - Tarjeta de débito</option>
                <option value="99">99 - Por definir (Solo PPD)</option>
              </select>
            </div>
          </div>
          
          <div className="bg-slate-50 border p-4 rounded-lg mt-4 flex justify-between items-center text-sm">
            <span className="font-semibold text-slate-600">Total a Facturar:</span>
            <span className="text-xl font-black text-indigo-700">${remission.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
          </div>

          <Button 
            className="w-full h-12 text-md mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            onClick={handleGenerateInvoice}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Receipt className="w-5 h-5 mr-2" />}
            {loading ? "Timbrando..." : "Generar CFDI"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
