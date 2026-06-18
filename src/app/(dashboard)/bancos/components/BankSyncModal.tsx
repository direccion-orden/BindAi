"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Landmark, ShieldCheck, KeyRound, CheckCircle2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface BankSyncModalProps {
  accountId: string;
  onClose: () => void;
}

type BankType = "bbva" | "banregio" | "banbajio";

export function BankSyncModal({ accountId, onClose }: BankSyncModalProps) {
  const { companyId } = useAuth();
  const [step, setStep] = useState<"select_bank" | "credentials" | "otp" | "syncing" | "success">("select_bank");
  const [bank, setBank] = useState<BankType | null>(null);
  
  // Form states
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  
  // API states
  const [linkId, setLinkId] = useState("");
  const [session, setSession] = useState("");
  
  const [syncCount, setSyncCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);

  const handleSelectBank = (selected: BankType) => {
    setBank(selected);
    setStep("credentials");
  };

  const getInstitutionCode = (selectedBank: BankType | null) => {
    if (selectedBank === "bbva") return "mx_bbva_bancomer";
    if (selectedBank === "banregio") return "mx_monterrey_regional";
    if (selectedBank === "banbajio") return "mx_bajio";
    return "";
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !password || !bank) {
      alert("Por favor completa las credenciales.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/bancos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_link",
          companyId,
          accountId,
          username: userId,
          password,
          institution: getInstitutionCode(bank)
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al intentar vincular la cuenta");
      }

      if (data.status === "mfa_required") {
        setSession(data.session);
        setLinkId(data.link);
        setStep("otp");
      } else if (data.status === "success") {
        setLinkId(data.link);
        await triggerDataSync(data.link);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al conectar con Belvo");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      alert("Por favor ingresa un código de 6 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/bancos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_mfa",
          companyId,
          accountId,
          linkId,
          session,
          token: otp
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "MFA incorrecto o expirado");
      }

      await triggerDataSync(linkId);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error al validar el MFA");
    } finally {
      setLoading(false);
    }
  };

  const triggerDataSync = async (activeLinkId: string) => {
    setStep("syncing");
    try {
      const res = await fetch("/api/bancos/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_data",
          companyId,
          accountId,
          linkId: activeLinkId
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al sincronizar datos bancarios");
      }

      setSyncCount(data.imported || 0);
      setMatchedCount(data.matched || 0);
      setStep("success");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Error durante la sincronización");
      setStep("select_bank");
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-muted/20">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            Conectar Banco Automático
          </h2>
          {step !== "syncing" && (
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full" disabled={loading}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Step 1: Select Bank */}
        {step === "select_bank" && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500 text-center">
              Selecciona tu institución bancaria para iniciar la vinculación segura y descargar tus movimientos.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <button
                onClick={() => handleSelectBank("bbva")}
                className="flex flex-col items-center gap-3 p-4 border rounded-xl hover:border-blue-500 hover:bg-blue-50/20 active:bg-blue-50/40 transition-all text-center group"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-900 text-white font-bold flex items-center justify-center text-sm tracking-tight shadow-md group-hover:scale-105 transition-transform">
                  BBVA
                </div>
                <span className="font-bold text-slate-700 text-xs">BBVA</span>
              </button>
              
              <button
                onClick={() => handleSelectBank("banregio")}
                className="flex flex-col items-center gap-3 p-4 border rounded-xl hover:border-orange-500 hover:bg-orange-50/20 active:bg-orange-50/40 transition-all text-center group"
              >
                <div className="w-12 h-12 rounded-lg bg-orange-600 text-white font-black flex items-center justify-center text-xs tracking-tight shadow-md group-hover:scale-105 transition-transform">
                  regio
                </div>
                <span className="font-bold text-slate-700 text-xs">Banregio</span>
              </button>

              <button
                onClick={() => handleSelectBank("banbajio")}
                className="flex flex-col items-center gap-3 p-4 border rounded-xl hover:border-emerald-600 hover:bg-emerald-50/20 active:bg-emerald-50/40 transition-all text-center group"
              >
                <div className="w-12 h-12 rounded-lg bg-emerald-700 text-white font-black flex items-center justify-center text-xs tracking-tight shadow-md group-hover:scale-105 transition-transform">
                  Bajío
                </div>
                <span className="font-bold text-slate-700 text-xs">BanBajío</span>
              </button>
            </div>
            <div className="flex justify-center items-center gap-1.5 text-[10px] text-slate-400 font-semibold pt-4">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Conexión encriptada con encriptación AES-256
            </div>
          </div>
        )}

        {/* Step 2: Credentials */}
        {step === "credentials" && (
          <form onSubmit={handleCredentialsSubmit} className="p-6 space-y-4 animate-in slide-in-from-right duration-200">
            <div className="flex items-center gap-2 pb-2 border-b">
              <span className={`px-2 py-0.5 text-xs font-bold rounded uppercase text-white ${bank === 'bbva' ? 'bg-blue-900' : bank === 'banregio' ? 'bg-orange-600' : 'bg-emerald-700'}`}>
                {bank}
              </span>
              <p className="text-xs font-semibold text-slate-500">Ingresa las credenciales de tu portal</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Número de Cliente / Usuario</label>
                <Input
                  required
                  disabled={loading}
                  placeholder="Ej. user_ok o cliente123"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Contraseña / Código de Acceso</label>
                <Input
                  type="password"
                  required
                  disabled={loading}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("select_bank")} disabled={loading}>
                Atrás
              </Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Siguiente
              </Button>
            </div>
          </form>
        )}

        {/* Step 3: OTP */}
        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="p-6 space-y-4 animate-in slide-in-from-right duration-200">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-600">
                <KeyRound className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="font-bold text-base text-slate-800">Autenticación Multifactor (MFA)</h3>
              <p className="text-xs text-slate-500 max-w-xs">
                Ingresa el código dinámico (token) generado en la aplicación móvil de tu banco para confirmar la sincronización.
              </p>
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-xs font-bold text-slate-600 block text-center mb-1">Token Dinámico *</label>
              <Input
                required
                type="text"
                maxLength={6}
                pattern="[0-9]*"
                inputMode="numeric"
                disabled={loading}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-12 text-center text-2xl font-black tracking-widest max-w-[160px] mx-auto"
              />
            </div>

            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("credentials")} disabled={loading}>
                Atrás
              </Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold" disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Sincronizar
              </Button>
            </div>
          </form>
        )}

        {/* Step 4: Syncing */}
        {step === "syncing" && (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-300">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
            <div className="space-y-1">
              <h4 className="font-bold text-slate-800">Sincronizando con Belvo...</h4>
              <p className="text-xs text-slate-400">Descargando transacciones e importando saldos...</p>
            </div>
            <div className="w-full bg-slate-100 h-1 rounded overflow-hidden max-w-[200px]">
              <div className="bg-indigo-600 h-full w-1/2 animate-pulse rounded" />
            </div>
          </div>
        )}

        {/* Step 5: Success */}
        {step === "success" && (
          <div className="p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 animate-bounce" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-slate-800">¡Sincronización Exitosa!</h3>
              <p className="text-sm text-slate-500 font-medium">
                Se ha conectado e importado tu estado de cuenta de Belvo.
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-xs text-left text-emerald-800 space-y-1.5 font-medium max-w-xs mx-auto">
              <p className="flex justify-between">
                <span>Movimientos importados:</span>
                <span className="font-bold">{syncCount}</span>
              </p>
              <p className="flex justify-between">
                <span>Conciliados automáticamente:</span>
                <span className="font-bold text-indigo-700">{matchedCount}</span>
              </p>
            </div>

            <div className="pt-2">
              <Button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Entendido
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
