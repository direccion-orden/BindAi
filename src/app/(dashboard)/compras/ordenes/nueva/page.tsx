"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Trash2, FileText, DollarSign, Calendar, Building2, BookOpen } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";

interface Vendor {
  id: string;
  name: string;
}

interface OrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  quantity: number;
  unitCost: number;
}

export default function NuevaOrdenCompraPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  
  const [vendorId, setVendorId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const unsubV = onSnapshot(query(collection(db, "companies", companyId, "vendors")), (snap) => {
      setVendors(snap.docs.map(d => ({ id: d.id, name: d.data().name })));
    });

    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          name: data.name || data.Name || "Sucursal sin nombre",
          address: data.address || data.Address || ""
        };
      }));
    });

    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(allAcc.filter((a: any) => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2));
    });

    return () => { unsubV(); unsubP(); unsubLoc(); unsubAcc(); };
  }, [companyId]);

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.variants.some(v => v.sku.toLowerCase().includes(searchTerm.toLowerCase()) || v.barcode.includes(searchTerm))
  );

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
        return { ...i, [field]: Math.max(0, value) };
      }
      return i;
    }));
  };

  const removeItem = (variantId: string) => {
    setSelectedItems(prev => prev.filter(i => i.variantId !== variantId));
  };

  const totalCost = selectedItems.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);

  const handleSave = async () => {
    if (!companyId || !vendorId) {
      alert("Debes seleccionar un proveedor.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("Debes agregar al menos un producto a la orden.");
      return;
    }
    if (!locationId || !accountId) {
      alert("Debes seleccionar una Sucursal y una Cuenta Contable de Gasto.");
      return;
    }

    setSaving(true);
    try {
      const orderId = crypto.randomUUID();
      const vendorName = vendors.find(v => v.id === vendorId)?.name || "Proveedor General";
      const now = new Date().toISOString();
      const orderNumber = `OC-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;

      // Create Purchase Order Record
      const orderRef = doc(db, "companies", companyId, "purchase_orders", orderId);
      await setDoc(orderRef, {
        id: orderId,
        orderNumber,
        vendorId,
        vendorName,
        status: "SENT", // Starts as SENT directly
        expectedDate: expectedDate || null,
        items: selectedItems.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          productName: i.productName + (i.variantTitle ? ` - ${i.variantTitle}` : ''),
          quantity: i.quantity,
          unitCost: i.unitCost
        })),
        totalAmount: totalCost,
        locationId,
        locationName: locations.find(l => l.id === locationId)?.name || "",
        accountId,
        accountCode: accounts.find(a => a.id === accountId)?.code || "",
        accountName: accounts.find(a => a.id === accountId)?.name || "",
        createdAt: now,
        createdBy: user?.email || "Unknown",
        notes
      });

      router.push("/compras/ordenes");
    } catch (error) {
      console.error(error);
      alert("Error al generar la Orden de Compra.");
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
        <Link href="/compras/ordenes">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva Orden de Compra</h1>
          <p className="text-muted-foreground">Genera una requisición de material para enviar a tu proveedor.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Form */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Datos del Proveedor</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Proveedor *</label>
              <select 
                className="w-full border rounded-md px-3 py-2 text-sm bg-background border-indigo-200"
                value={vendorId}
                onChange={e => setVendorId(e.target.value)}
              >
                <option value="" disabled>Selecciona un proveedor...</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha Esperada (Opcional)</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="date"
                  className="pl-9"
                  value={expectedDate}
                  onChange={e => setExpectedDate(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Instrucciones / Notas</label>
              <Input 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Condiciones de pago, entrega..."
              />
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Clasificación de la Orden
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
            <h3 className="font-semibold border-b pb-2">Añadir Producto</h3>
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
              <h3 className="font-semibold text-lg">Requisición de Artículos</h3>
              <span className="text-sm text-muted-foreground font-medium">{selectedItems.length} artículos</span>
            </div>
            
            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {selectedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <FileText className="w-12 h-12 mb-3 opacity-20" />
                  <p>Añade los productos que deseas solicitar al proveedor.</p>
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
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Costo U. (Estimado)</label>
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
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cant. Requerida</label>
                        <Input 
                          type="number" 
                          min={1} 
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
                <span className="text-sm text-muted-foreground font-medium">Total de la Orden</span>
                <span className="text-2xl font-black text-indigo-700">${totalCost.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || selectedItems.length === 0 || !vendorId || !locationId || !accountId}
                className="gap-2 px-8"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                Generar Orden
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
