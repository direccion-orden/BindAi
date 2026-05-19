"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Plus, Trash2, ArrowRight, Truck } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";

interface Warehouse {
  id: string;
  name: string;
}

interface TransferItem {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  maxQuantity: number; // current stock in origin warehouse
  transferQuantity: number;
}

export default function NuevaTransferenciaPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<TransferItem[]>([]);
  const [notes, setNotes] = useState("");
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    // Load Warehouses
    const unsubW = onSnapshot(query(collection(db, "companies", companyId, "warehouses")), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    // Load Products
    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    return () => { unsubW(); unsubP(); };
  }, [companyId]);

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.variants.some(v => v.sku.toLowerCase().includes(searchTerm.toLowerCase()) || v.barcode.includes(searchTerm))
  );

  const handleAddItem = (product: ShopifyProduct, variant: any) => {
    if (!fromWarehouseId) {
      alert("Selecciona primero el almacén de origen para consultar la disponibilidad.");
      return;
    }
    
    // Check stock in origin
    const currentStock = variant.inventoryByWarehouse?.[fromWarehouseId] || 0;
    if (currentStock <= 0) {
      alert("No hay existencias de este producto en el almacén de origen.");
      return;
    }

    const exists = selectedItems.find(i => i.variantId === variant.id);
    if (exists) {
      if (exists.transferQuantity < exists.maxQuantity) {
        setSelectedItems(prev => prev.map(i => i.variantId === variant.id ? { ...i, transferQuantity: i.transferQuantity + 1 } : i));
      } else {
        alert("No puedes transferir más del stock disponible.");
      }
    } else {
      setSelectedItems(prev => [...prev, {
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : "",
        maxQuantity: currentStock,
        transferQuantity: 1
      }]);
    }
    setSearchTerm("");
  };

  const updateQuantity = (variantId: string, qty: number) => {
    setSelectedItems(prev => prev.map(i => {
      if (i.variantId === variantId) {
        const validQty = Math.max(1, Math.min(qty, i.maxQuantity));
        return { ...i, transferQuantity: validQty };
      }
      return i;
    }));
  };

  const removeItem = (variantId: string) => {
    setSelectedItems(prev => prev.filter(i => i.variantId !== variantId));
  };

  const handleTransfer = async () => {
    if (!companyId || !fromWarehouseId || !toWarehouseId) return;
    if (fromWarehouseId === toWarehouseId) {
      alert("El almacén de origen y destino no pueden ser el mismo.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("Añade al menos un producto a transferir.");
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      const transferId = crypto.randomUUID();
      const fromWhName = warehouses.find(w => w.id === fromWarehouseId)?.name || "";
      const toWhName = warehouses.find(w => w.id === toWarehouseId)?.name || "";
      const now = new Date().toISOString();

      // 1. Create Transfer Record
      const transferRef = doc(db, "companies", companyId, "inventory_transfers", transferId);
      batch.set(transferRef, {
        id: transferId,
        fromWarehouseId,
        toWarehouseId,
        fromWarehouseName: fromWhName,
        toWarehouseName: toWhName,
        status: "COMPLETED",
        items: selectedItems.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          productName: i.productName + (i.variantTitle ? ` - ${i.variantTitle}` : ''),
          quantity: i.transferQuantity
        })),
        createdAt: now,
        completedAt: now,
        createdBy: user?.email || "Unknown",
        notes
      });

      // 2. Group items by product for updating product documents
      const itemsByProduct = selectedItems.reduce((acc, item) => {
        if (!acc[item.productId]) acc[item.productId] = [];
        acc[item.productId].push(item);
        return acc;
      }, {} as Record<string, TransferItem[]>);

      // Process each product
      for (const [productId, items] of Object.entries(itemsByProduct)) {
        // Fetch current product state to update variants accurately
        const prodRef = doc(db, "companies", companyId, "products", productId);
        const prodSnap = await getDoc(prodRef);
        if (!prodSnap.exists()) continue;

        const productData = prodSnap.data() as ShopifyProduct;
        const updatedVariants = [...productData.variants];

        for (const item of items) {
          const variantIndex = updatedVariants.findIndex(v => v.id === item.variantId);
          if (variantIndex > -1) {
            const v = updatedVariants[variantIndex];
            const inv = { ...(v.inventoryByWarehouse || {}) };
            
            // Deduct from Origin
            inv[fromWarehouseId] = Math.max(0, (inv[fromWarehouseId] || 0) - item.transferQuantity);
            // Add to Destination
            inv[toWarehouseId] = (inv[toWarehouseId] || 0) + item.transferQuantity;

            updatedVariants[variantIndex] = { ...v, inventoryByWarehouse: inv };
          }

          // 3. Create Transaction Ledger Entry
          const txRef = doc(db, "companies", companyId, "inventory_transactions", crypto.randomUUID());
          batch.set(txRef, {
            type: "TRANSFER",
            productId: item.productId,
            productName: item.productName + (item.variantTitle ? ` - ${item.variantTitle}` : ''),
            quantity: item.transferQuantity,
            fromWarehouseId,
            toWarehouseId,
            referenceId: transferId,
            reason: notes || "Transferencia interna",
            createdAt: now,
            createdBy: user?.email || "Unknown"
          });
        }

        // Update the product document
        batch.update(prodRef, { variants: updatedVariants });
      }

      await batch.commit();
      router.push("/inventarios/transferencias");
    } catch (error) {
      console.error(error);
      alert("Error al procesar la transferencia.");
    } finally {
      setSaving(false);
    }
  };

  // When changing Origin Warehouse, clear selected items to avoid stock inconsistencies
  const handleOriginChange = (val: string) => {
    setFromWarehouseId(val);
    setSelectedItems([]);
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/inventarios/transferencias">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva Transferencia</h1>
          <p className="text-muted-foreground">Ejecuta un movimiento de mercancía entre almacenes.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Form & Selection */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Ruta de Transferencia</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Almacén Origen</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={fromWarehouseId}
                onChange={e => handleOriginChange(e.target.value)}
              >
                <option value="" disabled>Selecciona origen...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-center text-muted-foreground">
              <ArrowRight className="w-5 h-5 rotate-90 md:rotate-0" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Almacén Destino</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={toWarehouseId}
                onChange={e => setToWarehouseId(e.target.value)}
              >
                <option value="" disabled>Selecciona destino...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id} disabled={w.id === fromWarehouseId}>{w.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-sm font-medium">Notas (Opcional)</label>
              <Input 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Motivo o referencia..."
              />
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Buscar Producto</h3>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nombre, SKU o código..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={!fromWarehouseId}
              />
            </div>

            {searchTerm && (
              <div className="border rounded-md max-h-64 overflow-y-auto bg-background divide-y">
                {filteredProducts.map(product => (
                  product.variants.map(variant => {
                    const stock = variant.inventoryByWarehouse?.[fromWarehouseId] || 0;
                    return (
                      <div key={variant.id} className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm">
                        <div>
                          <div className="font-medium">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                          <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                          <div className={`text-xs font-bold ${stock > 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                            Stock en origen: {stock}
                          </div>
                        </div>
                        <Button 
                          size="sm" 
                          variant="secondary" 
                          disabled={stock <= 0}
                          onClick={() => handleAddItem(product, variant)}
                        >
                          Añadir
                        </Button>
                      </div>
                    );
                  })
                ))}
                {filteredProducts.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">No se encontraron productos.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Items */}
        <div className="md:col-span-2">
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-muted/30">
              <h3 className="font-semibold text-lg">Productos a Transferir</h3>
              <span className="text-sm text-muted-foreground font-medium">{selectedItems.length} artículos</span>
            </div>
            
            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {selectedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Truck className="w-12 h-12 mb-3 opacity-20" />
                  <p>Selecciona un almacén de origen y busca productos para añadirlos a la transferencia.</p>
                </div>
              ) : (
                selectedItems.map(item => (
                  <div key={item.variantId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-background gap-4 shadow-sm">
                    <div className="flex-1">
                      <p className="font-bold">{item.productName}</p>
                      {item.variantTitle && <p className="text-sm text-muted-foreground">{item.variantTitle}</p>}
                      <p className="text-xs text-muted-foreground mt-1">Disponible: {item.maxQuantity}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase">Cant.</label>
                        <Input 
                          type="number" 
                          min={1} 
                          max={item.maxQuantity}
                          value={item.transferQuantity}
                          onChange={(e) => updateQuantity(item.variantId, parseInt(e.target.value) || 1)}
                          className="w-20 text-center font-bold"
                        />
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeItem(item.variantId)}>
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
                onClick={handleTransfer} 
                disabled={saving || selectedItems.length === 0 || !fromWarehouseId || !toWarehouseId}
                className="gap-2 px-8"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
                Ejecutar Transferencia
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
