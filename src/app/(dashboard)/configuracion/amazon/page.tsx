"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Settings,
  RefreshCw,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShoppingCart,
  Store,
  Layers,
  ArrowRightLeft,
  KeyRound,
  ShieldAlert
} from "lucide-react";
import {
  getAmazonSettings,
  saveAmazonSettings,
  testAmazonConnection,
  syncOrdersFromAmazon,
  AmazonSettings
} from "@/actions/amazon";

const MARKETPLACES = [
  { id: "A1AM78C64UM0Y8", name: "México (Amazon.com.mx)", region: "na" },
  { id: "ATVPDKIKX0DER", name: "Estados Unidos (Amazon.com)", region: "na" },
  { id: "A2EUQ1WTGCTBG2", name: "Canadá (Amazon.ca)", region: "na" },
  { id: "A1PA6795UKMFR9", name: "Alemania (Amazon.de)", region: "eu" },
  { id: "A1RKKUPIHCS9HS", name: "España (Amazon.es)", region: "eu" },
  { id: "A1F8U5H4MTO7H3", name: "Reino Unido (Amazon.co.uk)", region: "eu" },
  { id: "A1VC38T7YXB528", name: "Japón (Amazon.co.jp)", region: "fe" },
];

export default function AmazonIntegrationPage() {
  const { companyId } = useAuth();

  // Settings state
  const [sellerId, setSellerId] = useState("");
  const [marketplaceId, setMarketplaceId] = useState("A1AM78C64UM0Y8");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [region, setRegion] = useState<"na" | "eu" | "fe">("na");
  const [isActive, setIsActive] = useState(false);
  const [syncOrders, setSyncOrders] = useState(false);
  const [syncInventory, setSyncInventory] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingOrders, setSyncingOrders] = useState(false);

  // Messages
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [connectionError, setConnectionError] = useState("");
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncDays, setSyncDays] = useState<number>(7);

  // Auto-detect region when marketplace changes
  const handleMarketplaceChange = (mId: string) => {
    setMarketplaceId(mId);
    const found = MARKETPLACES.find(m => m.id === mId);
    if (found) {
      setRegion(found.region as "na" | "eu" | "fe");
    }
  };

  // Load saved settings
  useEffect(() => {
    if (!companyId) return;

    const loadSettings = async () => {
      try {
        const saved = await getAmazonSettings(companyId);
        if (saved) {
          setSellerId(saved.sellerId || "");
          setMarketplaceId(saved.marketplaceId || "A1AM78C64UM0Y8");
          setClientId(saved.clientId || "");
          setClientSecret(saved.clientSecret || "");
          setRefreshToken(saved.refreshToken || "");
          setRegion(saved.region || "na");
          setIsActive(!!saved.isActive);
          setSyncOrders(!!saved.syncOrders);
          setSyncInventory(!!saved.syncInventory);
          setLastSyncAt((saved as any).lastSyncAt || null);
        }
      } catch (err) {
        console.error("Error loading Amazon settings:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [companyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setSaving(true);
    setSaveResult(null);

    const payload: AmazonSettings = {
      sellerId: sellerId.trim(),
      marketplaceId,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      refreshToken: refreshToken.trim(),
      region,
      isActive,
      syncOrders,
      syncInventory
    };

    try {
      const res = await saveAmazonSettings(companyId, payload);
      if (res.success) {
        setSaveResult("Configuración guardada exitosamente.");
        setTimeout(() => setSaveResult(null), 3000);
      } else {
        alert(res.error || "Error al guardar configuración");
      }
    } catch (err: any) {
      alert("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!clientId || !clientSecret || !refreshToken) {
      alert("Por favor ingresa Client ID, Client Secret y Refresh Token antes de probar.");
      return;
    }

    setTesting(true);
    setConnectionStatus("idle");
    setConnectionError("");

    const payload: AmazonSettings = {
      sellerId: sellerId.trim(),
      marketplaceId,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      refreshToken: refreshToken.trim(),
      region,
      isActive,
      syncOrders,
      syncInventory
    };

    try {
      const res = await testAmazonConnection(payload);
      if (res.success) {
        setConnectionStatus("success");
      } else {
        setConnectionStatus("error");
        setConnectionError(res.error || "Fallo en la conexión");
      }
    } catch (err: any) {
      setConnectionStatus("error");
      setConnectionError(err.message || "Error al realizar la prueba");
    } finally {
      setTesting(false);
    }
  };

  const handleSyncOrders = async () => {
    if (!companyId) return;
    setSyncingOrders(true);
    setSyncResult(null);

    try {
      const res = await syncOrdersFromAmazon(companyId, syncDays);
      if (res.success) {
        setSyncResult(`Sincronización finalizada. Se importaron/actualizaron ${res.count} pedidos.`);
        setLastSyncAt(new Date().toISOString());
      } else {
        setSyncResult(`Error en sincronización: ${res.error}`);
      }
    } catch (err: any) {
      setSyncResult(`Error en sincronización: ${err.message}`);
    } finally {
      setSyncingOrders(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <span className="ml-2 text-sm text-slate-500 font-bold">Cargando integración de Amazon...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-2">
            <Store className="w-7 h-7 text-indigo-600" />
            Integración con Amazon Seller
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Conecta tu cuenta de Amazon Seller Central (SP-API) para sincronizar tus pedidos directamente al ERP.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing}
            className="font-bold text-xs"
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Probando...
              </>
            ) : (
              "Probar Conexión"
            )}
          </Button>
        </div>
      </div>

      {/* Info Warning */}
      <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex gap-3 text-xs text-indigo-900 leading-relaxed shadow-sm">
        <Info className="w-5 h-5 text-indigo-600 shrink-0" />
        <div>
          <span className="font-bold block mb-0.5">Direccionamiento Automático de Sucursal</span>
          Los pedidos sincronizados de Amazon se asignarán de forma automática a la sucursal de venta con el nombre <strong className="font-black text-indigo-950">"Amazon"</strong>.
          Si esta sucursal no existe en tu catálogo local, el sistema la creará con su respectivo almacén por defecto al ejecutar la primera sincronización.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <form onSubmit={handleSave} className="lg:col-span-2 space-y-6 bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 border-b pb-2 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            Credenciales de Amazon SP-API
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">Amazon Seller ID / Merchant Token</label>
              <Input
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                placeholder="Ej. A1X2Y3Z4W5V6U7"
                required
                className="rounded-xl border-slate-200 h-10 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">Marketplace de Venta</label>
              <Select value={marketplaceId} onValueChange={handleMarketplaceChange}>
                <SelectTrigger className="rounded-xl border-slate-200 h-10 text-sm bg-white">
                  <SelectValue placeholder="Selecciona Marketplace" />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {MARKETPLACES.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600">Login with Amazon (LWA) Client ID</label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="amzn1.application-oa2-client.xxxxxxxxxxxxxxxxx"
              required
              className="rounded-xl border-slate-200 h-10 text-sm font-mono"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600">LWA Client Secret</label>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••••••••••••••••••••••••••"
              required
              className="rounded-xl border-slate-200 h-10 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600">LWA Refresh Token</label>
            <Input
              type="password"
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
              placeholder="Atzr|xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              required
              className="rounded-xl border-slate-200 h-10 text-sm"
            />
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Settings className="w-4 h-4 text-indigo-600" />
              Parámetros de Sincronización
            </h3>

            <div className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors">
              <div>
                <label className="text-xs font-bold text-slate-700 block">Activar Integración</label>
                <span className="text-[10px] text-slate-400">Habilita o deshabilita la conexión con Amazon Seller.</span>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors">
              <div>
                <label className="text-xs font-bold text-slate-700 block">Sincronizar Pedidos automáticamente</label>
                <span className="text-[10px] text-slate-400">Permite importar pedidos en segundo plano usando el cron local.</span>
              </div>
              <Switch checked={syncOrders} onCheckedChange={setSyncOrders} />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors">
              <div>
                <label className="text-xs font-bold text-slate-700 block">Descontar Inventario local</label>
                <span className="text-[10px] text-slate-400">Resta unidades vendidas de tus existencias al importar un pedido.</span>
              </div>
              <Switch checked={syncInventory} onCheckedChange={setSyncInventory} />
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-4">
            {saveResult && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {saveResult}
              </span>
            )}
            <Button
              type="submit"
              disabled={saving}
              className="ml-auto bg-indigo-600 hover:bg-indigo-700 font-bold"
            >
              {saving ? "Guardando..." : "Guardar Configuración"}
            </Button>
          </div>
        </form>

        {/* Sidebar Info & Sync Panel */}
        <div className="space-y-6">
          {/* Estatus box */}
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Estado de la Conexión</h3>
            
            {connectionStatus === "success" && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2.5 text-xs text-emerald-800 font-semibold items-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                Conexión con Amazon exitosa
              </div>
            )}

            {connectionStatus === "error" && (
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex flex-col gap-1 text-xs text-rose-800 font-semibold">
                <div className="flex gap-2.5 items-center">
                  <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>Error de conexión</span>
                </div>
                <p className="text-[10px] font-mono text-rose-600 mt-1">{connectionError}</p>
              </div>
            )}

            {connectionStatus === "idle" && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex gap-2.5 text-xs text-slate-500 font-semibold items-center">
                <Link2 className="w-5 h-5 text-slate-400 shrink-0" />
                Sin conexión verificada
              </div>
            )}

            {lastSyncAt && (
              <div className="text-[10px] text-slate-400 font-semibold flex justify-between items-center border-t pt-2.5">
                <span>Último sync:</span>
                <span className="font-mono">{new Date(lastSyncAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Sync operations */}
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-600" />
              Sincronización Manual
            </h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Rango de días a importar</label>
                <Select value={syncDays.toString()} onValueChange={(v) => setSyncDays(parseInt(v))}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    <SelectItem value="1">Último día</SelectItem>
                    <SelectItem value="7">Últimos 7 días</SelectItem>
                    <SelectItem value="15">Últimos 15 días</SelectItem>
                    <SelectItem value="30">Últimos 30 días</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                onClick={handleSyncOrders}
                disabled={syncingOrders || !isActive}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs gap-1.5 h-9"
              >
                {syncingOrders ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Importar Ventas Ahora
                  </>
                )}
              </Button>

              {syncResult && (
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex gap-2 text-xs text-indigo-900 leading-relaxed font-semibold">
                  <Info className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                  <span>{syncResult}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
