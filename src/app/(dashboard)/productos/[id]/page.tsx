"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, getDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ArrowLeft, Save, Loader2, Image as ImageIcon, Sparkles, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShopifyProduct, ShopifyProductVariant, ShopifyProductOption } from "@/types/product";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SatCatalogSelect } from "@/components/pos/SatCatalogSelect";

export default function EditarProductoPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const { companyId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Basic Info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [productType, setProductType] = useState("");
  const [status, setStatus] = useState<'ACTIVE' | 'DRAFT'>('DRAFT');
  const [inventoryRole, setInventoryRole] = useState<'PRODUCTO' | 'MATERIA_PRIMA' | 'AMBOS'>('PRODUCTO');
  
  // SAT Configuration
  const [satProductCode, setSatProductCode] = useState("");
  const [satProductName, setSatProductName] = useState("");
  const [satUnitCode, setSatUnitCode] = useState("");
  const [satUnitName, setSatUnitName] = useState("");
  
  // Pricing & Inventory for default variant
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [inventoryQuantity, setInventoryQuantity] = useState("0");
  const [cost, setCost] = useState("0");

  const [originalProduct, setOriginalProduct] = useState<Partial<ShopifyProduct> | null>(null);

  // AI State
  const [generatingAi, setGeneratingAi] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchProduct();
    }
  }, [productId, companyId]);

  const fetchProduct = async () => {
    try {
      if (!companyId) return;
      const docRef = doc(db, "companies", companyId, "products", productId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        alert("Producto no encontrado");
        router.push("/productos");
        return;
      }

      const data = docSnap.data() as ShopifyProduct;
      setOriginalProduct(data);
      
      setTitle(data.title || "");
      setDescription(data.bodyHtml || "");
      setVendor(data.vendor || "");
      setProductType(data.productType || "");
      setStatus(data.status || "DRAFT");
      setInventoryRole(data.inventoryRole || "PRODUCTO");
      setSatProductCode(data.satProductCode || "");
      setSatProductName(data.satProductName || "");
      setSatUnitCode(data.satUnitCode || "");
      setSatUnitName(data.satUnitName || "");

      // Load first variant data if exists
      if (data.variants && data.variants.length > 0) {
        const v = data.variants[0];
        setPrice(v.price?.toString() || "");
        setCompareAtPrice(v.compareAtPrice?.toString() || "");
        setSku(v.sku || "");
        setBarcode(v.barcode || "");
        setInventoryQuantity(v.inventoryQuantity?.toString() || "0");
        setCost(v.cost?.toString() || "0");
      } else {
        // Fallback to legacy structure if any
        setPrice((data as any).price?.toString() || "");
        setSku((data as any).sku || "");
        setInventoryQuantity((data as any).inventoryQuantity?.toString() || "0");
      }

    } catch (error) {
      console.error("Error fetching product:", error);
      alert("Error al cargar el producto");
    } finally {
      setLoading(false);
    }
  };

  const generateAIDescription = async () => {
    if (!title) {
      alert("Por favor, ingresa al menos un Título para que la IA tenga contexto.");
      return;
    }
    setGeneratingAi(true);
    try {
      const res = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, productType, vendor })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar");
      
      setDescription(data.description);
    } catch (e: any) {
      console.error(e);
      alert("Error al generar descripción: " + e.message);
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert("El título es obligatorio");
      return;
    }
    
    setSaving(true);
    try {
      if (!companyId) return;
      const docRef = doc(db, "companies", companyId, "products", productId);
      
      // We only update the first variant. We keep others if they exist.
      let updatedVariants = originalProduct?.variants ? [...originalProduct.variants] : [];
      
      if (updatedVariants.length === 0) {
        // Create default variant if it didn't exist
        updatedVariants.push({
          id: crypto.randomUUID(),
          title: "Default Title",
          price: parseFloat(price) || 0,
          sku: sku,
          position: 1,
          compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
          option1: "Default Title",
          option2: null,
          option3: null,
          taxable: true,
          barcode: barcode,
          weight: 0,
          weightUnit: 'kg',
          inventoryQuantity: parseInt(inventoryQuantity) || 0,
        });
      } else {
        // Update only the first variant
        updatedVariants[0] = {
          ...updatedVariants[0],
          price: parseFloat(price) || 0,
          compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
          sku: sku,
          barcode: barcode,
          inventoryQuantity: parseInt(inventoryQuantity) || 0,
        };
      }

      const updatedProduct: Partial<ShopifyProduct> = {
        title,
        bodyHtml: description,
        vendor,
        productType,
        status,
        inventoryRole,
        satProductCode,
        satProductName,
        satUnitCode,
        satUnitName,
        variants: updatedVariants,
        updatedAt: serverTimestamp()
      };

      await updateDoc(docRef, updatedProduct);
      router.push("/productos");
      
    } catch (error) {
      console.error("Error updating product:", error);
      alert("Error al actualizar el producto");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.")) {
      setDeleting(true);
      try {
        if (!companyId) return;
        await deleteDoc(doc(db, "companies", companyId, "products", productId));
        router.push("/productos");
      } catch (error) {
        console.error("Error deleting product:", error);
        alert("Error al eliminar el producto");
        setDeleting(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in zoom-in duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/productos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Editar producto</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="destructive" onClick={handleDelete} disabled={deleting || saving} className="gap-2">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Eliminar
          </Button>
          <Button onClick={handleSave} disabled={saving || deleting} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar Cambios
          </Button>
        </div>
      </div>

      {(originalProduct?.variants && originalProduct.variants.length > 1) && (
        <div className="bg-amber-50 text-amber-800 border border-amber-200 p-4 rounded-xl flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <p className="text-sm font-medium">Este producto tiene múltiples variantes (como diferentes tallas o colores). Los campos de precio e inventario aquí abajo solo modificarán la variante principal por ahora.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Main Info */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <div>
              <label className="text-sm font-semibold mb-1.5 block">Título</label>
              <Input 
                placeholder="Ej. Playera de algodón cuello redondo" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold block">Descripción</label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 border-indigo-200"
                  onClick={generateAIDescription}
                  disabled={generatingAi || !title}
                >
                  {generatingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Mejorar con IA
                </Button>
              </div>
              <Textarea 
                placeholder="Describe tu producto..." 
                className="min-h-[150px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {/* Media (Placeholder) */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold mb-4">Elementos multimedia</h3>
            {originalProduct?.images && originalProduct.images.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto">
                {originalProduct.images.map((img: any, idx: number) => (
                  <div key={idx} className="w-32 h-32 rounded-lg border overflow-hidden shrink-0">
                    <img src={img.src} alt="Producto" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center text-muted-foreground bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                <ImageIcon className="w-10 h-10 mb-3 text-muted-foreground/50" />
                <p className="text-sm font-medium">Agrega archivos o arrastra y suelta</p>
                <p className="text-xs mt-1">Imágenes de alta resolución recomendadas</p>
              </div>
            )}
          </div>

          {/* Pricing */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold mb-2">Precios</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Precio</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input 
                    type="number" 
                    step="0.01" 
                    className="pl-7" 
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Precio de comparación</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input 
                    type="number" 
                    step="0.01" 
                    className="pl-7" 
                    placeholder="0.00"
                    value={compareAtPrice}
                    onChange={(e) => setCompareAtPrice(e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t">
              <label className="text-sm font-medium mb-1.5 block text-indigo-700">Costo Unitario Promedio</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input 
                  value={cost}
                  disabled
                  className="pl-7 bg-muted text-muted-foreground font-semibold"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Calculado automáticamente mediante Costo Promedio Ponderado en las recepciones de mercancía.
              </p>
            </div>
          </div>

          {/* Inventory */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold mb-2">Inventario</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">SKU</label>
                <Input 
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Código de barras</label>
                <Input 
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <div className="flex justify-between items-center max-w-[200px] mb-1.5">
                  <label className="text-sm font-medium">Cantidad disponible</label>
                </div>
                <Input 
                  type="number" 
                  value={inventoryQuantity}
                  disabled={true}
                  className="max-w-[200px] bg-muted/50"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  La cantidad de inventario solo puede modificarse mediante el módulo de <Link href="/inventarios/movimientos" className="text-indigo-600 underline">Movimientos</Link> o Transferencias.
                </p>
              </div>
            </div>
          </div>

          {/* Facturación SAT */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Configuración SAT (CFDI 4.0)
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Estos códigos son requeridos para facturar correctamente.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Clave de Producto/Servicio</label>
                <SatCatalogSelect 
                  type="product" 
                  value={satProductCode} 
                  nameValue={satProductName}
                  onChange={(code, name) => {
                    setSatProductCode(code);
                    setSatProductName(name);
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Clave de Unidad de Medida</label>
                <SatCatalogSelect 
                  type="unit" 
                  value={satUnitCode} 
                  nameValue={satUnitName}
                  onChange={(code, name) => {
                    setSatUnitCode(code);
                    setSatUnitName(name);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Status */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold">Estado del producto</h3>
            <select 
              className="w-full border rounded-md p-2 text-sm bg-background"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'DRAFT')}
            >
              <option value="ACTIVE">Activo</option>
              <option value="DRAFT">Borrador</option>
            </select>
            
            <h3 className="font-semibold pt-4 border-t">Rol en Inventario</h3>
            <select 
              className="w-full border rounded-md p-2 text-sm bg-background"
              value={inventoryRole}
              onChange={(e) => setInventoryRole(e.target.value as any)}
            >
              <option value="PRODUCTO">Producto (Para venta)</option>
              <option value="MATERIA_PRIMA">Materia Prima (Para ensambles)</option>
              <option value="AMBOS">Ambos (Para venta y ensambles)</option>
            </select>
          </div>

          {/* Organization */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold">Organización del producto</h3>
            <div>
              <label className="text-sm font-medium mb-1.5 block text-muted-foreground">Tipo de producto</label>
              <Input 
                placeholder="Ej. Ropa, Electrónica..." 
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block text-muted-foreground">Proveedor</label>
              <Input 
                placeholder="Ej. Nike, Apple..." 
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
