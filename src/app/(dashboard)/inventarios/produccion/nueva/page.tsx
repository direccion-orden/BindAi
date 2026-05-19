"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Plus, Trash2, Factory, Package, ArrowDown, ArrowUp } from "lucide-react";
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
  quantity: number;
  currentCost: number; // For materials: cost per unit. For finished: N/A initially.
  currentStock: number; // To validate available materials
  baseQuantityPerUnit?: number; // Used to auto-scale formula
}

export default function NuevaProduccionPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  interface ProductionFormula {
    id: string;
    name: string;
    finishedProductId: string;
    finishedVariantId: string;
    finishedProduct: string;
    finishedQuantity: number;
    materials: {
      productId: string;
      variantId: string;
      productName: string;
      quantity: number;
    }[];
  }

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [formulas, setFormulas] = useState<ProductionFormula[]>([]);
  const [selectedFormulaId, setSelectedFormulaId] = useState("");
  
  const [originWarehouseId, setOriginWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  
  // Output Product (Producto Terminado)
  const [finishedProductSearch, setFinishedProductSearch] = useState("");
  const [finishedProduct, setFinishedProduct] = useState<SelectedItem | null>(null);
  
  // Input Products (Materia Prima)
  const [materialSearch, setMaterialSearch] = useState("");
  const [materials, setMaterials] = useState<SelectedItem[]>([]);
  
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

    const unsubF = onSnapshot(query(collection(db, "companies", companyId, "production_formulas")), (snap) => {
      setFormulas(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionFormula)));
    });

    return () => { unsubW(); unsubP(); unsubF(); };
  }, [companyId]);

  const handleApplyFormula = (formulaId: string) => {
    setSelectedFormulaId(formulaId);
    if (!formulaId) return;
    const f = formulas.find(x => x.id === formulaId);
    if (!f) return;
    
    const prod = products.find(p => p.id === f.finishedProductId);
    const vari = prod?.variants.find(v => v.id === f.finishedVariantId);
    const finStock = destinationWarehouseId && vari ? ((vari.inventoryByWarehouse || {})[destinationWarehouseId] || 0) : 0;
    
    setFinishedProduct({
      productId: f.finishedProductId,
      variantId: f.finishedVariantId,
      productName: prod?.title || f.finishedProduct.split(' - ')[0],
      variantTitle: vari?.title !== "Default Title" ? (vari?.title || '') : "",
      quantity: f.finishedQuantity,
      currentCost: vari?.cost || 0,
      currentStock: finStock
    });

    // Materials
    const newMaterials: SelectedItem[] = f.materials.map(m => {
      const mProd = products.find(p => p.id === m.productId);
      const mVari = mProd?.variants.find(v => v.id === m.variantId);
      const mStock = originWarehouseId && mVari ? ((mVari.inventoryByWarehouse || {})[originWarehouseId] || 0) : 0;
      
      return {
        productId: m.productId,
        variantId: m.variantId,
        productName: mProd?.title || m.productName.split(' - ')[0],
        variantTitle: mVari?.title !== "Default Title" ? (mVari?.title || '') : "",
        quantity: m.quantity,
        currentCost: mVari?.cost || 0,
        currentStock: mStock,
        baseQuantityPerUnit: f.finishedQuantity > 0 ? (m.quantity / f.finishedQuantity) : m.quantity
      };
    });
    setMaterials(newMaterials);
  };

  // Search logic
  const getFilteredProducts = (term: string) => {
    if (!term) return [];
    return products.filter(p => 
      p.title.toLowerCase().includes(term.toLowerCase()) || 
      p.variants.some(v => v.sku.toLowerCase().includes(term.toLowerCase()) || v.barcode.includes(term))
    );
  };

  const handleSelectFinishedProduct = (product: ShopifyProduct, variant: any) => {
    const inv = variant.inventoryByWarehouse || {};
    const stock = destinationWarehouseId ? (inv[destinationWarehouseId] || 0) : 0;
    
    setFinishedProduct({
      productId: product.id,
      variantId: variant.id,
      productName: product.title,
      variantTitle: variant.title !== "Default Title" ? variant.title : "",
      quantity: 1,
      currentCost: variant.cost || 0,
      currentStock: stock
    });
    setFinishedProductSearch("");
  };

  const handleAddMaterial = (product: ShopifyProduct, variant: any) => {
    if (finishedProduct && finishedProduct.variantId === variant.id) {
      alert("No puedes usar el mismo producto como materia prima y producto terminado.");
      return;
    }

    const exists = materials.find(m => m.variantId === variant.id);
    if (!exists) {
      const inv = variant.inventoryByWarehouse || {};
      const stock = originWarehouseId ? (inv[originWarehouseId] || 0) : 0;

      setMaterials(prev => [...prev, {
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : "",
        quantity: 1,
        currentCost: variant.cost || 0,
        currentStock: stock,
        baseQuantityPerUnit: finishedProduct && finishedProduct.quantity > 0 ? (1 / finishedProduct.quantity) : 1
      }]);
    }
    setMaterialSearch("");
  };

  // Re-evaluate stock if warehouse changes
  useEffect(() => {
    if (products.length > 0) {
      if (finishedProduct && destinationWarehouseId) {
        const prod = products.find(p => p.id === finishedProduct.productId);
        const vari = prod?.variants.find(v => v.id === finishedProduct.variantId);
        const inv = vari?.inventoryByWarehouse || {};
        setFinishedProduct(prev => prev ? { ...prev, currentStock: inv[destinationWarehouseId] || 0 } : null);
      }
      if (originWarehouseId) {
        setMaterials(prev => prev.map(m => {
          const prod = products.find(p => p.id === m.productId);
          const vari = prod?.variants.find(v => v.id === m.variantId);
          const inv = vari?.inventoryByWarehouse || {};
          return { ...m, currentStock: inv[originWarehouseId] || 0 };
        }));
      }
    }
  }, [originWarehouseId, destinationWarehouseId, products]);

  const updateMaterialQuantity = (variantId: string, value: number) => {
    setMaterials(prev => prev.map(m => {
      if (m.variantId === variantId) {
        // Update base quantity so subsequent global scalings respect this manual change
        const newQty = Math.max(0, value);
        const newBase = finishedProduct && finishedProduct.quantity > 0 ? newQty / finishedProduct.quantity : newQty;
        return { ...m, quantity: newQty, baseQuantityPerUnit: newBase };
      }
      return m;
    }));
  };

  const handleFinishedQuantityChange = (val: string) => {
    const newQuantity = Math.max(1, parseInt(val) || 1);
    
    setFinishedProduct(prev => prev ? { ...prev, quantity: newQuantity } : null);
    
    // Auto scale materials
    setMaterials(prev => prev.map(m => ({
      ...m,
      quantity: m.baseQuantityPerUnit ? Number((m.baseQuantityPerUnit * newQuantity).toFixed(4)) : m.quantity
    })));
  };

  const removeMaterial = (variantId: string) => {
    setMaterials(prev => prev.filter(m => m.variantId !== variantId));
  };

  // Costs
  const totalMaterialsCost = materials.reduce((sum, m) => sum + (m.quantity * m.currentCost), 0);
  const costPerProducedUnit = finishedProduct && finishedProduct.quantity > 0 
    ? totalMaterialsCost / finishedProduct.quantity 
    : 0;

  const handleSave = async () => {
    if (!companyId || !originWarehouseId || !destinationWarehouseId) {
      alert("Selecciona los almacenes de origen y destino.");
      return;
    }
    if (!finishedProduct || finishedProduct.quantity <= 0) {
      alert("Debes definir un producto terminado válido y su cantidad.");
      return;
    }
    if (materials.length === 0) {
      alert("Debes agregar al menos una materia prima.");
      return;
    }
    
    // Validate stock
    const insufficientMaterials = materials.filter(m => m.quantity > m.currentStock);
    if (insufficientMaterials.length > 0) {
      const names = insufficientMaterials.map(m => m.productName).join(", ");
      alert(`No hay suficiente stock en el almacén seleccionado para: ${names}`);
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      const orderId = crypto.randomUUID();
      const originWarehouseName = warehouses.find(w => w.id === originWarehouseId)?.name || "";
      const destinationWarehouseName = warehouses.find(w => w.id === destinationWarehouseId)?.name || "";
      const now = new Date().toISOString();
      const orderNumber = `PROD-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;

      // 1. Create Production Order Record
      const orderRef = doc(db, "companies", companyId, "production_orders", orderId);
      batch.set(orderRef, {
        id: orderId,
        orderNumber,
        originWarehouseId,
        destinationWarehouseId,
        warehouseName: destinationWarehouseName,
        originWarehouseName,
        destinationWarehouseName,
        finishedProduct: finishedProduct.productName + (finishedProduct.variantTitle ? ` - ${finishedProduct.variantTitle}` : ''),
        finishedVariantId: finishedProduct.variantId,
        finishedProductId: finishedProduct.productId,
        finishedQuantity: finishedProduct.quantity,
        unitCostProduced: costPerProducedUnit,
        totalCost: totalMaterialsCost,
        materials: materials.map(m => ({
          productId: m.productId,
          variantId: m.variantId,
          productName: m.productName + (m.variantTitle ? ` - ${m.variantTitle}` : ''),
          quantity: m.quantity,
          unitCost: m.currentCost
        })),
        createdAt: now,
        createdBy: user?.email || "Unknown",
        notes,
        status: "Por Iniciar",
        materialsDeducted: false,
        finishedProductAdded: false,
        stageId: null
      });

      // Nota: Ya no se afecta inventario aquí. Se delega al tablero Kanban.

      await batch.commit();
      router.push("/inventarios/produccion");
    } catch (error) {
      console.error(error);
      alert("Error al procesar la orden de producción.");
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
        <Link href="/inventarios/produccion">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nueva Orden de Producción</h1>
          <p className="text-muted-foreground">Convierte materiales en producto terminado.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Form Setup */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Configuración</h3>
            
            {formulas.length > 0 && (
              <div className="space-y-2 pb-2 border-b">
                <label className="text-sm font-medium text-indigo-700">Cargar Fórmula / Receta (Opcional)</label>
                <select 
                  className="w-full border rounded-md px-3 py-2 text-sm bg-indigo-50 border-indigo-200"
                  value={selectedFormulaId}
                  onChange={e => handleApplyFormula(e.target.value)}
                >
                  <option value="">Selecciona una fórmula...</option>
                  {formulas.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.finishedProduct})</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">Autocompleta el producto a fabricar y la materia prima.</p>
              </div>
            )}
            
            <div className="space-y-4 border-b pb-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Almacén Origen (Materia Prima) *</label>
                <select 
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background border-indigo-200"
                  value={originWarehouseId}
                  onChange={e => setOriginWarehouseId(e.target.value)}
                >
                  <option value="" disabled>Selecciona almacén de origen...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">De este almacén se tomarán y descontarán los materiales.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Almacén Destino (Prod. Terminado) *</label>
                <select 
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background border-emerald-200"
                  value={destinationWarehouseId}
                  onChange={e => setDestinationWarehouseId(e.target.value)}
                >
                  <option value="" disabled>Selecciona almacén de destino...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">Aquí mismo ingresará y se sumará el producto terminado.</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Notas / Referencia</label>
              <Input 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej. Ensamble Lote A..."
              />
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 border-emerald-200">
            <div className="flex items-center gap-2 border-b pb-2">
              <Package className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-emerald-900">Producto Resultante (Alta)</h3>
            </div>
            
            {!finishedProduct ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar producto terminado..." 
                    className="pl-9"
                    value={finishedProductSearch}
                    onChange={(e) => setFinishedProductSearch(e.target.value)}
                    disabled={!destinationWarehouseId}
                  />
                </div>
                {finishedProductSearch && (
                  <div className="border rounded-md max-h-48 overflow-y-auto bg-background divide-y">
                    {getFilteredProducts(finishedProductSearch).map(product => (
                      product.variants.map(variant => (
                        <div key={variant.id} className="p-3 hover:bg-muted/50 cursor-pointer" onClick={() => handleSelectFinishedProduct(product, variant)}>
                          <div className="font-medium text-sm">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                          <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                        </div>
                      ))
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-emerald-900">{finishedProduct.productName}</p>
                    <p className="text-xs text-emerald-700">{finishedProduct.variantTitle}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setFinishedProduct(null)} className="h-6 w-6 p-0 hover:bg-emerald-200">
                    <Trash2 className="w-4 h-4 text-emerald-700" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800">CANTIDAD A PRODUCIR:</span>
                  <Input 
                    type="number" 
                    min={1} 
                    className="w-24 text-center font-bold bg-white" 
                    value={finishedProduct.quantity}
                    onChange={e => handleFinishedQuantityChange(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Materials */}
        <div className="md:col-span-2">
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-orange-50/50">
              <div className="flex items-center gap-2">
                <Factory className="w-5 h-5 text-orange-600" />
                <h3 className="font-semibold text-lg text-orange-900">Materia Prima Utilizada (Bajas)</h3>
              </div>
              <span className="text-sm text-orange-700 font-medium">{materials.length} componentes</span>
            </div>
            
            <div className="p-5 border-b bg-muted/30 relative">
               <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar y añadir componentes o materia prima..." 
                    className="pl-9 bg-background"
                    value={materialSearch}
                    onChange={(e) => setMaterialSearch(e.target.value)}
                    disabled={!originWarehouseId}
                  />
                </div>
                {materialSearch && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                    {getFilteredProducts(materialSearch).map(product => (
                      product.variants.map(variant => (
                        <div key={variant.id} className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm">
                          <div>
                            <div className="font-medium">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                            <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            onClick={() => handleAddMaterial(product, variant)}
                            disabled={materials.some(i => i.variantId === variant.id)}
                          >
                            Añadir Componente
                          </Button>
                        </div>
                      ))
                    ))}
                  </div>
                )}
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-3">
              {materials.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <ArrowDown className="w-8 h-8 mb-3 opacity-20" />
                  <p>Agrega los materiales que se consumirán.</p>
                </div>
              ) : (
                materials.map(item => (
                  <div key={item.variantId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-background gap-4 shadow-sm">
                    <div className="flex-1">
                      <p className="font-bold">{item.productName}</p>
                      {item.variantTitle && <p className="text-sm text-muted-foreground">{item.variantTitle}</p>}
                      <p className="text-xs text-muted-foreground mt-1">Stock disp: {item.currentStock}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex flex-col gap-1 min-w-[70px] text-right">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Costo U.</label>
                        <p className="text-sm">${item.currentCost.toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cant. a consumir</label>
                        <Input 
                          type="number" 
                          min={1} 
                          value={item.quantity}
                          onChange={(e) => updateMaterialQuantity(item.variantId, parseInt(e.target.value) || 1)}
                          className={`w-20 text-center font-bold ${item.quantity > item.currentStock ? 'border-destructive text-destructive' : ''}`}
                        />
                      </div>
                      <div className="flex flex-col gap-1 min-w-[70px] text-right">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Costo Total</label>
                        <p className="font-bold text-orange-700">${(item.quantity * item.currentCost).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive mt-4 sm:mt-0" onClick={() => removeMaterial(item.variantId)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-5 border-t bg-muted/30 flex flex-col justify-between gap-4">
              <div className="flex justify-between items-end">
                <div className="flex flex-col">
                  <span className="text-sm text-muted-foreground font-medium">Costo Total de Materiales</span>
                  <span className="text-2xl font-black text-orange-700">${totalMaterialsCost.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-sm text-muted-foreground font-medium">Costo por Unidad Producida</span>
                  <span className="text-xl font-bold text-emerald-700">${costPerProducedUnit.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </div>
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || materials.length === 0 || !originWarehouseId || !destinationWarehouseId || !finishedProduct || finishedProduct.quantity <= 0}
                className="w-full gap-2 mt-4 bg-indigo-600 hover:bg-indigo-700"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Factory className="w-5 h-5" />}
                Crear Orden de Producción
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
