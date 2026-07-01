"use client";

import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Receipt, X } from "lucide-react";
import { createCfdi } from "@/actions/facturama";
import { doc, updateDoc, getDoc, collection, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { distributeDiscountAndTax } from "@/lib/utils/discountEngine";
import { getNextSequence } from "@/lib/firebase/counters";

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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
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
    const fetchClient = async () => {
      if (!isOpen || !companyId || !remission) return;
      
      let clientId = remission.clientId;
      
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
        if (remission?.clientName) {
          setClientSearchQuery(remission.clientName);
        }
      }
    };
    
    fetchClient();
  }, [isOpen, remission, companyId]);

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

  if (!remission) return null;

  const filteredClients = clients.filter(c => {
    const queryText = clientSearchQuery.toLowerCase();
    const name = (c.name || c.LegalName || c.CommercialName || "").toLowerCase();
    const rfc = (c.rfc || c.RFC || "").toLowerCase();
    return name.includes(queryText) || rfc.includes(queryText);
  });

  const handleGenerateInvoice = async () => {
    setLoading(true);
    try {
      const totalDocDiscount = Number(remission.totalDiscount) || 0;
      const targetTax = Number(remission.tax) || 0;
      const targetTotal = Number(remission.totalAmount) || 0;

      const distributedItems = distributeDiscountAndTax(
        remission.items || [],
        totalDocDiscount,
        targetTax,
        targetTotal
      );

      const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;

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
              console.error("Error fetching product SAT codes in InvoiceModal:", e);
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

      if (facturamaPayload.Receiver.Rfc === "XAXX010101000" && facturamaPayload.Receiver.Name === "PUBLICO EN GENERAL") {
        facturamaPayload.GlobalInformation = {
          Periodicity: "01",
          Months: new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`,
          Year: new Date().getFullYear()
        };
      }

      const result = await createCfdi(facturamaPayload);

      if (result.success) {
        const invoiceId = result.data?.Id || result.data?.id || null;
        const invoiceUuid = result.data?.Complement?.TaxStamp?.Uuid || result.data?.Uuid || result.data?.uuid || null;
        const invoiceDate = result.data?.Date || result.data?.date || new Date().toISOString();

        // Get internal sequence if Facturama doesn't return one
        let internalInvoiceNumber = result.data?.Folio;
        if (!internalInvoiceNumber) {
          try {
            internalInvoiceNumber = await getNextSequence(companyId, 'facturas');
          } catch (e) {
            console.error("Error getting next sequence:", e);
            internalInvoiceNumber = remission.remissionNumber?.replace('REM-', 'FAC-') || remission.remissionNumber || "";
          }
        }

        // Save invoice relation to remission document
        await updateDoc(doc(db, "companies", companyId, "remisiones", remission.id), {
          status: "facturada",
          invoiceId: invoiceId,
          invoiceUuid: invoiceUuid,
          invoiceDate: invoiceDate
        });
        
        // Create new invoice document in the facturas collection
        const invoiceData = {
          id: invoiceId,
          invoiceNumber: internalInvoiceNumber,
          facturamaId: invoiceId,
          facturamaUuid: invoiceUuid,
          clientName: razonSocial.toUpperCase(),
          clientId: selectedClientId || remission.clientId || "public",
          items: remission.items || [],
          totalAmount: remission.totalAmount || 0,
          subtotal: remission.subtotal || 0,
          tax: remission.tax || 0,
          status: "timbrada",
          createdAt: new Date().toISOString(),
          createdBy: user?.email || "Unknown",
          cfdiPayload: facturamaPayload,
          isPosSale: true,
          posSaleId: remission.id,
          timbradoAt: invoiceDate
        };
        
        await setDoc(doc(db, "companies", companyId, "facturas", invoiceId), invoiceData);

        // Also update order to facturado if needed (optional)
        if (remission.orderId) {
          await updateDoc(doc(db, "companies", companyId, "pedidos", remission.orderId), {
            status: "facturado"
          });
        }

        alert("Factura timbrada exitosamente (Folio Fiscal: " + (invoiceUuid || 'Pendiente') + ")");
        window.location.reload();
      } else {
        alert("Error de Facturama: " + result.error);
        console.error(result.details);
      }

    } catch (e: any) {
      console.error(e);
      if (e.message?.includes("was not found on the server") || e.message?.includes("Failed to find Server Action")) {
        alert("El sistema ha sido actualizado recientemente. La página se recargará automáticamente para aplicar los cambios.");
        window.location.reload();
        return;
      }
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
