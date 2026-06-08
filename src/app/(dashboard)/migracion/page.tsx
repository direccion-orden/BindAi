"use client";

import React, { useState, useEffect } from "react";
import { collection, writeBatch, doc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Database, Building, Landmark, CheckCircle2, Trash2, Package, Users, Filter, ChevronDown, ChevronUp } from "lucide-react";
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
  const [isDeletingProducts, setIsDeletingProducts] = useState(false);
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

  // Category filter state
  const [bindCategories, setBindCategories] = useState<{id: string, name: string}[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);

  // Load categories from Firestore (imported in step 6)
  useEffect(() => {
    if (!companyId) return;
    const loadCats = async () => {
      try {
        const snap = await getDocs(collection(db, "companies", companyId, "categories"));
        const cats = snap.docs.map(d => ({
          id: d.id,
          name: d.data().Title || d.data().Name || d.data().name || d.id
        })).sort((a, b) => a.name.localeCompare(b.name));
        setBindCategories(cats);
      } catch (err) {
        console.error("Error loading categories:", err);
      }
    };
    loadCats();
  }, [companyId]);

  // Helper: fetch with retry on 429 rate limits
  const fetchWithRetry = async (url: string, maxRetries = 3): Promise<Response> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url);
      if (res.status === 429 && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        addLog(`  ⏳ Rate limit alcanzado, esperando ${waitMs / 1000}s...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return res;
    }
    throw new Error('Rate limit exceeded after retries');
  };

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
        const res = await fetchWithRetry(`/api/erp/sync?endpoint=${task.endpoint}&top=${top}&skip=${skip}`);
        const jsonResponse = await res.json();
        
        if (jsonResponse.error) throw new Error(jsonResponse.error);
        let data = jsonResponse.data;
        const rawPageSize = data ? data.length : 0;

        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        // Client-side category filter for products
        if (task.id === 'products' && selectedCategoryIds.size > 0) {
          const beforeCount = data.length;
          data = data.filter((item: any) => {
            const cat1 = item.Category1ID || '';
            const cat2 = item.Category2ID || '';
            const cat3 = item.Category3ID || '';
            return selectedCategoryIds.has(cat1.toString()) || 
                   selectedCategoryIds.has(cat2.toString()) || 
                   selectedCategoryIds.has(cat3.toString());
          });
          if (beforeCount !== data.length) {
            addLog(`  -> Filtrados: ${data.length} de ${beforeCount} productos coinciden con las categorías seleccionadas.`);
          }
          if (data.length === 0) {
            skip += top;
            if (rawPageSize < top) hasMore = false;
            await new Promise(r => setTimeout(r, 300));
            continue;
          }
        }

        const batch = writeBatch(db);
        const colRef = collection(db, "companies", companyId, task.id);

        // Fetch selling prices in throttled batches of 5
        const priceMap = new Map();
        if (task.id === "products") {
          const BATCH_SIZE = 5;
          for (let i = 0; i < data.length; i += BATCH_SIZE) {
            const chunk = data.slice(i, i + BATCH_SIZE);
            await Promise.all(chunk.map(async (item: any) => {
              const itemId = item.ID || item.Id || item.id || item.Number;
              if (!itemId) return;
              try {
                const priceRes = await fetchWithRetry(`/api/erp/fetch-product-price?bindId=${itemId}`);
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
              // Campos originales del ERP por respaldo (van primero para que nuestros campos los sobreescriban)
              ...item,
              // Campos mapeados normalizados
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
                  price: price,
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
              // Campos para búsqueda cruzada con Shopify
              SKU: item.SKU || item.Code || "",
              Code: item.Code || "",
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
        if (rawPageSize < top) {
          hasMore = false;
        } else {
          // Delay between pages to respect Bind API rate limits
          await new Promise(r => setTimeout(r, 500));
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

  const deleteAllProducts = async () => {
    if (!companyId) return;
    if (!confirm("¿Estás seguro? Esto eliminará TODOS los productos de la base de datos. Las remisiones, pedidos y facturas existentes conservarán los nombres de producto pero perderán la referencia al catálogo.")) return;
    
    setIsDeletingProducts(true);
    addLog("🗑️ Iniciando borrado de productos...");
    
    try {
      const colRef = collection(db, "companies", companyId, "products");
      let totalDeleted = 0;
      let hasMore = true;
      
      while (hasMore) {
        const snap = await getDocs(colRef);
        
        if (snap.empty) {
          hasMore = false;
          break;
        }
        
        // Firestore batch limit is 500
        const docsToDelete = snap.docs.slice(0, 500);
        const batch = writeBatch(db);
        docsToDelete.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
        totalDeleted += docsToDelete.length;
        addLog(`  -> ${totalDeleted} productos eliminados...`);
        
        if (snap.docs.length <= 500) {
          hasMore = false;
        }
      }
      
      addLog(`✅ Borrado de productos completado. ${totalDeleted} productos eliminados.`);
      setTasks(prev => prev.map(t => t.id === "products" ? { ...t, completed: false } : t));
    } catch (e: any) {
      addLog(`❌ Error al borrar productos: ${e.message}`);
    } finally {
      setIsDeletingProducts(false);
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
        
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-orange-500 text-orange-600 hover:bg-orange-50" onClick={deleteAllProducts} disabled={isDeletingProducts || isNuking || !companyId}>
            {isDeletingProducts ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Package className="w-4 h-4 mr-2" />}
            Limpiar Productos
          </Button>
          <Button variant="destructive" onClick={nukeDatabase} disabled={isNuking || isDeletingProducts || !companyId}>
            {isNuking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Limpiar Datos de Prueba
          </Button>
        </div>
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
              <React.Fragment key={task.id}>
                {/* Category filter panel - only shown before the products card */}
                {task.id === 'products' && bindCategories.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full text-left font-bold text-sm text-amber-800"
                      onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                    >
                      <Filter className="w-4 h-4" />
                      Filtrar por Categoría ({selectedCategoryIds.size > 0 ? `${selectedCategoryIds.size} seleccionadas` : 'Sin filtro — Todas'})
                      {showCategoryFilter ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                    </button>
                    {showCategoryFilter && (
                      <div className="space-y-2">
                        <div className="flex gap-2 mb-2">
                          <Button type="button" variant="outline" size="sm" className="text-xs"
                            onClick={() => setSelectedCategoryIds(new Set(bindCategories.map(c => c.id)))}>
                            Seleccionar todas
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="text-xs"
                            onClick={() => setSelectedCategoryIds(new Set())}>
                            Limpiar selección
                          </Button>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg bg-white p-2">
                          {bindCategories.map(cat => (
                            <label key={cat.id} className="flex items-center gap-2 text-xs py-1 px-1 hover:bg-amber-50 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedCategoryIds.has(cat.id)}
                                onChange={(e) => {
                                  const next = new Set(selectedCategoryIds);
                                  if (e.target.checked) next.add(cat.id);
                                  else next.delete(cat.id);
                                  setSelectedCategoryIds(next);
                                }}
                                className="rounded border-amber-300"
                              />
                              <span className="text-slate-700">{cat.name}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-[10px] text-amber-700">
                          {selectedCategoryIds.size === 0
                            ? 'Sin filtro: se importarán TODOS los productos de Bind ERP.'
                            : `Se importarán solo productos de ${selectedCategoryIds.size} categoría(s) seleccionada(s).`
                          }
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <Card className={task.completed ? "border-green-500 bg-green-50/30" : ""}>
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
              </React.Fragment>
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
