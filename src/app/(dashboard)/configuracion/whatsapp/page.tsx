"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { doc, getDoc, updateDoc, collection, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { 
  Loader2, 
  Settings, 
  CheckCircle2, 
  Info,
  Building2,
  Copy,
  MessageCircle,
  KeyRound,
  ShieldCheck,
  Smartphone
} from "lucide-react";

interface BankAccount {
  id: string;
  name: string;
}

export default function WhatsAppBotConfigPage() {
  const { companyId } = useAuth();

  // Settings state
  const [whatsappBotActive, setWhatsappBotActive] = useState(true);
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappVerifyToken, setWhatsappVerifyToken] = useState("bind_verify_token");
  const [whatsappPhoneId, setWhatsappPhoneId] = useState("");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [copied, setCopied] = useState(false);

  // Load Bank Accounts and saved settings
  useEffect(() => {
    if (!companyId) return;

    // Fetch active Bank Accounts
    const qB = query(collection(db, "companies", companyId, "bankAccounts"));
    const unsubB = onSnapshot(qB, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().Name || doc.data().name || "Cuenta sin nombre" 
      }));
      setBankAccounts(data);
    }, (error) => {
      console.error("Error loading bank accounts:", error);
    });

    // Fetch Saved Settings from Company document
    const loadSettings = async () => {
      try {
        const docRef = doc(db, "companies", companyId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setWhatsappBotActive(data.whatsappBotActive !== false);
          setWhatsappAccessToken(data.whatsappAccessToken || "");
          setWhatsappVerifyToken(data.whatsappVerifyToken || "bind_verify_token");
          setWhatsappPhoneId(data.whatsappPhoneId || "");
          setTwilioAccountSid(data.twilioAccountSid || "");
          setTwilioAuthToken(data.twilioAuthToken || "");
          setSelectedBankAccountId(data.whatsappDefaultBankAccountId || "");
        }
      } catch (err) {
        console.error("Error loading whatsapp settings:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();

    return () => {
      unsubB();
    };
  }, [companyId]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setSaving(true);
    try {
      const docRef = doc(db, "companies", companyId);
      await updateDoc(docRef, {
        whatsappBotActive,
        whatsappAccessToken,
        whatsappVerifyToken,
        whatsappPhoneId,
        twilioAccountSid,
        twilioAuthToken,
        whatsappDefaultBankAccountId: selectedBankAccountId,
        updatedAt: new Date().toISOString()
      });
      alert("Configuración de Bot de WhatsApp guardada exitosamente.");
    } catch (err: any) {
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhooks/whatsapp?companyId=${companyId}` 
    : "";

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center shadow-inner">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bot de WhatsApp</h1>
            <p className="text-muted-foreground">
              Configura el webhook de cobros para registrar comprobantes bancarios automáticamente con IA reenviando fotos.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Configuration Form */}
        <form onSubmit={handleSaveSettings} className="lg:col-span-7 space-y-6">
          
          {/* Card 1: Webhook URL info */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-400" /> Dirección del Webhook (Webhook URL)
            </h3>
            
            <p className="text-xs text-muted-foreground">
              Copia esta URL y configúrala como webhook de entrada en la consola de Twilio o en la app de Meta para recibir los mensajes de WhatsApp:
            </p>

            <div className="flex gap-2 items-center bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800">
              <span className="flex-1 truncate">{webhookUrl}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCopyWebhook}
                className="h-8 w-8 text-slate-400 hover:text-white shrink-0"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            {copied && <span className="text-[10px] text-green-500 font-bold block">¡Copiado al portapapeles!</span>}
          </div>

          {/* Card 2: General settings */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-slate-400" /> Ajustes Generales
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <label className="text-sm font-bold block">Activar Bot de WhatsApp</label>
                  <span className="text-xs text-muted-foreground">Habilita el procesamiento automático y respuesta del bot al recibir comprobantes.</span>
                </div>
                <Switch checked={whatsappBotActive} onCheckedChange={setWhatsappBotActive} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Cuenta Bancaria por Defecto</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedBankAccountId}
                  onChange={(e) => setSelectedBankAccountId(e.target.value)}
                  required
                >
                  <option value="">-- Seleccionar Cuenta --</option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Los anticipos generados por WhatsApp se registrarán automáticamente en esta cuenta bancaria receptora.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Credentials (Meta & Twilio) */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-5">
            <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-slate-400" /> Credenciales de Mensajería
            </h3>

            <div className="space-y-5">
              {/* Meta section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                  <Smartphone className="w-4 h-4" /> Meta WhatsApp Cloud API (Oficial)
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-650">Verify Token (Meta Webhook)</label>
                    <Input 
                      value={whatsappVerifyToken}
                      onChange={e => setWhatsappVerifyToken(e.target.value)}
                      placeholder="bind_verify_token"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-650">WhatsApp Phone Number ID</label>
                    <Input 
                      value={whatsappPhoneId}
                      onChange={e => setWhatsappPhoneId(e.target.value)}
                      placeholder="Identificador del número"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-650">Meta Cloud System Access Token</label>
                  <Input 
                    type="password"
                    value={whatsappAccessToken}
                    onChange={e => setWhatsappAccessToken(e.target.value)}
                    placeholder="EAIaSyC1..."
                  />
                  <p className="text-[10px] text-muted-foreground">
                    El token permanente del sistema obtenido de Meta Developer Console para enviar respuestas de vuelta.
                  </p>
                </div>
              </div>

              {/* Twilio section */}
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2 text-rose-500 text-xs font-bold uppercase tracking-wider">
                  <Building2 className="w-4 h-4" /> Twilio WhatsApp Sandbox / Production
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-650">Twilio Account SID</label>
                    <Input 
                      value={twilioAccountSid}
                      onChange={e => setTwilioAccountSid(e.target.value)}
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-650">Twilio Auth Token</label>
                    <Input 
                      type="password"
                      value={twilioAuthToken}
                      onChange={e => setTwilioAuthToken(e.target.value)}
                      placeholder="Token de autorización"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={saving} 
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar Configuración
            </Button>
          </div>

        </form>

        {/* Right Side: Setup Instructions */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-indigo-600/5 border border-indigo-600/10 p-6 rounded-xl space-y-4">
            <div className="flex items-center gap-2 text-indigo-600 font-bold">
              <Info className="w-5 h-5" />
              <span>Instrucciones de Configuración</span>
            </div>

            <div className="text-xs text-slate-800 space-y-4 leading-relaxed">
              <div>
                <p className="font-bold text-slate-900">Uso con Twilio (Recomendado por simplicidad):</p>
                <ol className="list-decimal pl-4 mt-1 space-y-1">
                  <li>Ve a tu consola de **Twilio Developer**.</li>
                  <li>Entra a **Messaging** &gt; **Try it Out** &gt; **Send a WhatsApp Message**.</li>
                  <li>En la pestaña de **Sandbox Settings**, copia la **Webhook URL** generada en esta página en el campo "WHEN A MESSAGE COMES IN".</li>
                  <li>Presiona **Save** y ¡listo! Puedes enviar un comprobante al número de prueba de Twilio.</li>
                </ol>
              </div>

              <div className="border-t pt-3">
                <p className="font-bold text-slate-900">Uso con Meta Cloud API (Oficial):</p>
                <ol className="list-decimal pl-4 mt-1 space-y-1">
                  <li>Ve a **Meta for Developers** y abre tu app.</li>
                  <li>Agrega el producto **WhatsApp** a tu app.</li>
                  <li>Entra a **Configuration** e ingresa la Webhook URL de esta página.</li>
                  <li>Ingresa el **Verify Token** configurado en esta página (por defecto `bind_verify_token`).</li>
                  <li>Presiona **Verify and Save**.</li>
                  <li>Suscríbete al webhook `messages` en la lista de campos Webhook.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
