"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, query, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ArrowLeft, Upload, FileDown, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ShopifyProduct, ShopifyProductVariant, ShopifyProductOption } from "@/types/product";

export default function ImportarProductosPage() {
  const router = useRouter();
  const { companyId } = useAuth();
  const [warehouses, setWarehouses] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "warehouses"));
    const unsub = onSnapshot(q, (snap) => {
      const w = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setWarehouses(w);
    });
    return () => unsub();
  }, [companyId]);

  const downloadTemplate = () => {
    let csv = "Title,Description,Price,SKU,Barcode";
    warehouses.forEach(w => {
      csv += `,Stock_${w.name}`;
    });
    csv += "\n";
    csv += "Producto Ejemplo,Descripción genial,150.00,SKU-001,123456789";
    warehouses.forEach(() => {
      csv += `,10`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_productos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async () => {
    if (!file || !companyId) return;
    setLoading(true);
    setSuccessCount(0);
    setErrorCount(0);
    setIsDone(false);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) throw new Error("El archivo está vacío o no tiene datos.");

      const headers = lines[0].split(',').map(h => h.trim());
      
      let success = 0;
      let errors = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        
        try {
          const title = values[headers.indexOf('Title')];
          if (!title) continue; // Skip empty rows

          const description = headers.includes('Description') ? values[headers.indexOf('Description')] : "";
          const price = headers.includes('Price') ? parseFloat(values[headers.indexOf('Price')]) : 0;
          const sku = headers.includes('SKU') ? values[headers.indexOf('SKU')] : "";
          const barcode = headers.includes('Barcode') ? values[headers.indexOf('Barcode')] : "";

          // Parse Inventory
          const inventoryByWarehouse: Record<string, number> = {};
          warehouses.forEach(w => {
            const headerName = `Stock_${w.name}`;
            const idx = headers.indexOf(headerName);
            if (idx !== -1) {
              inventoryByWarehouse[w.id] = parseInt(values[idx]) || 0;
            }
          });

          const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

          const defaultVariant: ShopifyProductVariant = {
            id: crypto.randomUUID(),
            title: "Default Title",
            price: price || 0,
            sku: sku,
            position: 1,
            compareAtPrice: null,
            option1: "Default Title",
            option2: null,
            option3: null,
            taxable: true,
            barcode: barcode,
            weight: 0,
            weightUnit: 'kg',
            inventoryByWarehouse
          };

          const defaultOption: ShopifyProductOption = {
            name: "Title",
            values: ["Default Title"]
          };

          const newProduct: Partial<ShopifyProduct> = {
            title,
            bodyHtml: description,
            vendor: "Importado",
            productType: "General",
            handle,
            tags: [],
            status: 'ACTIVE',
            options: [defaultOption],
            variants: [defaultVariant],
            images: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };

          await addDoc(collection(db, "companies", companyId, "products"), newProduct);
          success++;
        } catch (err) {
          console.error("Error en fila", i, err);
          errors++;
        }
      }

      setSuccessCount(success);
      setErrorCount(errors);
      setIsDone(true);

    } catch (e: any) {
      alert("Error leyendo el archivo: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/productos">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Importación Masiva de Productos</h1>
          <p className="text-muted-foreground">Sube un archivo CSV para crear múltiples productos a la vez.</p>
        </div>
      </div>

      {!isDone ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Step 1: Template */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">1</span>
              Descargar Plantilla
            </h2>
            <p className="text-sm text-muted-foreground">
              Descarga la plantilla CSV pre-generada. Esta plantilla incluye columnas para el inventario inicial de cada uno de tus <b>{warehouses.length} almacenes actuales</b>.
            </p>
            <Button variant="outline" onClick={downloadTemplate} className="w-full gap-2">
              <FileDown className="w-4 h-4" />
              Descargar CSV
            </Button>
          </div>

          {/* Step 2: Upload */}
          <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">2</span>
              Subir Archivo
            </h2>
            <p className="text-sm text-muted-foreground">
              Llena la plantilla, guárdala como CSV y súbela aquí.
            </p>
            
            <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center">
              <input 
                type="file" 
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
              />
            </div>
            
            <Button 
              onClick={handleFileUpload} 
              disabled={!file || loading} 
              className="w-full gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {loading ? "Importando..." : "Importar Productos"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-card border rounded-xl p-8 shadow-sm text-center space-y-6 max-w-md mx-auto">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
          <div>
            <h2 className="text-2xl font-bold">Importación Completada</h2>
            <p className="text-muted-foreground mt-2">Los productos han sido procesados.</p>
          </div>
          <div className="flex justify-center gap-6">
            <div className="text-center">
              <span className="block text-3xl font-bold text-green-600">{successCount}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Exitosos</span>
            </div>
            <div className="text-center">
              <span className="block text-3xl font-bold text-destructive">{errorCount}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Errores</span>
            </div>
          </div>
          <Link href="/productos" className="block mt-4">
            <Button className="w-full">Volver a Productos</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
