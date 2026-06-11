"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { collection, query, getDocs, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Search, Barcode, Image as ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePOS, Product } from "@/context/POSContext";
import { useAuth } from "@/context/AuthContext";
import { ShopifyProduct } from "@/types/product";

export function POSCatalogPanel({ width }: { width?: number }) {
  const { companyId } = useAuth();
  const { addItemToCart, branchId } = usePOS();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [branchWarehouses, setBranchWarehouses] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("TODAS");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedProductForVariants, setSelectedProductForVariants] = useState<Product | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [actualWidth, setActualWidth] = useState<number>(550);

  // ResizeObserver to track real rendered width of the panel
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setActualWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const fetchInitialProducts = async () => {
    setLoading(true);
    try {
      if (!companyId) return;
      // Fetch active products (using the new Shopify schema)
      const q = query(collection(db, "companies", companyId, "products"), where("status", "in", ["ACTIVE", "active"]));
      const snapshot = await getDocs(q);
      const fetched: Product[] = snapshot.docs.map(doc => {
        const data = doc.data() as ShopifyProduct;
        const hasMultipleVariants = data.variants && data.variants.length > 1 && data.variants[0]?.title !== "Default Title";
        const variant = data.variants && data.variants.length > 0 ? data.variants[0] : null;
        
        return {
          id: doc.id,
          title: hasMultipleVariants ? data.title : (data.title + (variant && variant.title !== "Default Title" ? ` - ${variant.title}` : "")),
          sku: variant?.sku || '',
          code: variant?.barcode || '',
          cost: 0,
          price: variant?.price || 0,
          imageUrl: data.images && data.images.length > 0 ? data.images[0].src : null,
          bindCurrentInventory: variant?.inventoryQuantity || 0,
          inventoryByWarehouse: variant?.inventoryByWarehouse,
          unit: 'pz',
          tags: data.tags || [],
          productType: data.productType,
          isService: data.isService || false,
          bodyHtml: data.bodyHtml || "",
          variants: data.variants || [],
          hasMultipleVariants,
          // Map category IDs from the Firestore document
          Category1ID: (data as any).Category1ID || null,
          Category2ID: (data as any).Category2ID || null,
          Category3ID: (data as any).Category3ID || null,
          categoryId: data.categoryId || null,
          salesCount: (data as any).salesCount || 0
        } as any;
      });
      setProducts(fetched);
    } catch (e) {
      console.error("Error fetching products:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchInitialProducts();

      // Fetch categories
      const fetchCategories = async () => {
        try {
          const q = query(collection(db, "companies", companyId, "categories"));
          const snapshot = await getDocs(q);
          const catList = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
              id: doc.id,
              name: d.name || d.Name || d.description || d.Description || ""
            };
          }).filter(c => c.name !== "");
          setCategories(catList);
        } catch (e) {
          console.error("Error fetching categories:", e);
        }
      };
      fetchCategories();
    }
  }, [companyId]);

  useEffect(() => {
    const fetchLocationWarehouses = async () => {
      if (!companyId || !branchId) {
        setBranchWarehouses([]);
        return;
      }
      try {
        const docSnap = await getDoc(doc(db, "companies", companyId, "locations", branchId));
        if (docSnap.exists()) {
           const locData = docSnap.data();
           const ws = locData.warehouses || locData.Warehouses || [];
           setBranchWarehouses(ws.map((w: any) => w.id || w.ID || w.Id));
        }
      } catch (e) {
        console.error("Error fetching branch warehouses", e);
      }
    };
    fetchLocationWarehouses();
  }, [companyId, branchId]);

  const allCategories = useMemo(() => {
    const nameSet = new Set<string>();
    
    // Always guarantee FORJACRIL is present in uppercase
    nameSet.add("FORJACRIL");

    categories.forEach(c => {
      if (c && typeof c.name === 'string' && c.name.trim() !== '') {
        nameSet.add(c.name.trim().toUpperCase());
      }
    });

    // Sort alphabetically
    const sorted = Array.from(nameSet).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    return ["TODAS", ...sorted];
  }, [categories]);

  const filteredProducts = useMemo(() => {
    let result = products;

    // Filter by selected category
    if (selectedCategory && selectedCategory.toUpperCase() !== "TODAS") {
      // Find the ID corresponding to this category name (case-insensitive)
      const selectedCatObj = categories.find(c => c && typeof c.name === 'string' && c.name.toLowerCase() === selectedCategory.toLowerCase());
      const selectedCatId = selectedCatObj?.id;

      result = result.filter(p => {
        // Case-insensitive match on productType string name
        const matchByName = p.productType && typeof p.productType === 'string' && p.productType.toLowerCase() === selectedCategory.toLowerCase();
        
        // Match on category document ID fields
        const matchById = selectedCatId && (
          (p as any).Category1ID === selectedCatId ||
          (p as any).Category2ID === selectedCatId ||
          (p as any).Category3ID === selectedCatId ||
          (p as any).categoryId === selectedCatId
        );
        return matchByName || matchById;
      });
    }

    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(p => 
        (p.title && p.title.toLowerCase().includes(lowerQ)) || 
        (p.sku && p.sku.toLowerCase().includes(lowerQ)) || 
        (p.code && p.code.toLowerCase().includes(lowerQ))
      );
    }
    
    // Sort products by sales frequency descending
    const sortedResult = [...result].sort((a, b) => ((b as any).salesCount || 0) - ((a as any).salesCount || 0));

    // Compute current inventory dynamically based on active warehouses for this branch
    return sortedResult.map(p => {
      let stock = 0;
      if (p.inventoryByWarehouse) {
         branchWarehouses.forEach(whId => {
            stock += (p.inventoryByWarehouse![whId] || 0);
         });
      } else {
         stock = p.bindCurrentInventory || 0; // fallback for older data
      }
      return { ...p, bindCurrentInventory: stock };
    });
  }, [products, selectedCategory, searchQuery, branchWarehouses, categories]);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      const term = searchQuery.trim();
      
      // 1. Buscar en la lista local precargada
      const exactMatch = filteredProducts.find(
        p => p.sku?.toLowerCase() === term.toLowerCase() || p.code?.toLowerCase() === term.toLowerCase()
      );
      
      if (exactMatch) {
        if (exactMatch.hasMultipleVariants) {
          setSelectedProductForVariants(exactMatch);
        } else {
          addItemToCart(exactMatch);
        }
        setSearchQuery(""); // Limpiar búsqueda
        return;
      }

      // 2. Búsqueda de respaldo rápida (directamente en Firestore por SKU o Code)
      try {
        if (!companyId) return;
        const qSku = query(collection(db, "companies", companyId, "products"), where("status", "in", ["ACTIVE", "active"]), where("SKU", "==", term));
        const snapSku = await getDocs(qSku);
        
        let foundDoc = snapSku.docs[0];
        
        if (!foundDoc) {
          const qCode = query(collection(db, "companies", companyId, "products"), where("status", "in", ["ACTIVE", "active"]), where("Code", "==", term));
          const snapCode = await getDocs(qCode);
          foundDoc = snapCode.docs[0];
        }

        if (foundDoc) {
          const data = foundDoc.data() as ShopifyProduct;
          const hasMultipleVariants = data.variants && data.variants.length > 1 && data.variants[0]?.title !== "Default Title";
          const variant = data.variants && data.variants.length > 0 ? data.variants[0] : null;
          const directProduct: Product = {
            id: foundDoc.id,
            title: hasMultipleVariants ? data.title : (data.title + (variant && variant.title !== "Default Title" ? ` - ${variant.title}` : "")),
            sku: variant?.sku || '',
            code: variant?.barcode || '',
            cost: 0,
            price: variant?.price || 0,
            imageUrl: data.images && data.images.length > 0 ? data.images[0].src : null,
            bindCurrentInventory: variant?.inventoryQuantity || 0,
            inventoryByWarehouse: variant?.inventoryByWarehouse,
            unit: 'pz',
            tags: data.tags || [],
            productType: data.productType,
            isService: data.isService || false,
            bodyHtml: data.bodyHtml || "",
            variants: data.variants || [],
            hasMultipleVariants
          } as any;
          
          if (hasMultipleVariants) {
            setSelectedProductForVariants(directProduct);
          } else {
            addItemToCart(directProduct);
          }
          setSearchQuery("");
          return;
        }
      } catch (err) {
        console.error("Error en búsqueda directa de respaldo:", err);
      }

      if (filteredProducts.length === 1) {
        const prod = filteredProducts[0];
        if (prod.hasMultipleVariants) {
          setSelectedProductForVariants(prod);
        } else {
          addItemToCart(prod);
        }
        setSearchQuery("");
      }
    }
  };

  const gridColsClass = useMemo(() => {
    if (actualWidth < 400) return "grid-cols-2";
    if (actualWidth >= 400 && actualWidth < 540) return "grid-cols-3";
    return "grid-cols-4";
  }, [actualWidth]);

  return (
    <div 
      ref={containerRef}
      style={width ? { width: `${width}px`, flexGrow: 0, flexShrink: 1 } : undefined}
      className={`flex flex-col bg-card border rounded-lg shadow-sm overflow-hidden ${!width ? 'flex-1 min-w-[300px]' : ''}`}
    >
      {/* Header / Buscador */}
      <div className="p-4 border-b bg-muted/20 shrink-0 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input 
            autoFocus
            className="pl-10 pr-10 h-12 text-lg bg-background"
            placeholder="Buscar por nombre, o escanear código (Presiona Enter)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Barcode className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-50" />
        </div>

        {/* Selector de Categorías (Lista de Selección) */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full h-10 px-3 pr-10 bg-background border border-input rounded-md text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer appearance-none transition-all duration-150"
          >
            {allCategories.map(cat => (
              <option key={cat} value={cat}>
                {cat === "TODAS" ? "Todas las Categorías" : cat}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>
      </div>
      
      {/* Cuadrícula de Productos */}
      <div className="flex-1 p-4 overflow-y-auto bg-muted/10 custom-scrollbar">
         {loading ? (
           <div className="h-full flex items-center justify-center text-muted-foreground">
             <p>Cargando catálogo...</p>
           </div>
         ) : (
           <div className={`grid ${gridColsClass} gap-3`}>
             {filteredProducts.map(product => (
                <div 
                  key={product.id} 
                  onClick={() => {
                    if (product.hasMultipleVariants) {
                      setSelectedProductForVariants(product);
                    } else {
                      addItemToCart(product);
                    }
                  }}
                  className="bg-background border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col group hover:border-primary/50 relative"
                >
                  {product.hasMultipleVariants && (
                    <span className="absolute top-1.5 left-1.5 bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow z-10">
                      Variantes
                    </span>
                  )}
                  <div className="aspect-square bg-muted/30 relative flex items-center justify-center overflow-hidden">
                     {product.imageUrl ? (
                         <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                     ) : (
                         <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
                     )}
                  </div>
                  <div className="p-2 flex-1 flex flex-col">
                     <p className="text-[10px] text-muted-foreground mb-0.5 truncate">{product.sku}</p>
                     <h3 className="font-medium text-xs leading-tight flex-1 line-clamp-2" title={product.title}>{product.title}</h3>
                     <div className="flex items-end justify-between mt-1">
                         <span className="font-bold text-primary text-xs">
                             {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format((product.price || 0) * 1.16)}
                         </span>
                     </div>
                  </div>
                </div>
              ))}
              {filteredProducts.length === 0 && !loading && (
                   <div className="col-span-full py-10 text-center text-muted-foreground">
                       No se encontraron productos. {searchQuery ? "Intenta otra búsqueda." : "No hay productos en esta categoría."}
                   </div>
               )}
            </div>
          )}
       </div>

       {/* Modal de Selección de Variante */}
       {selectedProductForVariants && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
           <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200 border">
             <div className="flex justify-between items-start">
               <div>
                 <h3 className="text-lg font-bold text-foreground">{selectedProductForVariants.title}</h3>
                 <p className="text-xs text-muted-foreground">Selecciona una variante para agregar al carrito</p>
               </div>
               <button 
                 onClick={() => setSelectedProductForVariants(null)}
                 className="text-muted-foreground hover:text-foreground text-xl font-medium"
               >
                 &times;
               </button>
             </div>
             
             <div className="max-h-60 overflow-y-auto divide-y border rounded-md">
               {selectedProductForVariants.variants?.map((v: any) => {
                 const inventory = v.inventoryQuantity ?? 0;
                 return (
                   <div 
                     key={v.id} 
                     className="p-3 flex items-center justify-between hover:bg-muted/30 transition-colors text-sm"
                   >
                     <div className="flex-1 min-w-0 pr-2">
                       <div className="font-semibold text-foreground truncate">{v.title}</div>
                       <div className="text-xs text-muted-foreground truncate">SKU: {v.sku}</div>
                       <div className="text-xs font-medium text-slate-500">
                         Disp: <span className={inventory > 0 ? "text-emerald-600" : "text-amber-600"}>{inventory}</span>
                       </div>
                     </div>
                     <div className="flex items-center gap-3">
                       <span className="font-bold text-primary">
                         {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format((v.price || 0) * 1.16)}
                       </span>
                       <button
                         onClick={() => {
                           const cartProd: Product = {
                             ...selectedProductForVariants,
                             title: `${selectedProductForVariants.title} - ${v.title}`,
                             sku: v.sku,
                             code: v.barcode || v.sku,
                             price: v.price || 0,
                             bindCurrentInventory: v.inventoryQuantity || 0,
                             inventoryByWarehouse: v.inventoryByWarehouse
                           };
                           addItemToCart(cartProd);
                           setSelectedProductForVariants(null);
                         }}
                         className="bg-primary text-primary-foreground font-semibold px-3 py-1.5 rounded-md text-xs hover:bg-primary/95 shadow-sm active:scale-95 transition-all"
                       >
                         Agregar
                       </button>
                     </div>
                   </div>
                 );
               })}
             </div>
             
             <div className="flex justify-end pt-2">
               <button
                 onClick={() => setSelectedProductForVariants(null)}
                 className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted/50 transition-colors"
               >
                 Cancelar
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
}
