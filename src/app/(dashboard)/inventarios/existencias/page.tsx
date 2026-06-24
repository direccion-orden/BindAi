"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { collection, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Download, 
  Loader2, 
  Warehouse, 
  ArrowLeft, 
  AlertCircle,
  Tag,
  Layers,
  Inbox
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShopifyProduct } from "@/types/product";

interface Category {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  warehouses: { id: string; name: string }[];
}

interface WarehouseData {
  id: string;
  name: string;
  description: string;
}

interface FlattenedStockItem {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  fullName: string;
  sku: string;
  barcode: string;
  categoryId: string;
  categoryName: string;
  totalStock: number;
  breakdown: {
    warehouseId: string;
    warehouseName: string;
    locationId: string;
    locationName: string;
    qty: number;
  }[];
}

export default function ExistenciasPage() {
  const { companyId } = useAuth();
  
  // Data State
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("Todas");
  const [selectedCategory, setSelectedCategory] = useState("Todas");

  useEffect(() => {
    if (!companyId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Categories
        const categoriesSnap = await getDocs(collection(db, "companies", companyId, "categories"));
        const categoriesList = categoriesSnap.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || d.Name || d.description || d.Description || ""
          };
        }).filter(c => c.name !== "");
        categoriesList.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        setCategories(categoriesList);

        // Fetch Locations (Sucursales)
        const locationsSnap = await getDocs(collection(db, "companies", companyId, "locations"));
        const locationsList = locationsSnap.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || d.Name || "Sucursal sin nombre",
            warehouses: d.warehouses || []
          };
        });
        locationsList.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
        setLocations(locationsList);

        // Fetch Warehouses (Almacenes)
        const warehousesSnap = await getDocs(collection(db, "companies", companyId, "warehouses"));
        const warehousesList = warehousesSnap.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            name: d.name || d.Name || "Almacén sin nombre",
            description: d.description || d.Description || ""
          };
        });
        setWarehouses(warehousesList);

        // Fetch Products
        const productsSnap = await getDocs(collection(db, "companies", companyId, "products"));
        const productsList = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShopifyProduct));
        setProducts(productsList);

      } catch (error) {
        console.error("Error loading inventory existence data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId]);

  // Compute stock items per variant
  const stockItems = useMemo(() => {
    const list: FlattenedStockItem[] = [];

    products.forEach(product => {
      // Resolve Category Name
      const catId = product.categoryId || (product as any).Category1ID || "";
      const matchedCat = categories.find(c => c.id === catId);
      let categoryName = "Sin Categoría";
      if (matchedCat) {
        categoryName = matchedCat.name;
      } else if (product.productType) {
        const isRoleValue = [
          "producto", "materia_prima", "materia prima", "ambos",
          "active", "draft", "archived"
        ].includes(product.productType.toLowerCase());
        if (!isRoleValue) {
          categoryName = product.productType;
        }
      }

      const variants = product.variants || [];
      variants.forEach(variant => {
        const variantTitle = variant.title || "Default Title";
        const fullName = variantTitle !== "Default Title" 
          ? `${product.title} - ${variantTitle}` 
          : product.title;

        // Build stock breakdown across all warehouses & locations
        const breakdown: FlattenedStockItem["breakdown"] = [];
        let totalStock = 0;

        // Resolve allowed warehouses if a specific branch/location is selected
        let allowedWarehouseIds: string[] = [];
        if (selectedLocation !== "Todas") {
          const loc = locations.find(l => l.id === selectedLocation);
          allowedWarehouseIds = loc?.warehouses?.map(w => w.id) || [];
        }

        // Gather inventory counts
        const invByWh = variant.inventoryByWarehouse || {};
        
        // Loop over warehouses in catalog to resolve names and locations
        warehouses.forEach(wh => {
          const qty = Number(invByWh[wh.id]) || 0;
          
          // Find which sucursal owns this warehouse
          const ownerLocation = locations.find(l => 
            l.warehouses?.some(w => w.id === wh.id)
          );
          const locationName = ownerLocation ? ownerLocation.name : "Sin Sucursal Asignada";
          const locationId = ownerLocation ? ownerLocation.id : "";

          // Filter by warehouse sucursal if requested
          if (selectedLocation !== "Todas" && locationId !== selectedLocation) {
            return;
          }

          if (qty > 0 || selectedLocation === "Todas") {
            breakdown.push({
              warehouseId: wh.id,
              warehouseName: wh.name,
              locationId,
              locationName,
              qty
            });
          }

          totalStock += qty;
        });

        // If a specific location is selected, the totalStock is the sum of allowed warehouses only
        if (selectedLocation !== "Todas") {
          totalStock = allowedWarehouseIds.reduce((sum, whId) => sum + (Number(invByWh[whId]) || 0), 0);
        }

        list.push({
          productId: product.id,
          variantId: variant.id,
          productTitle: product.title,
          variantTitle,
          fullName,
          sku: variant.sku || "",
          barcode: variant.barcode || "",
          categoryId: catId,
          categoryName,
          totalStock,
          breakdown
        });
      });
    });

    return list;
  }, [products, categories, locations, warehouses, selectedLocation]);

  // Apply filters: Search Term and Category
  const filteredItems = useMemo(() => {
    return stockItems.filter(item => {
      // 1. Filter by category
      if (selectedCategory !== "Todas") {
        // Resolve category matching
        const selectedCatObj = categories.find(c => c.name.toLowerCase() === selectedCategory.toLowerCase());
        const selectedCatId = selectedCatObj?.id;
        
        const matchesCategory = selectedCatId && (
          item.categoryId === selectedCatId ||
          item.categoryName.toLowerCase() === selectedCategory.toLowerCase()
        );
        if (!matchesCategory) return false;
      }

      // 2. Filter by search term
      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase().trim();
        const matchesSearch = 
          item.fullName.toLowerCase().includes(term) ||
          item.sku.toLowerCase().includes(term) ||
          item.barcode.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [stockItems, selectedCategory, searchTerm, categories]);

  // Export to Excel / CSV with BOM
  const handleExportCSV = () => {
    const headers = [
      "Producto",
      "Variante",
      "SKU",
      "Codigo de Barras",
      "Categoria",
      "Existencia Total",
      "Almacenes Detalle (Almacen - Sucursal: Cantidad)"
    ];

    const rows = filteredItems.map(item => {
      const breakdownText = item.breakdown
        .map(b => `${b.warehouseName} (${b.locationName}): ${b.qty}`)
        .join(" | ");

      return [
        item.productTitle,
        item.variantTitle === "Default Title" ? "" : item.variantTitle,
        item.sku || "",
        item.barcode || "",
        item.categoryName,
        item.totalStock,
        breakdownText || "Sin Existencia"
      ];
    });

    // Universal Excel Friendly CSV with BOM (\uFEFF)
    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `existencias_inventario_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-500">Cargando existencias de almacen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/inventarios">
              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8 hover:bg-slate-100">
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </Button>
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Existencias</h1>
          </div>
          <p className="text-sm text-slate-500 pl-10">
            Monitorea el inventario actual de tus productos y variantes agrupado por sucursal y almacen.
          </p>
        </div>
        <div className="flex items-center gap-2 pl-10 md:pl-0">
          <Button 
            variant="outline" 
            className="gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold h-9 text-xs" 
            onClick={handleExportCSV}
            disabled={filteredItems.length === 0}
          >
            <Download className="w-4 h-4 text-indigo-600" /> Exportar a Excel
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Filters Header */}
        <div className="p-4 border-b flex flex-col md:flex-row items-center gap-4 bg-slate-50/50">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Buscar por producto, SKU o codigo de barras..." 
              className="pl-9 h-10 text-xs w-full bg-white border-slate-200 placeholder:text-slate-400 focus-visible:ring-indigo-500 font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Sucursal Filter */}
          <div className="w-full md:w-60 shrink-0">
            <div className="relative">
              <Warehouse className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full pl-9 pr-3 border border-slate-200 rounded-md h-10 text-xs bg-white text-slate-700 shadow-sm font-semibold hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="Todas">Todas las sucursales</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Categoria Filter */}
          <div className="w-full md:w-60 shrink-0">
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full pl-9 pr-3 border border-slate-200 rounded-md h-10 text-xs bg-white text-slate-700 shadow-sm font-semibold hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="Todas">Todas las categorias</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="overflow-x-auto">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="p-3 bg-slate-100 rounded-full w-max mx-auto">
                <Inbox className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">Sin existencias encontradas</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                No hay productos ni variantes que coincidan con la busqueda o filtros aplicados.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50/50">
                  <TableHead className="font-semibold text-slate-600 text-xs pl-6">Producto / Variante</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-xs">SKU</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-xs">Cod. Barras</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-xs">Categoria</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-xs">Distribucion Almacen</TableHead>
                  <TableHead className="font-semibold text-slate-600 text-xs pr-6 text-right">Existencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item, idx) => (
                  <TableRow key={`${item.productId}-${item.variantId}-${idx}`} className="hover:bg-slate-50/30">
                    {/* Producto */}
                    <TableCell className="pl-6 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 text-sm leading-tight">{item.productTitle}</span>
                        {item.variantTitle !== "Default Title" && (
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded w-max mt-1">
                            {item.variantTitle}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    
                    {/* SKU */}
                    <TableCell className="font-mono text-xs text-slate-700 font-semibold">{item.sku || "-"}</TableCell>
                    
                    {/* Codigo de barras */}
                    <TableCell className="font-mono text-xs text-slate-600">{item.barcode || "-"}</TableCell>
                    
                    {/* Categoria */}
                    <TableCell>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100/80 text-slate-600 border border-slate-200/50">
                        {item.categoryName}
                      </span>
                    </TableCell>
                    
                    {/* Distribucion */}
                    <TableCell className="max-w-md">
                      {item.breakdown.length === 0 ? (
                        <span className="text-xs font-bold text-slate-400 italic">Sin Stock Registrado</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {item.breakdown.map((b, bIdx) => (
                            <span 
                              key={`${b.warehouseId}-${bIdx}`} 
                              className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-1 shadow-sm"
                              title={`Sucursal: ${b.locationName}`}
                            >
                              <span className="text-indigo-600 font-semibold">{b.warehouseName}:</span>
                              <span className="text-slate-800 font-extrabold">{b.qty}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    
                    {/* Existencia Total */}
                    <TableCell className="pr-6 text-right font-extrabold text-sm">
                      <span className={item.totalStock > 0 ? "text-emerald-600" : "text-slate-400"}>
                        {item.totalStock}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
