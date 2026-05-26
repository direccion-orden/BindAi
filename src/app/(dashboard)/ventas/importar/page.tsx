"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, doc, writeBatch, getDocs, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { 
  ArrowLeft, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Package, 
  Truck, 
  Receipt, 
  Database, 
  ArrowRightLeft,
  ChevronRight,
  RefreshCw,
  Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ImportLog {
  type: "success" | "warning" | "error" | "info";
  message: string;
  timestamp: string;
}

export default function ImportarHistorialPage() {
  const router = useRouter();
  const { companyId } = useAuth();
  
  // State for files
  const [cotizacionesFile, setCotizacionesFile] = useState<File | null>(null);
  const [pedidosFile, setPedidosFile] = useState<File | null>(null);
  const [remisionesFacturasFile, setRemisionesFacturasFile] = useState<File | null>(null);
  
  // State for loading
  const [loadingStep, setLoadingStep] = useState<number | null>(null);
  const [progressText, setProgressText] = useState("");
  const [logs, setLogs] = useState<ImportLog[]>([]);
  
  // Summary counts
  const [stats, setStats] = useState({
    quotesImported: 0,
    ordersImported: 0,
    remissionsImported: 0,
    invoicesImported: 0,
    clientsCreated: 0,
    productsCreated: 0,
  });

  const addLog = (type: "success" | "warning" | "error" | "info", message: string) => {
    setLogs(prev => [
      { type, message, timestamp: new Date().toLocaleTimeString() },
      ...prev
    ]);
  };

  // Helper: Load clients map from Firestore
  const loadClientsMap = async () => {
    if (!companyId) return new Map<string, string>();
    const snap = await getDocs(collection(db, "companies", companyId, "clients"));
    const clientMap = new Map<string, string>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      const nameKey = String(data.name || "").trim().toLowerCase();
      clientMap.set(nameKey, doc.id);
      if (data.rfc) {
        clientMap.set(String(data.rfc).trim().toLowerCase(), doc.id);
      }
    });
    return clientMap;
  };

  // Helper: Load products map from Firestore
  const loadProductsMap = async () => {
    if (!companyId) return new Map<string, any>();
    const snap = await getDocs(collection(db, "companies", companyId, "products"));
    const productMap = new Map<string, any>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      const titleKey = String(data.title || "").trim().toLowerCase();
      productMap.set(titleKey, { id: doc.id, ...data });
      if (data.variants && data.variants[0]) {
        if (data.variants[0].sku) {
          productMap.set(String(data.variants[0].sku).trim().toLowerCase(), { id: doc.id, ...data });
        }
        if (data.variants[0].barcode) {
          productMap.set(String(data.variants[0].barcode).trim().toLowerCase(), { id: doc.id, ...data });
        }
      }
    });
    return productMap;
  };

  // Helper: Create client on the fly
  const createClientOnTheFly = async (clientName: string, clientMap: Map<string, string>, clientBatch: any) => {
    if (!companyId || !clientName) return null;
    const cleanedName = clientName.replace(/^\s*-\s*/, "").trim();
    const nameKey = cleanedName.toLowerCase();
    
    if (clientMap.has(nameKey)) {
      return clientMap.get(nameKey);
    }

    const clientRef = doc(collection(db, "companies", companyId, "clients"));
    const clientId = clientRef.id;

    clientBatch.set(clientRef, {
      name: cleanedName,
      rfc: "",
      email: "",
      phone: "",
      address: "",
      zipCode: "",
      city: "",
      state: "",
      neighborhood: "",
      createdAt: new Date().toISOString(),
      migrated: true,
      comments: "Creado automáticamente durante la migración de historial."
    });

    clientMap.set(nameKey, clientId);
    setStats(prev => ({ ...prev, clientsCreated: prev.clientsCreated + 1 }));
    return clientId;
  };

  // Helper: Create product placeholder on the fly
  const createProductOnTheFly = async (productName: string, unitPrice: number, productMap: Map<string, any>, productBatch: any) => {
    if (!companyId || !productName) return null;
    const titleKey = productName.trim().toLowerCase();

    if (productMap.has(titleKey)) {
      return productMap.get(titleKey);
    }

    const productRef = doc(collection(db, "companies", companyId, "products"));
    const productId = productRef.id;

    const productData = {
      title: productName.trim(),
      handle: productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
      bodyHtml: "Producto histórico migrado automáticamente.",
      vendor: "Bind ERP (Migrado)",
      productType: "Histórico",
      status: 'ACTIVE',
      tags: ["Histórico", "Migrado"],
      currency: "MXN",
      cost: unitPrice * 0.7, // Asumimos costo aproximado del 70%
      iva: 16,
      variants: [
        {
          id: `var-${productId}`,
          title: "Default Title",
          price: unitPrice,
          sku: `HIST-${productId.substring(0, 8).toUpperCase()}`,
          barcode: `HIST-${productId.substring(0, 8).toUpperCase()}`,
          inventoryQuantity: 0,
          weight: 0,
        }
      ],
      options: [
        { id: "opt-1", name: "Title", values: ["Default Title"] }
      ],
      images: [],
      updatedAt: new Date(),
      migrated: true
    };

    productBatch.set(productRef, productData);
    productMap.set(titleKey, { id: productId, ...productData });
    setStats(prev => ({ ...prev, productsCreated: prev.productsCreated + 1 }));
    return { id: productId, ...productData };
  };

  // Step 1: Import Cotizaciones
  const handleImportCotizaciones = async () => {
    if (!cotizacionesFile || !companyId) return;
    setLoadingStep(1);
    setProgressText("Cargando mapas de base de datos...");
    addLog("info", "Iniciando importación de Cotizaciones...");
    
    try {
      const clientMap = await loadClientsMap();
      const productMap = await loadProductsMap();
      
      const Papa = await import("papaparse");
      Papa.default.parse(cotizacionesFile, {
        header: true,
        skipEmptyLines: true,
        encoding: "ISO-8859-1",
        complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) {
              addLog("error", "El archivo de Cotizaciones está vacío.");
              setLoadingStep(null);
              return;
            }

            setProgressText("Agrupando partidas por Folio...");
            // Group flat lines by Folio
            const groupedQuotes = new Map<string, any[]>();
            records.forEach((record: any) => {
              const folio = String(record.Folio || "").trim();
              if (!folio) return;
              if (!groupedQuotes.has(folio)) {
                groupedQuotes.set(folio, []);
              }
              groupedQuotes.get(folio)!.push(record);
            });

            addLog("info", `Detectadas ${groupedQuotes.size} cotizaciones únicas en el archivo.`);

            // Batches for Firestore
            const batches: any[] = [];
            let currentBatch = writeBatch(db);
            let writeCount = 0;
            let successQuotes = 0;

            setProgressText("Procesando y resolviendo relaciones...");
            
            // We use client-side transaction sets
            for (const [folio, lines] of groupedQuotes.entries()) {
              const firstLine = lines[0];
              const clientName = String(firstLine.Cliente || "").replace(/^\s*-\s*/, "").trim();
              
              // Resolve Client On the fly
              let clientId = await createClientOnTheFly(clientName, clientMap, currentBatch);

              // Build Items array
              const items: any[] = [];
              let calculatedSubtotal = 0;
              let calculatedTotal = 0;

              for (const line of lines) {
                const productName = String(line.Producto || "Concepto General").trim();
                const totalLine = parseFloat(line.Total) || 0;
                const subtotalLine = parseFloat(line.Subtotal) || 0;
                calculatedSubtotal += subtotalLine;
                calculatedTotal += totalLine;

                // Resolve Product on the fly
                const product = await createProductOnTheFly(productName, totalLine, productMap, currentBatch);
                
                items.push({
                  productId: product ? product.id : `hist-${crypto.randomUUID()}`,
                  productName: productName,
                  variantTitle: "Default Title",
                  quantity: 1,
                  unitPrice: subtotalLine,
                  discountPercentage: 0
                });
              }

              // Status mapping
              let status = "nueva";
              const bindStatus = String(firstLine.Estatus || "").trim().toLowerCase();
              if (bindStatus.includes("surtida") || bindStatus.includes("aceptada") || bindStatus.includes("ganada")) {
                status = "ganada";
              } else if (bindStatus.includes("cancelada") || bindStatus.includes("rechazada")) {
                status = "perdida";
              } else if (bindStatus.includes("enviada")) {
                status = "enviada";
              }

              // Date formatting (convert d-m-yyyy to ISO string)
              let isoDate = new Date().toISOString();
              if (firstLine.Creacion) {
                const dateParts = firstLine.Creacion.split("-");
                if (dateParts.length === 3) {
                  const day = parseInt(dateParts[0]);
                  const month = parseInt(dateParts[1]) - 1;
                  const year = parseInt(dateParts[2]);
                  isoDate = new Date(year, month, day).toISOString();
                }
              }

              const quoteId = `quote-${folio}`;
              const ref = doc(db, "companies", companyId, "quotes", quoteId);

              currentBatch.set(ref, {
                id: quoteId,
                quoteNumber: folio,
                clientName: clientName,
                clientId: clientId || null,
                totalAmount: calculatedTotal,
                subtotal: calculatedSubtotal,
                tax: calculatedTotal - calculatedSubtotal,
                status: status,
                createdAt: isoDate,
                createdBy: String(firstLine.Vendedor || "Migración Automática").trim(),
                items: items,
                migrated: true,
                updatedAt: new Date().toISOString()
              }, { merge: true });

              writeCount++;
              successQuotes++;

              if (writeCount >= 200) { // Keep batch sizes small since we do lookups
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                writeCount = 0;
              }
            }

            if (writeCount > 0) {
              batches.push(currentBatch);
            }

            setProgressText(`Guardando en Firestore (${batches.length} lotes)...`);
            for (let i = 0; i < batches.length; i++) {
              await batches[i].commit();
              setProgressText(`Guardando lote ${i + 1} de ${batches.length}...`);
            }

            setStats(prev => ({ ...prev, quotesImported: prev.quotesImported + successQuotes }));
            addLog("success", `¡Sincronización completa! Se importaron ${successQuotes} cotizaciones históricas.`);
          } catch (err: any) {
            console.error(err);
            addLog("error", `Error de procesamiento: ${err.message}`);
          } finally {
            setLoadingStep(null);
            setProgressText("");
          }
        }
      });
    } catch (e: any) {
      console.error(e);
      addLog("error", `Error de carga: ${e.message}`);
      setLoadingStep(null);
    }
  };

  // Step 2: Import Pedidos
  const handleImportPedidos = async () => {
    if (!pedidosFile || !companyId) return;
    setLoadingStep(2);
    setProgressText("Cargando mapas de base de datos...");
    addLog("info", "Iniciando importación de Pedidos...");

    try {
      const clientMap = await loadClientsMap();
      
      const Papa = await import("papaparse");
      Papa.default.parse(pedidosFile, {
        header: true,
        skipEmptyLines: true,
        encoding: "ISO-8859-1",
        complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) {
              addLog("error", "El archivo de Pedidos está vacío.");
              setLoadingStep(null);
              return;
            }

            setProgressText("Agrupando pedidos por Número y ordenando cronológicamente...");
            
            // Deduplicate Pedidos: Group by Numero, sort by Creation Date, and pick the latest record.
            const groupedPedidos = new Map<string, any[]>();
            records.forEach((record: any) => {
              const num = String(record.Numero || "").trim();
              if (!num) return;
              if (!groupedPedidos.has(num)) {
                groupedPedidos.set(num, []);
              }
              groupedPedidos.get(num)!.push(record);
            });

            addLog("info", `Detectados ${groupedPedidos.size} pedidos únicos en el archivo.`);

            const batches: any[] = [];
            let currentBatch = writeBatch(db);
            let writeCount = 0;
            let successOrders = 0;

            setProgressText("Procesando cabeceras y resolviendo clientes...");

            for (const [numero, rows] of groupedPedidos.entries()) {
              // Parse date & sort to find the latest update
              const parseDateStr = (str: string) => {
                // Format: DD/MM/YYYY HH:MM:SS AM/PM or similar
                if (!str) return new Date(0);
                const parts = str.split(" ");
                const dateParts = parts[0].split("/");
                if (dateParts.length === 3) {
                  const d = parseInt(dateParts[0]);
                  const m = parseInt(dateParts[1]) - 1;
                  const y = parseInt(dateParts[2]);
                  return new Date(y, m, d);
                }
                return new Date(str);
              };

              rows.sort((a, b) => parseDateStr(a.Creación).getTime() - parseDateStr(b.Creación).getTime());
              const latestRecord = rows[rows.length - 1]; // Pick latest state!

              const clientName = String(latestRecord.Cliente || "").trim();
              
              // Resolve Client On the fly
              let clientId = await createClientOnTheFly(clientName, clientMap, currentBatch);

              // Map status
              let status = "por_surtir";
              const bindStatus = String(latestRecord.Estatus || "").trim().toLowerCase();
              if (bindStatus.includes("cancelado")) {
                status = "cancelado";
              } else if (bindStatus.includes("surtido") || bindStatus.includes("listo")) {
                status = "surtido";
              } else if (bindStatus.includes("remisionado") || bindStatus.includes("terminado")) {
                status = "remisionado";
              }

              // Date formatting
              let isoDate = new Date().toISOString();
              if (latestRecord.Creación) {
                isoDate = parseDateStr(latestRecord.Creación).toISOString();
              }

              const totalAmount = parseFloat(latestRecord.Total) || 0;
              const subtotal = totalAmount / 1.16; // Asumimos tasa del 16% si no viene desglosado
              
              const orderId = `order-${numero}`;
              const ref = doc(db, "companies", companyId, "pedidos", orderId);

              // We create a single general placeholder item containing the amount
              const items = [
                {
                  productId: `hist-concept`,
                  productName: "Concepto de Venta ERP",
                  quantity: 1,
                  unitPrice: subtotal,
                  discountPercentage: 0
                }
              ];

              currentBatch.set(ref, {
                id: orderId,
                orderNumber: numero,
                quoteNumber: latestRecord.Pedido || "", // Reference number if available
                quoteId: latestRecord.Pedido ? `quote-${latestRecord.Pedido}` : null,
                clientName: clientName,
                clientId: clientId || null,
                totalAmount: totalAmount,
                subtotal: subtotal,
                tax: totalAmount - subtotal,
                status: status,
                createdAt: isoDate,
                createdBy: String(latestRecord.Empleado || latestRecord.VendedorAsignado || "Migración Automática").trim(),
                items: items,
                migrated: true,
                updatedAt: new Date().toISOString()
              }, { merge: true });

              writeCount++;
              successOrders++;

              if (writeCount >= 300) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                writeCount = 0;
              }
            }

            if (writeCount > 0) {
              batches.push(currentBatch);
            }

            setProgressText(`Guardando pedidos en Firestore (${batches.length} lotes)...`);
            for (let i = 0; i < batches.length; i++) {
              await batches[i].commit();
              setProgressText(`Guardando lote ${i + 1} de ${batches.length}...`);
            }

            setStats(prev => ({ ...prev, ordersImported: prev.ordersImported + successOrders }));
            addLog("success", `¡Sincronización completa! Se importaron ${successOrders} pedidos históricos.`);
          } catch (err: any) {
            console.error(err);
            addLog("error", `Error de procesamiento: ${err.message}`);
          } finally {
            setLoadingStep(null);
            setProgressText("");
          }
        }
      });
    } catch (e: any) {
      console.error(e);
      addLog("error", `Error de carga: ${e.message}`);
      setLoadingStep(null);
    }
  };

  // Step 3 & 4: Import Remisiones & Facturas (from combined file)
  const handleImportRemisionesFacturas = async () => {
    if (!remisionesFacturasFile || !companyId) return;
    setLoadingStep(3);
    setProgressText("Cargando mapas de base de datos...");
    addLog("info", "Iniciando importación combinada de Remisiones y Facturas...");

    try {
      const clientMap = await loadClientsMap();
      
      const Papa = await import("papaparse");
      Papa.default.parse(remisionesFacturasFile, {
        header: true,
        skipEmptyLines: true,
        encoding: "ISO-8859-1",
        complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) {
              addLog("error", "El archivo de Remisiones y Facturas está vacío.");
              setLoadingStep(null);
              return;
            }

            const batches: any[] = [];
            let currentBatch = writeBatch(db);
            let writeCount = 0;
            let successRemissions = 0;
            let successInvoices = 0;

            setProgressText("Procesando y dividiendo documentos contables...");

            for (const record of records) {
              const docType = String(record.Documento || "").trim().toLowerCase();
              const numero = String(record.Numero || "").trim();
              if (!numero) continue;

              const clientName = String(record.Cliente || "").trim();
              
              // Resolve Client On the fly
              let clientId = await createClientOnTheFly(clientName, clientMap, currentBatch);

              // Date formatting (DD/MM/YYYY)
              let isoDate = new Date().toISOString();
              if (record.Fecha) {
                const parts = record.Fecha.split("/");
                if (parts.length === 3) {
                  const d = parseInt(parts[0]);
                  const m = parseInt(parts[1]) - 1;
                  const y = parseInt(parts[2]);
                  isoDate = new Date(y, m, d).toISOString();
                }
              }

              const totalAmount = parseFloat(record.Total) || 0;
              const subtotal = parseFloat(record.Subtotal) || totalAmount / 1.16;
              const tax = parseFloat(record.Impuestos) || totalAmount - subtotal;

              // Check if it's a Remission (Remisión)
              if (docType.includes("remis")) {
                let status = "activa";
                const bindStatus = String(record.Estatus || "").trim().toLowerCase();
                if (bindStatus.includes("cancelada")) {
                  status = "cancelada";
                } else if (bindStatus.includes("facturada") || bindStatus.includes("pagada")) {
                  status = "facturada";
                }

                const remissionId = `remission-${numero}`;
                const ref = doc(db, "companies", companyId, "remisiones", remissionId);

                // Try to link to a PurchaseOrder (order Number)
                const orderNum = String(record.PurchaseOrder || "").trim();

                currentBatch.set(ref, {
                  id: remissionId,
                  remissionNumber: numero,
                  orderNumber: orderNum,
                  orderId: orderNum ? `order-${orderNum}` : null,
                  clientName: clientName,
                  clientId: clientId || null,
                  totalAmount: totalAmount,
                  subtotal: subtotal,
                  tax: tax,
                  status: status,
                  createdAt: isoDate,
                  createdBy: String(record.Vendedor || "Migración Automática").trim(),
                  migrated: true,
                  updatedAt: new Date().toISOString()
                }, { merge: true });

                successRemissions++;
                writeCount++;

              } else if (docType.includes("factur")) {
                // Check if it's an Invoice (Factura)
                let status = "por_timbrar";
                const bindStatus = String(record.Estatus || "").trim().toLowerCase();
                if (bindStatus.includes("timbrada") || bindStatus.includes("pagada") || bindStatus.includes("activa")) {
                  status = "timbrada";
                } else if (bindStatus.includes("cancelada")) {
                  status = "cancelada";
                }

                const invoiceId = `invoice-${numero}`;
                const ref = doc(db, "companies", companyId, "facturas", invoiceId);

                currentBatch.set(ref, {
                  id: invoiceId,
                  invoiceNumber: numero,
                  clientName: clientName,
                  clientId: clientId || null,
                  rfc: record.RFC || "",
                  uuid: record.UUID || null,
                  totalAmount: totalAmount,
                  subtotal: subtotal,
                  tax: tax,
                  status: status,
                  createdAt: isoDate,
                  createdBy: String(record.Vendedor || "Migración Automática").trim(),
                  paymentMethod: record.MetodoPago || "PPD",
                  migrated: true,
                  updatedAt: new Date().toISOString()
                }, { merge: true });

                successInvoices++;
                writeCount++;
              }

              if (writeCount >= 300) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                writeCount = 0;
              }
            }

            if (writeCount > 0) {
              batches.push(currentBatch);
            }

            setProgressText(`Guardando remisiones y facturas en Firestore (${batches.length} lotes)...`);
            for (let i = 0; i < batches.length; i++) {
              await batches[i].commit();
              setProgressText(`Guardando lote ${i + 1} de ${batches.length}...`);
            }

            setStats(prev => ({ 
              ...prev, 
              remissionsImported: prev.remissionsImported + successRemissions,
              invoicesImported: prev.invoicesImported + successInvoices
            }));
            addLog("success", `¡Sincronización completa! Se importaron ${successRemissions} remisiones y ${successInvoices} facturas.`);
          } catch (err: any) {
            console.error(err);
            addLog("error", `Error de procesamiento: ${err.message}`);
          } finally {
            setLoadingStep(null);
            setProgressText("");
          }
        }
      });
    } catch (e: any) {
      console.error(e);
      addLog("error", `Error de carga: ${e.message}`);
      setLoadingStep(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/ventas/cotizaciones">
          <Button variant="ghost" size="icon" className="hover:bg-muted transition-colors rounded-full">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Migración de Historial Comercial (Bind ERP)
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Carga tus archivos de exportación de Bind ERP para repoblar de forma progresiva y segura tus cotizaciones, pedidos, remisiones y facturas.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Import Panel */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* STEP 1: Cotizaciones */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-purple-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-50 rounded-xl text-purple-600 shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  Paso 1: Cotizaciones históricas
                  {stats.quotesImported > 0 && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                </h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Sube el archivo <span className="font-bold font-mono">Cotizaciones.csv</span>. Este paso creará de forma progresiva el embudo comercial, las partidas y vinculará a los clientes o los creará automáticamente si no existen.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <input
                type="file"
                id="cotizaciones-upload"
                className="hidden"
                accept=".csv"
                onChange={(e) => setCotizacionesFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                className="justify-start gap-2 border-dashed border-2 hover:border-solid hover:bg-muted text-muted-foreground text-xs h-10 flex-1 truncate"
                onClick={() => document.getElementById("cotizaciones-upload")?.click()}
                disabled={loadingStep !== null}
              >
                <Upload className="w-4 h-4 shrink-0" />
                {cotizacionesFile ? cotizacionesFile.name : "Seleccionar Cotizaciones.csv"}
              </Button>
              <Button
                onClick={handleImportCotizaciones}
                disabled={!cotizacionesFile || loadingStep !== null}
                className="bg-purple-600 hover:bg-purple-700 text-white min-w-[140px] text-xs h-10 gap-2 shrink-0 shadow-md"
              >
                {loadingStep === 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loadingStep === 1 ? "Importando..." : "Ejecutar Paso 1"}
              </Button>
            </div>
          </div>

          {/* STEP 2: Pedidos */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-indigo-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
                <Package className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  Paso 2: Pedidos de Venta en Proceso
                  {stats.ordersImported > 0 && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                </h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Sube el archivo <span className="font-bold font-mono">Pedidos.csv</span>. Procesará los estados del surtido de mercancías y ejecutará una deduplicación inteligente conservando únicamente el estado activo final de cada folio.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <input
                type="file"
                id="pedidos-upload"
                className="hidden"
                accept=".csv"
                onChange={(e) => setPedidosFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                className="justify-start gap-2 border-dashed border-2 hover:border-solid hover:bg-muted text-muted-foreground text-xs h-10 flex-1 truncate"
                onClick={() => document.getElementById("pedidos-upload")?.click()}
                disabled={loadingStep !== null}
              >
                <Upload className="w-4 h-4 shrink-0" />
                {pedidosFile ? pedidosFile.name : "Seleccionar Pedidos.csv"}
              </Button>
              <Button
                onClick={handleImportPedidos}
                disabled={!pedidosFile || loadingStep !== null}
                className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[140px] text-xs h-10 gap-2 shrink-0 shadow-md"
              >
                {loadingStep === 2 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loadingStep === 2 ? "Importando..." : "Ejecutar Paso 2"}
              </Button>
            </div>
          </div>

          {/* STEP 3 & 4: Remisiones y Facturas */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-emerald-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
                <Receipt className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  Paso 3 y 4: Remisiones y Facturaciones
                  {(stats.remissionsImported > 0 || stats.invoicesImported > 0) && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                </h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Sube el archivo <span className="font-bold font-mono">Remisiones y Facturas.csv</span>. Este paso clasificará automáticamente las entregas activas de mercancía (Remisiones) y las facturas fiscales (CFDI), vinculándolas a sus pedidos y guardando los UUIDs fiscales.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <input
                type="file"
                id="remisiones-upload"
                className="hidden"
                accept=".csv"
                onChange={(e) => setRemisionesFacturasFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                className="justify-start gap-2 border-dashed border-2 hover:border-solid hover:bg-muted text-muted-foreground text-xs h-10 flex-1 truncate"
                onClick={() => document.getElementById("remisiones-upload")?.click()}
                disabled={loadingStep !== null}
              >
                <Upload className="w-4 h-4 shrink-0" />
                {remisionesFacturasFile ? remisionesFacturasFile.name : "Seleccionar Remisiones y Facturas.csv"}
              </Button>
              <Button
                onClick={handleImportRemisionesFacturas}
                disabled={!remisionesFacturasFile || loadingStep !== null}
                className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px] text-xs h-10 gap-2 shrink-0 shadow-md"
              >
                {loadingStep === 3 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loadingStep === 3 ? "Importando..." : "Ejecutar Paso 3 y 4"}
              </Button>
            </div>
          </div>

        </div>

        {/* Sidebar Log & Statistics */}
        <div className="space-y-6">
          
          {/* Progress / Status indicator */}
          {loadingStep !== null && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Procesando datos en caliente...
              </div>
              <p className="text-xs text-muted-foreground font-medium">{progressText}</p>
            </div>
          )}

          {/* Stats Card */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              Estadísticas de la Migración
            </h3>
            
            <div className="divide-y text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-muted-foreground">Cotizaciones Importadas:</span>
                <span className="font-bold text-purple-600">{stats.quotesImported}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-muted-foreground">Pedidos Importados:</span>
                <span className="font-bold text-indigo-600">{stats.ordersImported}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-muted-foreground">Remisiones Importadas:</span>
                <span className="font-bold text-emerald-600">{stats.remissionsImported}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-muted-foreground">Facturas Importadas:</span>
                <span className="font-bold text-teal-600">{stats.invoicesImported}</span>
              </div>
              <div className="py-2.5 flex justify-between border-t-2">
                <span className="text-muted-foreground">Clientes creados on-the-fly:</span>
                <span className="font-bold text-foreground">{stats.clientsCreated}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-muted-foreground">Productos creados on-the-fly:</span>
                <span className="font-bold text-foreground">{stats.productsCreated}</span>
              </div>
            </div>
          </div>

          {/* Live Logs Card */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-4 flex flex-col h-[280px]">
            <h3 className="font-bold text-sm text-foreground uppercase tracking-wider flex items-center justify-between shrink-0">
              <span>Bitácora de Sincronización</span>
              <button 
                onClick={() => setLogs([])}
                className="text-[10px] text-muted-foreground hover:underline"
              >
                Limpiar
              </button>
            </h3>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar text-xs">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground/60 italic text-center">
                  Carga un archivo CSV para ver los registros del importador.
                </div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="flex gap-2 border-b pb-2 leading-relaxed">
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0 mt-0.5">{log.timestamp}</span>
                    <span className={`font-medium ${
                      log.type === "success" ? "text-green-600" :
                      log.type === "warning" ? "text-amber-600" :
                      log.type === "error" ? "text-red-600" :
                      "text-slate-600"
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
