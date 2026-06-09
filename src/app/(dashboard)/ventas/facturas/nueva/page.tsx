"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, getDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Save, Trash2, User, Package, FolderOpen, Receipt, Building2, BookOpen, Percent, MessageSquare } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";
import { Client } from "@/app/(dashboard)/clientes/page";
import { getNextSequence } from "@/lib/firebase/counters";
import { calculateOrderTotals, EngineItem, EngineDiscount } from "@/lib/utils/discountEngine";

interface OrderItem {
  productId: string;
  variantId: string;
  id?: string;
  productName: string;
  variantTitle: string;
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
  imageUrl?: string;
  categoryIds?: string[];
  isService?: boolean;
  description?: string;
  comment?: string;
  showComment?: boolean;
}

export default function NuevaFacturaPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [clientId, setClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  
  // New Client State
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<any[]>([]);

  const [productSearch, setProductSearch] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);
  
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");

  const [saving, setSaving] = useState(false);

  // Engine state
  const [availableDiscounts, setAvailableDiscounts] = useState<EngineDiscount[]>([]);
  const [enteredPromoCode, setEnteredPromoCode] = useState<string>("");

  useEffect(() => {
    if (!companyId) return;

    const unsubC = onSnapshot(query(collection(db, "companies", companyId, "clients")), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });

    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    const unsubProj = onSnapshot(query(collection(db, "companies", companyId, "projects")), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
      setAccounts(allAcc.filter((a: any) => a.type === "INGRESOS" && a.level >= 2));
    });

    const unsubD = onSnapshot(query(collection(db, "companies", companyId, "discounts"), where("status", "==", "active")), (snap) => {
      setAvailableDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as EngineDiscount)));
    });

    return () => { unsubC(); unsubP(); unsubProj(); unsubLoc(); unsubAcc(); unsubD(); };
  }, [companyId]);

  const getFilteredClients = () => {
    if (!clientSearch) return [];
    const term = clientSearch.toLowerCase();
    return clients.filter(c => {
      const nameVal = (c.LegalName || c.CommercialName || c.name || "").toLowerCase();
      const rfcVal = (c.RFC || c.rfc || "").toLowerCase();
      return nameVal.includes(term) || rfcVal.includes(term);
    });
  };

  const getFilteredProducts = () => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p => 
      p.title.toLowerCase().includes(term) || 
      p.variants.some(v => v.sku.toLowerCase().includes(term) || v.barcode?.includes(term))
    );
  };

  const handleSelectClient = (c: Client) => {
    setClientId(c.id);
    const clientName = c.LegalName || c.CommercialName || c.name || "Cliente sin nombre";
    setClientSearch(clientName);
    setProjectId("");
  };

  const handleAddProduct = (product: ShopifyProduct, variant: any) => {
    const exists = items.find(i => i.variantId === variant.id);
    if (!exists) {
      setItems([...items, { 
        productId: product.id, 
        variantId: variant.id, 
        productName: product.title, 
        variantTitle: variant.title !== "Default Title" ? variant.title : "", 
        quantity: 1, 
        unitPrice: variant.price || 0,
        discountPercentage: 0,
        imageUrl: product.images?.[0]?.src || "",
        categoryIds: [
          ...(product.productType ? [product.productType] : []),
          ...(product.tags || [])
        ],
        isService: !!product.isService,
        description: product.isService ? (product.bodyHtml || product.title || "") : "",
        comment: "",
        showComment: false
      }]);
    }
    setProductSearch("");
  };

  const updateItem = (variantId: string, field: keyof OrderItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.variantId === variantId) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const removeItem = (variantId: string) => {
    setItems(prev => prev.filter(i => i.variantId !== variantId));
  };

  // Calculations via Engine
  const engineItems: EngineItem[] = items.map(i => ({
    id: i.variantId,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    manualDiscountPercentage: i.discountPercentage,
    categoryIds: i.categoryIds || []
  }));

  const totals = calculateOrderTotals(engineItems, availableDiscounts, enteredPromoCode);
  const subtotal = totals.subtotal;
  const tax = totals.tax;
  const total = totals.total;

  const handleSave = async () => {
    if (!companyId) return;
    
    let finalClientId = clientId;
    let finalClientName = "";
    let clientRefDoc = null;

    if (isNewClient) {
      if (!newClientName || !newClientPhone) {
        alert("El Nombre y Teléfono son obligatorios para crear un cliente nuevo.");
        return;
      }
      finalClientName = newClientName;
    } else {
      if (!finalClientId) {
        alert("Selecciona un cliente válido.");
        return;
      }
      const client = clients.find(c => c.id === finalClientId);
      finalClientName = client ? (client.LegalName || client.CommercialName || client.name || "Desconocido") : "Desconocido";
      clientRefDoc = client;
    }

    if (items.length === 0) {
      alert("Agrega al menos un producto a la factura.");
      return;
    }

    if (!locationId || !accountId) {
      alert("Debes seleccionar una Sucursal y una Cuenta Contable de Ingreso.");
      return;
    }

    if (!window.confirm("¿Crear factura directa? Se descontará del inventario y quedará lista para timbrar.")) {
      return;
    }

    setSaving(true);
    try {
      if (isNewClient) {
        finalClientId = crypto.randomUUID();
        const clientRef = doc(db, "companies", companyId, "clients", finalClientId);
        await setDoc(clientRef, {
          id: finalClientId,
          name: newClientName,
          phone: newClientPhone,
          email: "",
          createdAt: new Date().toISOString()
        });
      }

      // Build CFDI Payload Defaults based on Client or Generic
      const cfdiPayload = {
        Receiver: {
          Name: clientRefDoc?.razonSocial?.toUpperCase() || finalClientName.toUpperCase(),
          CfdiUse: (clientRefDoc?.taxRegime === "616" || !clientRefDoc) ? "S01" : (clientRefDoc?.cfdiUse || "G03"),
          Rfc: clientRefDoc?.rfc?.toUpperCase() || "XAXX010101000",
          TaxZipCode: (clientRefDoc?.rfc?.toUpperCase() === "XAXX010101000" || !clientRefDoc) ? "64753" : (clientRefDoc?.zipCode || "00000"),
          FiscalRegime: clientRefDoc?.taxRegime || "616"
        },
        CfdiType: "I",
        Exportation: "01",
        PaymentForm: "01",
        PaymentMethod: "PUE",
        Currency: "MXN",
        Date: new Date().toISOString().split('.')[0],
        ExpeditionPlace: "64753",
        Items: items.map((item: any) => {
          // Find the precise engine calculations for this item
          const engineItem = totals.processedItems?.find(ei => ei.id === item.variantId);
          const discountAmt = engineItem ? engineItem.finalDiscountAmt : 0;
          const subtotalItem = (item.quantity * item.unitPrice) - discountAmt;
          
          return {
            ProductCode: "01010101",
            IdentificationNumber: item.variantId || "SKU",
            Description: item.isService && item.description ? item.description : item.productName,
            Unit: "PIEZA",
            UnitCode: "H87",
            UnitPrice: Number(item.unitPrice.toFixed(4)),
            Quantity: item.quantity,
            Subtotal: Number((item.quantity * item.unitPrice).toFixed(4)),
            Discount: Number(discountAmt.toFixed(4)),
            TaxObject: "02",
            Taxes: [
              {
                Total: Number((subtotalItem * 0.16).toFixed(4)),
                Name: "IVA",
                Base: Number(subtotalItem.toFixed(4)),
                Rate: 0.16,
                IsRetention: false
              }
            ],
            Total: Number((subtotalItem * 1.16).toFixed(4))
          };
        })
      };

      if (cfdiPayload.Receiver.Rfc === "XAXX010101000" && cfdiPayload.Receiver.Name === "PUBLICO EN GENERAL") {
        (cfdiPayload as any).GlobalInformation = {
          Periodicity: "01",
          Months: new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`,
          Year: new Date().getFullYear()
        };
      }

      const invId = crypto.randomUUID();
      const invNumber = await getNextSequence(companyId, 'facturas');

      const invRef = doc(db, "companies", companyId, "facturas", invId);
      await setDoc(invRef, {
        id: invId,
        invoiceNumber: invNumber,
        orderId: null, // Direct invoice
        orderNumber: null,
        clientId: finalClientId,
        clientName: finalClientName,
        items: items,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        promoCode: totals.appliedPromo?.code || null,
        tax: totals.tax,
        totalAmount: totals.total,
        projectId: projectId || null,
        projectName: projectId ? projects.find(p => p.id === projectId)?.name : null,
        locationId,
        locationName: locations.find(l => l.id === locationId)?.name || "",
        accountId,
        accountCode: accounts.find(a => a.id === accountId)?.code || "",
        accountName: accounts.find(a => a.id === accountId)?.name || "",
        status: "por_timbrar", 
        cfdiPayload: cfdiPayload,
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Unknown"
      });

      // Inventory Deduction Logic (assuming direct invoice implies delivery)
      for (const item of items) {
        const productRef = doc(db, "companies", companyId, "products", item.productId);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          const updatedVariants = productData.variants?.map((v: any) => {
            if (v.id === (item.variantId || item.id)) {
              return { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) };
            }
            return v;
          });
          
          await updateDoc(productRef, { variants: updatedVariants });
          
          // Generate Inventory Movement record
          const movId = crypto.randomUUID();
          await setDoc(doc(db, "companies", companyId, "inventory_movements", movId), {
            id: movId,
            productId: item.productId,
            variantId: item.variantId || item.id || "",
            type: "OUT",
            quantity: item.quantity,
            reason: `Venta Directa Facturada FAC-${invNumber}`,
            referenceId: invId,
            createdAt: new Date().toISOString()
          });
        }
      }

      alert(`Factura FAC-${invNumber} generada y lista para timbrar.`);
      router.push(`/ventas/facturas/${invId}`);
    } catch (error) {
      console.error(error);
      alert("Error al generar la factura.");
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
        <Link href="/ventas/facturas">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva Factura Directa</h1>
          <p className="text-muted-foreground">Crea una factura de venta directa para timbrar.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Form Setup */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                Datos del Cliente
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs text-blue-600 font-semibold hover:bg-blue-50"
                onClick={() => setIsNewClient(!isNewClient)}
              >
                {isNewClient ? 'Buscar Existente' : '+ Nuevo Cliente'}
              </Button>
            </h3>
            
            {isNewClient ? (
              <div className="space-y-3 bg-blue-50/30 p-3 rounded-lg border border-blue-100">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-blue-900">Nombre del Cliente *</label>
                  <Input 
                    placeholder="Ej. Juan Pérez" 
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="bg-white border-blue-200"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-blue-900">Teléfono *</label>
                  <Input 
                    placeholder="Ej. 55 1234 5678" 
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="bg-white border-blue-200"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 relative">
                <label className="text-sm font-medium">Buscar Cliente *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Nombre o RFC..." 
                    className="pl-9 bg-background"
                    value={clientSearch}
                    onChange={(e) => {
                      setClientSearch(e.target.value);
                      if (clientId) setClientId(""); 
                    }}
                  />
                </div>
                {!clientId && clientSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y z-50 shadow-xl">
                    {getFilteredClients().map(c => (
                      <div 
                        key={c.id} 
                        className="p-3 hover:bg-muted/50 cursor-pointer" 
                        onClick={() => handleSelectClient(c)}
                      >
                        <div className="font-medium text-sm">{c.LegalName || c.CommercialName || c.name || "Cliente sin nombre"}</div>
                        {(c.RFC || c.rfc) && <div className="text-xs text-muted-foreground">RFC: {c.RFC || c.rfc}</div>}
                      </div>
                    ))}
                    {getFilteredClients().length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">No se encontraron clientes</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Project Selection (only if a client is selected and exists) */}
            {!isNewClient && clientId && (
              <div className="space-y-2 pt-2 border-t mt-4">
                <label className="text-sm font-medium flex items-center gap-2 text-indigo-900">
                  <FolderOpen className="w-4 h-4 text-indigo-500" />
                  Vincular a Proyecto (Opcional)
                </label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                >
                  <option value="">Ninguno</option>
                  {projects.filter(p => p.clientId === clientId).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 mt-6">
            <h3 className="font-semibold border-b pb-2 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-600" />
              Clasificación de la Factura
            </h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Sucursal (Origen) *</label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
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
                <BookOpen className="w-4 h-4 text-purple-600" />
                Cuenta Contable de Ingreso *
              </label>
              <select 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                required
              >
                <option value="" disabled>Selecciona cuenta de ingreso...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right Column: Line Items */}
        <div className="md:col-span-2">
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center">
              <h3 className="font-semibold flex items-center gap-2">
                <Receipt className="w-4 h-4 text-slate-500" />
                Conceptos a Facturar
              </h3>
            </div>
            
            <div className="p-5 border-b bg-muted/30 relative">
               <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar producto (SKU, nombre, código)..." 
                    className="pl-9 bg-background"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                {productSearch && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                    {getFilteredProducts().map(product => (
                      product.variants.map(variant => (
                        <div 
                          key={variant.id} 
                          className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm cursor-pointer"
                          onClick={() => {
                            if (!items.some(i => i.variantId === variant.id)) {
                              handleAddProduct(product, variant);
                            }
                          }}
                        >
                          <div>
                            <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-slate-500">SKU: {variant.sku} | Stock Actual: {variant.stock || 0}</div>
                          </div>
                          {items.some(i => i.variantId === variant.id) && (
                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Agregado</span>
                          )}
                        </div>
                      ))
                    ))}
                    {getFilteredProducts().length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">No se encontraron productos</div>
                    )}
                  </div>
                )}
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Receipt className="w-12 h-12 mb-3 opacity-20" />
                  <p>Busca y agrega los productos a facturar.</p>
                </div>
              ) : (
                items.map((item, idx) => (
                  <div key={item.variantId ? `${item.variantId}-${idx}` : idx} className="flex flex-col p-4 border rounded-lg bg-background gap-3 shadow-sm relative">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 flex items-start gap-3">
                        <div className="w-12 h-12 rounded bg-slate-100 flex-shrink-0 overflow-hidden border">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-6 h-6 m-auto mt-3 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1">
                          {item.isService ? (
                            <textarea
                              value={item.description || ""}
                              onChange={(e) => updateItem(item.variantId, 'description', e.target.value)}
                              placeholder="Descripción del servicio..."
                              className="w-full text-xs font-semibold border rounded p-1.5 bg-background resize-y"
                              rows={2}
                            />
                          ) : (
                            <>
                              <p className="font-bold">{item.productName}</p>
                              {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 justify-end">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cant.</label>
                          <Input 
                            type="number" 
                            min={1} 
                            value={item.quantity}
                            onChange={(e) => updateItem(item.variantId, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-20 text-center font-bold"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Precio U.</label>
                          <Input 
                            type="number" 
                            min={0} 
                            step={0.01}
                            value={item.unitPrice}
                            onChange={(e) => updateItem(item.variantId, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-24 text-right font-medium"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Desc %</label>
                          <Input 
                            type="number" 
                            min={0}
                            max={100}
                            value={item.discountPercentage}
                            onChange={(e) => updateItem(item.variantId, 'discountPercentage', parseFloat(e.target.value) || 0)}
                            className="w-20 text-center text-emerald-600 font-bold"
                          />
                        </div>
                        <div className="flex flex-col gap-1 min-w-[80px] text-right">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Importe</label>
                          <p className="font-bold text-slate-800">
                            ${(item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 mt-4 sm:mt-0">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className={`${item.comment || item.showComment ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700' : 'text-muted-foreground hover:text-indigo-600'}`}
                            onClick={() => updateItem(item.variantId, 'showComment', !item.showComment)}
                            title="Agregar nota/comentario"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.variantId)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    {(item.showComment || item.comment) && (
                      <div className="pt-2 border-t border-slate-100">
                        <Input
                          placeholder="Escribe una nota o comentario sobre esta partida..."
                          value={item.comment || ""}
                          onChange={(e) => updateItem(item.variantId, 'comment', e.target.value)}
                          className="text-xs bg-muted/30 border-slate-200"
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-5 border-t bg-muted/30 flex flex-col items-end gap-2">
              <div className="w-full max-w-[300px] mb-4">
                 <label className="text-xs font-semibold text-indigo-700 flex items-center gap-1 mb-1">
                    <Percent className="w-3 h-3"/> Código Promocional
                 </label>
                 <Input 
                    value={enteredPromoCode}
                    onChange={(e) => setEnteredPromoCode(e.target.value.toUpperCase())}
                    placeholder="Ej. VERANO20"
                    className="h-8 text-sm font-mono uppercase"
                 />
                 {totals.error && enteredPromoCode && (
                   <p className="text-[10px] text-red-500 mt-1 font-medium">{totals.error}</p>
                 )}
                 {totals.appliedPromo && (
                   <p className="text-[10px] text-emerald-600 mt-1 font-medium flex items-center gap-1">
                     ✓ Aplicado: {totals.appliedPromo.title || totals.appliedPromo.code}
                   </p>
                 )}
              </div>

              <div className="flex justify-between w-full max-w-[300px] text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">${totals.subtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              {totals.totalDiscount > 0 && (
                <div className="flex justify-between w-full max-w-[300px] text-sm">
                  <span className="text-muted-foreground">Descuento</span>
                  <span className="font-semibold text-emerald-600">-${totals.totalDiscount.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              )}
              <div className="flex justify-between w-full max-w-[300px] text-sm">
                <span className="text-muted-foreground">IVA (16%)</span>
                <span className="font-semibold">${totals.tax.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between w-full max-w-[300px] text-lg mt-2 pt-2 border-t border-slate-300">
                <span className="font-bold text-slate-800">TOTAL</span>
                <span className="font-black text-blue-700">${totals.total.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || items.length === 0 || (!isNewClient && !clientId) || (isNewClient && (!newClientName || !newClientPhone))}
                className="w-full max-w-[300px] gap-2 bg-blue-600 hover:bg-blue-700 mt-4 text-white"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Crear Pre-Factura Directa
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
