"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { collection, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { 
  Loader2, 
  Settings, 
  RefreshCw, 
  Link2, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  MapPin,
  Store,
  Layers,
  ArrowRightLeft
} from "lucide-react";
import { 
  getShopifySettings, 
  saveShopifySettings, 
  testShopifyConnection, 
  registerShopifyWebhooksAction,
  syncProductsFromShopify,
  ShopifySettings
} from "@/actions/shopify";

interface ERPWarehouse {
  id: string;
  name: string;
}

export default function ShopifyIntegrationPage() {
  const { companyId } = useAuth();

  // Settings state
  const [shopName, setShopName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [syncInventory, setSyncInventory] = useState(false);
  const [syncOrders, setSyncOrders] = useState(false);
  const [locationMappings, setLocationMappings] = useState<Record<string, string>>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [registeringWebhooks, setRegisteringWebhooks] = useState(false);
  const [shopifyLocations, setShopifyLocations] = useState<any[]>([]);
  const [erpWarehouses, setErpWarehouses] = useState<ERPWarehouse[]>([]);

  // Messages
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [connectionError, setConnectionError] = useState("");
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [webhookResult, setWebhookResult] = useState<string | null>(null);

  // Load ERP Warehouses and saved settings
  useEffect(() => {
    if (!companyId) return;

    // Fetch Warehouses
    const qW = query(collection(db, "companies", companyId, "warehouses"));
    const unsubW = onSnapshot(qW, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().name || "Almacén Sin Nombre" 
      }));
      setErpWarehouses(data);
    });

    // Fetch Saved Shopify Settings
    const loadSettings = async () => {
      try {
        const saved = await getShopifySettings(companyId);
        if (saved) {
          setShopName(saved.shopName || "");
          setAccessToken(saved.accessToken || "");
          setWebhookSecret(saved.webhookSecret || "");
          setIsActive(!!saved.isActive);
          setSyncInventory(!!saved.syncInventory);
          setSyncOrders(!!saved.syncOrders);
          setLocationMappings(saved.locationMappings || {});

          // Fetch Shopify locations if connected
          if (saved.shopName && saved.accessToken) {
            const res = await testShopifyConnection(saved.shopName, saved.accessToken);
            if (res.success && res.locations) {
              setShopifyLocations(res.locations);
              setConnectionStatus("success");
            }
          }
        }
      } catch (err) {
        console.error("Error loading settings:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();

    return () => {
      unsubW();
    };
  }, [companyId]);

  const handleTestConnection = async () => {
    if (!shopName || !accessToken) {
      alert("Por favor ingresa el nombre de la tienda y el Token de Acceso.");
      return;
    }
    setTesting(true);
    setConnectionStatus("idle");
    setConnectionError("");
    try {
      const res = await testShopifyConnection(shopName, accessToken);
      if (res.success && res.locations) {
        setShopifyLocations(res.locations);
        setConnectionStatus("success");
      } else {
        setConnectionStatus("error");
        setConnectionError(res.error || "Error desconocido");
      }
    } catch (e: any) {
      setConnectionStatus("error");
      setConnectionError(e.message || "Failed to reach server");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setSaving(true);
    try {
      const settingsPayload: ShopifySettings = {
        shopName,
        accessToken,
        webhookSecret,
        isActive,
        syncInventory,
        syncOrders,
        locationMappings
      };

      const res = await saveShopifySettings(companyId, settingsPayload);
      if (res.success) {
        alert("Configuración de Shopify guardada exitosamente.");
      } else {
        alert(`Error al guardar: ${res.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSyncProducts = async () => {
    if (!companyId) return;
    if (!window.confirm("¿Deseas iniciar la importación manual de productos de Shopify? Esto agregará o actualizará los productos existentes.")) return;

    setSyncingProducts(true);
    setSyncResult(null);
    try {
      const res = await syncProductsFromShopify(companyId);
      if (res.success) {
        setSyncResult(`Sincronización completada. Se importaron/actualizaron ${res.count} productos exitosamente.`);
      } else {
        setSyncResult(`Error en la sincronización: ${res.error}`);
      }
    } catch (err: any) {
      setSyncResult(`Error: ${err.message}`);
    } finally {
      setSyncingProducts(false);
    }
  };

  const handleRegisterWebhooks = async () => {
    if (!companyId) return;
    setRegisteringWebhooks(true);
    setWebhookResult(null);
    try {
      const publicUrl = window.location.origin;
      const res = await registerShopifyWebhooksAction(companyId, publicUrl);
      if (res.success) {
        setWebhookResult(`Webhooks registrados correctamente:\n${res.registered?.join("\n")}`);
      } else {
        setWebhookResult(`Error al registrar webhooks: ${res.error}`);
      }
    } catch (err: any) {
      setWebhookResult(`Error: ${err.message}`);
    } finally {
      setRegisteringWebhooks(false);
    }
  };

  const handleMapLocation = (shopifyLocId: string, erpWarehouseId: string) => {
    setLocationMappings(prev => ({
      ...prev,
      [shopifyLocId]: erpWarehouseId
    }));
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
          <div className="w-12 h-12 rounded-2xl bg-[#96bf48]/10 text-[#7ba53c] flex items-center justify-center shadow-inner">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Integración con Shopify</h1>
            <p className="text-muted-foreground">
              Conecta tu canal de ventas en línea para sincronizar catálogo, stock e ingresos.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Credentials Form (7 cols) */}
        <form onSubmit={handleSaveSettings} className="lg:col-span-7 space-y-6">
          
          {/* Card 1: Connection Credentials */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
              <Settings className="w-5 h-5 text-slate-400" /> Credenciales de Conexión
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre de la Tienda de Shopify (Shop URL)</label>
                <div className="flex gap-2">
                  <Input 
                    required
                    value={shopName}
                    onChange={e => setShopName(e.target.value)}
                    placeholder="ej. mi-tienda.myshopify.com"
                    className="flex-1"
                  />
                  <Button 
                    type="button" 
                    variant="secondary"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="gap-2"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Probar Conexión
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ingresa tu subdominio de Shopify o el host completo (ej. `empresa.myshopify.com`).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Shopify Admin API Access Token</label>
                <Input 
                  required
                  type="password"
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                  placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <p className="text-xs text-muted-foreground">
                  El token de acceso API creado en la configuración de Apps del panel de administración de tu tienda Shopify.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Shopify Webhook Secret (Opcional)</label>
                <Input 
                  type="password"
                  value={webhookSecret}
                  onChange={e => setWebhookSecret(e.target.value)}
                  placeholder="Secreto de firma de webhooks"
                />
                <p className="text-xs text-muted-foreground">
                  Requerido para la autenticación de webhook firma HMAC. Se obtiene en la sección de Notificaciones de Shopify.
                </p>
              </div>
            </div>

            {/* Connection feedback message */}
            {connectionStatus === "success" && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span>¡Conexión establecida con Shopify de manera exitosa! Se cargaron las ubicaciones.</span>
              </div>
            )}

            {connectionStatus === "error" && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Error de conexión:</p>
                  <p className="text-xs">{connectionError}</p>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Sync Rules & Settings */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-slate-400" /> Reglas de Sincronización
            </h3>

            <div className="space-y-4">
              
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <label className="text-sm font-bold block">Integración Activa</label>
                  <span className="text-xs text-muted-foreground">Activa o desactiva la sincronización con Shopify de forma global.</span>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <label className="text-sm font-bold block">Sincronizar Stock de Inventario</label>
                  <span className="text-xs text-muted-foreground">Actualiza el inventario en Shopify cada vez que ocurra un movimiento físico o venta en el POS.</span>
                </div>
                <Switch checked={syncInventory} onCheckedChange={setSyncInventory} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-bold block">Importar Ventas y Pedidos</label>
                  <span className="text-xs text-muted-foreground">Carga las órdenes generadas en Shopify como Pedidos automáticos en tu ERP.</span>
                </div>
                <Switch checked={syncOrders} onCheckedChange={setSyncOrders} />
              </div>

            </div>
          </div>

          {/* Card 3: Location Mappings */}
          {shopifyLocations.length > 0 && (
            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-slate-400" /> Mapeo de Ubicaciones a Almacenes
              </h3>
              <p className="text-xs text-muted-foreground">
                Asigna cada sucursal/almacén físico de Shopify a su correspondiente almacén de inventario dentro del ERP.
              </p>

              <div className="space-y-3">
                {shopifyLocations.map((loc) => (
                  <div key={loc.id} className="flex flex-col sm:flex-row sm:items-center justify-between border p-3 rounded-lg bg-slate-50 gap-4">
                    <div>
                      <p className="text-sm font-bold">{loc.name}</p>
                      <p className="text-[10px] text-slate-500">{loc.address1 || "Sin dirección física"}</p>
                    </div>

                    <div className="w-full sm:w-60">
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={locationMappings[loc.id] || ""}
                        onChange={(e) => handleMapLocation(loc.id, e.target.value)}
                      >
                        <option value="">-- Seleccionar Almacén --</option>
                        {erpWarehouses.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form Submit Footer */}
          <div className="flex justify-end gap-3">
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

        {/* Right Side: Maintenance Controls & Info (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Card 4: Operations & Sync triggers */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg border-b pb-2 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-slate-400" /> Operaciones de Sincronización
            </h3>

            <div className="space-y-4">
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 font-bold justify-start"
                  onClick={handleSyncProducts}
                  disabled={syncingProducts || connectionStatus !== "success"}
                >
                  {syncingProducts ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                  Importar Catálogo Completo
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1.5 pl-1.5">
                  Descarga todos los productos, variantes y precios desde Shopify y los carga/actualiza en el inventario del ERP.
                </p>
              </div>

              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 font-bold justify-start"
                  onClick={handleRegisterWebhooks}
                  disabled={registeringWebhooks || connectionStatus !== "success"}
                >
                  {registeringWebhooks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Registrar Webhooks en Shopify
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1.5 pl-1.5">
                  Establece la sincronización en tiempo real. Shopify notificará al ERP sobre cada venta o cambio de producto al instante.
                </p>
              </div>
            </div>

            {/* Operation outputs */}
            {syncResult && (
              <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono whitespace-pre-wrap border border-slate-800">
                {syncResult}
              </div>
            )}

            {webhookResult && (
              <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono whitespace-pre-wrap border border-slate-800">
                {webhookResult}
              </div>
            )}
          </div>

          {/* Card 5: Shopify Helper Card */}
          <div className="bg-[#96bf48]/10 border border-[#96bf48]/20 p-6 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-[#7ba53c] font-bold">
              <Info className="w-5 h-5" />
              <span>¿Cómo crear tus credenciales?</span>
            </div>
            
            <ol className="text-xs text-slate-850 space-y-2 list-decimal pl-4 leading-relaxed">
              <li>Ingresa a tu administrador de Shopify.</li>
              <li>Ve a **Configuración &gt; Apps y canales de venta**.</li>
              <li>Haz clic en **Desarrollar apps** en la esquina superior derecha.</li>
              <li>Crea una app y otorga permisos de lectura/escritura a:
                <br />
                <span className="font-mono bg-white/50 px-1 rounded">write_products</span>, 
                <span className="font-mono bg-white/50 px-1 rounded">read_inventory</span>,
                <span className="font-mono bg-white/50 px-1 rounded">write_inventory</span>,
                <span className="font-mono bg-white/50 px-1 rounded">read_orders</span>,
                <span className="font-mono bg-white/50 px-1 rounded">write_orders</span>
              </li>
              <li>Instala la app para obtener el **Admin API Access Token**.</li>
            </ol>
          </div>

        </div>

      </div>

    </div>
  );
}
