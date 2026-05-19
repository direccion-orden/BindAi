"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Receipt, Truck } from "lucide-react";
import { createCfdi } from "@/actions/facturama";
import { doc, updateDoc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

// Re-use utility for sequence
import { getNextSequence } from "@/lib/firebase/counters";

export function ProcessOrderModal({ 
  isOpen, 
  onClose, 
  order, 
  companyId 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  order: any,
  companyId: string 
}) {
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState("remision"); // remision, pre-factura, factura
  
  // Facturama Required Fields
  const [rfc, setRfc] = useState("XAXX010101000");
  const [razonSocial, setRazonSocial] = useState(order?.clientName || "");
  const [taxRegime, setTaxRegime] = useState("616");
  const [zipCode, setZipCode] = useState("00000");
  const [companyZipCode, setCompanyZipCode] = useState("00000");
  const [cfdiUse, setCfdiUse] = useState("S01");
  const [paymentForm, setPaymentForm] = useState("01");
  const [paymentMethod, setPaymentMethod] = useState("PUE");

  useEffect(() => {
    if (isOpen && order?.clientId && companyId) {
      getDoc(doc(db, "companies", companyId)).then(snap => {
        if (snap.exists() && snap.data().zipCode) setCompanyZipCode(snap.data().zipCode);
      }).catch(console.error);

      getDoc(doc(db, "companies", companyId, "clients", order.clientId)).then(snap => {
        if (snap.exists()) {
          const client = snap.data();
          if (client.rfc) setRfc(client.rfc);
          if (client.razonSocial) setRazonSocial(client.razonSocial);
          else if (client.name) setRazonSocial(client.name);
          if (client.taxRegime) setTaxRegime(client.taxRegime);
          if (client.zipCode) setZipCode(client.zipCode);
          if (client.cfdiUse) setCfdiUse(client.cfdiUse);
        }
      }).catch(console.error);
    }
  }, [isOpen, order?.clientId, companyId]);

  if (!order) return null;

  const handleProcess = async () => {
    setLoading(true);
    try {
      if (actionType === "remision") {
        await processRemission();
      } else if (actionType === "pre-factura") {
        await processPreFactura();
      } else if (actionType === "factura") {
        await processFactura();
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Error al procesar el pedido.");
    } finally {
      setLoading(false);
    }
  };

  const processRemission = async () => {
    const remId = crypto.randomUUID();
    const remNumber = await getNextSequence(companyId, 'remisiones');

    // 1. Create Remission
    await setDoc(doc(db, "companies", companyId, "remisiones", remId), {
      id: remId,
      remissionNumber: remNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientId: order.clientId || null,
      clientName: order.clientName,
      items: order.items,
      totalAmount: order.totalAmount,
      projectId: order.projectId || null,
      projectName: order.projectName || null,
      createdAt: new Date().toISOString(),
      createdBy: order.createdBy,
      status: 'activa'
    });

    // 2. Update Order
    await updateDoc(doc(db, "companies", companyId, "pedidos", order.id), {
      status: "remisionado",
      remissionId: remId
    });

    // 3. Deduct Inventory
    for (const item of order.items) {
      const productRef = doc(db, "companies", companyId, "products", item.productId);
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const productData = productDoc.data();
        const updatedVariants = productData.variants?.map((v: any) => {
          if (v.id === item.variantId) {
            return { ...v, stock: (v.stock || 0) - item.quantity };
          }
          return v;
        });
        await updateDoc(productRef, { variants: updatedVariants });
        
        // Log movement
        const movId = crypto.randomUUID();
        await setDoc(doc(db, "companies", companyId, "inventory_movements", movId), {
          id: movId,
          productId: item.productId,
          variantId: item.variantId,
          type: "OUT",
          quantity: item.quantity,
          reason: `Remisión ${remNumber} (Pedido ${order.orderNumber})`,
          referenceId: remId,
          createdAt: new Date().toISOString()
        });
      }
    }

    alert("Remisión generada exitosamente.");
    window.location.reload();
  };

  const buildFacturamaPayload = () => {
    const payload: any = {
      Receiver: {
        Name: razonSocial.toUpperCase(),
        CfdiUse: taxRegime === "616" ? "S01" : cfdiUse,
        Rfc: rfc.toUpperCase(),
        TaxZipCode: (rfc.toUpperCase() === "XAXX010101000" || rfc.toUpperCase() === "XEXX010101000") ? companyZipCode : zipCode,
        FiscalRegime: taxRegime
      },
      CfdiType: "I",
      Exportation: "01",
      PaymentForm: paymentForm,
      PaymentMethod: paymentMethod,
      Currency: "MXN",
      ExpeditionPlace: companyZipCode,
      Items: order.items.map((item: any) => {
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

    if (payload.Receiver.Rfc === "XAXX010101000" && payload.Receiver.Name === "PUBLICO EN GENERAL") {
      payload.GlobalInformation = {
        Periodicity: "01",
        Months: new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`,
        Year: new Date().getFullYear()
      };
    }

    return payload;
  };

  const processPreFactura = async () => {
    const payload = buildFacturamaPayload();
    const invId = crypto.randomUUID();
    const invNumber = await getNextSequence(companyId, 'facturas');

    await setDoc(doc(db, "companies", companyId, "facturas", invId), {
      id: invId,
      invoiceNumber: invNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientId: order.clientId || null,
      clientName: order.clientName,
      items: order.items,
      totalAmount: order.totalAmount,
      projectId: order.projectId || null,
      projectName: order.projectName || null,
      cfdiPayload: payload,
      status: "por_timbrar",
      createdAt: new Date().toISOString(),
      createdBy: order.createdBy
    });

    await updateDoc(doc(db, "companies", companyId, "pedidos", order.id), {
      status: "pre_facturado",
      invoiceId: invId
    });

    alert("Pre-Factura creada exitosamente. Podrás timbrarla más tarde.");
    window.location.reload();
  };

  const processFactura = async () => {
    const payload = buildFacturamaPayload();
    const result = await createCfdi(payload);

    if (result.success) {
      const invId = crypto.randomUUID();
      const invNumber = await getNextSequence(companyId, 'facturas');

      await setDoc(doc(db, "companies", companyId, "facturas", invId), {
        id: invId,
        invoiceNumber: invNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        clientId: order.clientId || null,
        clientName: order.clientName,
        items: order.items,
        totalAmount: order.totalAmount,
        projectId: order.projectId || null,
        projectName: order.projectName || null,
        cfdiPayload: payload,
        facturamaId: result.data.Id,
        facturamaUuid: result.data.Uuid,
        status: "timbrada",
        createdAt: new Date().toISOString(),
        createdBy: order.createdBy
      });

      await updateDoc(doc(db, "companies", companyId, "pedidos", order.id), {
        status: "facturado",
        invoiceId: invId
      });

      alert("Factura timbrada exitosamente (Folio Fiscal: " + (result.data.Uuid || 'Pendiente') + ")");
      window.location.reload();
    } else {
      throw new Error("Error de Facturama: " + result.error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-600" /> 
            Procesar Pedido {order.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Selecciona qué documento deseas generar a partir de este pedido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Tipo de Documento a Generar *</label>
            <select 
              className="flex h-12 w-full rounded-md border-2 border-indigo-200 bg-indigo-50/30 px-3 py-2 text-md font-bold text-indigo-900 ring-offset-background"
              value={actionType}
              onChange={e => setActionType(e.target.value)}
            >
              <option value="remision">Remisión (Entrega Física)</option>
              <option value="pre-factura">Pre-Factura (Borrador Por Timbrar)</option>
              <option value="factura">Factura CFDI 4.0 (Timbrado Inmediato)</option>
            </select>
          </div>

          {(actionType === "pre-factura" || actionType === "factura") && (
            <>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
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
            </>
          )}
          
          <div className="bg-slate-50 border p-4 rounded-lg mt-4 flex justify-between items-center text-sm">
            <span className="font-semibold text-slate-600">Total del Documento:</span>
            <span className="text-xl font-black text-indigo-700">${order.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
          </div>

          <Button 
            className={`w-full h-12 text-md mt-4 font-bold text-white ${actionType === 'remision' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            onClick={handleProcess}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : actionType === 'remision' ? <Truck className="w-5 h-5 mr-2" /> : <Receipt className="w-5 h-5 mr-2" />}
            {loading ? "Procesando..." : actionType === 'remision' ? "Generar Remisión" : actionType === 'pre-factura' ? "Crear Pre-Factura" : "Timbrar Factura CFDI"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
