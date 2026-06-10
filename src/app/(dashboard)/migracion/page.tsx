"use client";

import React, { useState, useEffect, useRef } from "react";
import { collection, writeBatch, doc, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Database, Building, Landmark, CheckCircle2, Trash2, Package, Users, Filter, ChevronDown, ChevronUp, Play, Sparkles } from "lucide-react";
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
  const [overallProgress, setOverallProgress] = useState<{ current: number; total: number } | null>(null);

  const [tasks, setTasks] = useState<SyncTask[]>([
    // Fase 1
    { id: "locations", title: "1. Sucursales (Locations)", endpoint: "Locations", icon: <Building className="w-5 h-5 text-indigo-500" />, completed: false, phase: 1 },
    { id: "banks", title: "2. Bancos (Banks)", endpoint: "Banks", icon: <Landmark className="w-5 h-5 text-purple-500" />, completed: false, phase: 1 },
    { id: "bankAccounts", title: "3. Cuentas Bancarias", endpoint: "BankAccounts", icon: <Landmark className="w-5 h-5 text-pink-500" />, completed: false, phase: 1 },
    // Fase 2
    { id: "vendors", title: "4. Proveedores (Providers)", endpoint: "Providers", icon: <Users className="w-5 h-5 text-amber-500" />, completed: false, phase: 2 },
    { id: "clients", title: "5. Clientes (Clients)", endpoint: "Clients", icon: <Users className="w-5 h-5 text-teal-500" />, completed: false, phase: 2 },
    { id: "categories", title: "6. Familias (Categories)", endpoint: "Categories", icon: <Database className="w-5 h-5 text-blue-500" />, completed: false, phase: 2 },
    { id: "products", title: "7. Productos (Products)", endpoint: "Products", icon: <Package className="w-5 h-5 text-rose-500" />, completed: false, phase: 2 },
  ]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // Terminal Auto-scroll
  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Category filter state
  const [bindCategories, setBindCategories] = useState<{ id: string; name: string }[]>([]);
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

  const runSync = async (task: SyncTask): Promise<boolean> => {
    if (!companyId) return false;
    setLoadingTask(task.id);
    addLog(`Iniciando sincronización de ${task.title}...`);

    try {
      let skip = 0;
      const top = 100;
      let hasMore = true;
      let totalSynced = 0;

      // Load existing products to prevent overwriting variants/images
      const existingProductsMap = new Map();
      if (task.id === "products") {
        try {
          addLog("  🔍 Obteniendo catálogo local existente para evitar sobreescritura de variantes e imágenes...");
          const q = collection(db, "companies", companyId, "products");
          const snap = await getDocs(q);
          snap.docs.forEach(docSnap => {
            existingProductsMap.set(docSnap.id, docSnap.data());
          });
          addLog(`  🔍 Listo. Encontrados ${snap.size} productos locales.`);
        } catch (err: any) {
          console.error("Error loading local products:", err);
          addLog(`  ⚠️ No se pudieron cargar los productos locales: ${err.message}. Se continuará la importación básica.`);
        }
      }

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

            const existingProduct = existingProductsMap.get(itemId.toString());
            const existingImages = existingProduct?.images || [];
            const existingVariants = existingProduct?.variants || [];
            const existingOptions = existingProduct?.options || [{ id: "opt-1", name: "Title", values: ["Default Title"] }];
            const existingTags = existingProduct?.tags || [];
            const existingStatus = existingProduct?.status || 'ACTIVE';
            
            let variants = [];
            if (existingVariants.length === 0) {
              variants = [
                {
                  id: `var-${itemId}`,
                  title: "Default Title",
                  price: price,
                  sku: item.SKU || item.Code || "",
                  barcode: item.Code || "",
                  inventoryQuantity: item.CurrentInventory || 0,
                  weight: parseFloat(item.Weight) || 0,
                }
              ];
            } else if (existingVariants.length === 1) {
              const singleVar = { ...existingVariants[0] };
              singleVar.sku = item.SKU || item.Code || singleVar.sku || "";
              singleVar.barcode = item.Code || singleVar.barcode || "";
              singleVar.price = singleVar.price !== undefined && singleVar.price > 0 ? singleVar.price : price;
              singleVar.inventoryQuantity = item.CurrentInventory !== undefined ? item.CurrentInventory : (singleVar.inventoryQuantity || 0);
              singleVar.weight = parseFloat(item.Weight) || singleVar.weight || 0;
              variants = [singleVar];
            } else {
              // Multiple variants exist: match by SKU or barcode, or update first variant
              const bindSku = (item.SKU || item.Code || "").trim().toLowerCase();
              const bindBarcode = (item.Code || "").trim().toLowerCase();
              let matchedIndex = existingVariants.findIndex((v: any) => 
                (v.sku && v.sku.trim().toLowerCase() === bindSku) ||
                (v.barcode && v.barcode.trim().toLowerCase() === bindBarcode)
              );
              
              if (matchedIndex === -1) matchedIndex = 0;
              
              variants = existingVariants.map((v: any, idx: number) => {
                if (idx === matchedIndex) {
                  return {
                    ...v,
                    sku: item.SKU || item.Code || v.sku || "",
                    barcode: item.Code || v.barcode || "",
                    price: v.price !== undefined && v.price > 0 ? v.price : price,
                    inventoryQuantity: item.CurrentInventory !== undefined ? item.CurrentInventory : (v.inventoryQuantity || 0),
                    weight: parseFloat(item.Weight) || v.weight || 0,
                  };
                }
                return v;
              });
            }
            
            const mappedProduct = {
              ...item,
              title: title,
              handle: handle,
              bodyHtml: item.Description || existingProduct?.bodyHtml || "",
              vendor: "Bind ERP",
              productType: item.TypeText || existingProduct?.productType || "",
              status: existingStatus,
              tags: existingTags,
              currency: item.CurrencyCode || "MXN",
              cost: cost,
              iva: item.ChargeVAT ? 16 : 0,
              variants: variants,
              options: existingOptions,
              images: existingImages,
              updatedAt: new Date(),
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
      return true;
    } catch (e: any) {
      console.error(e);
      addLog(`❌ Error en ${task.title}: ${e.message}`);
      return false;
    } finally {
      setLoadingTask(null);
    }
  };

  const syncAllTasks = async () => {
    if (!companyId) return;
    addLog("🚀 Iniciando sincronización secuencial de todos los catálogos en orden...");
    setOverallProgress({ current: 0, total: tasks.length });

    let count = 0;
    for (const task of tasks) {
      addLog(`[Paso ${count + 1}/${tasks.length}] Sincronizando: ${task.title}...`);
      const success = await runSync(task);
      if (!success) {
        addLog(`⚠️ Sincronización interrumpida debido a error en: ${task.title}`);
        break;
      }
      count++;
      setOverallProgress({ current: count, total: tasks.length });
      // Small pause to yield to event loop and keep rate limits safe
      await new Promise(r => setTimeout(r, 1000));
    }

    if (count === tasks.length) {
      addLog("🎉 ¡Sincronización masiva de catálogos finalizada de forma exitosa!");
    } else {
      addLog("❌ La sincronización masiva se detuvo antes de finalizar.");
    }

    // Hide progress bar after 4 seconds
    setTimeout(() => {
      setOverallProgress(null);
    }, 4000);
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

  const percentProgress = overallProgress 
    ? Math.round((overallProgress.current / overallProgress.total) * 100)
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header and Sync Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 shadow-inner">
            <Database className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Consola de Migración ERP
            </h1>
            <p className="text-muted-foreground mt-0.5">
              Sincronización en tiempo real desde Bind ERP hacia tu base de datos integrada.
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          <Button 
            onClick={syncAllTasks}
            disabled={loadingTask !== null || isNuking || isDeletingProducts || !companyId}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 shadow-md hover:shadow-indigo-500/10 transition-all duration-300 gap-2 rounded-xl"
          >
            {loadingTask && overallProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Sincronizar Todo
          </Button>

          <Button 
            variant="outline" 
            className="border-orange-200 text-orange-600 hover:bg-orange-50 font-medium rounded-xl transition-all" 
            onClick={deleteAllProducts} 
            disabled={isDeletingProducts || isNuking || !companyId}
          >
            {isDeletingProducts ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Package className="w-4 h-4 mr-2" />}
            Limpiar Productos
          </Button>
          
          <Button 
            variant="destructive" 
            className="font-medium rounded-xl transition-all"
            onClick={nukeDatabase} 
            disabled={isNuking || isDeletingProducts || !companyId}
          >
            {isNuking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Limpiar Datos de Prueba
          </Button>
        </div>
      </div>

      {/* Overall Progress Bar */}
      {overallProgress && (
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/60 dark:border-slate-800/60 rounded-2xl p-5 shadow-sm space-y-3 transition-all duration-500 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center text-sm font-semibold">
            <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 animate-pulse">
              <Sparkles className="w-4 h-4" />
              Sincronización en curso
            </span>
            <span className="text-slate-600 dark:text-slate-400">
              {overallProgress.current} de {overallProgress.total} catálogos completados ({percentProgress}%)
            </span>
          </div>
          <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/20 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 rounded-full shadow-lg"
              style={{ width: `${percentProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left column: Tasks list */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Phase 1 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 rounded">Fase 1</span>
              <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-200">Arquitectura Base</h2>
            </div>
            
            <div className="grid gap-3">
              {tasks.filter(t => t.phase === 1).map(task => {
                const isActive = loadingTask === task.id;
                return (
                  <Card 
                    key={task.id} 
                    className={`transition-all duration-300 rounded-2xl border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md ${
                      task.completed ? "border-emerald-500/40 bg-emerald-50/10 dark:bg-emerald-950/5 dark:border-emerald-500/20" : ""
                    } ${isActive ? "ring-2 ring-indigo-500 animate-pulse border-indigo-500" : ""}`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                      <div className="flex items-center space-x-3.5">
                        <div className={`p-2 rounded-xl border transition-colors ${
                          task.completed ? "bg-emerald-100/50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200/30" : "bg-slate-100 dark:bg-slate-800 border-slate-200/20 text-slate-600"
                        }`}>
                          {task.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : task.icon}
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-200">{task.title}</CardTitle>
                          <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Extrae de <code>/{task.endpoint}</code> y guarda en <code>/{task.id}</code>
                          </CardDescription>
                        </div>
                      </div>
                      <Button 
                        variant={task.completed ? "outline" : "default"}
                        size="sm"
                        onClick={() => runSync(task)} 
                        disabled={loadingTask !== null || !companyId}
                        className={`font-semibold rounded-lg text-xs ${
                          task.completed ? "border-emerald-200/60 text-emerald-600 hover:bg-emerald-50/50" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                        }`}
                      >
                        {isActive ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                        {task.completed ? "Re-sincronizar" : "Sincronizar"}
                      </Button>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Phase 2 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 rounded">Fase 2</span>
              <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-200">Red Comercial</h2>
            </div>
            
            <div className="grid gap-3">
              {tasks.filter(t => t.phase === 2).map(task => {
                const isActive = loadingTask === task.id;
                return (
                  <React.Fragment key={task.id}>
                    {/* Category filter panel - only shown before the products card */}
                    {task.id === 'products' && bindCategories.length > 0 && (
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4.5 space-y-3 shadow-inner">
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full text-left font-bold text-sm text-amber-700 dark:text-amber-400 focus:outline-none"
                          onClick={() => setShowCategoryFilter(!showCategoryFilter)}
                        >
                          <Filter className="w-4 h-4 text-amber-500" />
                          Filtrar por Categoría ({selectedCategoryIds.size > 0 ? `${selectedCategoryIds.size} seleccionadas` : 'Sin filtro — Todas'})
                          {showCategoryFilter ? <ChevronUp className="w-4 h-4 ml-auto text-amber-500" /> : <ChevronDown className="w-4 h-4 ml-auto text-amber-500" />}
                        </button>
                        {showCategoryFilter && (
                          <div className="space-y-2.5 animate-in fade-in-20 duration-200">
                            <div className="flex gap-2">
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="text-xs h-7 border-amber-200/50 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-slate-700 dark:text-slate-300"
                                onClick={() => setSelectedCategoryIds(new Set(bindCategories.map(c => c.id)))}
                              >
                                Seleccionar todas
                              </Button>
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                className="text-xs h-7 border-amber-200/50 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-slate-700 dark:text-slate-300"
                                onClick={() => setSelectedCategoryIds(new Set())}
                              >
                                Limpiar selección
                              </Button>
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-amber-200/20 rounded-xl bg-white dark:bg-slate-900 p-2.5 shadow-sm">
                              {bindCategories.map(cat => (
                                <label key={cat.id} className="flex items-center gap-2.5 text-xs py-1.5 px-2 hover:bg-amber-50 dark:hover:bg-amber-950/20 rounded-lg cursor-pointer transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={selectedCategoryIds.has(cat.id)}
                                    onChange={(e) => {
                                      const next = new Set(selectedCategoryIds);
                                      if (e.target.checked) next.add(cat.id);
                                      else next.delete(cat.id);
                                      setSelectedCategoryIds(next);
                                    }}
                                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer"
                                  />
                                  <span className="text-slate-700 dark:text-slate-300 font-medium">{cat.name}</span>
                                </label>
                              ))}
                            </div>
                            <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 italic">
                              {selectedCategoryIds.size === 0
                                ? '⚠️ Sin filtro: se importarán TODOS los productos de Bind ERP sin restricción.'
                                : `✓ Se importarán únicamente los productos vinculados a las ${selectedCategoryIds.size} categoría(s) seleccionada(s).`
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <Card 
                      className={`transition-all duration-300 rounded-2xl border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md ${
                        task.completed ? "border-emerald-500/40 bg-emerald-50/10 dark:bg-emerald-950/5 dark:border-emerald-500/20" : ""
                      } ${isActive ? "ring-2 ring-indigo-500 animate-pulse border-indigo-500" : ""}`}
                    >
                      <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div className="flex items-center space-x-3.5">
                          <div className={`p-2 rounded-xl border transition-colors ${
                            task.completed ? "bg-emerald-100/50 dark:bg-emerald-950/30 text-emerald-600 border-emerald-200/30" : "bg-slate-100 dark:bg-slate-800 border-slate-200/20 text-slate-600"
                          }`}>
                            {task.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : task.icon}
                          </div>
                          <div>
                            <CardTitle className="text-base font-bold text-slate-800 dark:text-slate-200">{task.title}</CardTitle>
                            <CardDescription className="text-xs text-muted-foreground mt-0.5">
                              Extrae de <code>/{task.endpoint}</code> y guarda en <code>/{task.id}</code>
                            </CardDescription>
                          </div>
                        </div>
                        <Button 
                          variant={task.completed ? "outline" : "default"}
                          size="sm"
                          onClick={() => runSync(task)} 
                          disabled={loadingTask !== null || !companyId}
                          className={`font-semibold rounded-lg text-xs ${
                            task.completed ? "border-emerald-200/60 text-emerald-600 hover:bg-emerald-50/50" : "bg-indigo-600 hover:bg-indigo-700 text-white"
                          }`}
                        >
                          {isActive ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                          {task.completed ? "Re-sincronizar" : "Sincronizar"}
                        </Button>
                      </CardHeader>
                    </Card>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column: Terminal Console */}
        <div className="lg:col-span-5 h-full min-h-[600px] flex flex-col">
          <Card className="flex-1 flex flex-col bg-slate-950 border-slate-800 shadow-2xl rounded-2xl relative overflow-hidden h-full">
            {/* Terminal header */}
            <div className="bg-slate-900 border-b border-slate-800 px-4.5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Terminal de Sincronización</span>
              <div className="w-4" /> {/* Spacer */}
            </div>
            
            <CardContent className="flex-1 overflow-hidden p-4">
              <div className="h-[520px] overflow-y-auto font-mono text-[12.5px] leading-relaxed space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950 pr-2">
                {logs.length === 0 ? (
                  <div className="text-slate-500 flex items-center gap-2 h-full justify-center">
                    <Database className="w-4 h-4 animate-pulse" />
                    <span>Consola vacía. Inicia una sincronización...</span>
                  </div>
                ) : (
                  logs.map((log, i) => {
                    let logColor = "text-slate-300";
                    if (log.includes("❌")) logColor = "text-red-400 font-semibold";
                    else if (log.includes("✅")) logColor = "text-emerald-400 font-semibold";
                    else if (log.includes("⚠️")) logColor = "text-amber-400 font-semibold";
                    else if (log.includes("🚀") || log.includes("🎉")) logColor = "text-indigo-400 font-bold";
                    
                    return (
                      <div key={i} className={`${logColor} select-text break-words`}>
                        {log}
                      </div>
                    );
                  })
                )}
                <div ref={logsEndRef} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
