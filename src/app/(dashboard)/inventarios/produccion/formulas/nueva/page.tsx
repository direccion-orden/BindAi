"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Plus, Trash2, ClipboardList, Package, ArrowDown, Save } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";

interface SelectedItem {
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string;
  quantity: number;
}

export default function NuevaFormulaPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  
  const [formulaName, setFormulaName] = useState("");
  
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

    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    return () => { unsubP(); };
  }, [companyId]);

  // Search logic
  const getFilteredProducts = (term: string, roleFilter?: 'PRODUCTO' | 'MATERIA_PRIMA') => {
    if (!term) return [];
    return products.filter(p => {
      // Optional: Filter by role if we implemented it properly
      if (roleFilter === 'PRODUCTO' && p.inventoryRole === 'MATERIA_PRIMA') return false;
      if (roleFilter === 'MATERIA_PRIMA' && p.inventoryRole === 'PRODUCTO') return false;
      
      return p.title.toLowerCase().includes(term.toLowerCase()) || 
             p.variants.some(v => v.sku.toLowerCase().includes(term.toLowerCase()) || v.barcode.includes(term));
    });
  };

  const handleSelectFinishedProduct = (product: ShopifyProduct, variant: any) => {
    setFinishedProduct({
      productId: product.id,
      variantId: variant.id,
      productName: product.title,
      variantTitle: variant.title !== "Default Title" ? variant.title : "",
      quantity: 1
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
      setMaterials(prev => [...prev, {
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : "",
        quantity: 1
      }]);
    }
    setMaterialSearch("");
  };

  const updateMaterialQuantity = (variantId: string, value: number) => {
    setMaterials(prev => prev.map(m => {
      if (m.variantId === variantId) {
        return { ...m, quantity: Math.max(0, value) };
      }
      return m;
    }));
  };

  const removeMaterial = (variantId: string) => {
    setMaterials(prev => prev.filter(m => m.variantId !== variantId));
  };

  const handleSave = async () => {
    if (!companyId) return;
    
    if (!formulaName.trim()) {
      alert("La fórmula necesita un nombre.");
      return;
    }
    if (!finishedProduct || finishedProduct.quantity <= 0) {
      alert("Debes definir el producto terminado y la cantidad resultante base.");
      return;
    }
    if (materials.length === 0) {
      alert("Debes agregar al menos una materia prima.");
      return;
    }
    
    setSaving(true);
    try {
      const formulaId = crypto.randomUUID();
      const docRef = doc(db, "companies", companyId, "production_formulas", formulaId);
      
      await setDoc(docRef, {
        id: formulaId,
        name: formulaName,
        finishedProductId: finishedProduct.productId,
        finishedVariantId: finishedProduct.variantId,
        finishedProduct: finishedProduct.productName + (finishedProduct.variantTitle ? ` - ${finishedProduct.variantTitle}` : ''),
        finishedQuantity: finishedProduct.quantity,
        materials: materials.map(m => ({
          productId: m.productId,
          variantId: m.variantId,
          productName: m.productName + (m.variantTitle ? ` - ${m.variantTitle}` : ''),
          quantity: m.quantity
        })),
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Unknown"
      });

      router.push("/inventarios/produccion/formulas");
    } catch (error) {
      console.error(error);
      alert("Error al guardar la fórmula.");
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
        <Link href="/inventarios/produccion/formulas">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Crear Fórmula de Producción</h1>
          <p className="text-muted-foreground">Define una receta estandarizada (BOM) para tus ensambles.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Form Setup */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold border-b pb-2">Datos Generales</h3>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de la Fórmula *</label>
              <Input 
                value={formulaName}
                onChange={e => setFormulaName(e.target.value)}
                placeholder="Ej. Receta Pastel Chocolate"
              />
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b pb-2">
              <Package className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold">Producto Resultante</h3>
            </div>
            
            {!finishedProduct ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar producto a fabricar..." 
                    className="pl-9"
                    value={finishedProductSearch}
                    onChange={(e) => setFinishedProductSearch(e.target.value)}
                  />
                </div>
                {finishedProductSearch && (
                  <div className="border rounded-md max-h-48 overflow-y-auto bg-background divide-y">
                    {getFilteredProducts(finishedProductSearch, 'PRODUCTO').map(product => (
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
              <div className="bg-muted/30 border rounded-lg p-3 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold">{finishedProduct.productName}</p>
                    <p className="text-xs text-muted-foreground">{finishedProduct.variantTitle}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setFinishedProduct(null)} className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground">CANTIDAD BASE:</span>
                  <Input 
                    type="number" 
                    min={1} 
                    className="w-24 text-center font-bold bg-background" 
                    value={finishedProduct.quantity}
                    onChange={e => setFinishedProduct(prev => prev ? {...prev, quantity: Math.max(1, parseInt(e.target.value)||1)} : null)}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Esta receta define las proporciones exactas para fabricar esta cantidad base.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Materials */}
        <div className="md:col-span-2">
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="p-5 border-b flex justify-between items-center bg-muted/10">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold text-lg">Ingredientes / Materia Prima</h3>
              </div>
              <span className="text-sm text-muted-foreground font-medium">{materials.length} componentes</span>
            </div>
            
            <div className="p-5 border-b bg-muted/30 relative">
               <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar y añadir ingredientes..." 
                    className="pl-9 bg-background"
                    value={materialSearch}
                    onChange={(e) => setMaterialSearch(e.target.value)}
                  />
                </div>
                {materialSearch && (
                  <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                    {getFilteredProducts(materialSearch, 'MATERIA_PRIMA').map(product => (
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
                            Añadir
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
                  <p>Agrega los materiales que conforman la receta.</p>
                </div>
              ) : (
                materials.map(item => (
                  <div key={item.variantId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-background gap-4 shadow-sm">
                    <div className="flex-1">
                      <p className="font-bold">{item.productName}</p>
                      {item.variantTitle && <p className="text-sm text-muted-foreground">{item.variantTitle}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cant. Requerida</label>
                        <Input 
                          type="number" 
                          min={1} 
                          value={item.quantity}
                          onChange={(e) => updateMaterialQuantity(item.variantId, parseInt(e.target.value) || 1)}
                          className="w-24 text-center font-bold"
                        />
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive mt-4 sm:mt-0" onClick={() => removeMaterial(item.variantId)}>
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
                disabled={saving || materials.length === 0 || !finishedProduct || finishedProduct.quantity <= 0 || !formulaName.trim()}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Guardar Fórmula
              </Button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
