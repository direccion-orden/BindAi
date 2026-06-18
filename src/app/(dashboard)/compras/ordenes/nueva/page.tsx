"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Trash2, FileText, DollarSign, Calendar, Building2, BookOpen, User, Save } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";

interface Vendor {
  id: string;
  name: string;
}

interface OrderItem {
  lineKey?: string;
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  quantity: number;
  unitCost: number;
  isService?: boolean;
  description?: string;
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
    const isService = !!product.isService || variant.sku?.startsWith("SER-");

    if (isService) {
      const lineKey = crypto.randomUUID();
      setSelectedItems(prev => [...prev, {
        lineKey,
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : "",
        quantity: 1,
        unitCost: variant.price || 0,
        isService: true,
        description: product.bodyHtml || product.title || ""
      }]);
    } else {
      const exists = selectedItems.find(i => i.variantId === variant.id);
      if (!exists) {
        setSelectedItems(prev => [...prev, {
          productId: product.id,
          variantId: variant.id,
          productName: product.title,
          variantTitle: variant.title !== "Default Title" ? variant.title : "",
          quantity: 1,
          unitCost: 0,
          isService: false,
          description: ""
        }]);
      } else {
        setSelectedItems(prev => prev.map(item => 
          item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item
        ));
      }
    }
    setSearchTerm("");
  };

  const handleAddBlankItem = () => {
    const lineKey = crypto.randomUUID();
    setSelectedItems(prev => [...prev, {
      lineKey,
      productId: "custom",
      variantId: lineKey,
      productName: "",
      variantTitle: "",
      quantity: 1,
      unitCost: 0,
      isService: false,
      description: ""
    }]);
  };

  const updateItem = (lineKeyOrVariantId: string, field: keyof OrderItem, value: any) => {
    setSelectedItems(prev => prev.map(i => {
      const matchKey = i.lineKey || i.variantId;
      if (matchKey === lineKeyOrVariantId) {
        return { ...i, [field]: value };
      }
      return i;
    }));
  };

  const removeItem = (lineKeyOrVariantId: string) => {
    setSelectedItems(prev => prev.filter(i => (i.lineKey || i.variantId) !== lineKeyOrVariantId));
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
          productName: i.isService && i.description ? i.description : (i.productName + (i.variantTitle ? ` - ${i.variantTitle}` : '')),
          quantity: i.quantity,
          unitCost: i.unitCost,
          isService: !!i.isService,
          description: i.description || "",
          lineKey: i.lineKey || ""
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

      {/* Top Header Card: Datos Generales */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-sm text-indigo-950 flex items-center gap-2 border-b pb-2">
          <User className="w-4 h-4 text-indigo-600" />
          Datos Generales de la Orden de Compra
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          {/* Column 1: Proveedor */}
          <div className="space-y-2 col-span-1">
            <label className="text-xs font-medium text-slate-500 uppercase">Proveedor *</label>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={vendorId}
              onChange={e => setVendorId(e.target.value)}
            >
              <option value="" disabled>Selecciona un proveedor...</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Column 2: Sucursal Destino */}
          <div className="space-y-2 col-span-1">
            <label className="text-xs font-medium text-slate-500 uppercase">Sucursal (Destino) *</label>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona sucursal...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Column 3: Cuenta Contable Gasto */}
          <div className="space-y-2 col-span-1">
            <label className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              Cuenta de Gasto *
            </label>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona cuenta...</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
          </div>

          {/* Column 4: Date and Notes */}
          <div className="space-y-2 col-span-1">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Fecha Esperada</label>
              <Input 
                type="date"
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="mt-1">
              <label className="text-xs font-medium text-slate-500 uppercase">Instrucciones</label>
              <Input 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Condiciones de pago, entrega..."
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Left Column: Items list & Product search */}
        
          <div className="bg-card border rounded-xl shadow-sm flex flex-col min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-blue-50/30">
              <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-900">
                <FileText className="w-5 h-5 text-blue-600" />
                Requisición de Artículos
              </h3>
              <span className="text-sm text-blue-700 font-medium">{selectedItems.length} artículos</span>
            </div>
            
            <div className="p-5 border-b bg-muted/30 relative flex gap-2">
               <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar producto (SKU, nombre, código)..." 
                    className="pl-9 bg-background"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleAddBlankItem}
                  className="shrink-0 bg-background border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  + Partida en blanco
                </Button>
                {searchTerm && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                    {filteredProducts.map(product => (
                      product.variants.map(variant => (
                        <div 
                          key={variant.id} 
                          className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm cursor-pointer"
                          onClick={() => {
                            const isService = !!product.isService || variant.sku?.startsWith("SER-");
                            if (isService || !selectedItems.some(i => i.variantId === variant.id)) {
                              handleAddItem(product, variant);
                            }
                          }}
                        >
                          <div>
                            <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-slate-500">SKU: {variant.sku}</div>
                          </div>
                          {selectedItems.some(i => i.variantId === variant.id) && !variant.sku?.startsWith("SER-") && !product.isService && (
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Agregado</span>
                          )}
                        </div>
                      ))
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">No se encontraron productos</div>
                    )}
                  </div>
                )}
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {selectedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <FileText className="w-12 h-12 mb-3 opacity-20" />
                  <p>Añade los productos que deseas solicitar al proveedor.</p>
                </div>
              ) : (
                selectedItems.map(item => (
                  <div key={item.lineKey || item.variantId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-background gap-4 shadow-sm">
                    <div className="flex-1">
                      {item.productId === "custom" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mr-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Código / SKU</label>
                            <Input
                              placeholder="Ej. MAT-XYZ"
                              value={item.variantTitle}
                              onChange={(e) => updateItem(item.lineKey || item.variantId, 'variantTitle', e.target.value)}
                              className="h-8 text-xs font-semibold bg-background"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción / Nombre</label>
                            <Input
                              placeholder="Descripción del artículo..."
                              value={item.productName}
                              onChange={(e) => updateItem(item.lineKey || item.variantId, 'productName', e.target.value)}
                              className="h-8 text-xs font-bold bg-background"
                            />
                          </div>
                        </div>
                      ) : item.isService ? (
                        <textarea
                          value={item.description || ""}
                          onChange={(e) => updateItem(item.lineKey || item.variantId, 'description', e.target.value)}
                          placeholder="Descripción del servicio..."
                          className="w-full text-xs font-semibold border rounded p-1.5 bg-background resize-y"
                          rows={2}
                        />
                      ) : (
                        <>
                          <p className="font-bold">{item.productName}</p>
                          {item.variantTitle && <p className="text-sm text-muted-foreground">{item.variantTitle}</p>}
                        </>
                      )}
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
                            onChange={(e) => updateItem(item.lineKey || item.variantId, 'unitCost', parseFloat(e.target.value) || 0)}
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
                          onChange={(e) => updateItem(item.lineKey || item.variantId, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-20 text-center font-bold"
                        />
                      </div>
                      <div className="flex flex-col gap-1 min-w-[70px] text-right">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Subtotal</label>
                        <p className="font-bold text-indigo-700">${(item.quantity * item.unitCost).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive mt-4 sm:mt-0" onClick={() => removeItem(item.lineKey || item.variantId)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        

        {/* Right Column: Totals & Actions */}
        
          <div className="bg-card border rounded-xl shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-base border-b pb-2 flex items-center gap-2 text-slate-800">
              Resumen de Compra
            </h3>

            <div className="space-y-3">
              <div className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between text-lg font-bold text-slate-800">
                  <span>Total Estimado</span>
                  <span className="font-black text-indigo-700">${totalCost.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </div>
              
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || selectedItems.length === 0 || !vendorId || !locationId || !accountId}
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 mt-6 text-white"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Generar Orden de Compra
              </Button>
            </div>
          </div>
        

      </div>
    </div>
  );
}
