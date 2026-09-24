"use client";

import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CloudDownload,
  ShieldCheck,
  RefreshCw,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Lock,
  Building,
  Sparkles,
  X,
  Loader2,
  FileText,
  KeyRound,
  ExternalLink,
} from "lucide-react";

interface SyncfySatModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onSyncComplete?: (result: { imported: number; updated: number; totalFetched: number }) => void;
}

export function SyncfySatModal({
  isOpen,
  onClose,
  companyId,
  onSyncComplete,
}: SyncfySatModalProps) {
  const [loading, setLoading] = useState(true);
  const [companyData, setCompanyData] = useState<any>(null);
  const [isLinked, setIsLinked] = useState(false);
  const [satRfc, setSatRfc] = useState<string>("");
  const [credentialId, setCredentialId] = useState<string>("");

  // Widget state
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const widgetInstanceRef = useRef<any>(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<any>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Date range filters
  const [dateRangePreset, setDateRangePreset] = useState<"7days" | "month" | "30days" | "custom">("30days");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Initialize date defaults
  useEffect(() => {
    const today = new Date();
    const todayStr = getLocalDateStr(today);

    const past30 = new Date();
    past30.setDate(past30.getDate() - 30);
    const past30Str = getLocalDateStr(past30);

    setDateTo(todayStr);
    setDateFrom(past30Str);
  }, []);

  // Listen for company updates in Firestore
  useEffect(() => {
    if (!companyId || !isOpen) return;

    setLoading(true);
    const companyRef = doc(db, "companies", companyId);
    const unsub = onSnapshot(companyRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompanyData(data);
        const hasCred = Boolean(data.syncfySatCredentialId);
        setIsLinked(hasCred);
        setSatRfc(data.syncfySatRfc || data.rfc || "");
        setCredentialId(data.syncfySatCredentialId || "");
      }
      setLoading(false);
    });

    return () => unsub();
  }, [companyId, isOpen]);

  // Handle Preset Changes
  const handlePresetChange = (preset: "7days" | "month" | "30days" | "custom") => {
    setDateRangePreset(preset);
    const now = new Date();
    const todayStr = getLocalDateStr(now);

    if (preset === "7days") {
      const past7 = new Date();
      past7.setDate(now.getDate() - 7);
      setDateFrom(getLocalDateStr(past7));
      setDateTo(todayStr);
    } else if (preset === "month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(getLocalDateStr(startOfMonth));
      setDateTo(todayStr);
    } else if (preset === "30days") {
      const past30 = new Date();
      past30.setDate(now.getDate() - 30);
      setDateFrom(getLocalDateStr(past30));
      setDateTo(todayStr);
    }
  };

  // Launch Syncfy Widget for SAT (Site: 56cf5728784806f72b8b456f -> SAT CIEC)
  const handleLaunchWidget = async () => {
    setWidgetLoading(true);
    setWidgetError(null);
    setWidgetOpen(true);

    try {
      // 1. Obtain ephemeral session token
      const sessionRes = await fetch("/api/syncfy/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          companyName: companyData?.name || companyData?.LegalName,
        }),
      });

      const sessionData = await sessionRes.json();
      if (!sessionRes.ok || !sessionData.token) {
        throw new Error(sessionData.error || "No se pudo obtener la sesión de Syncfy.");
      }

      const token = sessionData.token;

      // 2. Ensure CSS and JS are loaded
      const cssId = "syncfy-widget-stylesheet";
      if (!document.getElementById(cssId)) {
        const link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.href = "https://www.syncfy.com/widget/v3/syncfy-authentication-widget.css";
        document.head.appendChild(link);
      }

      if (typeof (window as any).global === "undefined") {
        (window as any).global = window;
      }

      const scriptId = "syncfy-widget-script";
      if (!(window as any).SyncfyWidget) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://www.syncfy.com/widget/v3/syncfy-authentication-widget.js";
        script.async = true;
        script.onload = () => mountSatWidget(token);
        script.onerror = () => {
          setWidgetError("Error cargando script de Syncfy.");
          setWidgetLoading(false);
        };
        document.body.appendChild(script);
      } else {
        mountSatWidget(token);
      }
    } catch (err: any) {
      console.error("[Syncfy SAT] Error inicializando widget:", err);
      setWidgetError(err.message || "Error al inicializar widget SAT.");
      setWidgetLoading(false);
    }
  };

  const mountSatWidget = (token: string, attempts = 0) => {
    try {
      const container = document.getElementById("syncfy-sat-widget-container");
      if (!container) {
        if (attempts < 20) {
          setTimeout(() => mountSatWidget(token, attempts + 1), 150);
          return;
        }
        setWidgetError("Contenedor del widget no disponible.");
        setWidgetLoading(false);
        return;
      }

      if (!(window as any).SyncfyWidget) {
        if (attempts < 20) {
          setTimeout(() => mountSatWidget(token, attempts + 1), 150);
          return;
        }
        setWidgetError("El componente SyncfyWidget no está cargado.");
        setWidgetLoading(false);
        return;
      }

      container.innerHTML = "";

      const widget = new (window as any).SyncfyWidget({
        token,
        element: "#syncfy-sat-widget-container",
        config: {
          locale: "es",
          entrypoint: {
            country: "MX",
            site: "56cf5728784806f72b8b456f", // Site oficial del SAT (CIEC) en Syncfy
          },
          navigation: {
            displayPrivacyScreen: false,
            displayBusinessSites: true,
            displayPersonalSites: true,
            saveCredential: true,
            enableBackNavigation: false,
          },
        },
      });

      widgetInstanceRef.current = widget;

      widget.on("success", async (credential: any) => {
        console.log("[Syncfy SAT Widget] Conexión SAT exitosa:", credential);
        const newCredId = credential?.id_credential;
        const newRfc = credential?.username || companyData?.rfc || "";

        try {
          // Link in backend
          await fetch("/api/syncfy/sat/link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              companyId,
              syncfyCredentialId: newCredId,
              rfc: newRfc,
            }),
          });

          setIsLinked(true);
          setSatRfc(newRfc);
          setCredentialId(newCredId);
          setWidgetOpen(false);

          // Auto-trigger initial sync
          handleTriggerSync(newCredId);
        } catch (e: any) {
          console.error("[Syncfy SAT] Error vinculando credencial:", e);
        }
      });

      widget.on("error", (cred: any, err: any) => {
        console.error("[Syncfy SAT Widget] Error:", cred, err);
      });

      widget.on("closed", () => {
        setWidgetLoading(false);
      });

      widget.open();
      setWidgetLoading(false);
    } catch (err: any) {
      console.error("[Syncfy SAT] Error montando widget:", err);
      setWidgetError(err.message || "Error al abrir la ventana del SAT.");
      setWidgetLoading(false);
    }
  };

  // Trigger CFDI Ingestion
  const handleTriggerSync = async (forcedCredId?: string) => {
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);

    try {
      const res = await fetch("/api/syncfy/sat/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          dateFrom,
          dateTo,
          type: "received",
          idCredential: forcedCredId || credentialId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al sincronizar facturas con el SAT.");
      }

      setSyncSuccess(data);
      if (onSyncComplete) {
        onSyncComplete(data);
      }
    } catch (err: any) {
      console.error("[Syncfy SAT] Error sincronizando:", err);
      setSyncError(err.message || "Error de conexión durante la sincronización.");
    } finally {
      setSyncing(false);
    }
  };

  // Unlink SAT credential
  const handleUnlink = async () => {
    if (!confirm("¿Deseas desvincular la credencial del SAT? Deberás ingresar tu contraseña CIEC de nuevo.")) {
      return;
    }

    try {
      await fetch("/api/syncfy/sat/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          action: "unlink",
        }),
      });
      setIsLinked(false);
      setCredentialId("");
      setSatRfc("");
      setSyncSuccess(null);
    } catch (err: any) {
      console.error("[Syncfy SAT] Error desvinculando:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 via-slate-50/50 to-purple-50/50 dark:from-slate-900 dark:to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/20">
              <CloudDownload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Sincronización SAT vía Syncfy
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  CIEC Directo
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Descarga automática de facturas recibidas (gastos) directo a tu buzón contable
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm text-slate-500 font-medium">Consultando estado de conexión SAT...</p>
            </div>
          ) : widgetOpen ? (
            /* Widget Container View */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-950/40 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                <div className="flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
                  <Lock className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    Portal Seguro de Conexión Syncfy con el SAT. Ingresa tu <strong>RFC</strong> y <strong>Contraseña CIEC</strong>.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setWidgetOpen(false)}
                  className="text-xs h-7 px-2 text-slate-500 hover:text-slate-800"
                >
                  Volver
                </Button>
              </div>

              {widgetLoading && (
                <div className="py-12 flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
                  <p className="text-xs text-slate-500">Cargando interfaz de acceso SAT...</p>
                </div>
              )}

              {widgetError && (
                <div className="p-3.5 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs rounded-xl flex items-center gap-2 border border-red-200 dark:border-red-900/50">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{widgetError}</span>
                </div>
              )}

              <div
                id="syncfy-sat-widget-container"
                className="w-full min-h-[460px] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950/50 shadow-inner"
              />
            </div>
          ) : !isLinked ? (
            /* Not Linked State */
            <div className="space-y-5">
              <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-indigo-950/30 dark:via-slate-900 dark:to-purple-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-400/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Conexión Directa con el Portal del SAT
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Syncfy se conecta directamente al SAT utilizando tu CIEC (RFC y contraseña del portal).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Sin vencimiento de sellos SOAP</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Descarga de XML y PDF oficial</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Actualización automática en segundo plano</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Cifrado bancario de alta seguridad</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col items-center gap-3">
                <Button
                  onClick={handleLaunchWidget}
                  size="lg"
                  className="w-full sm:w-auto px-8 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/20 h-11 rounded-xl"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  Conectar Portal SAT (CIEC)
                </Button>
                <p className="text-[11px] text-slate-400 text-center">
                  Se abrirá el asistente seguro de Syncfy para ingresar tus credenciales una sola vez.
                </p>
              </div>
            </div>
          ) : (
            /* Linked State - Sync Control Panel */
            <div className="space-y-6">
              {/* Connection Status Card */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">SAT Conectado</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Activo
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      RFC: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{satRfc || "SAT"}</span> • ID: <span className="font-mono text-[11px]">{credentialId.substring(0, 12)}...</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLaunchWidget}
                    className="text-xs h-8 gap-1.5"
                    title="Actualizar contraseña CIEC o sincronización"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reconectar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUnlink}
                    className="text-xs h-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    Desvincular
                  </Button>
                </div>
              </div>

              {/* Date Filters Card */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Período de Facturas a Descargar:
                </label>

                {/* Quick Presets */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePresetChange("7days")}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                      dateRangePreset === "7days"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    Últimos 7 días
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange("month")}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                      dateRangePreset === "month"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    Este mes
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange("30days")}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                      dateRangePreset === "30days"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    Últimos 30 días
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange("custom")}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                      dateRangePreset === "custom"
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    Personalizado
                  </button>
                </div>

                {/* Custom Date Inputs */}
                {dateRangePreset === "custom" && (
                  <div className="grid grid-cols-2 gap-3 pt-1 animate-in fade-in">
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium">Desde:</span>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="text-xs h-9 mt-1"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium">Hasta:</span>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="text-xs h-9 mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sync Feedback */}
              {syncError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs rounded-xl flex items-center gap-2.5 border border-red-200 dark:border-red-900/50">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{syncError}</span>
                </div>
              )}

              {syncSuccess && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{syncSuccess.message}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                      <div className="text-base font-extrabold text-emerald-600">{syncSuccess.imported}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Nuevas Facturas</div>
                    </div>
                    <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                      <div className="text-base font-extrabold text-indigo-600">{syncSuccess.updated}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Actualizadas</div>
                    </div>
                    <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                      <div className="text-base font-extrabold text-slate-700 dark:text-slate-300">{syncSuccess.totalFetched}</div>
                      <div className="text-[10px] text-slate-500 font-medium">Consultadas</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                <Button
                  onClick={() => handleTriggerSync()}
                  disabled={syncing}
                  size="lg"
                  className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 rounded-xl shadow-lg shadow-indigo-600/20"
                >
                  {syncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Consultando Syncfy y extrayendo CFDIs del SAT...</span>
                    </>
                  ) : (
                    <>
                      <CloudDownload className="w-4 h-4" />
                      <span>Sincronizar Facturas SAT ({dateFrom || "Inicio"} al {dateTo || "Hoy"})</span>
                    </>
                  )}
                </Button>
                {companyData?.lastSatSync && (
                  <p className="text-[11px] text-slate-400 text-center mt-2">
                    Última sincronización: {new Date(companyData.lastSatSync).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Conexión cifrada a través de Syncfy API</span>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
