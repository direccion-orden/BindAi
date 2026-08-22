"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, doc, writeBatch, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  ArrowLeft,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  FileSpreadsheet,
  Info,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

interface ParsedRow {
  rawRow: Record<string, any>;
  id: string;
  titulo: string;
  variante: string;
  sku: string;
  codigoBarras: string;
  precio: number;
  precioComparacion: number | null;
  costo: number;
  categoria: string;
  proveedor: string;
  estado: "ACTIVE" | "DRAFT";
  rolInventario: "PRODUCTO" | "MATERIA_PRIMA" | "AMBOS";
  esServicio: boolean;
  etiquetas: string[];
  claveSat: string;
  unidadSat: string;
  peso: number;
  moneda: string;
  descripcion: string;
}

export default function ImportarProductosPage() {
  const router = useRouter();
  const { companyId } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [groupedProductsCount, setGroupedProductsCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [createdCount, setCreatedCount] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  // Generar y descargar plantilla CSV de ejemplo
  const handleDownloadTemplate = () => {
    const headers = [
      "ID",
      "Titulo",
      "Variante",
      "SKU",
      "CodigoBarras",
      "Precio",
      "PrecioComparacion",
      "Costo",
      "Categoria",
      "Proveedor",
      "Estado",
      "RolInventario",
      "EsServicio",
      "Etiquetas",
      "ClaveSAT",
      "UnidadSAT",
      "Peso",
      "Moneda",
      "Descripcion"
    ];

    const sampleRows = [
      [
        "",
        "Playera Algodón Básica",
        "Negra / M",
        "TSHIRT-BLK-M",
        "7501234567890",
        "299.00",
        "349.00",
        "120.00",
        "Ropa",
        "Textiles MX",
        "ACTIVE",
        "PRODUCTO",
        "NO",
        "ropa, playera, algodón",
        "53101602",
        "H87",
        "0.25",
        "MXN",
        "Playera 100% algodón de alta calidad"
      ],
      [
        "",
        "Playera Algodón Básica",
        "Negra / G",
        "TSHIRT-BLK-G",
        "7501234567891",
        "299.00",
        "349.00",
        "120.00",
        "Ropa",
        "Textiles MX",
        "ACTIVE",
        "PRODUCTO",
        "NO",
        "ropa, playera, algodón",
        "53101602",
        "H87",
        "0.28",
        "MXN",
        "Playera 100% algodón de alta calidad"
      ],
      [
        "",
        "Servicio de Asesoría Técnica",
        "",
        "SERV-001",
        "",
        "500.00",
        "",
        "0.00",
        "Servicios",
        "Interno",
        "ACTIVE",
        "PRODUCTO",
        "SI",
        "servicio, asesoría",
        "80101500",
        "E48",
        "0.00",
        "MXN",
        "Servicio de consultoría especializada por hora"
      ]
    ];

    const csvContent = [
      headers.join(","),
      ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `plantilla_productos_sistema.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Normalizar encabezados para flexibilidad de mapeo
  const normalizeKey = (key: string): string => {
    return key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  };

  const getValueByKeys = (row: Record<string, any>, possibleKeys: string[]): any => {
    const normalizedRowKeys = Object.keys(row).reduce((acc, k) => {
      acc[normalizeKey(k)] = row[k];
      return acc;
    }, {} as Record<string, any>);

    for (const key of possibleKeys) {
      const norm = normalizeKey(key);
      if (normalizedRowKeys[norm] !== undefined && normalizedRowKeys[norm] !== null) {
        return normalizedRowKeys[norm];
      }
    }
    return undefined;
  };

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile);
    setParsedRows([]);
    setGroupedProductsCount(0);
    setIsDone(false);
    setErrorMsg(null);

    if (!selectedFile) return;

    import("papaparse").then((Papa) => {
      Papa.default.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: (results: any) => {
          try {
            const rawRecords = results.data;
            if (!rawRecords || rawRecords.length === 0) {
              setErrorMsg("El archivo CSV está vacío o no contiene filas.");
              return;
            }

            const parsed: ParsedRow[] = [];
            const uniqueTitlesOrIds = new Set<string>();

            for (let i = 0; i < rawRecords.length; i++) {
              const r = rawRecords[i];

              const id = String(getValueByKeys(r, ["id", "uuid"]) || "").trim();
              const titulo = String(getValueByKeys(r, ["titulo", "title", "nombre", "producto", "codigo"]) || "").trim();

              if (!titulo && !id) continue;

              const variante = String(getValueByKeys(r, ["variante", "variant", "opcion", "option"]) || "").trim();
              const sku = String(getValueByKeys(r, ["sku"]) || "").trim();
              const codigoBarras = String(getValueByKeys(r, ["codigobarras", "codigo", "barcode", "upc", "ean"]) || "").trim();

              const rawPrice = getValueByKeys(r, ["precio", "price", "precioventa", "p-a"]);
              const precio = parseFloat(String(rawPrice || "0").replace(/[^0-9.-]+/g, "")) || 0;

              const rawCompareAtPrice = getValueByKeys(r, ["preciocomparacion", "compareatprice", "preciolista"]);
              const precioComparacion = rawCompareAtPrice !== undefined && rawCompareAtPrice !== ""
                ? (parseFloat(String(rawCompareAtPrice).replace(/[^0-9.-]+/g, "")) || null)
                : null;

              const rawCost = getValueByKeys(r, ["costo", "cost"]);
              const costo = parseFloat(String(rawCost || "0").replace(/[^0-9.-]+/g, "")) || 0;

              const categoria = String(getValueByKeys(r, ["categoria", "category", "producttype", "categoria1"]) || "").trim();
              const proveedor = String(getValueByKeys(r, ["proveedor", "vendor", "marca"]) || "").trim();

              const rawEstado = String(getValueByKeys(r, ["estado", "status"]) || "").trim().toUpperCase();
              const estado: "ACTIVE" | "DRAFT" = rawEstado === "DRAFT" || rawEstado === "BORRADOR" ? "DRAFT" : "ACTIVE";

              const rawRol = String(getValueByKeys(r, ["rolinventario", "inventoryrole", "rol"]) || "").trim().toUpperCase();
              let rolInventario: "PRODUCTO" | "MATERIA_PRIMA" | "AMBOS" = "PRODUCTO";
              if (rawRol.includes("MATERIA") || rawRol.includes("PRIMA")) rolInventario = "MATERIA_PRIMA";
              else if (rawRol.includes("AMBOS")) rolInventario = "AMBOS";

              const rawEsServicio = String(getValueByKeys(r, ["esservicio", "isservice", "servicio"]) || "").trim().toUpperCase();
              const esServicio = ["SI", "TRUE", "VERDADERO", "1"].includes(rawEsServicio);

              const rawEtiquetas = String(getValueByKeys(r, ["etiquetas", "tags"]) || "").trim();
              const etiquetas = rawEtiquetas
                ? rawEtiquetas.split(",").map(t => t.trim()).filter(Boolean)
                : [];

              const claveSat = String(getValueByKeys(r, ["clavesat", "satproductcode", "clavecfdi", "satcode"]) || "").trim();
              const unidadSat = String(getValueByKeys(r, ["unidadsat", "satunitcode", "unidadcfdi", "satunit"]) || "").trim();

              const rawPeso = getValueByKeys(r, ["peso", "weight"]);
              const peso = parseFloat(String(rawPeso || "0").replace(/[^0-9.-]+/g, "")) || 0;

              const moneda = String(getValueByKeys(r, ["moneda", "currency"]) || "MXN").trim().toUpperCase() || "MXN";
              const descripcion = String(getValueByKeys(r, ["descripcion", "description", "bodyhtml", "detalle"]) || "").trim();

              parsed.push({
                rawRow: r,
                id,
                titulo: titulo || "Sin título",
                variante,
                sku,
                codigoBarras,
                precio,
                precioComparacion,
                costo,
                categoria,
                proveedor,
                estado,
                rolInventario,
                esServicio,
                etiquetas,
                claveSat,
                unidadSat,
                peso,
                moneda,
                descripcion
              });

              const key = id || titulo.toLowerCase();
              uniqueTitlesOrIds.add(key);
            }

            setParsedRows(parsed);
            setGroupedProductsCount(uniqueTitlesOrIds.size);
          } catch (e: any) {
            console.error(e);
            setErrorMsg("Error al analizar el formato del archivo: " + e.message);
          }
        }
      });
    });
  };

  const handleFileUpload = async () => {
    if (!companyId || parsedRows.length === 0) return;
    setLoading(true);
    setErrorMsg(null);
    setCreatedCount(0);
    setUpdatedCount(0);
    setIsDone(false);

    try {
      // 1. Obtener catálogo existente de productos para Upsert
      const q = query(collection(db, "companies", companyId, "products"));
      const snapshot = await getDocs(q);

      const productByIdMap = new Map<string, any>();
      const productByTitleMap = new Map<string, any>();
      const productBySkuMap = new Map<string, any>();
      const productByBarcodeMap = new Map<string, any>();

      snapshot.docs.forEach((d) => {
        const p = { id: d.id, ...d.data() } as any;
        productByIdMap.set(d.id, p);

        if (p.title) {
          productByTitleMap.set(String(p.title).trim().toLowerCase(), p);
        }

        if (Array.isArray(p.variants)) {
          p.variants.forEach((v: any) => {
            if (v.sku) productBySkuMap.set(String(v.sku).trim().toLowerCase(), p);
            if (v.barcode) productByBarcodeMap.set(String(v.barcode).trim().toLowerCase(), p);
          });
        }
      });

      // 2. Agrupar filas del CSV por producto (por ID o por Título)
      const groups = new Map<string, ParsedRow[]>();
      parsedRows.forEach((row) => {
        const groupKey = row.id ? `id:${row.id}` : `title:${row.titulo.trim().toLowerCase()}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(row);
      });

      const batches = [];
      let currentBatch = writeBatch(db);
      let batchOperationCount = 0;

      let created = 0;
      let updated = 0;

      // 3. Procesar cada grupo de producto
      for (const [groupKey, rows] of Array.from(groups.entries())) {
        const firstRow = rows[0];

        // Buscar coincidencia en productos existentes
        let existingProduct: any = null;

        if (firstRow.id && productByIdMap.has(firstRow.id)) {
          existingProduct = productByIdMap.get(firstRow.id);
        } else if (productByTitleMap.has(firstRow.titulo.trim().toLowerCase())) {
          existingProduct = productByTitleMap.get(firstRow.titulo.trim().toLowerCase());
        } else {
          // Probar coincidencia por SKU o Código de barras de alguna de sus filas
          for (const r of rows) {
            if (r.sku && productBySkuMap.has(r.sku.toLowerCase())) {
              existingProduct = productBySkuMap.get(r.sku.toLowerCase());
              break;
            }
            if (r.codigoBarras && productByBarcodeMap.has(r.codigoBarras.toLowerCase())) {
              existingProduct = productByBarcodeMap.get(r.codigoBarras.toLowerCase());
              break;
            }
          }
        }

        const productId = existingProduct ? existingProduct.id : (firstRow.id || doc(collection(db, "companies", companyId, "products")).id);
        const ref = doc(db, "companies", companyId, "products", productId);

        const title = firstRow.titulo;
        const handle = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "");

        // Armar variantes
        let finalVariants: any[] = [];
        let finalOptions: any[] = [];

        const isMultiVariantCSV = rows.length > 1 || (rows.length === 1 && Boolean(firstRow.variante && firstRow.variante.toLowerCase() !== "default title"));

        if (existingProduct) {
          // MODO UPDATE: Preservar o actualizar variantes
          const existingVariants: any[] = existingProduct.variants || [];

          if (isMultiVariantCSV) {
            // Actualizar o agregar las variantes especificadas en el CSV
            finalVariants = [...existingVariants];

            rows.forEach((r, idx) => {
              const varTitle = r.variante || (rows.length === 1 ? "Default Title" : `Variante ${idx + 1}`);
              const rSku = r.sku.toLowerCase();
              const rBarcode = r.codigoBarras.toLowerCase();

              let matchIndex = finalVariants.findIndex(v =>
                (rSku && String(v.sku || "").toLowerCase() === rSku) ||
                (rBarcode && String(v.barcode || "").toLowerCase() === rBarcode) ||
                (varTitle && String(v.title || "").toLowerCase() === varTitle.toLowerCase())
              );

              if (matchIndex !== -1) {
                // Actualizar variante existente manteniendo inventario previo
                finalVariants[matchIndex] = {
                  ...finalVariants[matchIndex],
                  title: varTitle,
                  price: r.precio,
                  compareAtPrice: r.precioComparacion !== null ? r.precioComparacion : (finalVariants[matchIndex].compareAtPrice || null),
                  cost: r.costo || finalVariants[matchIndex].cost || 0,
                  sku: r.sku || finalVariants[matchIndex].sku || "",
                  barcode: r.codigoBarras || finalVariants[matchIndex].barcode || "",
                  weight: r.peso || finalVariants[matchIndex].weight || 0,
                };
              } else {
                // Nueva variante dentro de producto existente
                finalVariants.push({
                  id: `var-${crypto.randomUUID()}`,
                  title: varTitle,
                  price: r.precio,
                  compareAtPrice: r.precioComparacion,
                  cost: r.costo,
                  sku: r.sku,
                  barcode: r.codigoBarras,
                  position: finalVariants.length + 1,
                  option1: varTitle,
                  option2: null,
                  option3: null,
                  taxable: true,
                  weight: r.peso,
                  weightUnit: "kg",
                  inventoryQuantity: 0,
                  inventoryByWarehouse: {}
                });
              }
            });

            finalOptions = [
              {
                id: "opt-1",
                name: "Opciones",
                values: finalVariants.map(v => v.title)
              }
            ];
          } else {
            // Un solo registro simple en CSV
            if (existingVariants.length === 0) {
              finalVariants = [
                {
                  id: `var-${productId}`,
                  title: "Default Title",
                  price: firstRow.precio,
                  compareAtPrice: firstRow.precioComparacion,
                  cost: firstRow.costo,
                  sku: firstRow.sku,
                  barcode: firstRow.codigoBarras,
                  position: 1,
                  option1: "Default Title",
                  option2: null,
                  option3: null,
                  taxable: true,
                  weight: firstRow.peso,
                  weightUnit: "kg",
                  inventoryQuantity: 0,
                  inventoryByWarehouse: {}
                }
              ];
            } else {
              // Actualizar variante principal
              finalVariants = existingVariants.map((v, i) => {
                if (i === 0) {
                  return {
                    ...v,
                    price: firstRow.precio !== undefined ? firstRow.precio : v.price,
                    compareAtPrice: firstRow.precioComparacion !== null ? firstRow.precioComparacion : v.compareAtPrice,
                    cost: firstRow.costo || v.cost || 0,
                    sku: firstRow.sku || v.sku || "",
                    barcode: firstRow.codigoBarras || v.barcode || "",
                    weight: firstRow.peso || v.weight || 0
                  };
                }
                return v;
              });
            }

            finalOptions = existingProduct.options || [
              { id: "opt-1", name: "Title", values: ["Default Title"] }
            ];
          }
          updated++;
        } else {
          // MODO CREATE: Nuevo producto
          if (isMultiVariantCSV) {
            finalVariants = rows.map((r, idx) => ({
              id: `var-${crypto.randomUUID()}`,
              title: r.variante || `Variante ${idx + 1}`,
              price: r.precio,
              compareAtPrice: r.precioComparacion,
              cost: r.costo,
              sku: r.sku,
              barcode: r.codigoBarras,
              position: idx + 1,
              option1: r.variante || `Variante ${idx + 1}`,
              option2: null,
              option3: null,
              taxable: true,
              weight: r.peso,
              weightUnit: "kg",
              inventoryQuantity: 0,
              inventoryByWarehouse: {}
            }));

            finalOptions = [
              {
                id: "opt-1",
                name: "Opciones",
                values: finalVariants.map(v => v.title)
              }
            ];
          } else {
            finalVariants = [
              {
                id: `var-${productId}`,
                title: "Default Title",
                price: firstRow.precio,
                compareAtPrice: firstRow.precioComparacion,
                cost: firstRow.costo,
                sku: firstRow.sku,
                barcode: firstRow.codigoBarras,
                position: 1,
                option1: "Default Title",
                option2: null,
                option3: null,
                taxable: true,
                weight: firstRow.peso,
                weightUnit: "kg",
                inventoryQuantity: 0,
                inventoryByWarehouse: {}
              }
            ];
            finalOptions = [
              { id: "opt-1", name: "Title", values: ["Default Title"] }
            ];
          }
          created++;
        }

        // Combinar etiquetas
        const combinedTags = Array.from(new Set([
          ...(existingProduct?.tags || []),
          ...rows.flatMap(r => r.etiquetas)
        ])).filter(Boolean);

        const productData = {
          title: title,
          handle: handle,
          bodyHtml: firstRow.descripcion || existingProduct?.bodyHtml || "",
          vendor: firstRow.proveedor || existingProduct?.vendor || "",
          productType: firstRow.categoria || existingProduct?.productType || "",
          status: firstRow.estado || existingProduct?.status || "ACTIVE",
          inventoryRole: firstRow.rolInventario || existingProduct?.inventoryRole || "PRODUCTO",
          isService: firstRow.esServicio !== undefined ? firstRow.esServicio : (existingProduct?.isService || false),
          tags: combinedTags,
          currency: firstRow.moneda || existingProduct?.currency || "MXN",
          initialCost: firstRow.costo || existingProduct?.initialCost || 0,
          cost: firstRow.costo || existingProduct?.cost || 0,
          satProductCode: firstRow.claveSat || existingProduct?.satProductCode || "",
          satUnitCode: firstRow.unidadSat || existingProduct?.satUnitCode || "",
          variants: finalVariants,
          options: finalOptions,
          images: existingProduct?.images || [], // Preservar imágenes existentes
          updatedAt: new Date()
        };

        if (existingProduct) {
          currentBatch.update(ref, productData);
        } else {
          currentBatch.set(ref, {
            ...productData,
            createdAt: new Date()
          });
        }

        batchOperationCount++;
        if (batchOperationCount === 400) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          batchOperationCount = 0;
        }
      }

      if (batchOperationCount > 0) batches.push(currentBatch);

      for (const b of batches) {
        await b.commit();
      }

      setCreatedCount(created);
      setUpdatedCount(updated);
      setIsDone(true);
    } catch (e: any) {
      console.error("Error en la importación:", e);
      setErrorMsg("Ocurrió un error al guardar en la base de datos: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/productos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Carga Masiva de Productos</h1>
            <p className="text-muted-foreground mt-1">
              Crea o actualiza masivamente tus productos y variantes mediante un archivo CSV.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleDownloadTemplate}
          className="gap-2 bg-indigo-50/50 hover:bg-indigo-100/50 text-indigo-700 border-indigo-200 shrink-0"
        >
          <Download className="w-4 h-4 text-indigo-600" />
          Descargar Plantilla CSV
        </Button>
      </div>

      <div className="bg-card border rounded-xl p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="space-y-4">
          <label className="block text-sm font-semibold">Selecciona tu archivo CSV de Productos</label>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2.5 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20
                transition-colors cursor-pointer border rounded-lg p-1 bg-background"
            />

            <Button
              onClick={handleFileUpload}
              disabled={!file || parsedRows.length === 0 || loading}
              className="gap-2 min-w-[160px] bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {loading ? "Importando..." : "Importar Productos"}
            </Button>
          </div>
        </div>

        {/* Resumen del Archivo Parsed */}
        {file && parsedRows.length > 0 && !isDone && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <span>Vista Previa del Archivo ({parsedRows.length} filas detectadas)</span>
              </div>
              <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold">
                <Layers className="w-3.5 h-3.5" />
                <span>{groupedProductsCount} producto(s) únicos detectados</span>
              </div>
            </div>

            <div className="overflow-x-auto border rounded-lg bg-white max-h-64 overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted text-muted-foreground font-semibold sticky top-0 border-b">
                  <tr>
                    <th className="p-2">#</th>
                    <th className="p-2">Título</th>
                    <th className="p-2">Variante</th>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Precio</th>
                    <th className="p-2">Costo</th>
                    <th className="p-2">Categoría</th>
                    <th className="p-2">Clave SAT</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsedRows.slice(0, 8).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 text-muted-foreground">{idx + 1}</td>
                      <td className="p-2 font-medium">{row.titulo}</td>
                      <td className="p-2 text-slate-600">{row.variante || "-"}</td>
                      <td className="p-2 font-mono">{row.sku || "-"}</td>
                      <td className="p-2 font-semibold text-green-700">${row.precio.toFixed(2)}</td>
                      <td className="p-2 text-slate-600">${row.costo.toFixed(2)}</td>
                      <td className="p-2">{row.categoria || "-"}</td>
                      <td className="p-2 font-mono text-slate-500">{row.claveSat || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRows.length > 8 && (
              <p className="text-xs text-slate-500 text-right">
                * Mostrando las primeras 8 filas de {parsedRows.length} en total.
              </p>
            )}
          </div>
        )}

        {/* Guía de Campos */}
        {!file && (
          <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-indigo-900 font-semibold text-sm">
              <Info className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Instrucciones y Especificaciones del Archivo</span>
            </div>
            <ul className="text-xs text-indigo-950 space-y-1.5 list-disc pl-5 leading-relaxed">
              <li>
                <strong>Upsert Automático:</strong> Si incluyes un <code>ID</code> o un <code>SKU</code>/<code>Código de Barras</code> existente, el sistema actualizará los campos sin borrar tus imágenes.
              </li>
              <li>
                <strong>Productos con Variantes:</strong> Filas consecutivas con el mismo <code>Título</code> se agruparán en un solo producto con múltiples variantes (ej. Tallas, Colores).
              </li>
              <li>
                <strong>Facturación SAT:</strong> Puedes incluir los códigos <code>ClaveSAT</code> (ej. 53101602) y <code>UnidadSAT</code> (ej. H87) para dejar tus productos listos para facturar.
              </li>
            </ul>
          </div>
        )}

        {/* Notificación de Éxito */}
        {isDone && (
          <div className="p-6 bg-green-50 border border-green-200 rounded-xl flex items-start gap-4 animate-in fade-in">
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-semibold text-green-900">¡Importación Completada con Éxito!</h3>
              <p className="text-sm text-green-800">
                Se han procesado correctamente todos los registros del archivo:
              </p>
              <div className="flex gap-4 pt-2 text-xs font-semibold text-green-900">
                <span className="bg-green-100 border border-green-300 px-3 py-1 rounded-md">
                  ✨ {createdCount} producto(s) nuevo(s) creado(s)
                </span>
                <span className="bg-green-100 border border-green-300 px-3 py-1 rounded-md">
                  🔄 {updatedCount} producto(s) existente(s) actualizado(s)
                </span>
              </div>
              <div className="pt-3">
                <Link href="/productos">
                  <Button size="sm" className="bg-green-700 hover:bg-green-800 text-white gap-2">
                    Ir al Catálogo de Productos
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Notificación de Error */}
        {errorMsg && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-start gap-4 animate-in fade-in">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error durante la Importación</h3>
              <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
