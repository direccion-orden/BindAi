"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getRemissionForAutofactura, createAutofactura, downloadCfdi } from "@/actions/facturama";
import { Loader2, Receipt, Search, CheckCircle2, FileText, FileCode, Download, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function AutofacturaContent() {
  const searchParams = useSearchParams();
  
  // URL Params
  const paramCompanyId = searchParams.get("companyId") || "";
  const paramFolio = searchParams.get("folio") || "";
  const paramTotal = searchParams.get("total") || "";

  // Wizard Steps: 1 = Search, 2 = Fiscal Form, 3 = Success
  const [step, setStep] = useState<number>(1);
  
  // Form State - Step 1
  const [companyId, setCompanyId] = useState(paramCompanyId);
  const [folio, setFolio] = useState(paramFolio);
  const [total, setTotal] = useState(paramTotal);
  
  // Form State - Step 2
  const [rfc, setRfc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [taxRegime, setTaxRegime] = useState("616"); // default: sin obligaciones
  const [zipCode, setZipCode] = useState("");
  const [cfdiUse, setCfdiUse] = useState("S01"); // default: sin efectos
  const [email, setEmail] = useState("");

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyInvoiced, setAlreadyInvoiced] = useState(false);
  const [invoiceUuid, setInvoiceUuid] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [remission, setRemission] = useState<any>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'xml' | null>(null);

  // Auto-trigger search if all parameters are present in URL on mount
  useEffect(() => {
    if (paramCompanyId && paramFolio && paramTotal) {
      handleSearch(null, paramCompanyId, paramFolio, parseFloat(paramTotal));
    }
  }, [paramCompanyId, paramFolio, paramTotal]);

  const handleSearch = async (e: React.FormEvent | null, cId = companyId, f = folio, t = parseFloat(total)) => {
    if (e) e.preventDefault();
    setError(null);
    
    if (!cId) {
      setError("Falta el código identificador de la Empresa (companyId).");
      return;
    }
    if (!f) {
      setError("Por favor ingresa el Folio del ticket.");
      return;
    }
    if (isNaN(t) || t <= 0) {
      setError("Por favor ingresa un Monto Total válido.");
      return;
    }

    setLoading(true);
    try {
      const res = await getRemissionForAutofactura(cId, f, t);
      if (res.success) {
        if (res.alreadyInvoiced) {
          setAlreadyInvoiced(true);
          setInvoiceUuid(res.data.invoiceUuid);
          setInvoiceId(res.data.invoiceId);
          setStep(3);
        } else {
          setRemission(res.data);
          setStep(2);
        }
      } else {
        setError(res.error || "No se pudo recuperar la información del ticket.");
      }
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al buscar el ticket.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!rfc || rfc.trim().length < 12) {
      setError("Por favor ingresa un RFC válido (12 o 13 caracteres).");
      return;
    }
    if (!razonSocial || razonSocial.trim().length < 3) {
      setError("Por favor ingresa la Razón Social o Nombre Fiscal.");
      return;
    }
    if (!zipCode || zipCode.trim().length !== 5) {
      setError("Por favor ingresa un Código Postal Fiscal de 5 dígitos.");
      return;
    }
    if (!email || !email.includes("@")) {
      setError("Por favor ingresa un correo electrónico de contacto válido.");
      return;
    }

    setLoading(true);
    try {
      const res = await createAutofactura(companyId, remission.id, {
        rfc: rfc.trim().toUpperCase(),
        razonSocial: razonSocial.trim().toUpperCase(),
        taxRegime,
        zipCode: zipCode.trim(),
        cfdiUse,
        email: email.trim()
      });

      if (res.success) {
        setInvoiceUuid(res.invoiceUuid);
        setInvoiceId(res.invoiceId);
        setStep(3);
      } else {
        setError(res.error || "Ocurrió un error al timbrar la factura con Facturama.");
        console.error("Facturama Error Details:", res.details);
      }
    } catch (err: any) {
      setError(err.message || "Ocurrió un error al procesar el timbrado de tu factura.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async (format: 'pdf' | 'xml') => {
    const targetId = invoiceId;
    if (!targetId) return;

    setDownloading(format);
    try {
      const res = await downloadCfdi(targetId, format);
      if (res.success && res.content) {
        const byteCharacters = atob(res.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: format === 'pdf' ? 'application/pdf' : 'application/xml' });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${invoiceUuid || 'Factura'}.${format}`);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
      } else {
        alert("Error al descargar el archivo: " + res.error);
      }
    } catch (e) {
      console.error(e);
      alert("Error inesperado al intentar descargar el archivo.");
    } finally {
      setDownloading(null);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between py-10 px-4 relative overflow-hidden font-sans">
      {/* Background blobs for premium glassmorphic effect */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-xl mx-auto space-y-8 z-10 my-auto">
        
        {/* Header Block */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-2">
            <Receipt className="w-10 h-10 animate-pulse" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-200 via-slate-100 to-emerald-200 bg-clip-text text-transparent">
            Portal de Autofacturación
          </h1>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Factura tus tickets de compra en línea de forma fácil, segura y al instante.
          </p>
        </div>

        {/* Wizard Card */}
        <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-6 md:p-8 backdrop-blur-xl shadow-2xl space-y-6">
          
          {/* Step Progress Indicators */}
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 border-b border-slate-900 pb-4">
            <span className={step >= 1 ? "text-indigo-400 font-bold" : ""}>1. Buscar Ticket</span>
            <ArrowRight className="w-3.5 h-3.5" />
            <span className={step >= 2 ? "text-indigo-400 font-bold" : ""}>2. Datos Fiscales</span>
            <ArrowRight className="w-3.5 h-3.5" />
            <span className={step >= 3 ? "text-indigo-400 font-bold" : ""}>3. Descargar</span>
          </div>

          {/* Errors/Alerts */}
          {error && (
            <div className="flex gap-2.5 items-start bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl text-sm leading-snug animate-in fade-in slide-in-from-top-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Search Form */}
          {step === 1 && (
            <form onSubmit={(e) => handleSearch(e)} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Folio del Ticket *</label>
                <Input 
                  type="text" 
                  placeholder="Ej. POS-10025 o 10025" 
                  value={folio}
                  onChange={(e) => setFolio(e.target.value)}
                  className="!bg-slate-900 !border-slate-800 !text-white h-12 focus:border-indigo-500 text-lg placeholder:text-slate-600 font-semibold"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Monto Total ($) *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">$</span>
                  <Input 
                    type="number" 
                    step="0.01"
                    placeholder="0.00" 
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    className="!bg-slate-900 !border-slate-800 !text-white h-12 pl-8 focus:border-indigo-500 text-lg placeholder:text-slate-600 font-semibold"
                    required
                  />
                </div>
              </div>

              {!paramCompanyId && (
                <div className="space-y-2">
                  <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Código de Empresa (ID) *</label>
                  <Input 
                    type="text" 
                    placeholder="Código de la tienda" 
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="!bg-slate-900 !border-slate-800 !text-white h-12 focus:border-indigo-500 text-sm placeholder:text-slate-600"
                    required
                  />
                </div>
              )}

              <Button 
                type="submit" 
                disabled={loading}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base flex justify-center items-center gap-2 mt-6 rounded-xl shadow-lg transition-all"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                {loading ? "Buscando Ticket..." : "Buscar Ticket de Compra"}
              </Button>
            </form>
          )}

          {/* STEP 2: Fiscal Form */}
          {step === 2 && remission && (
            <form onSubmit={handleGenerateInvoice} className="space-y-6">
              
              {/* Ticket Details Summary */}
              <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl space-y-2 text-sm">
                <p className="font-bold text-indigo-400 uppercase text-xs tracking-wider">Detalles de la Compra</p>
                <div className="flex justify-between text-slate-400">
                  <span>Ticket Folio:</span>
                  <span className="font-semibold text-white">#{remission.remissionNumber || remission.orderNumber}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Fecha:</span>
                  <span className="font-semibold text-white">{new Date(remission.createdAt).toLocaleString('es-MX')}</span>
                </div>
                <div className="flex justify-between border-t border-slate-900 pt-2 mt-2 font-bold text-base">
                  <span>Monto Total:</span>
                  <span className="text-emerald-400">{formatMoney(remission.totalAmount)}</span>
                </div>
              </div>

              {/* Invoicing Inputs */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">RFC Receptor *</label>
                  <Input 
                    type="text" 
                    placeholder="RFC de 12 o 13 dígitos" 
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    className="!bg-slate-900 !border-slate-800 !text-white font-mono focus:border-indigo-500 uppercase font-semibold"
                    maxLength={13}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Nombre o Razón Social *</label>
                  <Input 
                    type="text" 
                    placeholder="Tal como aparece en la Constancia Fiscal" 
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
                    className="!bg-slate-900 !border-slate-800 !text-white focus:border-indigo-500 uppercase font-semibold"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Código Postal Fiscal *</label>
                    <Input 
                      type="text" 
                      placeholder="CP del domicilio fiscal" 
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      className="!bg-slate-900 !border-slate-800 !text-white focus:border-indigo-500 font-semibold"
                      maxLength={5}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Régimen Fiscal *</label>
                    <select 
                      className="flex h-10 w-full rounded-md border !border-slate-800 !bg-slate-900 px-3 py-2 text-sm !text-white focus:border-indigo-500 focus:outline-none"
                      value={taxRegime}
                      onChange={e => setTaxRegime(e.target.value)}
                      required
                    >
                      <option value="601" className="bg-slate-900 text-white">601 - General Personas Morales</option>
                      <option value="603" className="bg-slate-900 text-white">603 - Personas Morales con Fines no Lucrativos</option>
                      <option value="605" className="bg-slate-900 text-white">605 - Sueldos y Salarios / Asimilados</option>
                      <option value="606" className="bg-slate-900 text-white">606 - Arrendamiento</option>
                      <option value="608" className="bg-slate-900 text-white">608 - Actividades Agrícolas / Ganaderas</option>
                      <option value="612" className="bg-slate-900 text-white">612 - Personas Físicas con Actividad Empresarial</option>
                      <option value="616" className="bg-slate-900 text-white">616 - Sin obligaciones fiscales</option>
                      <option value="621" className="bg-slate-900 text-white">621 - Incorporación Fiscal</option>
                      <option value="625" className="bg-slate-900 text-white">625 - Régimen de las Actividades de las Personas Físicas con Ingresos por Plataformas Tecnológicas</option>
                      <option value="626" className="bg-slate-900 text-white">626 - RESICO</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Uso de CFDI *</label>
                    <select 
                      className="flex h-10 w-full rounded-md border !border-slate-800 !bg-slate-900 px-3 py-2 text-sm !text-white focus:border-indigo-500 focus:outline-none"
                      value={cfdiUse}
                      onChange={e => setCfdiUse(e.target.value)}
                      required
                    >
                      <option value="G01" className="bg-slate-900 text-white">G01 - Adquisición de mercancías</option>
                      <option value="G03" className="bg-slate-900 text-white">G03 - Gastos en general</option>
                      <option value="I01" className="bg-slate-900 text-white">I01 - Construcciones</option>
                      <option value="I02" className="bg-slate-900 text-white">I02 - Mobiliario y equipo</option>
                      <option value="D01" className="bg-slate-900 text-white">D01 - Honorarios médicos / dentales</option>
                      <option value="D02" className="bg-slate-900 text-white">D02 - Gastos médicos por incapacidad</option>
                      <option value="D04" className="bg-slate-900 text-white">D04 - Donativos</option>
                      <option value="D08" className="bg-slate-900 text-white">D08 - Gastos de transportación escolar</option>
                      <option value="D10" className="bg-slate-900 text-white">D10 - Depósitos en cuentas para el ahorro</option>
                      <option value="S01" className="bg-slate-900 text-white">S01 - Sin efectos fiscales</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs uppercase font-bold text-slate-400 tracking-wider">Correo Electrónico (XML/PDF) *</label>
                    <Input 
                      type="email" 
                      placeholder="correo@ejemplo.com" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="!bg-slate-900 !border-slate-800 !text-white focus:border-indigo-500"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-900">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="flex-1 bg-transparent border-slate-800 text-slate-400 hover:text-white"
                >
                  Regresar
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Generar Factura (SAT)
                </Button>
              </div>
            </form>
          )}

          {/* STEP 3: Success Screen */}
          {step === 3 && (
            <div className="text-center py-6 space-y-6 animate-in zoom-in-95">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-400">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold">
                  {alreadyInvoiced ? "Factura Emitida Anteriormente" : "¡Factura Generada con Éxito!"}
                </h3>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                  {alreadyInvoiced 
                    ? "Esta compra ya ha sido timbrada en el SAT. Puedes descargar tus comprobantes fiscales abajo." 
                    : "Tu comprobante fiscal CFDI 4.0 ha sido timbrado exitosamente y se envió una copia a tu correo."}
                </p>
              </div>

              {invoiceUuid && (
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-900 text-xs font-mono break-all max-w-sm mx-auto select-all text-slate-300">
                  <span className="block font-bold text-[9px] uppercase tracking-wider text-slate-500 mb-1">Folio Fiscal (UUID)</span>
                  {invoiceUuid}
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-3 justify-center pt-4 max-w-md mx-auto">
                <Button 
                  onClick={() => handleDownloadFile('pdf')}
                  disabled={downloading !== null}
                  variant="outline"
                  className="flex-1 gap-2 border-slate-800 text-indigo-400 hover:text-indigo-300 hover:bg-slate-900/40"
                >
                  {downloading === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  {downloading === 'pdf' ? "Descargando..." : "Descargar PDF"}
                </Button>

                <Button 
                  onClick={() => handleDownloadFile('xml')}
                  disabled={downloading !== null}
                  variant="outline"
                  className="flex-1 gap-2 border-slate-800 text-orange-400 hover:text-orange-300 hover:bg-slate-900/40"
                >
                  {downloading === 'xml' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
                  {downloading === 'xml' ? "Descargando..." : "Descargar XML"}
                </Button>
              </div>

              <div className="pt-6 border-t border-slate-900">
                <Button 
                  onClick={() => {
                    setError(null);
                    setStep(1);
                    // Do not reset companyId to keep it prefilled
                    setFolio("");
                    setTotal("");
                    setRfc("");
                    setRazonSocial("");
                    setZipCode("");
                    setEmail("");
                    setAlreadyInvoiced(false);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8"
                >
                  Facturar Otro Ticket
                </Button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-500">
          Facturación en línea con tecnología de Facturama PAC autorizado por el SAT.
        </div>
      </div>
    </div>
  );
}

export default function AutofacturaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-sans">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto" />
          <p className="text-sm text-slate-400">Cargando portal de facturación...</p>
        </div>
      </div>
    }>
      <AutofacturaContent />
    </Suspense>
  );
}
