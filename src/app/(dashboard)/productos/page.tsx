"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Plus, Search, Tag, Filter, MoreHorizontal, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShopifyProduct } from "@/types/product";
import { useAuth } from "@/context/AuthContext";

export default function ProductosPage() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const { companyId } = useAuth();

  useEffect(() => {
    if (companyId) {
      fetchProducts();
    }
  }, [companyId]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      if (!companyId) return;
      const q = query(collection(db, "companies", companyId, "products"), orderBy("title"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShopifyProduct));
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const title = p.title || "";
    const vendor = p.vendor || "";
    const type = p.productType || "";
    const search = searchTerm.toLowerCase();
    
    return title.toLowerCase().includes(search) || 
           vendor.toLowerCase().includes(search) ||
           type.toLowerCase().includes(search);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
          <p className="text-muted-foreground mt-1">Administra tu inventario y catálogo de productos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/productos/importar">
            <Button variant="outline" className="gap-2">
              <Package className="w-4 h-4" /> Importar CSV
            </Button>
          </Link>
          <Link href="/productos/nuevo">
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Agregar Producto
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b flex flex-col sm:flex-row items-center gap-4 bg-muted/20">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar productos..." 
              className="pl-9 max-w-md"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" className="gap-2 flex-1 sm:flex-none">
              <Filter className="w-4 h-4" /> Filtrar
            </Button>
            <Button variant="outline" className="gap-2 flex-1 sm:flex-none">
              <Tag className="w-4 h-4" /> Etiquetas
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-6 py-4 font-semibold">Producto</th>
                <th className="px-6 py-4 font-semibold">Estado</th>
                <th className="px-6 py-4 font-semibold">Inventario</th>
                <th className="px-6 py-4 font-semibold">Tipo</th>
                <th className="px-6 py-4 font-semibold">Proveedor</th>
                <th className="px-6 py-4 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    Cargando productos...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Package className="w-12 h-12 text-muted-foreground/30" />
                      <p>No se encontraron productos.</p>
                      {searchTerm && (
                        <Button variant="link" onClick={() => setSearchTerm("")}>Limpiar búsqueda</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const totalInventory = product.variants?.reduce((sum, v) => {
                    let total = 0;
                    if ((v as any).inventoryByWarehouse) {
                      total += Object.values((v as any).inventoryByWarehouse).reduce((a: any, b: any) => a + b, 0);
                    }
                    total += ((v as any).inventoryQuantity || 0);
                    return sum + total;
                  }, 0) || ((product as any).bindCurrentInventory || 0);
                  const variantsCount = product.variants?.length || 0;
                  const imageSrc = product.images && product.images.length > 0 
                    ? product.images[0].src 
                    : (product as any).imageUrl;
                  
                  const isActive = product.status === 'ACTIVE' || (product as any).isActive === true;
                  const isDraft = product.status === 'DRAFT';
                  
                  return (
                    <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0 border overflow-hidden">
                            {imageSrc ? (
                              <img src={imageSrc} alt={product.title} className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-5 h-5 text-muted-foreground/50" />
                            )}
                          </div>
                          <div>
                            <Link href={`/productos/${product.id}`} className="font-semibold hover:underline text-foreground">
                              {product.title}
                            </Link>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {variantsCount > 0 ? `${variantsCount} variante${variantsCount !== 1 ? 's' : ''}` : 'Producto simple'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          isActive ? 'bg-green-50 text-green-700 border-green-200' : 
                          isDraft ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          {isActive ? 'Activo' : isDraft ? 'Borrador' : 'Archivado'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={totalInventory <= 0 ? 'text-destructive font-medium' : ''}>
                          {totalInventory} disponibles
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {product.productType || '—'}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {product.vendor || '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
