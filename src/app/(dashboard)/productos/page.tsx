"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, query, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Plus, Search, MoreHorizontal, Package, Store, Loader2, X, CheckCircle2, AlertTriangle, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShopifyProduct } from "@/types/product";
import { useAuth } from "@/context/AuthContext";
import { pushProductsToShopify } from "@/actions/shopify";

export default function ProductosPage() {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");

  // Selection & Shopify sync state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handlePushToShopify = async () => {
    if (!companyId || selectedIds.size === 0) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await pushProductsToShopify(companyId, Array.from(selectedIds));
      setSyncResult({ created: result.created, updated: result.updated, errors: result.errors });
      setSelectedIds(new Set());
    } catch (err: any) {
      setSyncResult({ created: 0, updated: 0, errors: [err.message] });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportCSV = () => {
    import("papaparse").then((Papa) => {
      const exportData: any[] = [];
      products.forEach(p => {
        const pAny = p as any;

        // Resolver nombre de categoría
        const catId = pAny.categoryId || pAny.Category1ID || "";
        const matchedCat = categories.find(c => c.id === catId);
        let categoryName = "";
        if (matchedCat) {
          categoryName = matchedCat.name;
        } else if (pAny.productType) {
          const isRoleValue = [
            "producto", "materia_prima", "materia prima", "ambos",
            "active", "draft", "archived"
          ].includes(pAny.productType.toLowerCase());
          if (!isRoleValue) {
            categoryName = pAny.productType;
          }
        }

        const tagsString = Array.isArray(pAny.tags) ? pAny.tags.join(", ") : "";

        if (!pAny.variants || pAny.variants.length === 0) {
          exportData.push({
            ID: pAny.id || "",
            Titulo: pAny.title || "",
            Variante: "",
            SKU: pAny.SKU || pAny.sku || "",
            CodigoBarras: pAny.Code || pAny.barcode || "",
            Precio: 0,
            PrecioComparacion: "",
            Costo: pAny.cost !== undefined ? pAny.cost : (pAny.initialCost || 0),
            Categoria: categoryName,
            Proveedor: pAny.vendor || "",
            Estado: pAny.status || "ACTIVE",
            RolInventario: pAny.inventoryRole || "PRODUCTO",
            EsServicio: pAny.isService ? "SI" : "NO",
            Etiquetas: tagsString,
            ClaveSAT: pAny.satProductCode || "",
            UnidadSAT: pAny.satUnitCode || "",
            Peso: 0,
            Moneda: pAny.currency || "MXN",
            Descripcion: pAny.bodyHtml || ""
          });
        } else {
          pAny.variants.forEach((v: any) => {
            const variantTitle = pAny.variants.length > 1 || (v.title && v.title !== "Default Title") ? v.title : "";
            exportData.push({
              ID: pAny.id || "",
              Titulo: pAny.title || "",
              Variante: variantTitle,
              SKU: v.sku || "",
              CodigoBarras: v.barcode || "",
              Precio: v.price !== undefined ? v.price : 0,
              PrecioComparacion: v.compareAtPrice !== undefined && v.compareAtPrice !== null ? v.compareAtPrice : "",
              Costo: v.cost !== undefined ? v.cost : (pAny.cost !== undefined ? pAny.cost : (pAny.initialCost || 0)),
              Categoria: categoryName,
              Proveedor: pAny.vendor || "",
              Estado: pAny.status || "ACTIVE",
              RolInventario: pAny.inventoryRole || "PRODUCTO",
              EsServicio: pAny.isService ? "SI" : "NO",
              Etiquetas: tagsString,
              ClaveSAT: pAny.satProductCode || "",
              UnidadSAT: pAny.satUnitCode || "",
              Peso: v.weight || 0,
              Moneda: pAny.currency || "MXN",
              Descripcion: pAny.bodyHtml || ""
            });
          });
        }
      });

      const csv = Papa.unparse(exportData);
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `productos_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  const { companyId } = useAuth();

  useEffect(() => {
    if (companyId) {
      fetchProducts();
      fetchCategories();
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

  const fetchCategories = async () => {
    try {
      if (!companyId) return;
      const q = query(collection(db, "companies", companyId, "categories"));
      const snapshot = await getDocs(q);
      const catList = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name || d.Name || d.description || d.Description || ""
        };
      }).filter(c => c.name !== "");
      catList.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      setCategories(catList);
    } catch (e) {
      console.error("Error fetching categories:", e);
    }
  };

  const filteredProducts = products.filter(p => {
    // 1. Filtrar por categoría seleccionada
    if (selectedCategory && selectedCategory !== "Todas") {
      const selectedCatObj = categories.find(c => c.name.toLowerCase() === selectedCategory.toLowerCase());
      const selectedCatId = selectedCatObj?.id;

      const matchByName = p.productType && typeof p.productType === 'string' && p.productType.toLowerCase() === selectedCategory.toLowerCase();
      const matchById = selectedCatId && (
        (p as any).Category1ID === selectedCatId ||
        (p as any).Category2ID === selectedCatId ||
        (p as any).Category3ID === selectedCatId ||
        (p as any).categoryId === selectedCatId
      );
      if (!matchByName && !matchById) {
        return false;
      }
    }

    // 2. Filtrar por búsqueda
    const title = p.title || "";
    const vendor = p.vendor || "";
    const type = p.productType || "";
    const search = searchTerm.toLowerCase();
    
    // Buscar también en SKU y código de barras de las variantes
    const hasSkuOrBarcode = p.variants?.some(v => 
      (v.sku && String(v.sku).toLowerCase().includes(search)) ||
      (v.barcode && String(v.barcode).toLowerCase().includes(search))
    ) || (p as any).SKU === searchTerm || (p as any).Code === searchTerm;
    
    return title.toLowerCase().includes(search) || 
           vendor.toLowerCase().includes(search) ||
           type.toLowerCase().includes(search) ||
           hasSkuOrBarcode;
  });

  // Sorting state
  const [sortField, setSortField] = useState<string>("title");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const getProductInventory = (product: ShopifyProduct) => {
    return product.variants?.reduce((sum, v) => {
      let total = 0;
      if ((v as any).inventoryByWarehouse) {
        total += (Object.values((v as any).inventoryByWarehouse) as number[]).reduce((a: number, b: number) => a + b, 0);
      }
      total += ((v as any).inventoryQuantity || 0);
      return sum + total;
    }, 0) || ((product as any).bindCurrentInventory || 0);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "totalInventory" ? "desc" : "asc");
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 ml-1.5 inline shrink-0" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    );
  };

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortField === "totalInventory") {
      const aVal = getProductInventory(a);
      const bVal = getProductInventory(b);
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    let aVal = "";
    let bVal = "";

    if (sortField === "title") {
      aVal = a.title || "";
      bVal = b.title || "";
    } else if (sortField === "status") {
      const aActive = a.status === 'ACTIVE' || (a as any).isActive === true;
      const bActive = b.status === 'ACTIVE' || (b as any).isActive === true;
      aVal = aActive ? "activo" : (a.status === 'DRAFT' ? "borrador" : "archivado");
      bVal = bActive ? "activo" : (b.status === 'DRAFT' ? "borrador" : "archivado");
    } else if (sortField === "productType") {
      aVal = a.productType || "";
      bVal = b.productType || "";
    } else if (sortField === "vendor") {
      aVal = a.vendor || "";
      bVal = b.vendor || "";
    }

    return sortDirection === "asc"
      ? aVal.localeCompare(bVal, "es")
      : bVal.localeCompare(aVal, "es");
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos</h1>
          <p className="text-muted-foreground mt-1">Administra tu inventario y catálogo de productos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
            <Download className="w-4 h-4" /> Exportar CSV
          </Button>
          <Link href="/productos/importar" target="_blank">
            <Button variant="outline" className="gap-2">
              <Package className="w-4 h-4" /> Importar CSV
            </Button>
          </Link>
          <Link href="/productos/nuevo" target="_blank">
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
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
          <div className="w-full sm:w-60 shrink-0">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border rounded-md p-2 h-10 text-sm bg-background text-foreground shadow-sm hover:border-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="Todas">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="pl-4 pr-2 py-4 w-10">
                  <input
                    type="checkbox"
                    checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer select-none hover:bg-muted/70 hover:text-foreground transition-colors" onClick={() => handleSort("title")}>
                  <div className="flex items-center">
                    Producto
                    {renderSortIcon("title")}
                  </div>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer select-none hover:bg-muted/70 hover:text-foreground transition-colors" onClick={() => handleSort("status")}>
                  <div className="flex items-center">
                    Estado
                    {renderSortIcon("status")}
                  </div>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer select-none hover:bg-muted/70 hover:text-foreground transition-colors" onClick={() => handleSort("totalInventory")}>
                  <div className="flex items-center">
                    Inventario
                    {renderSortIcon("totalInventory")}
                  </div>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer select-none hover:bg-muted/70 hover:text-foreground transition-colors" onClick={() => handleSort("productType")}>
                  <div className="flex items-center">
                    Tipo
                    {renderSortIcon("productType")}
                  </div>
                </th>
                <th className="px-6 py-4 font-semibold cursor-pointer select-none hover:bg-muted/70 hover:text-foreground transition-colors" onClick={() => handleSort("vendor")}>
                  <div className="flex items-center">
                    Proveedor
                    {renderSortIcon("vendor")}
                  </div>
                </th>
                <th className="px-6 py-4 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    Cargando productos...
                  </td>
                </tr>
              ) : sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
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
                sortedProducts.map((product) => {
                  const totalInventory = getProductInventory(product);
                  const variantsCount = product.variants?.length || 0;
                  const imageSrc = product.images && product.images.length > 0 
                    ? product.images[0].src 
                    : (product as any).imageUrl;
                  
                  const isActive = product.status === 'ACTIVE' || (product as any).isActive === true;
                  const isDraft = product.status === 'DRAFT';
                  
                  return (
                    <tr key={product.id} className={`hover:bg-muted/30 transition-colors ${selectedIds.has(product.id) ? 'bg-blue-50/50' : ''}`}>
                      <td className="pl-4 pr-2 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(product.id)}
                          onChange={() => toggleSelect(product.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
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
                            <Link href={`/productos/${product.id}`} target="_blank" className="font-semibold hover:underline text-foreground">
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

      {/* Floating action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4 border border-slate-700">
          <span className="text-sm font-medium">
            {selectedIds.size} producto{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
            onClick={handlePushToShopify}
            disabled={isSyncing}
          >
            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
            {isSyncing ? 'Sincronizando...' : 'Enviar a Shopify'}
          </Button>
          <button onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sync result toast */}
      {syncResult && (
        <div className="fixed bottom-6 right-6 z-50 bg-white border rounded-xl shadow-2xl p-4 max-w-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {syncResult.errors.length === 0 ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              )}
              <span className="font-semibold text-sm">Sincronización completada</span>
            </div>
            <button onClick={() => setSyncResult(null)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            {syncResult.created > 0 && <p>✅ {syncResult.created} producto{syncResult.created !== 1 ? 's' : ''} creado{syncResult.created !== 1 ? 's' : ''} en Shopify</p>}
            {syncResult.updated > 0 && <p>🔄 {syncResult.updated} producto{syncResult.updated !== 1 ? 's' : ''} actualizado{syncResult.updated !== 1 ? 's' : ''} en Shopify</p>}
            {syncResult.errors.length > 0 && (
              <div className="text-red-600">
                <p>❌ {syncResult.errors.length} error{syncResult.errors.length !== 1 ? 'es' : ''}:</p>
                {syncResult.errors.slice(0, 3).map((e, i) => <p key={i} className="truncate">• {e}</p>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
