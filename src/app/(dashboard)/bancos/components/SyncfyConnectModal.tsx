"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  Calendar,
  Landmark,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface SyncfyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAccountId?: string;
  accounts: any[];
  onSyncComplete?: () => void;
}

export function SyncfyConnectModal({
  isOpen,
  onClose,
  selectedAccountId,
  accounts,
  onSyncComplete,
}: SyncfyConnectModalProps) {
  const { companyId } = useAuth();

  const getTodayStr = () => new Date().toISOString().split("T")[0];
  const getPastDateStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  };

  const [step, setStep] = useState<"init" | "widget" | "direct_sync" | "map_accounts" | "syncing" | "success">("init");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingApiKey, setMissingApiKey] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState(false);

  // Syncfy states
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [discoveredAccounts, setDiscoveredAccounts] = useState<any[]>([]);
  const [selectedSyncfyAccountId, setSelectedSyncfyAccountId] = useState<string>("");
  const [targetLocalAccountId, setTargetLocalAccountId] = useState<string>(selectedAccountId || (accounts[0]?.id || ""));

  // Date range states (configurable por el usuario)
  const [dateFrom, setDateFrom] = useState<string>(getPastDateStr(45));
  const [dateTo, setDateTo] = useState<string>(getTodayStr());

  // Sync results
  const [syncResults, setSyncResults] = useState<{ imported: number; totalFetched: number } | null>(null);

  const widgetInstanceRef = useRef<any>(null);
  const widgetContainerRef = useRef<HTMLDivElement>(null);

  const currentAccount = accounts.find((a) => a.id === targetLocalAccountId) || accounts.find((a) => a.id === selectedAccountId);
  const isAlreadyLinked = Boolean(currentAccount?.syncfyAccountId);

  useEffect(() => {
    if (selectedAccountId) {
      setTargetLocalAccountId(selectedAccountId);
    } else if (accounts.length > 0) {
      setTargetLocalAccountId(accounts[0].id);
    }
  }, [selectedAccountId, accounts]);

  // Iniciar sesión y widget cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setMissingApiKey(false);
      setSyncResults(null);

      // Si la cuenta ya está vinculada, ofrecemos la opción directa de sincronizar por rango
      if (isAlreadyLinked) {
        setStep("direct_sync");
      } else {
        setStep("init");
        initSyncfySession();
      }
    } else {
      // Limpiar widget si se cierra
      if (widgetInstanceRef.current && typeof widgetInstanceRef.current.close === "function") {
        try {
          widgetInstanceRef.current.close();
        } catch (e) {}
      }
      widgetInstanceRef.current = null;
    }
  }, [isOpen, companyId]);

  const initSyncfySession = async () => {
    if (!companyId) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/syncfy/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.missingApiKey) {
          setMissingApiKey(true);
        }
        throw new Error(data.error || "No se pudo iniciar la sesión con Syncfy");
      }

      setSessionToken(data.token);
      setStep("widget");
    } catch (err: any) {
      console.error("Error al inicializar sesión Syncfy:", err);
      setErrorMessage(err.message || "Error al conectar con el servidor de Open Banking.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && step === "widget" && sessionToken) {
      loadWidgetScript(sessionToken);
    }
  }, [isOpen, step, sessionToken]);

  const loadWidgetScript = (token: string) => {
    // 1. Cargar CSS si no existe
    const cssId = "syncfy-widget-stylesheet";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://www.syncfy.com/widget/v3/syncfy-authentication-widget.css";
      document.head.appendChild(link);
    }

    // Polyfill global if needed for React 19 / webpack
    if (typeof (window as any).global === "undefined") {
      (window as any).global = window;
    }

    // 2. Cargar Script si no existe
    const scriptId = "syncfy-widget-script";
    if (!(window as any).SyncfyWidget) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://www.syncfy.com/widget/v3/syncfy-authentication-widget.js";
      script.async = true;
      script.onload = () => {
        mountWidget(token);
      };
      script.onerror = () => {
        setErrorMessage("No se pudo cargar el componente seguro de Syncfy. Verifica tu conexión a internet.");
      };
      document.body.appendChild(script);
    } else {
      mountWidget(token);
    }
  };

  const mountWidget = (token: string, attempts = 0) => {
    try {
      const container = document.getElementById("syncfy-widget-container");
      if (!container) {
        if (attempts < 20) {
          setTimeout(() => mountWidget(token, attempts + 1), 100);
          return;
        }
        setErrorMessage("No se encontró el contenedor para el widget de Syncfy.");
        return;
      }

      if (!(window as any).SyncfyWidget) {
        if (attempts < 20) {
          setTimeout(() => mountWidget(token, attempts + 1), 150);
          return;
        }
        throw new Error("El componente SyncfyWidget no está disponible.");
      }

      container.innerHTML = "";

      const widget = new (window as any).SyncfyWidget({
        token,
        element: "#syncfy-widget-container",
        config: {
          locale: "es",
          entrypoint: {
            country: "MX",
          },
          navigation: {
            displayPrivacyScreen: false, // Inicia directamente en el catálogo de bancos
            displayBusinessSites: true,
            displayPersonalSites: true,
            saveCredential: true,
            enableBackNavigation: true,
          },
        },
      });

      widgetInstanceRef.current = widget;

      // Event Listeners
      widget.on("success", async (credential: any) => {
        console.log("[Syncfy Widget] Success:", credential);
        const credId = credential?.id_credential;
        if (credId) setCredentialId(credId);
        await fetchDiscoveredAccounts(token, credId);
      });

      widget.on("error", (cred: any, jobErr: any) => {
        console.error("[Syncfy Widget] Error:", cred, jobErr);
      });

      widget.on("closed", () => {
        console.log("[Syncfy Widget] Closed");
      });

      widget.open();
    } catch (err: any) {
      console.error("Error al montar widget de Syncfy:", err);
      setErrorMessage("Error al inicializar el widget de Syncfy: " + err.message);
    }
  };

  const fetchDiscoveredAccounts = async (token: string, credId?: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/syncfy/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, token, idCredential: credId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudieron obtener las cuentas de Syncfy");
      }

      const accs = data.accounts || [];
      setDiscoveredAccounts(accs);
      if (accs.length > 0) {
        setSelectedSyncfyAccountId(accs[0].id_account);
      }
      setStep("map_accounts");
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Payment Required") || err.message?.includes("402")) {
        setPaymentRequired(true);
      }
      setErrorMessage("Error al recuperar cuentas bancarias: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (days: number) => {
    setDateFrom(getPastDateStr(days));
    setDateTo(getTodayStr());
  };

  // Sincronización directa para cuenta ya vinculada
  const handleDirectSync = async () => {
    if (!targetLocalAccountId) return;
    setLoading(true);
    setStep("syncing");
    setErrorMessage(null);

    try {
      const syncRes = await fetch("/api/syncfy/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          bankAccountId: targetLocalAccountId,
          syncfyAccountId: currentAccount?.syncfyAccountId,
          syncfyCredentialId: currentAccount?.syncfyCredentialId,
          dateFrom,
          dateTo,
        }),
      });

      const syncData = await syncRes.json();
      if (!syncRes.ok) {
        throw new Error(syncData.error || "Error al sincronizar movimientos");
      }

      setSyncResults({
        imported: syncData.imported || 0,
        totalFetched: syncData.totalFetched || 0,
      });

      setStep("success");
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Payment Required") || err.message?.includes("402")) {
        setPaymentRequired(true);
      }
      setErrorMessage(err.message || "Ocurrió un error al sincronizar.");
      setStep("direct_sync");
    } finally {
      setLoading(false);
    }
  };

  // Sincronización al vincular por primera vez
  const handleLinkAndSync = async () => {
    if (!targetLocalAccountId || !selectedSyncfyAccountId) {
      alert("Por favor selecciona la cuenta local y la cuenta de banco a vincular.");
      return;
    }

    setLoading(true);
    setStep("syncing");
    setErrorMessage(null);

    try {
      const chosenSyncfyAcc = discoveredAccounts.find((a) => a.id_account === selectedSyncfyAccountId);

      // 1. Vincular
      const linkRes = await fetch("/api/syncfy/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          bankAccountId: targetLocalAccountId,
          syncfyAccountId: selectedSyncfyAccountId,
          syncfyCredentialId: credentialId || chosenSyncfyAcc?.id_credential,
          syncfyAccountName: chosenSyncfyAcc?.name || "Cuenta Syncfy",
        }),
      });

      if (!linkRes.ok) {
        const linkData = await linkRes.json();
        throw new Error(linkData.error || "Error al asociar cuenta bancaria");
      }

      // 2. Sincronizar transacciones con rango de fechas definido por el usuario
      const syncRes = await fetch("/api/syncfy/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          bankAccountId: targetLocalAccountId,
          syncfyAccountId: selectedSyncfyAccountId,
          syncfyCredentialId: credentialId || chosenSyncfyAcc?.id_credential,
          dateFrom,
          dateTo,
        }),
      });

      const syncData = await syncRes.json();
      if (!syncRes.ok) {
        throw new Error(syncData.error || "Error al sincronizar movimientos");
      }

      setSyncResults({
        imported: syncData.imported || 0,
        totalFetched: syncData.totalFetched || 0,
      });

      setStep("success");
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Payment Required") || err.message?.includes("402")) {
        setPaymentRequired(true);
      }
      setErrorMessage(err.message || "Ocurrió un error al sincronizar.");
      setStep("map_accounts");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] p-0 overflow-hidden bg-background border shadow-2xl rounded-2xl max-h-[92vh] flex flex-col">
        {/* Header con gradiente premium */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white p-5 relative shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white shadow-inner">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Conectar Banco con Syncfy Open Banking
              </DialogTitle>
              <DialogDescription className="text-white/80 text-xs mt-0.5 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
                Conexión bancaria cifrada de solo lectura • Conexión oficial autorizada
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col">
          {/* Missing API Key Warning */}
          {missingApiKey && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-5 mb-4 text-amber-900 dark:text-amber-100">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Falta configurar SYNCFY_API_KEY en el servidor</h4>
                  <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                    Para conectar bancos en tiempo real, ingresa tu clave API generada en tu consola de desarrollador de Syncfy (<a href="https://syncfy.com" target="_blank" rel="noreferrer" className="underline font-medium inline-flex items-center gap-1">syncfy.com <ExternalLink className="w-3 h-3" /></a>) en el archivo <code className="bg-amber-200/60 dark:bg-amber-900/60 px-1.5 py-0.5 rounded font-mono text-[11px]">.env.local</code>:
                  </p>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono select-all">
                    SYNCFY_API_KEY=tu_api_key_aqui
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Payment Required Warning */}
          {paymentRequired && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 rounded-xl p-5 mb-4 flex items-start gap-3 text-sm shadow-sm">
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-bold text-base">Plan o Créditos Requeridos en Syncfy (402 Payment Required)</h4>
                <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                  Tu autenticación con BBVA fue <strong>completamente exitosa y autorizada</strong>. Sin embargo, Syncfy requiere que tu cuenta de desarrollador active un plan comercial o créditos de Open Banking en su portal para permitir la extracción de cuentas, saldos y movimientos en producción.
                </p>
                <div className="pt-1 flex items-center gap-3">
                  <a
                    href="https://syncfy.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm"
                  >
                    Abrir Portal de Facturación en Syncfy <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 mb-4 flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Error al conectar con Syncfy</p>
                <p className="text-xs mt-1 text-rose-700">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Loading Initializer */}
          {step === "init" && loading && (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-muted-foreground">Inicializando túnel seguro con Syncfy...</p>
            </div>
          )}

          {/* Step: Direct Sync (para cuentas ya vinculadas) */}
          {step === "direct_sync" && (
            <div className="space-y-6 py-2">
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Landmark className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                      Cuenta vinculada: {currentAccount?.syncfyAccountName || "Syncfy Bank Feed"}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Asociada a: {currentAccount?.Name || currentAccount?.name} ({currentAccount?.CurrencyCode || currentAccount?.currency || "MXN"})
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStep("init");
                    initSyncfySession();
                  }}
                  className="text-xs"
                >
                  Re-vincular o cambiar cuenta
                </Button>
              </div>

              {/* Selector de Rango de Fechas */}
              <div className="p-5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-600" /> Rango de Fechas a Sincronizar
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Define el período de movimientos que deseas extraer desde tu banco.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(15)}
                      className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border hover:border-emerald-500 font-medium transition-all"
                    >
                      15 días
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(30)}
                      className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border hover:border-emerald-500 font-medium transition-all"
                    >
                      30 días
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(60)}
                      className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border hover:border-emerald-500 font-medium transition-all"
                    >
                      60 días
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(90)}
                      className="text-xs px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 text-emerald-700 font-bold transition-all"
                    >
                      90 días (Máx)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Fecha Inicio:
                    </label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-11 font-medium bg-background text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                      Fecha Fin:
                    </label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-11 font-medium bg-background text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={onClose}>
                  Cerrar
                </Button>
                <Button
                  onClick={handleDirectSync}
                  disabled={loading || !dateFrom || !dateTo}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sincronizar Movimientos del Período
                </Button>
              </div>
            </div>
          )}

          {/* Step: Syncfy Embedded Widget Container (Centrado y Responsivo) */}
          <div className={step === "widget" ? "space-y-3 flex-1 flex flex-col items-center justify-center w-full" : "hidden"}>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border text-xs text-muted-foreground flex items-center justify-between w-full max-w-4xl">
              <span>Selecciona tu institución financiera e ingresa tus credenciales bancarias en el widget seguro.</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" /> Cifrado bancario de 256 bits
              </span>
            </div>
            <div className="w-full flex justify-center items-center">
              <div
                id="syncfy-widget-container"
                ref={widgetContainerRef}
                className="w-full max-w-4xl h-[620px] min-h-[580px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-inner relative flex justify-center items-center overflow-auto"
              />
            </div>
          </div>

          {/* Step: Map Discovered Accounts to ERP Local Bank Accounts */}
          {step === "map_accounts" && (
            <div className="space-y-6 py-2">
              <div className="border-b pb-4">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ¡Banco conectado exitosamente!
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Se encontraron las siguientes cuentas bancarias. Selecciona a qué cuenta del sistema deseas asociar los movimientos y el rango de fechas:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cuenta de Syncfy */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Cuenta descubierta en Syncfy:
                  </label>
                  {discoveredAccounts.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No se detectaron subcuentas.</p>
                  ) : (
                    <div className="space-y-2">
                      {discoveredAccounts.map((acc) => (
                        <div
                          key={acc.id_account}
                          onClick={() => setSelectedSyncfyAccountId(acc.id_account)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedSyncfyAccountId === acc.id_account
                              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20"
                              : "border-slate-200 hover:border-slate-300 bg-card"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{acc.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {acc.number ? `No. ${acc.number}` : "Cuenta estándar"} • {acc.currency || "MXN"}
                              </p>
                            </div>
                            {acc.balance !== undefined && (
                              <span className="text-xs font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                                ${Number(acc.balance).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cuenta del ERP */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Asociar con Cuenta en el ERP:
                  </label>
                  <select
                    value={targetLocalAccountId}
                    onChange={(e) => setTargetLocalAccountId(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-background text-sm font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.Name || acc.name} ({acc.CurrencyCode || acc.currency || "MXN"}) - Saldo: $
                        {Number(acc.balance || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>

                  <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">¿Qué sucederá?</p>
                    <p>• Los movimientos del período se descargarán automáticamente sin duplicar.</p>
                    <p>• El saldo de la cuenta se sincronizará con los movimientos del banco.</p>
                  </div>
                </div>
              </div>

              {/* Selector de Rango de Fechas en Primera Sincronización */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border space-y-3 mt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2.5">
                  <div>
                    <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-emerald-600" /> Rango de Fechas a Descargar
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Syncfy permite consultar hasta 90 días de historial según el banco.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(15)}
                      className="text-[11px] px-2 py-1 rounded bg-white dark:bg-slate-800 border hover:border-emerald-500 font-medium"
                    >
                      15 días
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(30)}
                      className="text-[11px] px-2 py-1 rounded bg-white dark:bg-slate-800 border hover:border-emerald-500 font-medium"
                    >
                      30 días
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(60)}
                      className="text-[11px] px-2 py-1 rounded bg-white dark:bg-slate-800 border hover:border-emerald-500 font-medium"
                    >
                      60 días
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(90)}
                      className="text-[11px] px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 text-emerald-700 font-bold"
                    >
                      90 días (Máx)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Fecha Inicio:
                    </label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-10 text-xs font-semibold bg-background"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Fecha Fin:
                    </label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-10 text-xs font-semibold bg-background"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleLinkAndSync}
                  disabled={loading || !selectedSyncfyAccountId || !targetLocalAccountId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 px-6"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  Vincular y Sincronizar Movimientos
                </Button>
              </div>
            </div>
          )}

          {/* Step: Syncing in Progress */}
          {step === "syncing" && (
            <div className="py-16 flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Descargando transacciones bancarias...
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Consultando extractos del período {dateFrom} al {dateTo} y aplicando reglas de no duplicidad en el sistema.
                </p>
              </div>
            </div>
          )}

          {/* Step: Success Feedback */}
          {step === "success" && (
            <div className="py-10 flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  ¡Sincronización Exitosa!
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Tu cuenta bancaria ha quedado vinculada y actualizada con el extracto bancario.
                </p>
              </div>

              {syncResults && (
                <div className="grid grid-cols-2 gap-4 max-w-md w-full my-3">
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 border rounded-xl">
                    <p className="text-2xl font-black text-emerald-600">{syncResults.imported}</p>
                    <p className="text-xs font-semibold text-slate-500 uppercase mt-1">Nuevos Movimientos</p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900 border rounded-xl">
                    <p className="text-2xl font-black text-slate-700 dark:text-slate-300">
                      {syncResults.totalFetched}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 uppercase mt-1">Leídos del Banco</p>
                  </div>
                </div>
              )}

              <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 mt-2">
                Aceptar y Ver Movimientos
              </Button>
            </div>
          )}
        </div>

        {/* Estilos CSS globales para centrar y asegurar responsividad del widget Syncfy */}
        <style jsx global>{`
          #syncfy-widget-container {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            width: 100% !important;
            margin: 0 auto !important;
          }
          #syncfy-widget-container > * {
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 680px !important;
            display: flex !important;
            justify-content: center !important;
          }
          #syncfy-widget-container .pb-w-sync_container {
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 680px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
          }
          #syncfy-widget-container .pb-w-sync_widget-content {
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 640px !important;
          }
          #syncfy-widget-container .pb-w-sync_credential-content {
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 580px !important;
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
