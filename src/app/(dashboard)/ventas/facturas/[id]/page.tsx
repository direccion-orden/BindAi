"use client";

import React, { useState, useEffect, use } from "react";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ArrowLeft, Receipt, Package, FileText, FileCode, Download, DollarSign, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createCfdi, cancelCfdi, downloadCfdi } from "@/actions/facturama";
import { useRouter } from "next/navigation";
import { PaymentModal } from "@/components/payments/PaymentModal";
import { DocumentPaymentsTab } from "@/components/payments/DocumentPaymentsTab";
import { FolderOpen } from "lucide-react";

export default function FacturaDetallePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { companyId } = useAuth();
  
  const [factura, setFactura] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timbrando, setTimbrando] = useState(false);
  const [companyZipCode, setCompanyZipCode] = useState("00000");

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelMotive, setCancelMotive] = useState("02");
  const [canceling, setCanceling] = useState(false);
  const [downloading, setDownloading] = useState<'pdf' | 'xml' | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("detalle");
  
  const router = useRouter();

  useEffect(() => {
    if (!companyId || !params.id) return;

    const fetchFactura = async () => {
      try {
        const docRef = doc(db, "companies", companyId, "facturas", params.id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setFactura({ id: snap.id, ...snap.data() });
        }
        const companyRef = doc(db, "companies", companyId);
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists() && companySnap.data().zipCode) {
          setCompanyZipCode(companySnap.data().zipCode);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchFactura();
  }, [companyId, params.id]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!factura) {
    return <div className="p-10 text-center">Factura no encontrada.</div>;
  }

  const handleTimbrar = async () => {
    if (!companyId || !factura.cfdiPayload) return;
    setTimbrando(true);
    try {
      // Ensure CFDI 4.0 backwards compatibility for already created payloads
      const payloadToSend = { ...factura.cfdiPayload };
      payloadToSend.ExpeditionPlace = companyZipCode !== "00000" ? companyZipCode : "64753"; // Override with actual branch zip code
      if (payloadToSend.Date) {
        delete payloadToSend.Date;
      }
      if (!payloadToSend.Exportation) payloadToSend.Exportation = "01";
      if (payloadToSend.Receiver && payloadToSend.Receiver.TaxRegime && !payloadToSend.Receiver.FiscalRegime) {
        payloadToSend.Receiver.FiscalRegime = payloadToSend.Receiver.TaxRegime;
        delete payloadToSend.Receiver.TaxRegime;
      }
      if (payloadToSend.Receiver && payloadToSend.Receiver.FiscalRegime === "616") {
        payloadToSend.Receiver.CfdiUse = "S01";
      }
      if (payloadToSend.Receiver && (payloadToSend.Receiver.Rfc === "XAXX010101000" || payloadToSend.Receiver.Rfc === "XEXX010101000")) {
        payloadToSend.Receiver.TaxZipCode = payloadToSend.ExpeditionPlace;
      }
      if (payloadToSend.Items && Array.isArray(payloadToSend.Items)) {
        payloadToSend.Items.forEach((item: any) => {
          if (!item.TaxObject) item.TaxObject = "02";
        });
      }
      if (payloadToSend.Receiver && payloadToSend.Receiver.Rfc === "XAXX010101000" && payloadToSend.Receiver.Name === "PUBLICO EN GENERAL") {
        payloadToSend.GlobalInformation = {
          Periodicity: "01", // Diario
          Months: new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`,
          Year: new Date().getFullYear()
        };
      }
      
      const result = await createCfdi(payloadToSend);
      if (result.success) {
        console.log("Facturama Success Response:", result.data);
        
        const facturamaId = result.data?.Id || result.data?.id || null;
        const facturamaUuid = result.data?.Complement?.TaxStamp?.Uuid || result.data?.Uuid || result.data?.uuid || null;
        
        await updateDoc(doc(db, "companies", companyId, "facturas", factura.id), {
          status: "timbrada",
          facturamaId: facturamaId,
          facturamaUuid: facturamaUuid,
          timbradoAt: new Date().toISOString()
        });
        
        alert("Factura timbrada exitosamente. Folio: " + (facturamaUuid || "Pendiente"));
        window.location.reload();
      } else {
        alert("Error de Facturama: " + result.error + "\n\nDetalles: " + JSON.stringify(result.details, null, 2));
        console.error("Facturama Error Details:", result.details);
      }
    } catch (error) {
      console.error(error);
      alert("Error al intentar timbrar.");
    } finally {
      setTimbrando(false);
    }
  };

  const handleCancel = async () => {
    if (!companyId || !factura.facturamaId) return;
    setCanceling(true);
    try {
      const result = await cancelCfdi(factura.facturamaId, cancelMotive);
      if (result.success) {
        await updateDoc(doc(db, "companies", companyId, "facturas", factura.id), {
          status: "cancelada",
          canceledAt: new Date().toISOString(),
          cancelMotive: cancelMotive
        });
        
        if (factura.orderId) {
          await updateDoc(doc(db, "companies", companyId, "orders", factura.orderId), {
            status: "por_facturar" // or por_surtir depending on previous state, assuming por_facturar since it was invoiced
          });
        }
        
        alert("Factura cancelada exitosamente.");
        setIsCancelModalOpen(false);
        window.location.reload();
      } else {
        alert("Error al cancelar en Facturama: " + result.error);
        console.error("Facturama Cancel Details:", result.details);
      }
    } catch (error) {
      console.error(error);
      alert("Error inesperado al cancelar la factura.");
    } finally {
      setCanceling(false);
    }
  };

  const handleDuplicate = async () => {
    if (!companyId || !factura) return;
    try {
      const newInvId = crypto.randomUUID();
      const { id, invoiceNumber, status, facturamaId, facturamaUuid, timbradoAt, canceledAt, cancelMotive, cfdiPayload, ...rest } = factura;
      
      const newPayload = { ...cfdiPayload };
      if (newPayload.Date) delete newPayload.Date;

      // In a real scenario we'd use a transaction for getNextSequence
      // For now we'll just clone it. The edit page will handle regenerating the payload.
      await setDoc(doc(db, "companies", companyId, "facturas", newInvId), {
        ...rest,
        id: newInvId,
        invoiceNumber: `DUP-${invoiceNumber}`, // Temporary
        status: "por_timbrar",
        cfdiPayload: newPayload,
        createdAt: new Date().toISOString()
      });
      
      router.push(`/ventas/facturas/${newInvId}/editar`);
    } catch(e) {
      console.error(e);
      alert("Error al duplicar factura");
    }
  };

  const handleDownload = async (format: 'pdf' | 'xml') => {
    if (!factura.facturamaId) return;
    setDownloading(format);
    try {
      const result = await downloadCfdi(factura.facturamaId, format);
      if (result.success && result.content) {
        // Convert base64 to blob and trigger download
        const byteCharacters = atob(result.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: format === 'pdf' ? 'application/pdf' : 'application/xml' });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${factura.facturamaUuid || factura.invoiceNumber}.${format}`);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
      } else {
        alert("Error al descargar archivo: " + result.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error inesperado al descargar.");
    } finally {
      setDownloading(null);
    }
  };
  
  const grossSubtotal = factura.items && Array.isArray(factura.items)
    ? factura.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0)
    : 0;
  const totalDiscount = factura.items && Array.isArray(factura.items)
    ? factura.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice * (item.discountPercentage || 0) / 100), 0)
    : 0;

  const displaySubtotal = factura.subtotal || grossSubtotal;
  const displayDiscount = factura.totalDiscount || totalDiscount;
  const taxableSubtotal = displaySubtotal - displayDiscount;
  const displayTax = factura.tax !== undefined ? factura.tax : (taxableSubtotal * 0.16);
  const displayTotal = factura.totalAmount !== undefined ? factura.totalAmount : (taxableSubtotal + displayTax);

  return (
    <div className="flex flex-col space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <Link href="/ventas/facturas">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Factura FAC-{factura.invoiceNumber}</h1>
              {(factura.status === 'timbrada' || factura.status === 'cancelada') && factura.facturamaId && (
                <div className="flex gap-2 ml-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDownload('pdf')}
                    disabled={downloading === 'pdf'}
                    className="h-7 gap-1 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    {downloading === 'pdf' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDownload('xml')}
                    disabled={downloading === 'xml'}
                    className="h-7 gap-1 text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
                  >
                    {downloading === 'xml' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileCode className="w-3 h-3" />} XML
                  </Button>
                </div>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Cliente: {factura.clientName} | Pedido Origen: <Link href={`/ventas/pedidos/${factura.orderId}`} target="_blank" className="text-indigo-600 hover:underline">{factura.orderNumber}</Link>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {factura.status !== 'cancelada' && (factura.paidAmount || 0) < displayTotal - 0.01 && (
            <Button onClick={() => setIsPaymentModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <DollarSign className="w-4 h-4" /> Registrar Pago
            </Button>
          )}

          {factura.status === 'por_timbrar' && (
            <>
              <Link href={`/ventas/facturas/${factura.id}/editar`} target="_blank">
                <Button variant="outline" disabled={timbrando}>
                  Editar Factura
                </Button>
              </Link>
              <Button onClick={handleTimbrar} disabled={timbrando} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                {timbrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} 
                {timbrando ? "Timbrando..." : "Timbrar Factura"}
              </Button>
            </>
          )}
          {factura.status === 'timbrada' && (
            <div className="flex items-center gap-3">
              <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200" onClick={() => setIsCancelModalOpen(true)}>
                Cancelar Factura
              </Button>
              <div className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-lg flex items-center gap-2">
                <Receipt className="w-5 h-5" /> Factura Timbrada
              </div>
            </div>
          )}
          {factura.status === 'cancelada' && (
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleDuplicate}>
                Duplicar a Nueva
              </Button>
              <div className="px-4 py-2 bg-red-50 text-red-700 font-bold rounded-lg flex items-center gap-2">
                Factura Cancelada
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b mb-1 px-4 gap-2 bg-card rounded-t-xl border-t border-x pt-2 shrink-0">
        <button 
          onClick={() => setActiveTab("detalle")} 
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === 'detalle' ? 'bg-background border-t border-x border-slate-200 text-indigo-600 font-bold -mb-[1px]' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Detalle
        </button>
        <button 
          onClick={() => setActiveTab("pagos")} 
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === 'pagos' ? 'bg-background border-t border-x border-slate-200 text-indigo-600 font-bold -mb-[1px]' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Pagos
        </button>
        <button 
          onClick={() => setActiveTab("archivos")} 
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === 'archivos' ? 'bg-background border-t border-x border-slate-200 text-indigo-600 font-bold -mb-[1px]' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Archivos
        </button>
        <button 
          onClick={() => setActiveTab("relacionados")} 
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === 'relacionados' ? 'bg-background border-t border-x border-slate-200 text-indigo-600 font-bold -mb-[1px]' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Documentos relacionados
        </button>
      </div>

      {activeTab === "detalle" && (
        <div className="bg-white border rounded-xl shadow-sm p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-6 mb-8 bg-slate-50 p-4 rounded-lg border border-slate-200 overflow-hidden">
            <div className="min-w-0 lg:col-span-2">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Estatus</p>
              <p className="font-bold capitalize truncate">{factura.status.replace('_', ' ')}</p>
            </div>
            <div className="min-w-0 lg:col-span-3">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">UUID / Folio Fiscal</p>
              <p className="font-bold text-indigo-700 whitespace-nowrap tracking-tighter text-[clamp(11px,1.5vw,16px)]">{factura.facturamaUuid || '--'}</p>
            </div>
            <div className="min-w-0 lg:col-span-2">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Sucursal</p>
              <p className="font-bold truncate">{factura.locationName || 'N/A'}</p>
            </div>
            <div className="min-w-0 lg:col-span-2">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Almacén</p>
              <p className="font-bold truncate">{factura.warehouseName || 'N/A'}</p>
            </div>
            <div className="min-w-0 lg:col-span-1 lg:pl-1">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Fecha</p>
              <p className="font-bold whitespace-nowrap text-[clamp(11px,1.5vw,14px)]">{new Date(factura.createdAt).toLocaleDateString('es-MX')}</p>
            </div>
            <div className="min-w-0 lg:col-span-2">
              <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Creado por</p>
              <p className="font-bold whitespace-nowrap tracking-tight text-[clamp(11px,1.5vw,16px)]">{factura.createdBy}</p>
            </div>
          </div>

          <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-400" /> Conceptos a Facturar
          </h3>

          <div className="space-y-3">
            {factura.items?.map((item: any, idx: number) => (
              <div key={item.variantId ? `${item.variantId}-${idx}` : idx} className="flex flex-col border p-3 rounded-lg text-sm bg-white shadow-sm gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 flex items-start gap-3">
                    <div className="w-12 h-12 rounded bg-slate-100 flex-shrink-0 overflow-hidden border">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 m-auto mt-3 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      {item.isService ? (
                        <div className="space-y-1">
                          {item.sku && (
                            <div>
                              <span className="inline-block font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                {item.sku}
                              </span>
                            </div>
                          )}
                          <p className="font-semibold text-sm leading-tight text-foreground/90 whitespace-pre-wrap">{item.description}</p>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold">{item.productName}</p>
                            {item.sku && (
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                {item.sku}
                              </span>
                            )}
                          </div>
                          {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                        </>
                      )}

                      {/* Comment in view mode */}
                      {item.comment && (
                        <p className="text-xs text-indigo-600 font-medium flex items-start gap-1 mt-1 bg-indigo-50/50 p-1.5 rounded border border-indigo-100/50 whitespace-pre-wrap">
                          <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{item.comment}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right flex items-center gap-6 justify-end">
                    <div className="text-slate-500 text-xs font-medium">
                      <span className="font-semibold text-slate-700">{item.quantity}</span> x ${item.unitPrice.toLocaleString('es-MX', {minimumFractionDigits:2})}
                      {item.discountPercentage > 0 && (
                        <span className="text-emerald-600 font-medium ml-1.5">(-{item.discountPercentage}%)</span>
                      )}
                    </div>
                    <div className="font-bold text-slate-950 min-w-[100px] text-base">
                      ${(item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-6 border-t mt-6">
            <div className="w-72 space-y-2 text-sm bg-slate-50 p-4 rounded-lg border">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span>${displaySubtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              {displayDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Descuento</span>
                  <span>-${displayDiscount.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <span>IVA (16%)</span>
                <span>${displayTax.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between font-black text-xl pt-2 border-t mt-2 text-slate-900">
                <span>Total CFDI</span>
                <span className="text-indigo-700">${displayTotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              {(factura.paidAmount || 0) > 0 && (
                <>
                  <div className="flex justify-between text-emerald-600 font-medium pt-2">
                    <span>Pagado</span>
                    <span>${(factura.paidAmount || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                  </div>
                  <div className="flex justify-between text-rose-600 font-bold border-t mt-2 pt-2">
                    <span>Saldo Pendiente</span>
                    <span>${Math.max(0, factura.totalAmount - (factura.paidAmount || 0)).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "pagos" && (
        <div className="bg-white border rounded-xl shadow-sm p-6">
          <DocumentPaymentsTab 
            document={factura} 
            documentType="factura" 
            companyId={companyId || ""} 
            onUpdate={() => window.location.reload()}
          />
        </div>
      )}

      {activeTab === "archivos" && (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-400">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-slate-800 mb-1">Archivos</p>
          <p className="text-xs">Próximamente en el siguiente sprint.</p>
        </div>
      )}

      {activeTab === "relacionados" && (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-semibold text-slate-800 mb-1">Documentos relacionados</p>
          <p className="text-xs">Próximamente en el siguiente sprint.</p>
        </div>
      )}

      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-lg w-full max-w-md p-6 flex flex-col">
            <h3 className="text-lg font-bold text-red-600 mb-2">Cancelar Factura</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Estás a punto de cancelar esta factura ante el SAT. Selecciona el motivo de cancelación.
            </p>
            
            <div className="space-y-4 my-4">
              <div>
                <label className="text-sm font-medium">Motivo de Cancelación (SAT)</label>
                <select 
                  className="w-full border rounded-md p-2 mt-1 text-sm bg-white"
                  value={cancelMotive}
                  onChange={(e) => setCancelMotive(e.target.value)}
                >
                  <option value="02">02 - Comprobante emitido con errores sin relación</option>
                  <option value="03">03 - No se llevó a cabo la operación</option>
                  <option value="04">04 - Operación nominativa relacionada en una factura global</option>
                </select>
                <p className="text-xs text-muted-foreground mt-2">
                  * El motivo "01" requiere un UUID de sustitución y se habilitará en el futuro. Por defecto se usa "02".
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t">
              <Button variant="ghost" onClick={() => setIsCancelModalOpen(false)} disabled={canceling}>Cerrar</Button>
              <Button 
                onClick={handleCancel}
                disabled={canceling}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {canceling && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Confirmar Cancelación
              </Button>
            </div>
          </div>
        </div>
      )}

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        document={factura}
        documentType="factura"
        companyId={companyId || ""}
      />
    </div>
  );
}
