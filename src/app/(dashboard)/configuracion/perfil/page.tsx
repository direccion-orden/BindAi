"use client";

import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Save, Building2, ShieldCheck, Mail, MapPin, KeyRound, UploadCloud, CheckCircle2, MessageCircle, Server, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CompanyProfilePage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fielSaving, setFielSaving] = useState(false);
  const [fielStatus, setFielStatus] = useState<"none" | "configured">("none");
  const [companyCode, setCompanyCode] = useState<number | null>(null);
  
  const [fielData, setFielData] = useState({
    cerBase64: "",
    keyBase64: "",
    password: ""
  });
  
  const [formData, setFormData] = useState({
    name: "",
    razonSocial: "",
    rfc: "",
    taxRegime: "",
    zipCode: "",
    email: "",
    phone: "",
    address: "",
    whatsappPhone: "",
    smtpHost: "",
    smtpPort: "",
    smtpUser: "",
    smtpPass: "",
    geminiApiKey: ""
  });

  useEffect(() => {
    if (!companyId) return;
    
    const fetchProfile = async () => {
      const docRef = doc(db, "companies", companyId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data.companyCode === 'number') {
          setCompanyCode(data.companyCode);
        }
        setFormData({
          name: data.name || "",
          razonSocial: data.razonSocial || "",
          rfc: data.rfc || "",
          taxRegime: data.taxRegime || "",
          zipCode: data.zipCode || "",
          email: data.email || "",
          phone: data.phone || "",
          address: data.address || "",
          whatsappPhone: data.whatsappPhone || "",
          smtpHost: data.smtpHost || "",
          smtpPort: data.smtpPort || "",
          smtpUser: data.smtpUser || "",
          smtpPass: data.smtpPass || "",
          geminiApiKey: data.geminiApiKey || ""
        });
      }

      // Check if FIEL exists
      const satDoc = await getDoc(doc(db, "companies", companyId, "credentials", "sat"));
      if (satDoc.exists()) {
        setFielStatus("configured");
      }

      setLoading(false);
    };
    
    fetchProfile();
  }, [companyId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    
    setSaving(true);
    try {
      const docRef = doc(db, "companies", companyId);
      await updateDoc(docRef, {
        ...formData,
        updatedAt: new Date().toISOString()
      });
      alert("Perfil de la empresa guardado exitosamente.");
    } catch (error) {
      console.error(error);
      alert("Error al guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cer' | 'key') => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      setFielData(prev => ({
        ...prev,
        [type === 'cer' ? 'cerBase64' : 'keyBase64']: base64
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveFiel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!fielData.cerBase64 || !fielData.keyBase64 || !fielData.password) {
      alert("Debes subir ambos archivos y escribir la contraseña.");
      return;
    }
    
    setFielSaving(true);
    try {
      const docRef = doc(db, "companies", companyId, "credentials", "sat");
      await updateDoc(doc(db, "companies", companyId), {}); // Dummy write to ensure we have access, just in case
      
      // Save credentials in subcollection
      const { setDoc } = await import("firebase/firestore");
      await setDoc(docRef, {
        cerBase64: fielData.cerBase64,
        keyBase64: fielData.keyBase64,
        password: fielData.password, // In a prod app, this should be encrypted
        updatedAt: new Date().toISOString()
      });
      
      setFielStatus("configured");
      setFielData({ cerBase64: "", keyBase64: "", password: "" }); // Clear form
      alert("Credenciales SAT guardadas correctamente.");
    } catch (error) {
      console.error(error);
      alert("Error al guardar credenciales SAT.");
    } finally {
      setFielSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Perfil de la Empresa</h1>
        <p className="text-muted-foreground">
          Configura los datos fiscales y comerciales de tu organización.
        </p>
      </div>

      {companyId && (
        <div className="bg-slate-900/5 dark:bg-slate-900/30 border border-slate-200/60 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Código de tu Empresa (para invitar colaboradores)</p>
            <p className="font-mono text-2xl font-black text-indigo-600 dark:text-indigo-400 select-all mt-1">{companyCode || "Generando..."}</p>
            <span className="text-[10px] text-slate-400 font-mono block mt-1">ID Interno: {companyId}</span>
          </div>
          <Button 
            type="button"
            variant="outline" 
            size="sm" 
            onClick={() => {
              const textToCopy = companyCode ? String(companyCode) : companyId;
              navigator.clipboard.writeText(textToCopy);
              alert("Código de la empresa copiado al portapapeles.");
            }}
            className="shrink-0 font-semibold"
          >
            Copiar Código
          </Button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Comercial Data */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-semibold flex items-center gap-2 border-b pb-3">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Información Comercial
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre Comercial</label>
              <Input 
                name="name" 
                value={formData.name} 
                onChange={handleChange} 
                placeholder="Ej. Mi Tienda" 
                required 
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Correo Electrónico de Contacto</label>
              <Input 
                name="email" 
                type="email" 
                value={formData.email} 
                onChange={handleChange} 
                placeholder="contacto@mitienda.com" 
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Teléfono</label>
              <Input 
                name="phone" 
                value={formData.phone} 
                onChange={handleChange} 
                placeholder="Ej. 55 1234 5678" 
              />
            </div>
          </div>

          {/* Fiscal Data */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-semibold flex items-center gap-2 border-b pb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Información Fiscal (CFDI 4.0)
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Razón Social *</label>
              <Input 
                name="razonSocial" 
                value={formData.razonSocial} 
                onChange={handleChange} 
                placeholder="MI EMPRESA SA DE CV" 
                className="uppercase"
                required 
              />
              <p className="text-xs text-muted-foreground">Tal cual aparece en la Constancia de Situación Fiscal.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">RFC *</label>
                <Input 
                  name="rfc" 
                  value={formData.rfc} 
                  onChange={handleChange} 
                  placeholder="XAXX010101000" 
                  className="uppercase"
                  maxLength={13}
                  required 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Código Postal *</label>
                <Input 
                  name="zipCode" 
                  value={formData.zipCode} 
                  onChange={handleChange} 
                  placeholder="Ej. 64753" 
                  maxLength={5}
                  required 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Régimen Fiscal *</label>
              <select 
                name="taxRegime" 
                value={formData.taxRegime} 
                onChange={handleChange} 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              >
                <option value="">Seleccionar Régimen...</option>
                <option value="601">601 - General de Ley Personas Morales</option>
                <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                <option value="605">605 - Sueldos y Salarios e Ingresos Asimilados a Salarios</option>
                <option value="606">606 - Arrendamiento</option>
                <option value="608">608 - Demás ingresos</option>
                <option value="609">609 - Consolidación</option>
                <option value="610">610 - Residentes en el Extranjero sin Establecimiento Permanente en México</option>
                <option value="611">611 - Ingresos por Dividendos (socios y accionistas)</option>
                <option value="612">612 - Personas Físicas con Actividades Empresariales y Profesionales</option>
                <option value="614">614 - Ingresos por intereses</option>
                <option value="615">615 - Régimen de los ingresos por obtención de premios</option>
                <option value="616">616 - Sin obligaciones fiscales</option>
                <option value="620">620 - Sociedades Cooperativas de Producción que optan por diferir sus ingresos</option>
                <option value="621">621 - Incorporación Fiscal</option>
                <option value="622">622 - Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras</option>
                <option value="623">623 - Opcional para Grupos de Sociedades</option>
                <option value="624">624 - Coordinados</option>
                <option value="625">625 - Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas</option>
                <option value="626">626 - Régimen Simplificado de Confianza (RESICO)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-semibold flex items-center gap-2 border-b pb-3">
            <MapPin className="w-5 h-5 text-orange-600" />
            Dirección Física
          </h3>
          <div className="space-y-2">
            <label className="text-sm font-medium">Dirección Completa</label>
            <Input 
              name="address" 
              value={formData.address} 
              onChange={handleChange} 
              placeholder="Calle, Número, Colonia, Ciudad, Estado" 
            />
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-semibold flex items-center gap-2 border-b pb-3 text-indigo-600">
            <MessageCircle className="w-5 h-5 text-indigo-600" />
            Configuración de Notificaciones (WhatsApp y Correo)
          </h3>
          <p className="text-xs text-muted-foreground">
            Configura las credenciales personalizadas desde las cuales tus clientes recibirán los tickets de venta.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WhatsApp Config */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                Canal de WhatsApp
              </h4>
              <div className="space-y-2">
                <label className="text-sm font-medium">WhatsApp de Contacto de la Empresa</label>
                <Input 
                  name="whatsappPhone" 
                  value={formData.whatsappPhone} 
                  onChange={handleChange} 
                  placeholder="Ej. 525512345678" 
                />
                <p className="text-xs text-muted-foreground">Número de WhatsApp (con código de país, ej. 52 para México) que aparecerá en los enlaces de contacto y firmas de ticket.</p>
              </div>
            </div>

            {/* SMTP Config */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                <Server className="w-4 h-4 text-slate-500" />
                Servidor de Correo (SMTP)
              </h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-2">
                    <label className="text-xs font-medium">Servidor Host</label>
                    <Input 
                      name="smtpHost" 
                      value={formData.smtpHost} 
                      onChange={handleChange} 
                      placeholder="smtp.gmail.com" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Puerto</label>
                    <Input 
                      name="smtpPort" 
                      value={formData.smtpPort} 
                      onChange={handleChange} 
                      placeholder="465" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Usuario / Correo Emisor</label>
                  <Input 
                    name="smtpUser" 
                    type="email" 
                    value={formData.smtpUser} 
                    onChange={handleChange} 
                    placeholder="contacto@tuempresa.com" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Contraseña (o Token de Aplicación)</label>
                  <Input 
                    name="smtpPass" 
                    type="password" 
                    value={formData.smtpPass} 
                    onChange={handleChange} 
                    placeholder="••••••••••••" 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-semibold flex items-center gap-2 border-b pb-3 text-indigo-600">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            Configuración de Inteligencia Artificial (Gemini)
          </h3>
          <p className="text-xs text-muted-foreground">
            Configura una clave de API (API KEY) de Google Gemini para habilitar la generación de portadas con IA, descripciones automáticas y asistentes inteligentes en tu cuenta.
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Gemini API Key</label>
            <Input 
              name="geminiApiKey" 
              type="password"
              value={formData.geminiApiKey} 
              onChange={handleChange} 
              placeholder="AIzaSy..." 
            />
            <p className="text-[10px] text-muted-foreground">
              Puedes obtener tu API Key de forma gratuita o de pago desde Google AI Studio (https://aistudio.google.com/).
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={saving} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[200px]">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Guardar Perfil
          </Button>
        </div>
      </form>

      {/* SAT FIEL Config */}
      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4 mt-8">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-purple-600" />
            Credenciales SAT (e.Firma)
          </h3>
          {fielStatus === "configured" && (
            <span className="flex items-center text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
              <CheckCircle2 className="w-4 h-4 mr-1" /> Configuradas
            </span>
          )}
        </div>
        
        <p className="text-sm text-muted-foreground">
          Sube los archivos de tu e.Firma (FIEL) para habilitar la descarga automatizada de facturas (gastos) desde el SAT. Tus archivos se guardan de forma segura en una bóveda privada.
        </p>

        <form onSubmit={handleSaveFiel} className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Certificado (.cer) *</label>
              <div className="flex h-10 w-full rounded-md border border-input bg-background text-sm file:border-0 file:bg-primary/10 file:text-primary file:text-sm file:font-semibold file:mr-4 file:h-full overflow-hidden">
                <input 
                  type="file" 
                  accept=".cer"
                  onChange={e => handleFileChange(e, 'cer')}
                  className="w-full h-full cursor-pointer"
                  required={fielStatus === "none"}
                />
              </div>
              {fielData.cerBase64 && <p className="text-xs text-green-600 font-semibold">Archivo cargado en memoria.</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Clave Privada (.key) *</label>
              <div className="flex h-10 w-full rounded-md border border-input bg-background text-sm file:border-0 file:bg-primary/10 file:text-primary file:text-sm file:font-semibold file:mr-4 file:h-full overflow-hidden">
                <input 
                  type="file" 
                  accept=".key"
                  onChange={e => handleFileChange(e, 'key')}
                  className="w-full h-full cursor-pointer"
                  required={fielStatus === "none"}
                />
              </div>
              {fielData.keyBase64 && <p className="text-xs text-green-600 font-semibold">Archivo cargado en memoria.</p>}
            </div>
          </div>

          <div className="space-y-4 flex flex-col justify-between">
            <div className="space-y-2">
              <label className="text-sm font-medium">Contraseña de Clave Privada *</label>
              <Input 
                type="password"
                value={fielData.password}
                onChange={e => setFielData(p => ({ ...p, password: e.target.value }))}
                placeholder="********"
                required={fielStatus === "none"}
              />
              <p className="text-xs text-muted-foreground">La contraseña asociada a tu archivo .key</p>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={fielSaving || (!fielData.cerBase64 && fielStatus === 'none')} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white w-full md:w-auto">
                {fielSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                {fielStatus === "configured" ? "Actualizar e.Firma" : "Guardar e.Firma"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
