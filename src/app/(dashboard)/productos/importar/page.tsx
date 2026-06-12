"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, query, doc, writeBatch, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ArrowLeft, Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function ImportarProductosPage() {
  const router = useRouter();
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isDone, setIsDone] = useState(false);

  const handleFileUpload = async () => {
    if (!file || !companyId) return;
    setLoading(true);
    setSuccessCount(0);
    setErrorCount(0);
    setIsDone(false);

    import("papaparse").then((Papa) => {
      Papa.default.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) throw new Error("Archivo vacío");

            const isPriceList = records[0].hasOwnProperty("P-A") && records[0].hasOwnProperty("Código");
            
            const batches = [];
            let currentBatch = writeBatch(db);
            let count = 0;
            let success = 0;

            // ALWAYS fetch products to prevent overwriting images and prices
            const q = query(collection(db, "companies", companyId, "products"));
            const snapshot = await getDocs(q);
            const productMap = new Map();
            const productByIdMap = new Map();
            
            snapshot.docs.forEach(d => {
              const p = { id: d.id, ...d.data() } as any;
              productByIdMap.set(d.id, p);
              if (p.variants && p.variants[0]) {
                if (p.variants[0].barcode) productMap.set(String(p.variants[0].barcode).trim(), p);
                if (p.variants[0].sku) productMap.set(String(p.variants[0].sku).trim(), p);
              }
            });

            if (isPriceList) {
              // MODO LISTA DE PRECIOS
              for (const record of records) {
                if (!record.Código) continue;
                const code = String(record.Código).trim();
                const product = productMap.get(code);
                if (!product) continue;

                const rawPrice = record["P-A"];
                if (!rawPrice) continue;
                const parsedPrice = parseFloat(String(rawPrice).replace(/[^0-9.-]+/g, ""));
                if (isNaN(parsedPrice)) continue;

                const updatedVariants = [...(product.variants || [])];
                if (updatedVariants.length > 0) {
                  updatedVariants[0] = { ...updatedVariants[0], price: parsedPrice };
                }
                
                currentBatch.update(doc(db, "companies", companyId, "products", product.id), {
                  variants: updatedVariants,
                  updatedAt: new Date()
                });

                count++;
                success++;
                if (count === 400) {
                  batches.push(currentBatch);
                  currentBatch = writeBatch(db);
                  count = 0;
                }
              }

            } else {
              // MODO PRODUCTOS NORMAL
              for (const record of records) {
                const productId = record.ID && record.ID.length > 20 ? record.ID : (record.Codigo || record.SKU);
                if (!productId) continue;

                const existingProduct = productByIdMap.get(productId);
                
                const ref = doc(db, "companies", companyId, "products", productId);
                
                const title = record.Titulo || record.Codigo || "Sin título";
                const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                
                const rawCost = record.Costo;
                const cost = rawCost !== undefined && rawCost !== ""
                  ? (parseFloat(String(rawCost).replace(/[^0-9.-]+/g, "")) || 0)
                  : 0;

                const rawPrice = record.Precio;
                const priceValue = rawPrice !== undefined && rawPrice !== ""
                  ? (parseFloat(String(rawPrice).replace(/[^0-9.-]+/g, "")) || 0)
                  : null;
                
                // Preserve existing data if present
                const existingImages = existingProduct?.images || [];
                const existingVariants = existingProduct?.variants || [];
                
                let variants = [];
                if (existingVariants.length === 0) {
                  variants = [
                    {
                      id: `var-${productId}`,
                      title: "Default Title",
                      price: priceValue !== null ? priceValue : cost,
                      cost: cost,
                      sku: record.SKU || record.Codigo || "",
                      barcode: record.Codigo || "",
                      inventoryQuantity: 0,
                      weight: parseFloat(record.Peso) || 0,
                    }
                  ];
                } else if (existingVariants.length === 1) {
                  const singleVar = { ...existingVariants[0] };
                  singleVar.sku = record.SKU || record.Codigo || singleVar.sku || "";
                  singleVar.barcode = record.Codigo || singleVar.barcode || "";
                  singleVar.price = priceValue !== null ? priceValue : (singleVar.price !== undefined ? singleVar.price : cost);
                  if (rawCost !== undefined && rawCost !== "") {
                    singleVar.cost = cost;
                  }
                  singleVar.weight = parseFloat(record.Peso) || singleVar.weight || 0;
                  variants = [singleVar];
                } else {
                  // Multiple variants exist: Match by SKU or barcode, or default to the first
                  const csvSku = (record.SKU || record.Codigo || "").trim().toLowerCase();
                  const csvBarcode = (record.Codigo || "").trim().toLowerCase();
                  let matchedIndex = existingVariants.findIndex((v: any) => 
                    (v.sku && v.sku.trim().toLowerCase() === csvSku) ||
                    (v.barcode && v.barcode.trim().toLowerCase() === csvBarcode)
                  );
                  
                  if (matchedIndex === -1) matchedIndex = 0;
                  
                  variants = existingVariants.map((v: any, idx: number) => {
                    if (idx === matchedIndex) {
                      return {
                        ...v,
                        sku: record.SKU || record.Codigo || v.sku || "",
                        barcode: record.Codigo || v.barcode || "",
                        price: priceValue !== null ? priceValue : (v.price !== undefined ? v.price : cost),
                        cost: rawCost !== undefined && rawCost !== "" ? cost : (v.cost !== undefined ? v.cost : cost),
                        weight: parseFloat(record.Peso) || v.weight || 0,
                      };
                    }
                    return v;
                  });
                }

                currentBatch.set(ref, {
                  title: title,
                  handle: handle,
                  bodyHtml: record.Descripcion || existingProduct?.bodyHtml || "",
                  vendor: existingProduct?.vendor || "Bind ERP",
                  productType: record["Categoria 1"] || existingProduct?.productType || "",
                  status: existingProduct?.status || 'ACTIVE',
                  tags: Array.from(new Set([...(existingProduct?.tags || []), record["Categoria 2"], record["Categoria 3"]].filter(Boolean))),
                  currency: record.Moneda || "MXN",
                  initialCost: existingProduct?.initialCost || cost,
                  cost: rawCost !== undefined && rawCost !== "" ? cost : (existingProduct?.cost || cost),
                  iva: record["Tipo de IVA."] ? parseFloat(record["Tipo de IVA."].replace("%", "")) : (existingProduct?.iva || 0),
                  satProductCode: record["Clave CFDI"] || existingProduct?.satProductCode || "",
                  satUnitCode: record["Unidad CFDI"] || existingProduct?.satUnitCode || "",
                  variants: variants,
                  options: existingProduct?.options || [{ id: "opt-1", name: "Title", values: ["Default Title"] }],
                  images: existingImages, // PRESERVE IMAGES!
                  updatedAt: new Date()
                }, { merge: true });
                
                count++;
                success++;
                if (count === 400) {
                  batches.push(currentBatch);
                  currentBatch = writeBatch(db);
                  count = 0;
                }
              }
            }

            if (count > 0) batches.push(currentBatch);
            for (const b of batches) {
              await b.commit();
            }
            
            setSuccessCount(success);
            setIsDone(true);
          } catch (error) {
            console.error(error);
            setErrorCount(1);
          } finally {
            setLoading(false);
          }
        }
      });
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/productos">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Importar Productos desde Bind ERP</h1>
          <p className="text-muted-foreground mt-1">
            Sube tu archivo CSV de productos exportado de Bind para actualizar el catálogo. Las actualizaciones son progresivas (Upsert), no borrarán tu información previa.
          </p>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-8 space-y-6">
        <div className="space-y-4">
          <label className="block text-sm font-medium">Archivo CSV de Bind ERP</label>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-primary/10 file:text-primary
                hover:file:bg-primary/20
                transition-colors cursor-pointer"
            />
            <Button 
              onClick={handleFileUpload} 
              disabled={!file || loading}
              className="gap-2 min-w-[140px]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {loading ? "Importando..." : "Subir Archivo"}
            </Button>
          </div>
        </div>

        {isDone && (
          <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-xl flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-green-900">¡Importación Completada!</h3>
              <p className="text-green-700 mt-1">
                Se actualizaron {successCount} productos correctamente. Ningún registro existente fue duplicado, sólo se combinó la información con el UUID original.
              </p>
            </div>
          </div>
        )}

        {errorCount > 0 && (
          <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-xl flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error en la Importación</h3>
              <p className="text-red-700 mt-1">
                Ocurrió un error inesperado al procesar el archivo. Revisa el formato y asegúrate de que sea un CSV válido de Bind ERP.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
