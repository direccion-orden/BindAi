"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
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
  const productId = decodeURIComponent(params.id as string);
  const { companyId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Basic Info
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [productType, setProductType] = useState("");
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED' | 'DRAFT'>('DRAFT');
  const [inventoryRole, setInventoryRole] = useState<'PRODUCTO' | 'MATERIA_PRIMA' | 'AMBOS'>('PRODUCTO');
  const [isService, setIsService] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [availableTags, setAvailableTags] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableVendors, setAvailableVendors] = useState<
    { id: string; name: string }[]
  >([]);

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
  const [initialCost, setInitialCost] = useState("0");

  const [originalProduct, setOriginalProduct] = useState<Partial<ShopifyProduct> | null>(null);
  const [variantsList, setVariantsList] = useState<any[]>([]);

  // AI State
  const [allImages, setAllImages] = useState<{id: string, file?: File, preview: string, isOriginal?: boolean, src?: string}[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const added = Array.from(e.target.files).map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        isOriginal: false
      }));
      setAllImages((prev) => [...prev, ...added]);
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

    const newImages = [...allImages];
    const draggedIndex = newImages.findIndex((img) => img.id === draggedId);
    const targetIndex = newImages.findIndex((img) => img.id === targetId);

    const [draggedItem] = newImages.splice(draggedIndex, 1);
    newImages.splice(targetIndex, 0, draggedItem);
    setAllImages(newImages);
    setDraggedId(null);
  };


  const [generatingAi, setGeneratingAi] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchProduct();
    }
  }, [productId, companyId]);

  // Fetch Warehouses, Categories, Tags & Vendors
  useEffect(() => {
    if (!companyId) return;


    // Categories
    const qC = query(collection(db, "companies", companyId, "categories"));
    const unsubC = onSnapshot(qC, (snap) => {
      const c = snap.docs.map((doc) => {
        const d = doc.data();
        return { id: doc.id, name: d.name || d.Name || d.description || d.Description || "Sin nombre" };
      });
      console.log("Categories loaded:", c.length); setCategories(c);
    });

    // Tags
    const qT = query(collection(db, "companies", companyId, "tags"));
    const unsubT = onSnapshot(qT, (snap) => {
      const t = snap.docs.map((doc) => ({ id: doc.id, name: doc.data().name }));
      setAvailableTags(t);
    });

    // Vendors
    const qV = query(collection(db, "companies", companyId, "vendors"));
    const unsubV = onSnapshot(qV, (snap) => {
      const v = snap.docs.map((doc) => {
        const d = doc.data();
        return { id: doc.id, name: d.name || d.Name || d.RazonSocial || d.NombreComercial || d.LegalName || d.ComercialName || "Sin nombre" };
      });
      setAvailableVendors(v);
    });

    return () => {
            unsubC();
      unsubT();
      unsubV();
    };
  }, [companyId]);

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
      setVariantsList(data.variants || []);
      if (data.images) setAllImages(data.images.map((img:any) => ({ id: img.id || crypto.randomUUID(), preview: img.src, isOriginal: true, src: img.src })));
      
      setTitle(data.title || "");
      setDescription(data.bodyHtml || "");
      setVendor(data.vendor || "");
      setProductType(data.productType || "");
      setStatus(data.status || "DRAFT");
      setInventoryRole(data.inventoryRole || "PRODUCTO");
      setIsService(!!data.isService);
      setSatProductCode(data.satProductCode || "");
      setSatProductName(data.satProductName || "");
      setSatUnitCode(data.satUnitCode || "");
      setSatUnitName(data.satUnitName || "");
      setSelectedTags(data.tags || []);

      // Load first variant data if exists
      if (data.variants && data.variants.length > 0) {
        const v = data.variants[0];
        setPrice(v.price?.toString() || "");
        setCompareAtPrice(v.compareAtPrice?.toString() || "");
        setSku(v.sku || "");
        setBarcode(v.barcode || "");
        setInventoryQuantity(v.inventoryQuantity?.toString() || "0");
        setInitialCost(data.initialCost?.toString() || data.cost?.toString() || "0");
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

  const handleCreateCategory = async () => {
    if (!companyId || !newCategoryName.trim()) return;
    setSavingCategory(true);
    try {
      const docId = crypto.randomUUID();
      await setDoc(doc(db, "companies", companyId, "categories", docId), {
        name: newCategoryName.trim(),
        createdAt: serverTimestamp(),
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
        createdAt: serverTimestamp(),
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
        createdAt: serverTimestamp(),
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
        body: JSON.stringify({ title, description, productType, vendor, companyId })
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
      
      let updatedVariants = [...variantsList];
      
      if (updatedVariants.length <= 1) {
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
      }

      
      let finalImages = [];
      for (const img of allImages) {
        if (img.isOriginal) {
          finalImages.push({ id: img.id, src: img.src, altText: title });
        } else if (img.file) {
          const imageRef = ref(storage, `companies/${companyId}/products/${productId}/${img.id}`);
          await uploadBytes(imageRef, img.file);
          const url = await getDownloadURL(imageRef);
          finalImages.push({ id: img.id, src: url, altText: title });
        }
      }

      const updatedProduct: Partial<ShopifyProduct> = {
        initialCost: parseFloat(initialCost) || 0,
        title,
        bodyHtml: description,
        vendor,
        productType,
        status,
        inventoryRole,
        isService,
        satProductCode,
        satProductName,
        satUnitCode,
        satUnitName,
        variants: updatedVariants,
        images: finalImages,
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

          {/* Media */}
          <div className="bg-card border rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold mb-4">Elementos multimedia</h3>
            
            {allImages.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {allImages.map((img, idx) => (
                  <div 
                    key={img.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, img.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, img.id)}
                    className={`relative aspect-square border rounded-lg overflow-hidden cursor-move group ${draggedId === img.id ? "opacity-50" : "opacity-100 hover:border-primary/50"}`}
                  >
                    <img src={img.preview} alt="Producto" className="w-full h-full object-cover" />
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="destructive" size="icon" className="h-6 w-6" onClick={(e) => { e.preventDefault(); setAllImages(prev => prev.filter(i => i.id !== img.id)); }}>
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
            ) : null}
            
            <label className="block border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center text-muted-foreground bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageChange} />
              <ImageIcon className="w-10 h-10 mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium">Agrega archivos o arrastra y suelta</p>
              <p className="text-xs mt-1">Imágenes de alta resolución recomendadas</p>
            </label>
          </div>

          {variantsList.length > 1 ? (
            <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h3 className="font-semibold text-base">Variantes del producto</h3>
                  <p className="text-xs text-muted-foreground">Administra los precios, SKUs y códigos de barra de cada variante.</p>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setVariantsList(prev => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        title: `Variante ${prev.length + 1}`,
                        price: parseFloat(price) || 0,
                        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
                        sku: "",
                        barcode: "",
                        inventoryQuantity: 0,
                        weight: 0,
                        weightUnit: "kg"
                      }
                    ]);
                  }}
                  className="text-xs bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800"
                >
                  + Añadir Variante
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left text-xs uppercase tracking-wider">
                      <th className="pb-2 font-bold pr-2">Nombre / Opción</th>
                      <th className="pb-2 font-bold pr-2">SKU</th>
                      <th className="pb-2 font-bold pr-2">Código de barras</th>
                      <th className="pb-2 font-bold pr-2 w-28 text-right">Precio</th>
                      <th className="pb-2 font-bold pr-2 w-28 text-right">Comp. Precio</th>
                      <th className="pb-2 font-bold w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {variantsList.map((v, index) => (
                      <tr key={v.id || index} className="hover:bg-muted/10">
                        <td className="py-2.5 pr-2">
                          <Input 
                            value={v.title || ""} 
                            onChange={(e) => {
                              const newList = [...variantsList];
                              newList[index] = { ...newList[index], title: e.target.value };
                              setVariantsList(newList);
                            }}
                            placeholder="Ej. Chico, Rojo..."
                            className="h-8 text-xs font-semibold"
                          />
                        </td>
                        <td className="py-2.5 pr-2">
                          <Input 
                            value={v.sku || ""} 
                            onChange={(e) => {
                              const newList = [...variantsList];
                              newList[index] = { ...newList[index], sku: e.target.value };
                              setVariantsList(newList);
                            }}
                            placeholder="SKU"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="py-2.5 pr-2">
                          <Input 
                            value={v.barcode || ""} 
                            onChange={(e) => {
                              const newList = [...variantsList];
                              newList[index] = { ...newList[index], barcode: e.target.value };
                              setVariantsList(newList);
                            }}
                            placeholder="Código barras"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">$</span>
                            <Input 
                              type="number" 
                              step="0.01" 
                              value={v.price !== undefined ? v.price : ""} 
                              onChange={(e) => {
                                const newList = [...variantsList];
                                newList[index] = { ...newList[index], price: parseFloat(e.target.value) || 0 };
                                setVariantsList(newList);
                              }}
                              placeholder="0.00"
                              className="h-8 pl-5 text-xs text-right font-medium"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">$</span>
                            <Input 
                              type="number" 
                              step="0.01" 
                              value={v.compareAtPrice !== undefined && v.compareAtPrice !== null ? v.compareAtPrice : ""} 
                              onChange={(e) => {
                                const newList = [...variantsList];
                                newList[index] = { ...newList[index], compareAtPrice: e.target.value ? parseFloat(e.target.value) : null };
                                setVariantsList(newList);
                              }}
                              placeholder="0.00"
                              className="h-8 pl-5 text-xs text-right"
                            />
                          </div>
                        </td>
                        <td className="py-2.5 text-center">
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon"
                            onClick={() => {
                              setVariantsList(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                * Las cantidades de stock de cada variante solo se pueden modificar mediante el módulo de Movimientos de Inventario.
              </p>
            </div>
          ) : (
            <>
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
                
                <div className="pt-4 border-t grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Costo Inicial</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number"
                        value={initialCost}
                        onChange={(e) => setInitialCost(e.target.value)}
                        className="pl-7"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block text-indigo-700">Costo Promedio</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input value={cost} disabled className="pl-7 bg-muted text-muted-foreground font-semibold" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Inventory */}
              <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Inventario</h3>
                  <Button 
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const defaultV = {
                        id: crypto.randomUUID(),
                        title: "Chico",
                        price: parseFloat(price) || 0,
                        sku: sku,
                        barcode: barcode,
                        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
                        inventoryQuantity: parseInt(inventoryQuantity) || 0,
                        weight: 0,
                        weightUnit: "kg"
                      };
                      const secondV = {
                        id: crypto.randomUUID(),
                        title: "Grande",
                        price: parseFloat(price) || 0,
                        sku: sku ? `${sku}-G` : "",
                        barcode: "",
                        compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
                        inventoryQuantity: 0,
                        weight: 0,
                        weightUnit: "kg"
                      };
                      setVariantsList([defaultV, secondV]);
                    }}
                    className="text-xs text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-800"
                  >
                    + Convertir a Múltiples Variantes
                  </Button>
                </div>
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
                      La cantidad de inventario solo puede modificarse mediante el módulo de <Link href="/inventarios/movimientos" target="_blank" className="text-indigo-600 underline">Movimientos</Link> o Transferencias.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

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
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'ARCHIVED' | 'DRAFT')}
            >
              <option value="ACTIVE">Activo</option>
              <option value="DRAFT">Borrador</option>
              <option value="ARCHIVED">Archivado</option>
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

            <div className="flex items-center gap-2 pt-4 border-t">
              <input
                type="checkbox"
                id="isService"
                checked={isService}
                onChange={(e) => setIsService(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="isService" className="text-sm font-semibold select-none cursor-pointer">
                Es un servicio / concepto intangible
              </label>
            </div>
          </div>

          {/* Organization */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold">Organización del producto</h3>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Categoría
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-primary px-2"
                  onClick={() => setIsCategoryModalOpen(true)}
                >
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
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border border-dashed flex flex-col gap-2 items-start">
                  <span>No hay categorías registradas.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCategoryModalOpen(true)}
                  >
                    Crear Categoría
                  </Button>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Proveedor
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-primary px-2"
                  onClick={() => setIsVendorModalOpen(true)}
                >
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
                  {availableVendors.map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border border-dashed flex flex-col gap-2 items-start">
                  <span>No hay proveedores.</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsVendorModalOpen(true)}
                  >
                    Crear Proveedor
                  </Button>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Etiquetas
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-primary px-2"
                  onClick={() => setIsTagModalOpen(true)}
                >
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
                  <option value="" disabled>
                    Agregar etiqueta...
                  </option>
                  {availableTags
                    .filter((t) => !selectedTags.includes(t.name))
                    .map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                </select>
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
                      >
                        {tag}
                        <button
                          onClick={() =>
                            setSelectedTags(
                              selectedTags.filter((t) => t !== tag),
                            )
                          }
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
              <label className="text-sm font-medium">
                Nombre de la Categoría
              </label>
              <Input
                autoFocus
                placeholder="Ej. Bebidas, Snacks..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCategory();
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsCategoryModalOpen(false);
                  setNewCategoryName("");
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateCategory}
                disabled={!newCategoryName.trim() || savingCategory}
              >
                {savingCategory && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
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
              <label className="text-sm font-medium">
                Nombre de la Etiqueta
              </label>
              <Input
                autoFocus
                placeholder="Ej. Novedad, Verano, Descuento..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTag();
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsTagModalOpen(false);
                  setNewTagName("");
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateTag}
                disabled={!newTagName.trim() || savingTag}
              >
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
              <label className="text-sm font-medium">
                Razón Social o Nombre
              </label>
              <Input
                autoFocus
                placeholder="Ej. Comercializadora S.A. de C.V."
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateVendor();
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setIsVendorModalOpen(false);
                  setNewVendorName("");
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateVendor}
                disabled={!newVendorName.trim() || savingVendor}
              >
                {savingVendor && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Crear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
