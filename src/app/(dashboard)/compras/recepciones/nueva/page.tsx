"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Plus, Trash2, Truck, DollarSign, Building2, BookOpen } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";

interface Warehouse {
  id: string;
  name: string;
}

interface Vendor {
  id: string;
  name: string;
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  status: string;
  createdAt: string;
  items: {
    productId: string;
    variantId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    receivedQuantity?: number;
  }[];
}

interface ReceivingItem {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  quantity: number;
  unitCost: number;
  originalOrderId?: string;
  maxAllowedQuantity?: number;
}

export default function NuevaRecepcionPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  
  const [warehouseId, setWarehouseId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<ReceivingItem[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const unsubW = onSnapshot(query(collection(db, "companies", companyId, "warehouses")), (snap) => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    const unsubV = onSnapshot(query(collection(db, "companies", companyId, "vendors")), (snap) => {
      setVendors(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    const unsubO = onSnapshot(query(collection(db, "companies", companyId, "purchase_orders")), (snap) => {
      const orders = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as PendingOrder))
        .filter(o => o.status === "SENT" || o.status === "PARTIAL");
      setPendingOrders(orders);
    });

    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(allAcc.filter((a: any) => (a.type === "GASTOS" || a.type === "COSTOS") && a.level > 2));
    });

    return () => { unsubW(); unsubV(); unsubP(); unsubO(); unsubLoc(); unsubAcc(); };
  }, [companyId]);

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.variants.some(v => v.sku.toLowerCase().includes(searchTerm.toLowerCase()) || v.barcode.includes(searchTerm))
  );

  const handleOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    if (!orderId) {
      setSelectedItems([]);
      return;
    }

    const order = pendingOrders.find(o => o.id === orderId);
    if (order) {
      setVendorId(order.vendorId);
      
      const itemsToReceive = order.items.map(item => {
        const received = item.receivedQuantity || 0;
        const pending = item.quantity - received;
        
        // Extract variant title if it was appended (e.g., "Product Name - Variant")
        let vTitle = "";
        const parts = item.productName.split(" - ");
        if (parts.length > 1) {
          vTitle = parts[parts.length - 1];
        }

        return {
          productId: item.productId,
          variantId: item.variantId,
          productName: parts[0],
          variantTitle: vTitle,
          quantity: pending > 0 ? pending : 0,
          unitCost: item.unitCost,
          originalOrderId: orderId,
          maxAllowedQuantity: pending > 0 ? pending : 0
        };
      }).filter(i => i.quantity > 0);

      setSelectedItems(itemsToReceive);
    }
  };

  const handleAddItem = (product: ShopifyProduct, variant: any) => {
    const exists = selectedItems.find(i => i.variantId === variant.id);
    if (!exists) {
      setSelectedItems(prev => [...prev, {
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : "",
        quantity: 1,
        unitCost: 0 // default to 0
      }]);
    }
    setSearchTerm("");
  };

  const updateItem = (variantId: string, field: 'quantity' | 'unitCost', value: number) => {
    setSelectedItems(prev => prev.map(i => {
      if (i.variantId === variantId) {
        let finalValue = Math.max(0, value);
        if (field === 'quantity' && i.maxAllowedQuantity !== undefined) {
          finalValue = Math.min(finalValue, i.maxAllowedQuantity);
        }
        return { ...i, [field]: finalValue };
      }
      return i;
    }));
  };

  const removeItem = (variantId: string) => {
    setSelectedItems(prev => prev.filter(i => i.variantId !== variantId));
  };

  const totalCost = selectedItems.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

  const handleSave = async () => {
    if (!companyId || !warehouseId) {
      alert("Debes seleccionar un almacén destino.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("Debes agregar al menos un producto a la recepción.");
      return;
    }
    if (!locationId || !accountId) {
      alert("Debes seleccionar una Sucursal y una Cuenta Contable de Gasto.");
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      
      const purchaseId = crypto.randomUUID();
      const warehouseName = warehouses.find(w => w.id === warehouseId)?.name || "";
      const vendorName = vendors.find(v => v.id === vendorId)?.name || "Proveedor General";
      const now = new Date().toISOString();

      // 1. Create Purchase Record
      const purchaseRef = doc(db, "companies", companyId, "purchases", purchaseId);
      batch.set(purchaseRef, {
        id: purchaseId,
        vendorId,
        vendorName,
        warehouseId,
        warehouseName,
        invoiceNumber,
        purchaseOrderId: selectedOrderId || null,
        status: "COMPLETED",
        items: selectedItems.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          productName: i.productName + (i.variantTitle ? ` - ${i.variantTitle}` : ''),
          quantity: i.quantity,
          unitCost: i.unitCost
        })),
        totalCost,
        locationId,
        locationName: locations.find(l => l.id === locationId)?.name || "",
        accountId,
        accountCode: accounts.find(a => a.id === accountId)?.code || "",
        accountName: accounts.find(a => a.id === accountId)?.name || "",
        createdAt: now,
        createdBy: user?.email || "Unknown",
        notes
      });

      // 2. Group items by product for updating product documents
      const itemsByProduct = selectedItems.reduce((acc, item) => {
        if (!acc[item.productId]) acc[item.productId] = [];
        acc[item.productId].push(item);
        return acc;
      }, {} as Record<string, ReceivingItem[]>);

      // Process each product
      for (const [productId, items] of Object.entries(itemsByProduct)) {
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
            
            // 2.a Costo Promedio Ponderado (Weighted Average Cost)
            const currentTotalStock = Object.values(inv).reduce((sum, q) => sum + (q as number), 0);
            const currentCost = v.cost || 0;
            const totalCurrentValue = currentTotalStock * currentCost;
            const totalNewValue = item.quantity * item.unitCost;
            const newTotalStock = currentTotalStock + item.quantity;
            const newAverageCost = newTotalStock > 0 ? (totalCurrentValue + totalNewValue) / newTotalStock : 0;

            // Add to Destination Warehouse
            inv[warehouseId] = (inv[warehouseId] || 0) + item.quantity;

            updatedVariants[variantIndex] = { 
              ...v, 
              inventoryByWarehouse: inv,
              cost: newAverageCost
            };
          }

          // 3. Create Transaction Ledger Entry (Type IN)
          const txRef = doc(db, "companies", companyId, "inventory_transactions", crypto.randomUUID());
          batch.set(txRef, {
            type: "IN",
            productId: item.productId,
            productName: item.productName + (item.variantTitle ? ` - ${item.variantTitle}` : ''),
            quantity: item.quantity,
            toWarehouseId: warehouseId,
            referenceId: purchaseId,
            reason: `Compra - Fac: ${invoiceNumber || 'S/N'}`,
            createdAt: now,
            createdBy: user?.email || "Unknown"
          });
        }

        // Update the product document
        batch.update(prodRef, { variants: updatedVariants });
      }

      // 4. Update Purchase Order if linked
      if (selectedOrderId) {
        const orderRef = doc(db, "companies", companyId, "purchase_orders", selectedOrderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
          const orderData = orderSnap.data() as PendingOrder;
          let allCompleted = true;
          
          const updatedItems = orderData.items.map(orderItem => {
            const receivedItem = selectedItems.find(si => si.variantId === orderItem.variantId);
            const newlyReceived = receivedItem ? receivedItem.quantity : 0;
            const totalReceived = (orderItem.receivedQuantity || 0) + newlyReceived;
            
            if (totalReceived < orderItem.quantity) {
              allCompleted = false;
            }
            
            return {
              ...orderItem,
              receivedQuantity: totalReceived
            };
          });

          batch.update(orderRef, {
            items: updatedItems,
            status: allCompleted ? "COMPLETED" : "PARTIAL"
          });
        }
      }

      await batch.commit();
      router.push("/compras/recepciones");
    } catch (error) {
      console.error(error);
      alert("Error al procesar la entrada de mercancía.");
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
        <Link href="/compras/recepciones">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva Entrada (Compra)</h1>
          <p className="text-muted-foreground">Recibe mercancía y actualiza tu inventario.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Form */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Datos de Recepción</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Proveedor (Opcional)</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={vendorId}
                onChange={e => {
                  setVendorId(e.target.value);
                  setSelectedOrderId("");
                  setSelectedItems([]);
                }}
              >
                <option value="">Proveedor General</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            {vendorId && pendingOrders.some(o => o.vendorId === vendorId) && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Vincular Orden de Compra</label>
                <select 
                  className="w-full border rounded-md px-3 py-2 text-sm bg-indigo-50 border-indigo-200 text-indigo-900"
                  value={selectedOrderId}
                  onChange={e => handleOrderChange(e.target.value)}
                >
                  <option value="">Entrada libre (Sin Orden)</option>
                  {pendingOrders.filter(o => o.vendorId === vendorId).map(o => (
                    <option key={o.id} value={o.id}>{o.orderNumber} - {new Date(o.createdAt).toLocaleDateString('es-MX')}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Almacén Destino *</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background border-indigo-200"
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
              <label className="text-sm font-medium">Nº Factura / Nota</label>
              <Input 
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="F-1234..."
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Notas Adicionales</label>
              <Input 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observaciones..."
              />
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Clasificación del Gasto
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Sucursal (Destino) *</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background border-indigo-200"
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                required
              >
                <option value="" disabled>Selecciona una sucursal...</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                Cuenta Contable de Gasto *
              </label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background border-indigo-200"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                required
              >
                <option value="" disabled>Selecciona cuenta de gasto...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Buscar Producto</h3>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nombre o código..." 
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {searchTerm && (
              <div className="border rounded-md max-h-64 overflow-y-auto bg-background divide-y">
                {filteredProducts.map(product => (
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
                        disabled={selectedItems.some(i => i.variantId === variant.id)}
                      >
                        Añadir
                      </Button>
                    </div>
                  ))
                ))}
                {filteredProducts.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">No se encontraron productos.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Items */}
        <div className="md:col-span-2">
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-muted/30">
              <h3 className="font-semibold text-lg">Productos Recibidos</h3>
              <span className="text-sm text-muted-foreground font-medium">{selectedItems.length} artículos</span>
            </div>
            
            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {selectedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Truck className="w-12 h-12 mb-3 opacity-20" />
                  <p>Busca y selecciona los productos que llegaron en esta entrega.</p>
                </div>
              ) : (
                selectedItems.map(item => (
                  <div key={item.variantId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-background gap-4 shadow-sm">
                    <div className="flex-1">
                      <p className="font-bold">{item.productName}</p>
                      {item.variantTitle && <p className="text-sm text-muted-foreground">{item.variantTitle}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Costo U.</label>
                        <div className="relative">
                          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                          <Input 
                            type="number" 
                            min={0}
                            step="0.01"
                            value={item.unitCost}
                            onChange={(e) => updateItem(item.variantId, 'unitCost', parseFloat(e.target.value) || 0)}
                            className="w-24 pl-6 text-right font-medium"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Cant. {item.maxAllowedQuantity !== undefined && <span className="text-indigo-500">(Max: {item.maxAllowedQuantity})</span>}
                        </label>
                        <Input 
                          type="number" 
                          min={1} 
                          max={item.maxAllowedQuantity}
                          value={item.quantity}
                          onChange={(e) => updateItem(item.variantId, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-20 text-center font-bold"
                        />
                      </div>
                      <div className="flex flex-col gap-1 min-w-[70px] text-right">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Subtotal</label>
                        <p className="font-bold text-indigo-700">${(item.quantity * item.unitCost).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive mt-4 sm:mt-0" onClick={() => removeItem(item.variantId)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-5 border-t bg-muted/30 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground font-medium">Costo Total de Recepción</span>
                <span className="text-2xl font-black text-indigo-700">${totalCost.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || selectedItems.length === 0 || !warehouseId || !locationId || !accountId}
                className="gap-2 px-8"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
                Registrar Entrada
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
