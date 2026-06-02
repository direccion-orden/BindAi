"use client";

import React, { useState } from "react";
import { collection, writeBatch, doc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Database, Building, Landmark, CheckCircle2, Trash2, Package, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SyncTask = {
  id: string;
  title: string;
  endpoint: string;
  icon: React.ReactNode;
  completed: boolean;
  phase: number;
};

export default function MigrationPage() {
  const { companyId } = useAuth();
  const [loadingTask, setLoadingTask] = useState<string | null>(null);
  const [isNuking, setIsNuking] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const [tasks, setTasks] = useState<SyncTask[]>([
    // Fase 1
    { id: "locations", title: "1. Sucursales (Locations)", endpoint: "Locations", icon: <Building className="w-5 h-5 text-blue-500" />, completed: false, phase: 1 },
    { id: "banks", title: "2. Bancos (Banks)", endpoint: "Banks", icon: <Landmark className="w-5 h-5 text-indigo-500" />, completed: false, phase: 1 },
    { id: "bankAccounts", title: "3. Cuentas Bancarias", endpoint: "BankAccounts", icon: <Landmark className="w-5 h-5 text-green-500" />, completed: false, phase: 1 },
    // Fase 2
    { id: "vendors", title: "4. Proveedores (Providers)", endpoint: "Providers", icon: <Users className="w-5 h-5 text-amber-500" />, completed: false, phase: 2 },
    { id: "clients", title: "5. Clientes (Clients)", endpoint: "Clients", icon: <Users className="w-5 h-5 text-emerald-500" />, completed: false, phase: 2 },
    { id: "categories", title: "6. Familias (Categories)", endpoint: "Categories", icon: <Database className="w-5 h-5 text-purple-500" />, completed: false, phase: 2 },
    { id: "products", title: "7. Productos (Products)", endpoint: "Products", icon: <Package className="w-5 h-5 text-rose-500" />, completed: false, phase: 2 },
  ]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const runSync = async (task: SyncTask) => {
    if (!companyId) return;
    setLoadingTask(task.id);
    addLog(`Iniciando sincronización de ${task.title}...`);

    try {
      let skip = 0;
      const top = 100;
      let hasMore = true;
      let totalSynced = 0;

      while (hasMore) {
        const res = await fetch(`/api/erp/sync?endpoint=${task.endpoint}&top=${top}&skip=${skip}`);
        const jsonResponse = await res.json();
        
        if (jsonResponse.error) throw new Error(jsonResponse.error);
        const data = jsonResponse.data;

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        const batch = writeBatch(db);
        const colRef = collection(db, "companies", companyId, task.id);

        // Si es la colección de productos, cargamos los precios de venta en paralelo para el lote
        const priceMap = new Map();
        if (task.id === "products") {
          await Promise.all(data.map(async (item: any) => {
            const itemId = item.ID || item.Id || item.id || item.Number;
            if (!itemId) return;
            try {
              const priceRes = await fetch(`/api/erp/fetch-product-price?bindId=${itemId}`);
              if (priceRes.ok) {
                const priceJson = await priceRes.json();
                if (priceJson.price > 0) {
                  priceMap.set(itemId.toString(), priceJson.price);
                }
              }
            } catch (err) {
              console.error("Error fetching price for", itemId, err);
            }
          }));
        }

        data.forEach((item: any) => {
          const itemId = item.ID || item.Id || item.id || item.Number; 
          if (!itemId) return;
          const docRef = doc(colRef, itemId.toString());
          
          if (task.id === "products") {
            const title = item.Title || item.Code || "Sin título";
            const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const cost = parseFloat(item.Cost) || 0;
            
            // Usar el precio de venta real del mapa, o el costo como fallback
            const price = priceMap.get(itemId.toString()) || cost;
            
            const mappedProduct = {
              title: title,
              handle: handle,
              bodyHtml: item.Description || "",
              vendor: "Bind ERP",
              productType: item.TypeText || "",
              status: 'ACTIVE',
              tags: [],
              currency: item.CurrencyCode || "MXN",
              cost: cost,
              iva: item.ChargeVAT ? 16 : 0,
              variants: [
                {
                  id: `var-${itemId}`,
                  title: "Default Title",
                  price: price, // Usamos el precio de venta real mapeado
                  sku: item.SKU || item.Code || "",
                  barcode: item.Code || "",
                  inventoryQuantity: item.CurrentInventory || 0,
                  weight: parseFloat(item.Weight) || 0,
                }
              ],
              options: [
                { id: "opt-1", name: "Title", values: ["Default Title"] }
              ],
              images: [],
              updatedAt: new Date(),
              // Mantenemos también los campos originales del ERP por respaldo
              ...item
            };
            batch.set(docRef, mappedProduct, { merge: true });
          } else {
            batch.set(docRef, item, { merge: true });
          }
        });

        await batch.commit();
        totalSynced += data.length;
        addLog(`  -> Sincronizados ${totalSynced} registros...`);
        
        skip += top;
        if (data.length < top) {
          hasMore = false;
        }
      }

      addLog(`✅ Sincronización completada: ${task.title} (${totalSynced} registros).`);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: true } : t));
    } catch (e: any) {
      console.error(e);
      addLog(`❌ Error en ${task.title}: ${e.message}`);
    } finally {
      setLoadingTask(null);
    }
  };

  const nukeDatabase = async () => {
    if (!companyId) return;
    if (!confirm("¿ESTÁS SEGURO? Esto borrará todos los catálogos y transacciones de prueba de esta empresa para dejarla en limpio. No hay marcha atrás.")) return;
    
    setIsNuking(true);
    addLog("⚠️ INICIANDO BORRADO MASIVO (NUKE)...");
    
    const collectionsToWipe = ["locations", "banks", "bankAccounts", "clients", "vendors", "providers", "products", "categories", "orders", "invoices", "remissions", "payments"];
    
    try {
      for (const col of collectionsToWipe) {
        addLog(`Borrando colección: ${col}...`);
        const colRef = collection(db, "companies", companyId, col);
        const snap = await getDocs(colRef);
        
        if (!snap.empty) {
          const batch = writeBatch(db);
          snap.docs.forEach(docSnap => {
            batch.delete(docSnap.ref);
          });
          await batch.commit();
          addLog(`  -> ${snap.size} documentos eliminados en ${col}.`);
        } else {
          addLog(`  -> Colección ${col} ya estaba vacía.`);
        }
      }
      addLog("✅ BORRADO MASIVO COMPLETADO. Base de datos limpia.");
      setTasks(prev => prev.map(t => ({ ...t, completed: false })));
    } catch (e: any) {
      addLog(`❌ Error durante borrado: ${e.message}`);
    } finally {
      setIsNuking(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Database className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Consola de Migración ERP</h1>
            <p className="text-muted-foreground">
              Sincronización masiva desde Bind ERP hacia la base de datos nativa.
            </p>
          </div>
        </div>
        
        <Button variant="destructive" onClick={nukeDatabase} disabled={isNuking || !companyId}>
          {isNuking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
          Limpiar Datos de Prueba
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Fase 1: Arquitectura Base</h2>
            {tasks.filter(t => t.phase === 1).map(task => (
              <Card key={task.id} className={task.completed ? "border-green-500 bg-green-50/30" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center space-x-3">
                    {task.completed ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : task.icon}
                    <CardTitle className="text-base">{task.title}</CardTitle>
                  </div>
                  <Button 
                    variant={task.completed ? "outline" : "default"}
                    size="sm"
                    onClick={() => runSync(task)} 
                    disabled={loadingTask !== null || !companyId}
                  >
                    {loadingTask === task.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {task.completed ? "Re-sincronizar" : "Sincronizar"}
                  </Button>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Extrae datos de <code>/{task.endpoint}</code> en Bind y guarda en <code>/{task.id}</code>
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Fase 2: Red Comercial</h2>
            {tasks.filter(t => t.phase === 2).map(task => (
              <Card key={task.id} className={task.completed ? "border-green-500 bg-green-50/30" : ""}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center space-x-3">
                    {task.completed ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : task.icon}
                    <CardTitle className="text-base">{task.title}</CardTitle>
                  </div>
                  <Button 
                    variant={task.completed ? "outline" : "default"}
                    size="sm"
                    onClick={() => runSync(task)} 
                    disabled={loadingTask !== null || !companyId}
                  >
                    {loadingTask === task.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {task.completed ? "Re-sincronizar" : "Sincronizar"}
                  </Button>
                </CardHeader>
                <CardContent>
                  <CardDescription>
                    Extrae datos de <code>/{task.endpoint}</code> en Bind y guarda en <code>/{task.id}</code>
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <Card className="h-full bg-slate-950 text-slate-50 border-slate-800">
            <CardHeader>
              <CardTitle>Terminal de Sincronización</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] overflow-y-auto font-mono text-sm space-y-1">
                {logs.length === 0 ? (
                  <span className="text-slate-500">Esperando ejecución...</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className={log.includes("❌") ? "text-red-400" : log.includes("✅") ? "text-green-400" : log.includes("⚠️") ? "text-yellow-400" : "text-slate-300"}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
