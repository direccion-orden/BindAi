"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Save, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";

interface Warehouse {
  id: string;
  name: string;
}

interface SelectedItem {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  currentStock: number;
  adjustmentQty: number;
}

const OUT_REASONS = [
  "Merma (Daño en almacén)",
  "Caducidad",
  "Robo / Extravío",
  "Ajuste por Conteo Físico",
  "Muestra / Regalo",
  "Uso interno"
];

const IN_REASONS = [
  "Sobrante detectado",
  "Ajuste por Conteo Físico",
  "Devolución interna"
];

export default function NuevoAjustePage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  
  const [warehouseId, setWarehouseId] = useState("");
  const [adjType, setAdjType] = useState<'OUT' | 'IN'>('OUT');
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<SelectedItem[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const unsubW = onSnapshot(query(collection(db, "companies", companyId, "warehouses")), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    return () => { unsubW(); unsubP(); };
  }, [companyId]);

  // Reset reason when type changes
  useEffect(() => {
    setReason("");
  }, [adjType]);

  const getFilteredProducts = (term: string) => {
    if (!term) return [];
    return products.filter(p => 
      p.title.toLowerCase().includes(term.toLowerCase()) || 
      p.variants.some(v => v.sku.toLowerCase().includes(term.toLowerCase()) || v.barcode?.includes(term))
    );
  };

  const handleAddItem = (product: ShopifyProduct, variant: any) => {
    const exists = items.find(m => m.variantId === variant.id);
    if (!exists) {
      const inv = variant.inventoryByWarehouse || {};
      const stock = warehouseId ? (inv[warehouseId] || 0) : 0;

      setItems(prev => [...prev, {
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : "",
        currentStock: stock,
        adjustmentQty: 1
      }]);
    }
    setSearch("");
  };

  const updateItemQty = (variantId: string, value: number) => {
    setItems(prev => prev.map(m => {
      if (m.variantId === variantId) {
        return { ...m, adjustmentQty: Math.max(1, value) };
      }
      return m;
    }));
  };

  const removeItem = (variantId: string) => {
    setItems(prev => prev.filter(m => m.variantId !== variantId));
  };

  // Re-evaluate stock if warehouse changes
  useEffect(() => {
    if (warehouseId && products.length > 0) {
      setItems(prev => prev.map(m => {
        const prod = products.find(p => p.id === m.productId);
        const vari = prod?.variants.find(v => v.id === m.variantId);
        const inv = vari?.inventoryByWarehouse || {};
        return { ...m, currentStock: inv[warehouseId] || 0 };
      }));
    }
  }, [warehouseId, products]);

  const handleSave = async () => {
    if (!companyId || !warehouseId) {
      alert("Selecciona el almacén.");
      return;
    }
    if (!reason) {
      alert("Debes seleccionar el motivo del ajuste.");
      return;
    }
    if (items.length === 0) {
      alert("Debes agregar al menos un producto.");
      return;
    }
    
    // Validate stock for OUT adjustments
    if (adjType === 'OUT') {
      const insufficient = items.filter(m => m.adjustmentQty > m.currentStock);
      if (insufficient.length > 0) {
        const names = insufficient.map(m => m.productName).join(", ");
        alert(`No hay suficiente stock para dar de baja: ${names}`);
        return;
      }
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const adjustmentId = crypto.randomUUID();
      const warehouseName = warehouses.find(w => w.id === warehouseId)?.name || "";
      const now = new Date().toISOString();

      // 1. Create Adjustment Record
      const adjRef = doc(db, "companies", companyId, "inventory_adjustments", adjustmentId);
      batch.set(adjRef, {
        id: adjustmentId,
        warehouseId,
        warehouseName,
        type: adjType,
        reason,
        notes,
        itemsCount: items.length,
        items: items.map(m => ({
          productId: m.productId,
          variantId: m.variantId,
          productName: m.productName + (m.variantTitle ? ` - ${m.variantTitle}` : ''),
          quantity: m.adjustmentQty
        })),
        createdAt: now,
        createdBy: user?.email || "Unknown"
      });

      // 2. Process Inventory Updates and Transactions
      const itemsByProduct = items.reduce((acc, item) => {
        if (!acc[item.productId]) acc[item.productId] = [];
        acc[item.productId].push(item);
        return acc;
      }, {} as Record<string, SelectedItem[]>);

      for (const [productId, productItems] of Object.entries(itemsByProduct)) {
        const prodRef = doc(db, "companies", companyId, "products", productId);
        const prodSnap = await getDoc(prodRef);
        if (!prodSnap.exists()) continue;

        const productData = prodSnap.data() as ShopifyProduct;
        const updatedVariants = [...productData.variants];

        for (const item of productItems) {
          const variantIndex = updatedVariants.findIndex(v => v.id === item.variantId);
          if (variantIndex > -1) {
            const v = updatedVariants[variantIndex];
            const inv = { ...(v.inventoryByWarehouse || {}) };
            
            if (adjType === 'OUT') {
              inv[warehouseId] = (inv[warehouseId] || 0) - item.adjustmentQty;
            } else {
              inv[warehouseId] = (inv[warehouseId] || 0) + item.adjustmentQty;
            }
            
            updatedVariants[variantIndex] = { ...v, inventoryByWarehouse: inv };
          }

          // Transaction Ledger
          const txRef = doc(db, "companies", companyId, "inventory_transactions", crypto.randomUUID());
          const txData: any = {
            type: adjType,
            productId: item.productId,
            productName: item.productName + (item.variantTitle ? ` - ${item.variantTitle}` : ''),
            quantity: item.adjustmentQty,
            referenceId: adjustmentId,
            reason: `Ajuste de Inv. - ${reason}`,
            createdAt: now,
            createdBy: user?.email || "Unknown"
          };
          
          if (adjType === 'OUT') {
            txData.fromWarehouseId = warehouseId;
          } else {
            txData.toWarehouseId = warehouseId;
          }

          batch.set(txRef, txData);
        }
        
        batch.update(prodRef, { variants: updatedVariants });
      }

      await batch.commit();
      router.push("/inventarios/ajustes");
    } catch (error) {
      console.error(error);
      alert("Error al guardar el ajuste de inventario.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/inventarios/ajustes">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nuevo Ajuste de Inventario</h1>
          <p className="text-muted-foreground">Registra una merma o sobrante manualmente.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Form Setup */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Configuración</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Almacén *</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value)}
              >
                <option value="" disabled>Selecciona un almacén...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Ajuste *</label>
              <div className="flex flex-col gap-2">
                <Button 
                  variant={adjType === 'OUT' ? 'default' : 'outline'}
                  className={`w-full justify-start gap-2 ${adjType === 'OUT' ? 'bg-destructive hover:bg-destructive/90 text-white' : ''}`}
                  onClick={() => setAdjType('OUT')}
                >
                  <ArrowDown className="w-4 h-4" /> Baja (Merma)
                </Button>
                <Button 
                  variant={adjType === 'IN' ? 'default' : 'outline'}
                  className={`w-full justify-start gap-2 ${adjType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                  onClick={() => setAdjType('IN')}
                >
                  <ArrowUp className="w-4 h-4" /> Alta (Sobrante)
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Motivo *</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={reason}
                onChange={e => setReason(e.target.value)}
              >
                <option value="" disabled>Selecciona un motivo...</option>
                {adjType === 'OUT' 
                  ? OUT_REASONS.map(r => <option key={r} value={r}>{r}</option>)
                  : IN_REASONS.map(r => <option key={r} value={r}>{r}</option>)
                }
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Notas Adicionales</label>
              <Input 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej. Producto dañado al mover tarima..."
              />
            </div>
          </div>
        </div>

        {/* Right Column: Items */}
        <div className="md:col-span-2">
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-muted/10">
              <h3 className="font-semibold text-lg">Productos a Ajustar</h3>
              <span className="text-sm text-muted-foreground font-medium">{items.length} elementos</span>
            </div>
            
            <div className="p-5 border-b bg-muted/30 relative">
               <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar producto a afectar..." 
                    className="pl-9 bg-background"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={!warehouseId}
                  />
                </div>
                {search && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                    {getFilteredProducts(search).map(product => (
                      product.variants.map(variant => (
                        <div key={variant.id} className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm">
                          <div>
                            <div className="font-medium">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={() => handleAddItem(product, variant)}
                            disabled={items.some(i => i.variantId === variant.id)}
                          >
                            Agregar
                          </Button>
                        </div>
                      ))
                    ))}
                  </div>
                )}
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <ArrowDown className="w-8 h-8 mb-3 opacity-20" />
                  <p>Busca y agrega los productos a ajustar.</p>
                </div>
              ) : (
                items.map(item => (
                  <div key={item.variantId} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-background gap-4 shadow-sm ${adjType==='OUT' && item.adjustmentQty > item.currentStock ? 'border-destructive' : ''}`}>
                    <div className="flex-1">
                      <p className="font-bold">{item.productName}</p>
                      {item.variantTitle && <p className="text-sm text-muted-foreground">{item.variantTitle}</p>}
                      <p className="text-xs text-muted-foreground mt-1">Stock Actual: {item.currentStock}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Cant. a {adjType === 'OUT' ? 'Restar' : 'Sumar'}
                        </label>
                        <Input 
                          type="number" 
                          min={1} 
                          value={item.adjustmentQty}
                          onChange={(e) => updateItemQty(item.variantId, parseInt(e.target.value) || 1)}
                          className={`w-24 text-center font-bold ${adjType==='OUT' && item.adjustmentQty > item.currentStock ? 'text-destructive border-destructive' : ''}`}
                        />
                      </div>
                      <div className="flex flex-col gap-1 min-w-[70px] text-right">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stock Final</label>
                        <p className={`font-bold ${adjType === 'OUT' ? 'text-destructive' : 'text-emerald-600'}`}>
                          {adjType === 'OUT' ? item.currentStock - item.adjustmentQty : item.currentStock + item.adjustmentQty}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive mt-4 sm:mt-0" onClick={() => removeItem(item.variantId)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-5 border-t bg-muted/30 flex justify-end">
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || items.length === 0 || !warehouseId || !reason}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Guardar Ajuste
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
