"use client";

import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Receipt, Truck, X } from "lucide-react";
import { createCfdi } from "@/actions/facturama";
import { doc, updateDoc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

// Re-use utility for sequence
import { getNextSequence } from "@/lib/firebase/counters";
import { distributeDiscountAndTax } from "@/lib/utils/discountEngine";

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
  const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState("remision"); // remision, pre-factura, factura
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const clientSelectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientSelectorRef.current && !clientSelectorRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const [appliedDate, setAppliedDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

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
    const fetchClient = async () => {
      if (!isOpen || !companyId || !order) return;
      
      let clientId = order.clientId;
      
      try {
        const companySnap = await getDoc(doc(db, "companies", companyId));
        if (companySnap.exists() && companySnap.data().zipCode) {
          setCompanyZipCode(companySnap.data().zipCode);
        }
      } catch(e) { console.error(e); }

      // Fetch all clients catalog
      try {
        const clientsSnap = await getDocs(collection(db, "companies", companyId, "clients"));
        const clientsList = clientsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as any));
        clientsList.sort((a, b) => {
          const nameA = (a.name || a.LegalName || a.CommercialName || "").toLowerCase();
          const nameB = (b.name || b.LegalName || b.CommercialName || "").toLowerCase();
          return nameA.localeCompare(nameB, "es");
        });
        setClients(clientsList);
      } catch(e) { console.error("Error loading clients list:", e); }

      if (clientId) {
        setSelectedClientId(clientId);
        try {
          const clientSnap = await getDoc(doc(db, "companies", companyId, "clients", clientId));
          if (clientSnap.exists()) {
            const client = clientSnap.data();
            if (client.rfc || client.RFC) setRfc(client.rfc || client.RFC);
            
            let name = "";
            if (client.razonSocial) name = client.razonSocial;
            else if (client.LegalName) name = client.LegalName;
            else if (client.name) name = client.name;
            setRazonSocial(name);
            setClientSearchQuery(name);
            
            if (client.taxRegime) setTaxRegime(client.taxRegime);
            if (client.zipCode || client.ZipCode) setZipCode(client.zipCode || client.ZipCode);
            if (client.cfdiUse) setCfdiUse(client.cfdiUse);
          }
        } catch(e) { console.error(e); }
      } else {
        if (order?.clientName) {
          setClientSearchQuery(order.clientName);
        }
      }
    };

    fetchClient();
  }, [isOpen, order, companyId]);

  const handleClientSelect = (client: any) => {
    setSelectedClientId(client.id);
    const name = client.razonSocial || client.LegalName || client.name || "";
    setClientSearchQuery(name);
    setRfc(client.rfc || client.RFC || "XAXX010101000");
    setRazonSocial(name);
    setTaxRegime(client.taxRegime || "616");
    setZipCode(client.zipCode || client.ZipCode || "00000");
    setCfdiUse(client.cfdiUse || "S01");
    setShowClientDropdown(false);
  };

  const handleClearClient = () => {
    setClientSearchQuery("");
    setSelectedClientId("");
    setRfc("XAXX010101000");
    setRazonSocial("");
    setTaxRegime("616");
    setZipCode("00000");
    setCfdiUse("S01");
    setShowClientDropdown(true);
  };

  if (!order) return null;

  const filteredClients = clients.filter(c => {
    const queryText = clientSearchQuery.toLowerCase();
    const name = (c.name || c.LegalName || c.CommercialName || "").toLowerCase();
    const rfc = (c.rfc || c.RFC || "").toLowerCase();
    return name.includes(queryText) || rfc.includes(queryText);
  });

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
      if (e.message?.includes("was not found on the server") || e.message?.includes("Failed to find Server Action")) {
        alert("El sistema ha sido actualizado recientemente. La página se recargará automáticamente para aplicar los cambios.");
        window.location.reload();
        return;
      }
      alert(e.message || "Error al procesar el pedido.");
    } finally {
      setLoading(false);
    }
  };

  const processRemission = async () => {
    const remId = crypto.randomUUID();
    const remNumber = await getNextSequence(companyId, 'remisiones');

    let accountId = "";
    let accountCode = "401.1";
    let accountName = "Ventas Nacionales";

    try {
      const q = query(
        collection(db, "companies", companyId, "accounts"),
        where("code", "==", "401.1")
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        accountId = snap.docs[0].id;
        accountCode = snap.docs[0].data().code || "401.1";
        accountName = snap.docs[0].data().name || "Ventas Nacionales";
      }
    } catch (err) {
      console.error("Error querying account 401.1 for order remission:", err);
    }

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    const appliedISO = new Date(`${appliedDate}T${hours}:${minutes}:${seconds}.${milliseconds}`).toISOString();

    // 1. Create Remission
    const isPaid = order.status === "pagado" || (order.paidAmount >= (order.totalAmount - 0.01));
    
    await setDoc(doc(db, "companies", companyId, "remisiones", remId), {
      id: remId,
      remissionNumber: remNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientId: order.clientId || null,
      clientName: order.clientName,
      items: order.items,
      subtotal: round2(order.subtotal || 0),
      tax: round2(order.tax || 0),
      totalDiscount: round2(order.totalDiscount || 0),
      totalAmount: round2(order.totalAmount || 0),
      paidAmount: order.paidAmount || 0,
      projectId: order.projectId || null,
      projectName: order.projectName || null,
      locationId: order.locationId || null,
      locationName: order.locationName || "",
      accountId,
      accountCode,
      accountName,
      createdAt: appliedISO,
      createdBy: order.createdBy,
      status: isPaid ? 'pagada' : 'activa'
    });

    // 2. Update Order
    await updateDoc(doc(db, "companies", companyId, "pedidos", order.id), {
      status: "remisionado",
      remissionId: remId
    });

    // 2.5 Relate existing payments to the new remission
    try {
      const paymentsQuery = query(
        collection(db, "companies", companyId, "payments"),
        where("documentId", "==", order.id),
        where("documentType", "==", "pedido")
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      for (const pDoc of paymentsSnap.docs) {
        await updateDoc(pDoc.ref, {
          documentId: remId,
          documentType: "remision",
          orderId: order.id // Mantener referencia al pedido original
        });
      }
    } catch (payErr) {
      console.error("Error updating related payments:", payErr);
    }

    // 3. Deduct Inventory
    for (const item of order.items) {
      const productRef = doc(db, "companies", companyId, "products", item.productId);
      const productDoc = await getDoc(productRef);
      if (productDoc.exists()) {
        const productData = productDoc.data();
        const updatedVariants = productData.variants?.map((v: any) => {
          if (v.id === (item.variantId || item.id)) {
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
          variantId: item.variantId || item.id || "",
          type: "OUT",
          quantity: item.quantity,
          reason: `Remisión ${remNumber} (Pedido ${order.orderNumber})`,
          referenceId: remId,
          createdAt: appliedISO
        });
      }
    }

    alert("Remisión generada exitosamente.");
    window.location.reload();
  };

  const buildFacturamaPayload = async () => {
    const totalDocDiscount = Number(order.totalDiscount) || 0;
    const targetTax = Number(order.tax) || 0;
    const targetTotal = Number(order.totalAmount) || 0;

    const distributedItems = distributeDiscountAndTax(
      order.items || [],
      totalDocDiscount,
      targetTax,
      targetTotal
    );

    // Fetch missing SAT codes from product catalog
    const resolvedItems = await Promise.all(
      distributedItems.map(async (item: any) => {
        let satProductCode = item.satProductCode;
        let satUnitCode = item.satUnitCode;
        let satUnitName = item.satUnitName;

        if ((!satProductCode || satProductCode === "01010101") && item.productId && companyId) {
          try {
            const prodSnap = await getDoc(doc(db, "companies", companyId, "products", item.productId));
            if (prodSnap.exists()) {
              const prodData = prodSnap.data();
              if (prodData) {
                if (prodData.satProductCode) satProductCode = prodData.satProductCode;
                if (prodData.satUnitCode) satUnitCode = prodData.satUnitCode;
                if (prodData.satUnitName) satUnitName = prodData.satUnitName;
              }
            }
          } catch (e) {
            console.error("Error fetching product SAT codes in buildFacturamaPayload:", e);
          }
        }

        return {
          ...item,
          satProductCode: satProductCode || "01010101",
          satUnitCode: satUnitCode || "H87",
          satUnitName: satUnitName || "PIEZA"
        };
      })
    );

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
      Items: resolvedItems.map((item: any) => {
        const unitPriceRounded = round2(item.unitPrice);
        const subtotalVal = round2(item.quantity * unitPriceRounded);
        
        const discountVal = round2(item.finalDiscountAmt);
        const baseVal = round2(subtotalVal - discountVal);
        const taxTotalVal = round2(item.tax);
        const totalVal = round2(baseVal + taxTotalVal);

        return {
          ProductCode: item.satProductCode,
          IdentificationNumber: item.variantId || item.id || "SKU",
          Description: item.isService && item.description ? item.description : item.productName,
          Unit: item.satUnitName,
          UnitCode: item.satUnitCode,
          UnitPrice: unitPriceRounded,
          Quantity: item.quantity,
          Subtotal: subtotalVal,
          Discount: discountVal,
          TaxObject: "02",
          Taxes: [
            {
              Total: taxTotalVal,
              Name: "IVA",
              Base: baseVal,
              Rate: 0.16,
              IsRetention: false
            }
          ],
          Total: totalVal
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
    const payload = await buildFacturamaPayload();
    const invId = crypto.randomUUID();
    const invNumber = await getNextSequence(companyId, 'facturas');

    await setDoc(doc(db, "companies", companyId, "facturas", invId), {
      id: invId,
      invoiceNumber: invNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientId: selectedClientId || order.clientId || null,
      clientName: razonSocial || order.clientName,
      items: order.items,
      subtotal: round2(order.subtotal || 0),
      tax: round2(order.tax || 0),
      totalDiscount: round2(order.totalDiscount || 0),
      totalAmount: round2(order.totalAmount || 0),
      paidAmount: order.paidAmount || 0,
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

    // Relate existing payments to the new pre-invoice
    try {
      const paymentsQuery = query(
        collection(db, "companies", companyId, "payments"),
        where("documentId", "==", order.id),
        where("documentType", "==", "pedido")
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      for (const pDoc of paymentsSnap.docs) {
        await updateDoc(pDoc.ref, {
          documentId: invId,
          documentType: "factura",
          orderId: order.id
        });
      }
    } catch (payErr) {
      console.error("Error updating related payments for pre-invoice:", payErr);
    }

    alert("Pre-Factura creada exitosamente. Podrás timbrarla más tarde.");
    window.location.reload();
  };

  const processFactura = async () => {
    const payload = await buildFacturamaPayload();
    const result = await createCfdi(payload);

    if (result.success) {
      const invId = crypto.randomUUID();
      const invNumber = await getNextSequence(companyId, 'facturas');

      const facturamaId = result.data?.Id || result.data?.id || null;
      const facturamaUuid = result.data?.Complement?.TaxStamp?.Uuid || result.data?.Uuid || result.data?.uuid || null;

      await setDoc(doc(db, "companies", companyId, "facturas", invId), {
        id: invId,
        invoiceNumber: invNumber,
        orderId: order.id,
        orderNumber: order.orderNumber,
        clientId: selectedClientId || order.clientId || null,
        clientName: razonSocial || order.clientName,
        items: order.items,
        subtotal: round2(order.subtotal || 0),
        tax: round2(order.tax || 0),
        totalDiscount: round2(order.totalDiscount || 0),
        totalAmount: round2(order.totalAmount || 0),
        paidAmount: order.paidAmount || 0,
        projectId: order.projectId || null,
        projectName: order.projectName || null,
        cfdiPayload: payload,
        facturamaId: facturamaId,
        facturamaUuid: facturamaUuid,
        status: "timbrada",
        createdAt: new Date().toISOString(),
        createdBy: order.createdBy
      });

      await updateDoc(doc(db, "companies", companyId, "pedidos", order.id), {
        status: "facturado",
        invoiceId: invId
      });

      // Relate existing payments to the new invoice
      try {
        const paymentsQuery = query(
          collection(db, "companies", companyId, "payments"),
          where("documentId", "==", order.id),
          where("documentType", "==", "pedido")
        );
        const paymentsSnap = await getDocs(paymentsQuery);
        for (const pDoc of paymentsSnap.docs) {
          await updateDoc(pDoc.ref, {
            documentId: invId,
            documentType: "factura",
            orderId: order.id
          });
        }
      } catch (payErr) {
        console.error("Error updating related payments for invoice:", payErr);
      }

      alert("Factura timbrada exitosamente (Folio Fiscal: " + (facturamaUuid || 'Pendiente') + ")");
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

          {actionType === "remision" && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Fecha de Aplicación *</label>
              <Input 
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={appliedDate}
                onChange={e => setAppliedDate(e.target.value)}
                required
              />
            </div>
          )}

          {(actionType === "pre-factura" || actionType === "factura") && (
            <>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-2 col-span-2 relative" ref={clientSelectorRef}>
                  <label className="text-sm font-semibold text-slate-700">Seleccionar Cliente</label>
                  <div className="relative">
                    <Input 
                      placeholder="Escribe para buscar cliente..." 
                      value={clientSearchQuery}
                      onChange={e => {
                        setClientSearchQuery(e.target.value);
                        setShowClientDropdown(true);
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      className="pr-10"
                    />
                    {clientSearchQuery && (
                      <button
                        type="button"
                        onClick={handleClearClient}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {showClientDropdown && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredClients.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">
                          No se encontraron clientes
                        </div>
                      ) : (
                        filteredClients.map(c => (
                          <div 
                            key={c.id}
                            className={`p-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors text-sm ${selectedClientId === c.id ? 'bg-indigo-50/50 font-medium' : ''}`}
                            onClick={() => handleClientSelect(c)}
                          >
                            <div className="font-semibold text-slate-800">
                              {c.LegalName || c.name || c.CommercialName || "Sin nombre"}
                            </div>
                            <div className="text-xs text-slate-500 flex justify-between mt-0.5">
                              <span>RFC: {c.rfc || c.RFC || "Sin RFC"}</span>
                              {c.email && <span className="text-slate-400">{c.email}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
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
