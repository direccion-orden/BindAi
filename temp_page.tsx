"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, serverTimestamp, query, onSnapshot, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { ArrowLeft, Save, Loader2, Image as ImageIcon, Plus, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShopifyProduct, ShopifyProductVariant, ShopifyProductOption } from "@/types/product";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { SatCatalogSelect } from "@/components/pos/SatCatalogSelect";

export default function NuevoProductoPage() {
  const router = useRouter();
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  
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
  
  interface ProductImage {
    id: string;
    file: File;
    preview: string;
  }
  const [images, setImages] = useState<ProductImage[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  
  // Pricing & Inventory for default variant
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [inventoryByWarehouse, setInventoryByWarehouse] = useState<Record<string, number>>({});
  const [warehouses, setWarehouses] = useState<{id: string, name: string}[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [availableTags, setAvailableTags] = useState<{id: string, name: string}[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableVendors, setAvailableVendors] = useState<{id: string, name: string}[]>([]);

  // Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);

  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [savingVendor, setSavingVendor] = useState(false);

  // Fetch Warehouses, Categories, Tags & Vendors
  useEffect(() => {
    if (!companyId) return;
    
    // Warehouses
    const qW = query(collection(db, "companies", companyId, "warehouses"));
    const unsubW = onSnapshot(qW, (snap) => {
      const w = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setWarehouses(w);
    });

    // Categories
    const qC = query(collection(db, "companies", companyId, "categories"));
    const unsubC = onSnapshot(qC, (snap) => {
      const c = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setCategories(c);
    });

    // Tags
    const qT = query(collection(db, "companies", companyId, "tags"));
    const unsubT = onSnapshot(qT, (snap) => {
      const t = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setAvailableTags(t);
    });

    // Vendors
    const qV = query(collection(db, "companies", companyId, "vendors"));
    const unsubV = onSnapshot(qV, (snap) => {
      const v = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setAvailableVendors(v);
    });

    return () => {
      unsubW();
      unsubC();
      unsubT();
      unsubV();
    };
  }, [companyId]);

  // AI State
  const [generatingAi, setGeneratingAi] = useState(false);

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

  const handleCreateCategory = async () => {
    if (!companyId || !newCategoryName.trim()) return;
    setSavingCategory(true);
    try {
      const docId = crypto.randomUUID();
      await setDoc(doc(db, "companies", companyId, "categories", docId), {
        name: newCategoryName.trim(),
        createdAt: serverTimestamp()
      });
      setProductType(newCategoryName.trim());
      setNewCategoryName("");
      setIsCategoryModalOpen(false);
    } catch (e) {
      console.error(e);
      alert("Error al crear categoría");
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCreateTag = async () => {
    if (!companyId || !newTagName.trim()) return;
    setSavingTag(true);
    try {
      const docId = crypto.randomUUID();
      await setDoc(doc(db, "companies", companyId, "tags", docId), {
        name: newTagName.trim(),
        createdAt: serverTimestamp()
      });
      if (!selectedTags.includes(newTagName.trim())) {
        setSelectedTags([...selectedTags, newTagName.trim()]);
      }
      setNewTagName("");
      setIsTagModalOpen(false);
    } catch (e) {
      console.error(e);
      alert("Error al crear etiqueta");
    } finally {
      setSavingTag(false);
    }
  };

  const handleCreateVendor = async () => {
    if (!companyId || !newVendorName.trim()) return;
    setSavingVendor(true);
    try {
      const docId = crypto.randomUUID();
      await setDoc(doc(db, "companies", companyId, "vendors", docId), {
        name: newVendorName.trim(),
        createdAt: serverTimestamp()
      });
      setVendor(newVendorName.trim());
      setNewVendorName("");
      setIsVendorModalOpen(false);
    } catch (e) {
      console.error(e);
      alert("Error al crear proveedor");
    } finally {
      setSavingVendor(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newImages = Array.from(e.target.files).map(file => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file)
      }));
      setImages(prev => [...prev, ...newImages]);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const newImages = [...images];
    const draggedIndex = newImages.findIndex(img => img.id === draggedId);
    const targetIndex = newImages.findIndex(img => img.id === targetId);

    const [draggedItem] = newImages.splice(draggedIndex, 1);
    newImages.splice(targetIndex, 0, draggedItem);
    setImages(newImages);
    setDraggedId(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert("El título es obligatorio");
      return;
    }
    
    setLoading(true);
    try {
      // Create a default handle
      const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      
      // Create default variant
      const defaultVariant: ShopifyProductVariant = {
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
        inventoryByWarehouse: inventoryByWarehouse,
      };

      const defaultOption: ShopifyProductOption = {
        name: "Title",
        values: ["Default Title"]
      };
      
      let uploadedImages: any[] = [];
      if (images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const storageRef = ref(storage, `products/${Date.now()}_${img.file.name}`);
          const snapshot = await uploadBytes(storageRef, img.file);
          const downloadUrl = await getDownloadURL(snapshot.ref);
          uploadedImages.push({
            id: crypto.randomUUID(),
            src: downloadUrl,
            alt: title,
            position: i + 1
          });
        }
      }

      const newProduct: Partial<ShopifyProduct> = {
        title,
        bodyHtml: description,
        vendor,
        productType,
        handle,
        tags: selectedTags,
        status,
        inventoryRole,
        satProductCode,
        satProductName,
        satUnitCode,
        satUnitName,
        options: [defaultOption],
        variants: [defaultVariant],
        images: uploadedImages,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (!companyId) throw new Error("No company ID found");
      await addDoc(collection(db, "companies", companyId, "products"), newProduct);
      router.push("/productos");
      
    } catch (error) {
      console.error("Error saving product:", error);
      alert("Error al guardar el producto");
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/productos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Agregar producto</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Descartar</span>
          <Button onClick={handleSave} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </Button>
        </div>
      </div>

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
                  Generar con IA
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

          {/* Media */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold mb-4">Elementos multimedia</h3>
            
            {images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, img.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, img.id)}
                    className={`relative aspect-square border rounded-lg overflow-hidden cursor-move group ${draggedId === img.id ? 'opacity-50' : 'opacity-100 hover:border-primary/50'}`}
                  >
                    <img src={img.preview} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="icon" className="h-6 w-6" onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setImages(images.filter(i => i.id !== img.id));
                      }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    {idx === 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-primary-foreground text-[10px] text-center py-1">
                        Principal
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <label className="block border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center text-muted-foreground bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer relative overflow-hidden">
              <input 
                type="file" 
                accept="image/*"
                multiple
                className="hidden" 
                onChange={handleImageChange}
              />
              <ImageIcon className="w-10 h-10 mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium">Agrega archivos o arrastra y suelta</p>
              <p className="text-xs mt-1">Imágenes de alta resolución recomendadas</p>
            </label>
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
          </div>

          {/* Inventory */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold mb-2">Inventario</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col justify-end">
                <label className="text-sm font-medium mb-1.5 block">SKU (Unidad de mantenimiento de existencias)</label>
                <Input 
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                />
              </div>
              <div className="flex flex-col justify-end">
                <label className="text-sm font-medium mb-1.5 block">Código de barras (ISBN, UPC, GTIN, etc.)</label>
                <Input 
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                />
              </div>
              <div className="col-span-2 pt-2 border-t mt-2">
                <label className="text-sm font-medium mb-3 block">Inventario Inicial por Almacén</label>
                <div className="space-y-3">
                  {warehouses.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No hay almacenes configurados. Agrega almacenes en Configuración.</p>
                  ) : (
                    warehouses.map(w => (
                      <div key={w.id} className="flex items-center justify-between gap-4 max-w-sm">
                        <span className="text-sm text-muted-foreground">{w.name}</span>
                        <Input 
                          type="number" 
                          placeholder="0"
                          value={inventoryByWarehouse[w.id] || ""}
                          onChange={(e) => setInventoryByWarehouse({
                            ...inventoryByWarehouse,
                            [w.id]: parseInt(e.target.value) || 0
                          })}
                          className="max-w-[120px]"
                        />
                      </div>
                    ))
                  )}
                </div>
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-muted-foreground">Categoría</label>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => setIsCategoryModalOpen(true)}>
                  + Nueva
                </Button>
              </div>
              {categories.length > 0 ? (
                <select 
                  className="w-full border rounded-md p-2 text-sm bg-background"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                >
                  <option value="">Seleccionar categoría...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border border-dashed flex flex-col gap-2 items-start">
                  <span>No hay categorías registradas.</span>
                  <Button variant="outline" size="sm" onClick={() => setIsCategoryModalOpen(true)}>
                    Crear Categoría
                  </Button>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-muted-foreground">Proveedor</label>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => setIsVendorModalOpen(true)}>
                  + Nuevo
                </Button>
              </div>
              {availableVendors.length > 0 ? (
                <select 
                  className="w-full border rounded-md p-2 text-sm bg-background"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                >
                  <option value="">Seleccionar proveedor...</option>
                  {availableVendors.map(v => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border border-dashed flex flex-col gap-2 items-start">
                  <span>No hay proveedores.</span>
                  <Button variant="outline" size="sm" onClick={() => setIsVendorModalOpen(true)}>
                    Crear Proveedor
                  </Button>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-muted-foreground">Etiquetas</label>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-primary px-2" onClick={() => setIsTagModalOpen(true)}>
                  + Nueva
                </Button>
              </div>
              <div className="space-y-3">
                <select 
                  className="w-full border rounded-md p-2 text-sm bg-background"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && !selectedTags.includes(val)) {
                      setSelectedTags([...selectedTags, val]);
                    }
                    e.target.value = "";
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Agregar etiqueta...</option>
                  {availableTags.filter(t => !selectedTags.includes(t.name)).map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedTags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                        {tag}
                        <button 
                          onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                          className="hover:text-destructive transition-colors"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold">Nueva Categoría</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de la Categoría</label>
              <Input 
                autoFocus
                placeholder="Ej. Bebidas, Snacks..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateCategory();
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setIsCategoryModalOpen(false); setNewCategoryName(""); }}>
                Cancelar
              </Button>
              <Button onClick={handleCreateCategory} disabled={!newCategoryName.trim() || savingCategory}>
                {savingCategory && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear
              </Button>
            </div>
          </div>
        </div>
      )}

      {isTagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold">Nueva Etiqueta</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de la Etiqueta</label>
              <Input 
                autoFocus
                placeholder="Ej. Novedad, Verano, Descuento..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTag();
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setIsTagModalOpen(false); setNewTagName(""); }}>
                Cancelar
              </Button>
              <Button onClick={handleCreateTag} disabled={!newTagName.trim() || savingTag}>
                {savingTag && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear
              </Button>
            </div>
          </div>
        </div>
      )}

      {isVendorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold">Nuevo Proveedor</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium">Razón Social o Nombre</label>
              <Input 
                autoFocus
                placeholder="Ej. Comercializadora S.A. de C.V."
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateVendor();
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setIsVendorModalOpen(false); setNewVendorName(""); }}>
                Cancelar
              </Button>
              <Button onClick={handleCreateVendor} disabled={!newVendorName.trim() || savingVendor}>
                {savingVendor && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Crear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
