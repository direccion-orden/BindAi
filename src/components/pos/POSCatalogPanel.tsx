"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, limit, getDocs, where, startAfter, documentId, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Search, Barcode, Image as ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePOS, Product } from "@/context/POSContext";
import { useAuth } from "@/context/AuthContext";
import { ShopifyProduct } from "@/types/product";

export function POSCatalogPanel() {
  const { companyId } = useAuth();
  const { addItemToCart, branchId } = usePOS();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [branchWarehouses, setBranchWarehouses] = useState<string[]>([]);

  // Removed effect from here

  const fetchInitialProducts = async () => {
    setLoading(true);
    try {
      if (!companyId) return;
      // Fetch the first 50 active products (using the new Shopify schema)
      const q = query(collection(db, "companies", companyId, "products"), where("status", "==", "ACTIVE"));
      const snapshot = await getDocs(q);
      const fetched: Product[] = snapshot.docs.map(doc => {
        const data = doc.data() as ShopifyProduct;
        const variant = data.variants && data.variants.length > 0 ? data.variants[0] : null;
        
        return {
          id: doc.id, // Or variant.id if we want to sell variants
          title: data.title + (variant && variant.title !== "Default Title" ? ` - ${variant.title}` : ""),
          sku: variant?.sku || '',
          code: variant?.barcode || '',
          cost: 0,
          price: variant?.price || 0,
          imageUrl: data.images && data.images.length > 0 ? data.images[0].src : null,
          bindCurrentInventory: variant?.inventoryQuantity || 0,
          inventoryByWarehouse: variant?.inventoryByWarehouse,
          unit: 'pz',
          tags: data.tags || [],
          productType: data.productType
        };
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

  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(p => 
        (p.title && p.title.toLowerCase().includes(lowerQ)) || 
        (p.sku && p.sku.toLowerCase().includes(lowerQ)) || 
        (p.code && p.code.toLowerCase().includes(lowerQ))
      );
    }
    
    // Compute current inventory dynamically based on active warehouses for this branch
    return result.map(p => {
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
  }, [products, searchQuery, branchWarehouses]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      // If there is exactly one product that matches exactly the SKU or Code
      const exactMatch = filteredProducts.find(
        p => p.sku?.toLowerCase() === searchQuery.toLowerCase() || p.code?.toLowerCase() === searchQuery.toLowerCase()
      );
      
      if (exactMatch) {
        addItemToCart(exactMatch);
        setSearchQuery(""); // Clear search after adding
      } else if (filteredProducts.length === 1) {
        // Fallback: if there's only 1 filtered result, assume that's the one they meant
        addItemToCart(filteredProducts[0]);
        setSearchQuery("");
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-card border rounded-lg shadow-sm overflow-hidden min-w-[300px]">
      {/* Header / Buscador */}
      <div className="p-4 border-b bg-muted/20 shrink-0">
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
      </div>
      
      {/* Cuadrícula de Productos */}
      <div className="flex-1 p-4 overflow-y-auto bg-muted/10 custom-scrollbar">
         {loading ? (
           <div className="h-full flex items-center justify-center text-muted-foreground">
             <p>Cargando catálogo...</p>
           </div>
         ) : (
           <div className="grid grid-cols-2 gap-4">
             {filteredProducts.map(product => (
               <div 
                 key={product.id} 
                 onClick={() => addItemToCart(product)}
                 className="bg-background border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col group hover:border-primary/50"
               >
                 <div className="aspect-square bg-muted/30 relative flex items-center justify-center overflow-hidden">
                    {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                        <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                    )}
                 </div>
                 <div className="p-3 flex-1 flex flex-col">
                    <p className="text-xs text-muted-foreground mb-1">{product.sku}</p>
                    <h3 className="font-medium text-sm leading-tight flex-1 line-clamp-2" title={product.title}>{product.title}</h3>
                    <div className="flex items-end justify-between mt-2">
                        <span className="font-bold text-primary">
                            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((product.price || 0) * 1.16)}
                        </span>
                    </div>
                 </div>
               </div>
             ))}
             {filteredProducts.length === 0 && !loading && (
                 <div className="col-span-full py-10 text-center text-muted-foreground">
                     No se encontraron productos. {searchQuery ? "Intenta otra búsqueda." : "No hay productos en la base de datos."}
                 </div>
             )}
           </div>
         )}
      </div>
    </div>
  );
}
