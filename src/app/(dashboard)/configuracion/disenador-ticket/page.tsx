"use client";

import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Save, Printer, UploadCloud, Info, AlertTriangle, CheckCircle2, Sliders, FileText, AlignLeft, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

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

export default function TicketDesignerPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<TicketConfig>(DEFAULT_CONFIG);
  const [companyProfile, setCompanyProfile] = useState<any>({
    name: "Nombre de tu Empresa",
    address: "Av. Constitución 123, Monterrey, N.L.",
    rfc: "XAXX010101000",
    phone: "8122009693"
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load configuration & company profile
  useEffect(() => {
    if (!companyId) return;

    const loadData = async () => {
      try {
        // Fetch standard company details for fallback previews
        const companyRef = doc(db, "companies", companyId);
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists()) {
          const profileData = companySnap.data();
          setCompanyProfile({
            name: profileData.name || "Nombre de tu Empresa",
            address: profileData.address || "Av. Constitución 123, Monterrey, N.L.",
            rfc: profileData.rfc || "XAXX010101000",
            phone: profileData.phone || profileData.whatsappPhone || "8122009693"
          });
        }

        // Fetch custom ticket configuration
        const configRef = doc(db, "companies", companyId, "ticketConfig", "settings");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setConfig({
            ...DEFAULT_CONFIG,
            ...configSnap.data()
          });
        }
      } catch (err) {
        console.error("Error loading ticket configuration:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [companyId]);

  // Handle Switch toggles
  const handleToggle = (key: keyof TicketConfig) => {
    setConfig(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Handle value inputs
  const handleValueChange = (key: keyof TicketConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Image Upload handler (Base64 conversion)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 120 * 1024) {
      alert("El tamaño de la imagen debe ser menor a 120KB para optimizar el almacenamiento.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const base64 = uploadEvent.target?.result as string;
      setConfig(prev => ({
        ...prev,
        logoBase64: base64,
        logoUrl: "" // Clear url since we have direct base64 now
      }));
    };
    reader.readAsDataURL(file);
  };

  // Trigger file input
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Save Settings
  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    setSaveStatus("idle");

    try {
      const configRef = doc(db, "companies", companyId, "ticketConfig", "settings");
      await setDoc(configRef, {
        ...config,
        updatedAt: new Date().toISOString()
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("Error saving ticket configuration:", err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="ml-2 text-muted-foreground">Cargando diseñador de ticket...</span>
      </div>
    );
  }

  // Pre-determined Fallback display values
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Printer className="w-8 h-8 text-indigo-600" />
            Diseñador de Tickets
          </h1>
          <p className="text-muted-foreground mt-1">
            Personaliza el formato, datos y textos de los tickets térmicos entregados en el punto de venta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "success" && (
            <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
              <CheckCircle2 className="w-4 h-4" />
              Guardado con éxito
            </div>
          )}
          {saveStatus === "error" && (
            <div className="flex items-center gap-1.5 text-rose-600 text-sm font-medium bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50">
              <AlertTriangle className="w-4 h-4" />
              Error al guardar
            </div>
          )}
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar Configuración
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Customization Forms (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Logo customization */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-3 text-indigo-900 dark:text-indigo-100">
              <Sliders className="w-5 h-5 text-indigo-600" />
              Logotipo del Ticket
            </h2>
            
            <div className="flex items-center justify-between py-1">
              <div>
                <label className="text-sm font-semibold block">Mostrar Logotipo</label>
                <span className="text-xs text-muted-foreground">Activa para imprimir el logo en la parte superior.</span>
              </div>
              <Switch 
                checked={config.showLogo} 
                onCheckedChange={() => handleToggle("showLogo")} 
              />
            </div>

            {config.showLogo && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Subir Imagen Local</label>
                    <div 
                      onClick={triggerFileInput}
                      className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition flex flex-col items-center justify-center space-y-1.5 min-h-[90px]"
                    >
                      <UploadCloud className="w-6 h-6 text-indigo-500" />
                      <span className="text-xs font-medium">Hacer click para seleccionar</span>
                      <span className="text-[10px] text-muted-foreground">SVG, PNG o JPG (Máx. 120KB)</span>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleImageUpload} 
                        accept="image/*" 
                        className="hidden" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">O bien, URL de imagen</label>
                    <Input 
                      type="url" 
                      placeholder="https://miweb.com/logo.png" 
                      value={config.logoUrl}
                      onChange={(e) => handleValueChange("logoUrl", e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">Usa URL si prefieres no guardar la imagen en base de datos.</p>
                  </div>
                </div>

                {config.logoBase64 && (
                  <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border">
                    <img 
                      src={config.logoBase64} 
                      alt="Logo cargado" 
                      className="h-10 object-contain max-w-[120px] bg-white p-1 border rounded"
                    />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-emerald-600">Imagen local cargada</p>
                      <button 
                        onClick={() => handleValueChange("logoBase64", "")} 
                        className="text-[10px] text-rose-500 font-bold hover:underline"
                      >
                        Eliminar logotipo
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-semibold text-muted-foreground uppercase">Ancho del Logotipo (Vista Previa)</label>
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{config.logoWidth}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="80" 
                    max="240" 
                    step="10"
                    value={config.logoWidth}
                    onChange={(e) => handleValueChange("logoWidth", parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Company Details */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-3 text-indigo-900 dark:text-indigo-100">
              <FileText className="w-5 h-5 text-indigo-600" />
              Datos de la Empresa en el Ticket
            </h2>

            <div className="space-y-3">
              {/* Company Name */}
              <div className="border-b pb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">Mostrar Nombre Comercial</label>
                  <Switch 
                    checked={config.showCompanyName} 
                    onCheckedChange={() => handleToggle("showCompanyName")} 
                  />
                </div>
                {config.showCompanyName && (
                  <Input 
                    placeholder={`Por defecto: ${companyProfile.name}`}
                    value={config.customCompanyName}
                    onChange={(e) => handleValueChange("customCompanyName", e.target.value)}
                  />
                )}
              </div>

              {/* Company Address */}
              <div className="border-b pb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">Mostrar Dirección</label>
                  <Switch 
                    checked={config.showAddress} 
                    onCheckedChange={() => handleToggle("showAddress")} 
                  />
                </div>
                {config.showAddress && (
                  <Input 
                    placeholder={`Por defecto: ${companyProfile.address}`}
                    value={config.customAddress}
                    onChange={(e) => handleValueChange("customAddress", e.target.value)}
                  />
                )}
              </div>

              {/* RFC */}
              <div className="border-b pb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">Mostrar RFC</label>
                  <Switch 
                    checked={config.showRfc} 
                    onCheckedChange={() => handleToggle("showRfc")} 
                  />
                </div>
                {config.showRfc && (
                  <Input 
                    placeholder={`Por defecto: ${companyProfile.rfc}`}
                    value={config.customRfc}
                    onChange={(e) => handleValueChange("customRfc", e.target.value)}
                    className="uppercase"
                  />
                )}
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">Mostrar Teléfono</label>
                  <Switch 
                    checked={config.showPhone} 
                    onCheckedChange={() => handleToggle("showPhone")} 
                  />
                </div>
                {config.showPhone && (
                  <Input 
                    placeholder={`Por defecto: ${companyProfile.phone}`}
                    value={config.customPhone}
                    onChange={(e) => handleValueChange("customPhone", e.target.value)}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Custom Text Fields */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-3 text-indigo-900 dark:text-indigo-100">
              <AlignLeft className="w-5 h-5 text-indigo-600" />
              Textos del Ticket
            </h2>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Texto de Cabecera (Superior)</label>
                <Textarea 
                  placeholder="Ej. ¡Bienvenidos! Gracias por visitarnos hoy."
                  value={config.headerText}
                  onChange={(e) => handleValueChange("headerText", e.target.value)}
                  rows={2}
                />
                <span className="text-[10px] text-muted-foreground block">Aparece justo debajo de los datos de contacto principales.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Texto del Pie (Inferior)</label>
                <Textarea 
                  placeholder="Ej. Conserve este comprobante para cualquier devolución."
                  value={config.footerText}
                  onChange={(e) => handleValueChange("footerText", e.target.value)}
                  rows={2}
                />
                <span className="text-[10px] text-muted-foreground block">Aparece en la parte final, arriba del código de barras.</span>
              </div>
            </div>
          </div>

          {/* Card 4: Structure & Layout options */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-3 text-indigo-900 dark:text-indigo-100">
              <Tags className="w-5 h-5 text-indigo-600" />
              Estructura e Impresión
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Ancho del Papel</label>
                <select 
                  value={config.ticketWidth} 
                  onChange={(e) => handleValueChange("ticketWidth", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                >
                  <option value="80mm">80mm (Estándar Térmico)</option>
                  <option value="58mm">58mm (Mini Portátil)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Tamaño de Letra</label>
                <select 
                  value={config.fontSize} 
                  onChange={(e) => handleValueChange("fontSize", e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-background text-sm outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                >
                  <option value="sm">Pequeño (12px)</option>
                  <option value="base">Normal (14px)</option>
                  <option value="lg">Grande (16px)</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold block">Mostrar Fecha y Hora</label>
                  <span className="text-[10px] text-muted-foreground">Imprime la fecha actual de la venta.</span>
                </div>
                <Switch 
                  checked={config.showDate} 
                  onCheckedChange={() => handleToggle("showDate")} 
                />
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <label className="text-sm font-semibold block">Mostrar Puntos Acumulados</label>
                  <span className="text-[10px] text-muted-foreground">Muestra los puntos ganados de monedero electrónico.</span>
                </div>
                <Switch 
                  checked={config.showPoints} 
                  onCheckedChange={() => handleToggle("showPoints")} 
                />
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <label className="text-sm font-semibold block">Mostrar Código de Barras</label>
                  <span className="text-[10px] text-muted-foreground">Incluye el código en la base para buscar devoluciones.</span>
                </div>
                <Switch 
                  checked={config.showBarcode} 
                  onCheckedChange={() => handleToggle("showBarcode")} 
                />
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <label className="text-sm font-semibold block">Mostrar Método de Pago</label>
                  <span className="text-[10px] text-muted-foreground">Muestra cómo pagó el cliente (Efectivo, Tarjeta, etc.).</span>
                </div>
                <Switch 
                  checked={config.showPaymentMethod} 
                  onCheckedChange={() => handleToggle("showPaymentMethod")} 
                />
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <label className="text-sm font-semibold block">Mostrar Referencia de Pago</label>
                  <span className="text-[10px] text-muted-foreground">Imprime la referencia capturada de la terminal/transferencia.</span>
                </div>
                <Switch 
                  checked={config.showPaymentReference} 
                  onCheckedChange={() => handleToggle("showPaymentReference")} 
                />
              </div>
            </div>
          </div>

          {/* Card 5: online invoicing options */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2 border-b pb-3 text-indigo-900 dark:text-indigo-100">
              <Sliders className="w-5 h-5 text-indigo-600" />
              Facturación en Línea (Autofactura)
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-semibold block">Mostrar Datos de Facturación</label>
                  <span className="text-[10px] text-muted-foreground">Imprime las instrucciones y folio para autofactura.</span>
                </div>
                <Switch 
                  checked={config.showBillingInfo} 
                  onCheckedChange={() => handleToggle("showBillingInfo")} 
                />
              </div>

              {config.showBillingInfo && (
                <>
                  <div className="flex items-center justify-between border-t pt-3">
                    <div>
                      <label className="text-sm font-semibold block">Mostrar QR de Facturación</label>
                      <span className="text-[10px] text-muted-foreground">Genera un código QR para escaneo rápido desde celular.</span>
                    </div>
                    <Switch 
                      checked={config.showBillingQr} 
                      onCheckedChange={() => handleToggle("showBillingQr")} 
                    />
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <label className="text-sm font-semibold">URL del Portal de Facturación</label>
                    <Input 
                      type="url" 
                      placeholder="Ej. https://miempresa.facturama.mx/autofactura" 
                      value={config.billingUrl}
                      onChange={(e) => handleValueChange("billingUrl", e.target.value)}
                    />
                    <span className="text-[10px] text-muted-foreground block">
                      Puedes usar <strong>{`{folio}`}</strong> y <strong>{`{total}`}</strong> en la URL para autocompletar el portal (ej. <code>?folio={`{folio}`}</code>).
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <label className="text-sm font-semibold">Instrucciones en el Ticket</label>
                    <Textarea 
                      placeholder="Ej. Factura tu ticket en línea dentro de los 30 días de tu compra."
                      value={config.billingInstructions}
                      onChange={(e) => handleValueChange("billingInstructions", e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Virtual Ticket Live Preview (5 cols) */}
        <div className="lg:col-span-5 sticky top-6">
          <div className="bg-slate-100 dark:bg-slate-900 border rounded-xl p-6 shadow-inner flex flex-col items-center justify-center min-h-[500px]">
            <span className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Vista Previa en Vivo
            </span>

            {/* Ticket Simulator */}
            <div 
              style={{ width: config.ticketWidth === "80mm" ? "280px" : "210px" }}
              className="bg-white text-black p-4 shadow-xl border border-slate-200 transition-all duration-300 relative rounded-sm font-mono text-[12px] leading-tight select-none"
            >
              {/* Paper Top Jagged Border simulation */}
              <div className="absolute -top-1.5 left-0 right-0 h-1.5 bg-gradient-to-b from-transparent to-white" style={{ backgroundImage: "radial-gradient(circle, transparent 4px, white 4px)", backgroundSize: "10px 12px", backgroundPosition: "0 4px" }} />

              <div className="text-center space-y-1 mb-3 pt-2">
                {/* Logo Preview */}
                {config.showLogo && (config.logoBase64 || config.logoUrl) && (
                  <div className="flex justify-center mb-2">
                    <img 
                      src={config.logoBase64 || config.logoUrl} 
                      alt="Logo Preview" 
                      style={{ width: `${config.logoWidth}px` }}
                      className="max-h-20 object-contain grayscale"
                    />
                  </div>
                )}
                {config.showLogo && !(config.logoBase64 || config.logoUrl) && (
                  <div className="border border-slate-200 py-1.5 px-3 rounded text-[10px] text-slate-400 border-dashed max-w-[140px] mx-auto mb-2">
                    Sin Logotipo Cargado
                  </div>
                )}

                {/* Company Name */}
                {previewName && (
                  <h3 className="font-bold text-sm uppercase tracking-tight">{previewName}</h3>
                )}

                {/* Company Address, RFC, Phone */}
                {previewAddress && <p className="text-[10px] whitespace-pre-wrap">{previewAddress}</p>}
                {previewRfc && <p className="text-[10px]">RFC: {previewRfc.toUpperCase()}</p>}
                {previewPhone && <p className="text-[10px]">TEL: {previewPhone}</p>}
                
                {/* Header text */}
                {config.headerText && (
                  <p className="text-[10px] border-t border-dashed border-black pt-1.5 mt-1.5 text-center italic whitespace-pre-wrap">
                    {config.headerText}
                  </p>
                )}
              </div>

              {/* Document General Info */}
              <div className="border-t border-black pt-2 mb-2 text-[10px] space-y-0.5">
                {config.showDate && <p>FECHA: {new Date().toLocaleString('es-MX')}</p>}
                <p>FOLIO: POS-10025</p>
                <p>CAJA: CAJA GENERAL</p>
                <p>CLIENTE: PÚBLICO EN GENERAL</p>
              </div>

              {/* Items List */}
              <div className="border-t border-b border-black py-2 mb-2">
                <table className="w-full text-[10px] leading-tight">
                  <thead>
                    <tr className="border-b border-black text-left">
                      <th className="font-bold pb-1 text-left" style={{ width: "15%" }}>CANT</th>
                      <th className="font-bold pb-1 text-left" style={{ width: "55%" }}>DESCRIPCIÓN</th>
                      <th className="font-bold pb-1 text-right" style={{ width: "30%" }}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-1">2.0</td>
                      <td className="py-1 pr-1">ELEVADOR MULTIUSOS</td>
                      <td className="py-1 text-right">$995.08</td>
                    </tr>
                    <tr>
                      <td className="py-1">1.0</td>
                      <td className="py-1 pr-1">ORGANIZADOR ESCALERA</td>
                      <td className="py-1 text-right">$585.34</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="text-[10px] space-y-1 mb-3">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>$1,362.43</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA (16%):</span>
                  <span>$217.99</span>
                </div>
                <div className="flex justify-between font-bold text-xs mt-1 pt-1 border-t border-dashed border-black">
                  <span>TOTAL:</span>
                  <span>$1,580.42</span>
                </div>
              </div>

              {/* Payment Details Preview */}
              {(config.showPaymentMethod || config.showPaymentReference) && (
                <div className="text-[10px] border-t border-dashed border-black pt-2 pb-1 space-y-0.5 mb-2">
                  {config.showPaymentMethod && <p>MÉTODO DE PAGO: TARJETA</p>}
                  {config.showPaymentReference && <p>REFERENCIA: AUTH-123456</p>}
                </div>
              )}

              {/* Points box */}
              {config.showPoints && (
                <div className="text-center border border-black p-1.5 mb-3 text-[10px] rounded-sm font-semibold">
                  <p>¡Acumulaste 15 puntos!</p>
                  <p className="font-normal text-[9px]">Saldo anterior: 120 pts</p>
                </div>
              )}

              {/* Billing Info Preview */}
              {config.showBillingInfo && (
                <div className="text-[10px] border-t border-dashed border-black pt-2 pb-2 mb-2 text-center space-y-1 bg-slate-50 p-2 rounded border border-indigo-100">
                  <p className="font-bold text-[9px] text-indigo-700">DATOS DE FACTURACIÓN</p>
                  {config.billingInstructions && (
                    <p className="text-[9px] text-slate-600 whitespace-pre-wrap leading-tight">{config.billingInstructions}</p>
                  )}
                  <div className="text-[9px] text-left pt-1 border-t border-slate-100 space-y-0.5 font-mono">
                    <p className="truncate">PORTAL: {config.billingUrl || "https://facturama.mx/autofactura"}</p>
                    <p>FOLIO: POS-10025</p>
                    <p>TOTAL: $1,580.42</p>
                  </div>
                  {config.showBillingQr && (
                    <div className="flex flex-col items-center pt-2">
                      <div className="h-20 w-20 bg-slate-200 border-2 border-slate-400 flex items-center justify-center text-[8px] font-bold text-slate-600 select-none">
                        [ MOCK QR ]
                      </div>
                      <span className="text-[8px] mt-1 text-slate-400">Escanear para facturar</span>
                    </div>
                  )}
                </div>
              )}

              {/* Footer text */}
              {config.footerText && (
                <div className="text-center text-[9px] mb-3 whitespace-pre-wrap leading-tight text-slate-800">
                  {config.footerText}
                </div>
              )}

              {/* Barcode */}
              {config.showBarcode && (
                <div className="text-center flex flex-col items-center mt-4">
                  <div className="h-6 w-full max-w-[150px] bg-slate-300 flex items-center justify-center text-[8px] text-slate-500 font-bold select-none border border-slate-400">
                    ||||| MOCK-BARCODE |||||
                  </div>
                  <span className="text-[9px] mt-1 text-slate-500">POS-10025</span>
                </div>
              )}

              {/* Paper Bottom Jagged Border simulation */}
              <div className="absolute -bottom-1.5 left-0 right-0 h-1.5 bg-gradient-to-t from-transparent to-white" style={{ backgroundImage: "radial-gradient(circle, transparent 4px, white 4px)", backgroundSize: "10px 12px", backgroundPosition: "0 -4px" }} />
            </div>

            <p className="text-[10px] text-slate-400 mt-4 text-center max-w-[240px]">
              El aspecto impreso real puede variar según la configuración de tu navegador y modelo de impresora térmica.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
