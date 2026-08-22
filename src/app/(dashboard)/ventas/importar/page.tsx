"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, query, doc, writeBatch, getDocs, addDoc, increment, runTransaction } from "firebase/firestore";
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
import { getLocalDateString } from "@/lib/utils";

interface ImportLog {
  type: "success" | "warning" | "error" | "info";
  message: string;
  timestamp: string;
}

export default function ImportarHistorialPage() {
  const router = useRouter();
  const { companyId } = useAuth();
  const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;
  const parseNumber = (val: any): number => {
    if (val === undefined || val === null) return 0;
    const str = String(val).replace(/,/g, "").trim();
    const parsed = parseFloat(str.replace(/[^0-9.-]/g, ""));
    return isNaN(parsed) ? 0 : parsed;
  };
  
  // State for files
  const [cotizacionesFile, setCotizacionesFile] = useState<File | null>(null);
  const [pedidosFile, setPedidosFile] = useState<File | null>(null);
  const [remisionesFacturasFile, setRemisionesFacturasFile] = useState<File | null>(null);
  const [ingresosFile, setIngresosFile] = useState<File | null>(null); // Added for incomes
  
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
    paymentsImported: 0, // Added for incomes
    anticiposMigrated: 0, // Added for legacy anticipos
  });

  const addLog = (type: "success" | "warning" | "error" | "info", message: string) => {
    setLogs(prev => [
      { type, message, timestamp: new Date().toLocaleTimeString() },
      ...prev
    ]);
  };

  const fixDoubleEncoding = (str: string): string => {
    if (!str) return str;
    try {
      return decodeURIComponent(escape(str));
    } catch (e) {
      return str;
    }
  };

  // Helper: Normalize strings for flexible key matching (removes accents, BOM, non-alphanumeric, and lowercase)
  const normalizeKey = (key: string): string => {
    return String(key || "")
      .replace(/^\ufeff/, "") // Remove BOM
      .trim()
      .toLowerCase()
      .normalize("NFD") // Decompose accents
      .replace(/[\u0300-\u036f]/g, "") // Remove accent characters
      .replace(/[^a-z0-9]/g, ""); // Remove non-alphanumeric
  };

  // Helper: Resolve a value from a record with flexible key matching (prioritizing the order of possibleKeys)
  const getFlexibleValue = (record: any, possibleKeys: string[], defaultValue: any = ""): any => {
    if (!record) return defaultValue;
    
    // Normalize target keys
    const targetKeys = possibleKeys.map(k => normalizeKey(k));
    
    // Find matching key in record prioritizing targetKeys order
    const recordKeys = Object.keys(record);
    const normalizedRecordKeys = recordKeys.map(k => ({ original: k, normalized: normalizeKey(k) }));
    
    for (const targetKey of targetKeys) {
      const match = normalizedRecordKeys.find(rk => rk.normalized === targetKey);
      if (match) {
        return record[match.original];
      }
    }
    
    return defaultValue;
  };

  // Helper: Robust Date parser that handles DD/MM/YYYY, YYYY/MM/DD, DD-MM-YYYY, YYYY-MM-DD
  const parseDateStr = (str: string): Date => {
    if (!str) return new Date(0);
    // Remove time part if exists
    const parts = String(str).trim().split(" ");
    const dateStr = parts[0];
    
    // Split by / or -
    const separator = dateStr.includes("/") ? "/" : "-";
    const dateParts = dateStr.split(separator);
    
    if (dateParts.length === 3) {
      const part1 = parseInt(dateParts[0]);
      const part2 = parseInt(dateParts[1]);
      const part3 = parseInt(dateParts[2]);
      
      if (dateParts[0].length === 4) {
        // YYYY/MM/DD or YYYY-MM-DD
        return new Date(part1, part2 - 1, part3);
      } else {
        // DD/MM/YYYY or DD-MM-YYYY
        return new Date(part3, part2 - 1, part1);
      }
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? new Date(0) : parsed;
  };

  // Helper: Load clients map from Firestore
  const loadClientsMap = async () => {
    if (!companyId) return new Map<string, string>();
    const snap = await getDocs(collection(db, "companies", companyId, "clients"));
    const clientMap = new Map<string, string>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      const name = data.LegalName || data.CommercialName || data.ClientName || data.legalName || data.name || data.razonSocial || "";
      const nameKey = String(name).trim().toLowerCase();
      if (nameKey) {
        clientMap.set(nameKey, doc.id);
      }
      const rfc = data.RFC || data.rfc || "";
      const rfcKey = String(rfc).trim().toLowerCase();
      if (rfcKey) {
        clientMap.set(rfcKey, doc.id);
      }
    });
    return clientMap;
  };




  // Helper: Load facturas map from Firestore
  const loadFacturasMap = async () => {
    if (!companyId) return new Map<string, string>();
    const snap = await getDocs(collection(db, "companies", companyId, "facturas"));
    const fMap = new Map<string, string>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.invoiceNumber) {
        fMap.set(String(data.invoiceNumber).trim().toLowerCase(), doc.id);
      }
    });
    return fMap;
  };

  // Helper: Load remisiones map from Firestore
  const loadRemisionesMap = async () => {
    if (!companyId) return new Map<string, string>();
    const snap = await getDocs(collection(db, "companies", companyId, "remisiones"));
    const rMap = new Map<string, string>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.remissionNumber) {
        rMap.set(String(data.remissionNumber).trim().toLowerCase(), doc.id);
      }
    });
    return rMap;
  };

  // Helper: Load accounts map from Firestore
  const loadAccountsMap = async () => {
    if (!companyId) return new Map<string, string>();
    const snap = await getDocs(collection(db, "companies", companyId, "accounts"));
    const aMap = new Map<string, string>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.name) {
        aMap.set(String(data.name).trim().toLowerCase(), doc.id);
      }
    });
    return aMap;
  };

  // Helper: Load products map from Firestore
  const loadProductsMap = async () => {
    if (!companyId) return new Map<string, any>();
    const snap = await getDocs(collection(db, "companies", companyId, "products"));
    const productMap = new Map<string, any>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      const titleKey = String(data.title || "").trim().toLowerCase();
      const titleKeyHealed = fixDoubleEncoding(titleKey);
      
      productMap.set(titleKey, { id: doc.id, ...data });
      if (titleKeyHealed !== titleKey) {
        productMap.set(titleKeyHealed, { id: doc.id, ...data });
      }

      if (data.variants && Array.isArray(data.variants)) {
        data.variants.forEach(variant => {
          if (variant.sku) {
            productMap.set(String(variant.sku).trim().toLowerCase(), { id: doc.id, ...data });
          }
          if (variant.barcode) {
            productMap.set(String(variant.barcode).trim().toLowerCase(), { id: doc.id, ...data });
          }
        });
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
      name: cleanedName.toUpperCase(),
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
        encoding: "UTF-8",
        complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) {
              addLog("error", "El archivo de Cotizaciones está vacío.");
              setLoadingStep(null);
              return;
            }

            const headers = Object.keys(records[0]);
            addLog("info", `Cabeceras detectadas en el CSV: ${headers.join(", ")}`);
            setProgressText("Agrupando partidas por Folio...");

            // Group flat lines by Folio
            let maxImportedFolio = 0;
            const groupedQuotes = new Map<string, any[]>();
            records.forEach((record: any) => {
              const folio = String(getFlexibleValue(record, ["folio", "numero", "num", "id", "codigo", "referencia", "quotenumber", "quote", "foliodecotizacion"])).trim();
              if (!folio) return;

              const match = folio.match(/^[A-Z]*[- ]*(\d+)/i);
              const numVal = match ? parseInt(match[1], 10) : parseInt(folio.replace(/[^0-9]/g, ""), 10);
              if (numVal && numVal > maxImportedFolio) {
                maxImportedFolio = numVal;
              }

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
            
            for (const [folio, lines] of groupedQuotes.entries()) {
              const firstLine = lines[0];
              const clientName = String(getFlexibleValue(firstLine, ["cliente", "client", "nombrecliente", "clientname", "customer", "razonsocial", "nombre", "clientenombre"]) || "").replace(/^\s*-\s*/, "").trim();
              
              // Resolve Client On the fly
              let clientId = await createClientOnTheFly(clientName, clientMap, currentBatch);

              // Build Items array
              const items: any[] = [];
              let calculatedSubtotal = 0;
              let calculatedTotal = 0;

              for (const line of lines) {
                const productName = String(getFlexibleValue(line, ["producto", "product", "articulo", "concepto", "descripcion", "description", "item"]) || "Concepto General").trim();
                const totalVal = getFlexibleValue(line, ["total", "monto", "amount", "importetotal", "importe", "totalamount"]);
                const subtotalVal = getFlexibleValue(line, ["subtotal", "subtotalamount", "submonto"]);
                
                const totalLine = round2(parseFloat(String(totalVal).replace(/[^0-9.-]/g, "")) || 0);
                const subtotalLine = round2(parseFloat(String(subtotalVal).replace(/[^0-9.-]/g, "")) || 0);
                calculatedSubtotal += subtotalLine;
                calculatedTotal += totalLine;

                // Resolve Product on the fly
                let product = null;
                const titleKey = productName.toLowerCase();
                const titleKeyHealed = fixDoubleEncoding(titleKey);
                if (titleKey && productMap.has(titleKey)) {
                  product = productMap.get(titleKey);
                } else if (titleKeyHealed && productMap.has(titleKeyHealed)) {
                  product = productMap.get(titleKeyHealed);
                } else {
                  product = await createProductOnTheFly(productName, totalLine, productMap, currentBatch);
                }
                
                let matchedVariant = null;
                if (product && product.variants) {
                  matchedVariant = product.variants[0];
                }

                items.push({
                  productId: product ? product.id : `hist-${crypto.randomUUID()}`,
                  productName: productName,
                  sku: product ? (matchedVariant ? matchedVariant.sku : "") : "",
                  variantId: matchedVariant ? (matchedVariant.id || `var-${product.id}`) : `var-${crypto.randomUUID()}`,
                  variantTitle: matchedVariant ? (matchedVariant.title || "Default Title") : "Default Title",
                  quantity: 1,
                  unitPrice: subtotalLine,
                  discountPercentage: 0
                });
              }

              // Status mapping
              let status = "nueva";
              const bindStatus = String(getFlexibleValue(firstLine, ["estatus", "status", "estado", "situacion"]) || "").trim().toLowerCase();
              if (bindStatus.includes("surtida") || bindStatus.includes("aceptada") || bindStatus.includes("ganada")) {
                status = "ganada";
              } else if (bindStatus.includes("cancelada") || bindStatus.includes("rechazada")) {
                status = "perdida";
              } else if (bindStatus.includes("enviada")) {
                status = "enviada";
              }

              // Date formatting
              let isoDate = new Date().toISOString();
              const creationDateStr = String(getFlexibleValue(firstLine, ["fechapedido", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion", "creacion"]) || "");
              if (creationDateStr) {
                const parsedDate = parseDateStr(creationDateStr);
                if (parsedDate.getTime() > 0) {
                  isoDate = parsedDate.toISOString();
                }
              }

              const quoteId = `quote-${folio}`;
              const ref = doc(db, "companies", companyId, "quotes", quoteId);

              currentBatch.set(ref, {
                id: quoteId,
                quoteNumber: folio,
                clientName: clientName,
                clientId: clientId || null,
                totalAmount: round2(calculatedTotal),
                subtotal: round2(calculatedSubtotal),
                tax: round2(calculatedTotal - calculatedSubtotal),
                status: status,
                createdAt: isoDate,
                createdBy: String(getFlexibleValue(firstLine, ["vendedor", "empleado", "vendedorasignado", "agent", "salesagent", "user", "usuario", "creadoby", "creadopor"]) || "Migración Automática").trim(),
                items: items,
                migrated: true,
                updatedAt: new Date().toISOString()
              }, { merge: true });

              writeCount++;
              successQuotes++;

              if (writeCount >= 200) {
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

            if (maxImportedFolio > 0) {
              try {
                const counterRef = doc(db, "companies", companyId, "counters", "sequences");
                await runTransaction(db, async (transaction) => {
                  const counterDoc = await transaction.get(counterRef);
                  let currentVal = 0;
                  if (counterDoc.exists() && counterDoc.data().cotizaciones !== undefined) {
                    currentVal = counterDoc.data().cotizaciones;
                  }
                  if (maxImportedFolio > currentVal) {
                    transaction.set(counterRef, { cotizaciones: maxImportedFolio }, { merge: true });
                    addLog("info", `Folio de cotizaciones actualizado a la numeración Bind: ${maxImportedFolio}`);
                  }
                });
              } catch (seqErr: any) {
                console.error("Error updating sequence for cotizaciones:", seqErr);
              }
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
      const productMap = await loadProductsMap();
      
      const Papa = await import("papaparse");
      Papa.default.parse(pedidosFile, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) {
              addLog("error", "El archivo de Pedidos está vacío.");
              setLoadingStep(null);
              return;
            }

            const headers = Object.keys(records[0]);
            addLog("info", `Cabeceras detectadas en el CSV: ${headers.join(", ")}`);
            setProgressText("Agrupando pedidos por Número y ordenando cronológicamente...");
            
            // Deduplicate Pedidos: Group by Numero, sort by Creation Date, and pick the latest record.
            let maxImportedFolio = 0;
            const groupedPedidos = new Map<string, any[]>();
            records.forEach((record: any) => {
              const num = String(getFlexibleValue(record, ["numero", "num", "folio", "pedido", "id", "codigo", "referencia", "ordernumber", "order", "numerodepedido", "foliodepedido"])).trim();
              if (!num) return;

              const match = num.match(/^[A-Z]*[- ]*(\d+)/i);
              const numVal = match ? parseInt(match[1], 10) : parseInt(num.replace(/[^0-9]/g, ""), 10);
              if (numVal && numVal > maxImportedFolio) {
                maxImportedFolio = numVal;
              }

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
              // Group rows by their date to find the latest date
              // First, sort all rows by date ascending so we can easily find the latest date
              rows.sort((a, b) => {
                const dateA = String(getFlexibleValue(a, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
                const dateB = String(getFlexibleValue(b, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
                return parseDateStr(dateA).getTime() - parseDateStr(dateB).getTime();
              });
              
              const latestRecordRaw = rows[rows.length - 1];
              const latestDateStr = String(getFlexibleValue(latestRecordRaw, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
              
              // Get all rows that match this latest date
              const latestDateRows = rows.filter(row => {
                const rowDate = String(getFlexibleValue(row, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
                return rowDate === latestDateStr;
              });

              // Check if we have any non-cancelled row on the latest date
              const activeStatusRows = latestDateRows.filter(row => {
                const rowStatus = String(getFlexibleValue(row, ["estatus", "status", "estado", "situacion", "estatuspedido", "statuspedido"]) || "").trim().toLowerCase();
                return !rowStatus.includes("cancelado");
              });

              let activeLines = [];
              let latestRecord = null;
              let latestStatus = "";

              if (activeStatusRows.length > 0) {
                // We have active (non-cancelled) lines on the latest date!
                // We prioritize these active lines!
                activeLines = activeStatusRows;
                latestRecord = activeStatusRows[activeStatusRows.length - 1];
                latestStatus = String(getFlexibleValue(latestRecord, ["estatus", "status", "estado", "situacion", "estatuspedido", "statuspedido"]));
              } else {
                // All lines on the latest date are cancelled.
                // We fall back to the cancelled lines.
                activeLines = latestDateRows;
                latestRecord = latestDateRows[latestDateRows.length - 1];
                latestStatus = String(getFlexibleValue(latestRecord, ["estatus", "status", "estado", "situacion", "estatuspedido", "statuspedido"]));
              }

              const clientName = String(getFlexibleValue(latestRecord, ["cliente", "client", "nombrecliente", "clientname", "customer", "razonsocial", "nombre", "clientenombre"]) || "").trim();
              
              // Resolve Client On the fly
              let clientId = await createClientOnTheFly(clientName, clientMap, currentBatch);

              // Map status
              let status = "por_surtir";
              const statusLower = latestStatus.toLowerCase();
              if (statusLower.includes("cancelado")) {
                status = "cancelado";
              } else if (statusLower.includes("surtido") || statusLower.includes("listo")) {
                status = "surtido";
              } else if (statusLower.includes("remisionado") || statusLower.includes("terminado")) {
                status = "remisionado";
              }

              // The earliest record represents when the order was actually created
              const earliestRecord = rows[0];
              const earliestDateStr = String(getFlexibleValue(earliestRecord, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));

              // Date formatting (using the earliest Creacion date as the creation date of the order)
              let isoDate = new Date().toISOString();
              if (earliestDateStr) {
                const parsedDate = parseDateStr(earliestDateStr);
                if (parsedDate.getTime() > 0) {
                  isoDate = parsedDate.toISOString();
                }
              }

              const totalAmountVal = getFlexibleValue(latestRecord, ["total", "monto", "amount", "importetotal", "importe", "totalamount"]);
              const totalAmount = round2(parseFloat(String(totalAmountVal).replace(/[^0-9.-]/g, "")) || 0);
              
              // Build Items array from detailed CSV lines
              const items: any[] = [];
              let calculatedSubtotal = 0;

              for (const line of activeLines) {
                const quantity = parseFloat(String(getFlexibleValue(line, ["cantidad", "quantity", "cant"])).replace(/[^0-9.-]/g, "")) || 1;
                const unitPrice = round2(parseFloat(String(getFlexibleValue(line, ["precio", "unitprice", "preciounitario", "rate"])).replace(/[^0-9.-]/g, "")) || 0);
                calculatedSubtotal += quantity * unitPrice;
              }

              // Determine global discount percentage if total is lower than subtotal * 1.16
              let orderDiscountPercentage = 0;
              if (calculatedSubtotal > 0 && totalAmount < (calculatedSubtotal * 1.16) - 1.00) {
                const taxableSubtotal = totalAmount / 1.16;
                const discountAmt = Math.max(0, calculatedSubtotal - taxableSubtotal);
                orderDiscountPercentage = Math.round((discountAmt / calculatedSubtotal) * 100);
              }

              for (const line of activeLines) {
                const productName = String(getFlexibleValue(line, ["producto", "product", "articulo", "concepto", "descripcion", "description", "item"]) || "Concepto de Venta").trim();
                const sku = String(getFlexibleValue(line, ["codigo", "code", "sku", "barcode", "upc"]) || "").trim();
                const qty = parseFloat(String(getFlexibleValue(line, ["cantidad", "quantity", "cant"])).replace(/[^0-9.-]/g, "")) || 1;
                const unitPrice = round2(parseFloat(String(getFlexibleValue(line, ["precio", "unitprice", "preciounitario", "rate"])).replace(/[^0-9.-]/g, "")) || 0);

                // Resolve Product on the fly
                let product = null;
                const titleKey = productName.toLowerCase();
                const titleKeyHealed = fixDoubleEncoding(titleKey);
                const skuKey = sku.toLowerCase();

                if (skuKey && productMap.has(skuKey)) {
                  product = productMap.get(skuKey);
                } else if (titleKey && productMap.has(titleKey)) {
                  product = productMap.get(titleKey);
                } else if (titleKeyHealed && productMap.has(titleKeyHealed)) {
                  product = productMap.get(titleKeyHealed);
                } else {
                  product = await createProductOnTheFly(productName, unitPrice, productMap, currentBatch);
                }

                let matchedVariant = null;
                if (product && product.variants) {
                  if (skuKey) {
                    matchedVariant = product.variants.find((v: any) => String(v.sku).toLowerCase() === skuKey || String(v.barcode).toLowerCase() === skuKey);
                  }
                  if (!matchedVariant) {
                    matchedVariant = product.variants[0];
                  }
                }

                items.push({
                  productId: product ? product.id : `hist-${crypto.randomUUID()}`,
                  productName: productName,
                  sku: sku || (matchedVariant ? matchedVariant.sku : ""),
                  variantId: matchedVariant ? (matchedVariant.id || `var-${product.id}`) : `var-${crypto.randomUUID()}`,
                  variantTitle: matchedVariant ? (matchedVariant.title || "Default Title") : "Default Title",
                  quantity: qty,
                  unitPrice: unitPrice,
                  discountPercentage: orderDiscountPercentage
                });
              }

              const subtotal = round2(calculatedSubtotal);
              const totalDiscount = round2(subtotal * (orderDiscountPercentage / 100));
              const taxableSubtotal = round2(subtotal - totalDiscount);
              const tax = round2(Math.max(0, totalAmount - taxableSubtotal));

              const orderId = `order-${numero}`;
              const ref = doc(db, "companies", companyId, "pedidos", orderId);

              // Try to resolve reference quote
              const refQuoteNum = String(getFlexibleValue(latestRecord, ["pedido", "cotizacion", "cotizacionnumero", "quote", "quotenumber", "referencia"]) || "").trim();
              const quoteNumber = (refQuoteNum && refQuoteNum !== numero) ? refQuoteNum : "";

              currentBatch.set(ref, {
                id: orderId,
                orderNumber: numero,
                quoteNumber: quoteNumber,
                quoteId: quoteNumber ? `quote-${quoteNumber}` : null,
                clientName: clientName,
                clientId: clientId || null,
                totalAmount: totalAmount,
                subtotal: subtotal,
                totalDiscount: totalDiscount,
                tax: tax,
                status: status,
                createdAt: isoDate,
                createdBy: String(getFlexibleValue(latestRecord, ["empleado", "vendedor", "vendedorasignado", "agent", "salesagent", "user", "usuario", "creadoby", "creadopor"]) || "Migración Automática").trim(),
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

            if (maxImportedFolio > 0) {
              try {
                const counterRef = doc(db, "companies", companyId, "counters", "sequences");
                await runTransaction(db, async (transaction) => {
                  const counterDoc = await transaction.get(counterRef);
                  let currentVal = 0;
                  if (counterDoc.exists() && counterDoc.data().pedidos !== undefined) {
                    currentVal = counterDoc.data().pedidos;
                  }
                  if (maxImportedFolio > currentVal) {
                    transaction.set(counterRef, { pedidos: maxImportedFolio }, { merge: true });
                    addLog("info", `Folio de pedidos actualizado a la numeración Bind: ${maxImportedFolio}`);
                  }
                });
              } catch (seqErr: any) {
                console.error("Error updating sequence for pedidos:", seqErr);
              }
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
    addLog("info", "Iniciando importación combinada de Remisiones y Facturas con detalle...");

    try {
      const clientMap = await loadClientsMap();
      const productMap = await loadProductsMap();
      
      const Papa = await import("papaparse");
      Papa.default.parse(remisionesFacturasFile, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) {
              addLog("error", "El archivo de Remisiones y Facturas está vacío.");
              setLoadingStep(null);
              return;
            }

            const headers = Object.keys(records[0]);
            addLog("info", `Cabeceras detectadas en el CSV: ${headers.join(", ")}`);
            setProgressText("Agrupando partidas por documento...");

            // Group lines by document type and document number
            const groupedDocs = new Map<string, any[]>();
            records.forEach((record: any) => {
              const docType = String(getFlexibleValue(record, ["documento", "tipodocumento", "tipo", "documenttype", "type"]) || "").trim().toLowerCase();
              const numero = String(getFlexibleValue(record, ["numero", "num", "folio", "id", "codigo", "referencia", "documentnumber"])).trim();
              if (!numero || !docType) return;
              
              const key = `${docType}:${numero.toLowerCase()}`;
              if (!groupedDocs.has(key)) {
                groupedDocs.set(key, []);
              }
              groupedDocs.get(key)!.push(record);
            });

            addLog("info", `Detectados ${groupedDocs.size} documentos únicos (Remisiones/Facturas) con detalle.`);

            const batches: any[] = [];
            let currentBatch = writeBatch(db);
            let writeCount = 0;
            let successRemissions = 0;
            let successInvoices = 0;

            let maxImportedRemision = 0;
            let maxImportedFactura = 0;

            setProgressText("Procesando cabeceras y resolviendo partidas...");

            for (const [docKey, lines] of groupedDocs.entries()) {
              const firstLine = lines[0];
              const docType = String(getFlexibleValue(firstLine, ["documento", "tipodocumento", "tipo", "documenttype", "type"]) || "").trim().toLowerCase();
              const numero = String(getFlexibleValue(firstLine, ["numero", "num", "folio", "id", "codigo", "referencia", "documentnumber"])).trim();

              const match = numero.match(/^[A-Z]*[- ]*(\d+)/i);
              const numVal = match ? parseInt(match[1], 10) : parseInt(numero.replace(/[^0-9]/g, ""), 10);

              if (docType.includes("factur")) {
                if (numVal && numVal > maxImportedFactura) {
                  maxImportedFactura = numVal;
                }
              } else {
                if (numVal && numVal > maxImportedRemision) {
                  maxImportedRemision = numVal;
                }
              }
              
              const clientName = String(getFlexibleValue(firstLine, ["cliente", "client", "nombrecliente", "clientname", "customer", "razonsocial", "nombre", "clientenombre"]) || "").trim();
              
              // Resolve Client On the fly
              let clientId = await createClientOnTheFly(clientName, clientMap, currentBatch);

              // Date formatting
              let isoDate = new Date().toISOString();
              const dateStr = String(getFlexibleValue(firstLine, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]) || "");
              if (dateStr) {
                const parsedDate = parseDateStr(dateStr);
                if (parsedDate.getTime() > 0) {
                  isoDate = parsedDate.toISOString();
                }
              }

              const totalVal = getFlexibleValue(firstLine, ["total", "monto", "amount", "importetotal", "importe", "totalamount"]);
              const subtotalVal = getFlexibleValue(firstLine, ["subtotal", "subtotalamount", "submonto"]);
              const taxVal = getFlexibleValue(firstLine, ["impuestos", "impuesto", "iva", "tax", "taxes"]);

              const totalAmount = round2(parseNumber(totalVal));
              const subtotal = round2(parseNumber(subtotalVal) || (totalAmount / 1.16));
              const tax = round2(parseNumber(taxVal) || (totalAmount - subtotal));

              // Build Items array from detailed CSV lines
              const items: any[] = [];

              for (const line of lines) {
                const productName = String(line["Producto_Nombre"] || "").trim();
                if (!productName) continue;

                const sku = String(line["Producto_SKU"] || "").trim();
                const qty = parseNumber(line["Producto_Cantidad"]);
                const unitPrice = round2(parseNumber(line["Producto_PrecioUnitario"]));
                const discountPercentage = parseNumber(line["Producto_DescuentoPorcentaje"]);

                // Resolve Product on the fly
                let product = null;
                const titleKey = productName.toLowerCase();
                const titleKeyHealed = fixDoubleEncoding(titleKey);
                const skuKey = sku.toLowerCase();

                if (skuKey && productMap.has(skuKey)) {
                  product = productMap.get(skuKey);
                } else if (titleKey && productMap.has(titleKey)) {
                  product = productMap.get(titleKey);
                } else if (titleKeyHealed && productMap.has(titleKeyHealed)) {
                  product = productMap.get(titleKeyHealed);
                } else {
                  product = await createProductOnTheFly(productName, unitPrice, productMap, currentBatch);
                }

                let matchedVariant = null;
                if (product && product.variants) {
                  if (skuKey) {
                    matchedVariant = product.variants.find((v: any) => String(v.sku).toLowerCase() === skuKey || String(v.barcode).toLowerCase() === skuKey);
                  }
                  if (!matchedVariant) {
                    matchedVariant = product.variants[0];
                  }
                }

                items.push({
                  productId: product ? product.id : `hist-${crypto.randomUUID()}`,
                  productName: productName,
                  sku: sku || (matchedVariant ? matchedVariant.sku : ""),
                  variantId: matchedVariant ? (matchedVariant.id || `var-${product.id}`) : `var-${crypto.randomUUID()}`,
                  variantTitle: matchedVariant ? (matchedVariant.title || "Default Title") : "Default Title",
                  quantity: qty,
                  unitPrice: unitPrice,
                  discountPercentage: discountPercentage
                });
              }

              // Check if it's a Remission (Remisión)
              if (docType.includes("remis")) {
                let status = "activa";
                const bindStatus = String(getFlexibleValue(firstLine, ["estatus", "status", "estado", "situacion"]) || "").trim().toLowerCase();
                if (bindStatus.includes("cancelada")) {
                  status = "cancelada";
                } else if (bindStatus.includes("facturada")) {
                  status = "facturada";
                } else if (bindStatus.includes("pagada")) {
                  status = "pagada";
                }

                const remissionId = `remission-${numero}`;
                const ref = doc(db, "companies", companyId, "remisiones", remissionId);

                // Try to link to a PurchaseOrder (order Number)
                const orderNum = String(getFlexibleValue(firstLine, ["purchaseorder", "ordencompra", "orden", "pedido", "order"]) || "").trim();

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
                  createdBy: String(getFlexibleValue(firstLine, ["vendedor", "empleado", "vendedorasignado", "agent", "salesagent", "user", "usuario", "creadoby", "creadopor"]) || "Migración Automática").trim(),
                  items: items,
                  migrated: true,
                  updatedAt: new Date().toISOString()
                }, { merge: true });

                successRemissions++;
                writeCount++;

              } else if (docType.includes("factur")) {
                // Check if it's an Invoice (Factura)
                let status = "por_timbrar";
                const bindStatus = String(getFlexibleValue(firstLine, ["estatus", "status", "estado", "situacion"]) || "").trim().toLowerCase();
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
                  rfc: String(getFlexibleValue(firstLine, ["rfc", "taxid", "rfcmiscelanea"]) || "").trim(),
                  uuid: getFlexibleValue(firstLine, ["uuid", "timbre", "foliocomercial", "foliofiscal", "fiscalid"]) || null,
                  totalAmount: totalAmount,
                  subtotal: subtotal,
                  tax: tax,
                  status: status,
                  createdAt: isoDate,
                  createdBy: String(getFlexibleValue(firstLine, ["vendedor", "empleado", "vendedorasignado", "agent", "salesagent", "user", "usuario", "creadoby", "creadopor"]) || "Migración Automática").trim(),
                  paymentMethod: String(getFlexibleValue(firstLine, ["metodopago", "formapago", "paymentmethod"]) || "PPD").trim(),
                  items: items,
                  migrated: true,
                  updatedAt: new Date().toISOString()
                }, { merge: true });

                successInvoices++;
                writeCount++;
              }

              if (writeCount >= 200) {
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

            try {
              const counterRef = doc(db, "companies", companyId, "counters", "sequences");
              await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                let currentRem = 0;
                let currentInv = 0;
                if (counterDoc.exists()) {
                  const data = counterDoc.data();
                  if (data.remisiones !== undefined) currentRem = data.remisiones;
                  if (data.facturas !== undefined) currentInv = data.facturas;
                }
                const updates: any = {};
                if (maxImportedRemision > currentRem) {
                  updates.remisiones = maxImportedRemision;
                  addLog("info", `Folio de remisiones actualizado a la numeración Bind: ${maxImportedRemision}`);
                }
                if (maxImportedFactura > currentInv) {
                  updates.facturas = maxImportedFactura;
                  addLog("info", `Folio de facturas actualizado a la numeración Bind: ${maxImportedFactura}`);
                }
                if (Object.keys(updates).length > 0) {
                  transaction.set(counterRef, updates, { merge: true });
                }
              });
            } catch (seqErr: any) {
              console.error("Error updating sequence for remisiones/facturas:", seqErr);
            }

            setStats(prev => ({ 
              ...prev, 
              remissionsImported: prev.remissionsImported + successRemissions,
              invoicesImported: prev.invoicesImported + successInvoices
            }));
            addLog("success", `¡Sincronización completa! Se importaron ${successRemissions} remisiones y ${successInvoices} facturas con sus partidas.`);
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

  // Step 5: Import Incomes/Payments
  const handleImportIngresos = async () => {
    if (!ingresosFile || !companyId) return;
    setLoadingStep(5);
    setProgressText("Cargando mapas de base de datos...");
    addLog("info", "Iniciando importación masiva de Ingresos y Cobros...");

    try {
      const clientMap = await loadClientsMap();
      const facturasMap = await loadFacturasMap();
      const remisionesMap = await loadRemisionesMap();
      const accountsMap = await loadAccountsMap();

      // Load existing payments to prevent duplicate increments
      const paymentsSnap = await getDocs(collection(db, "companies", companyId, "payments"));
      const existingPaymentIds = new Set<string>();
      paymentsSnap.forEach(d => {
        existingPaymentIds.add(d.id);
      });

      const Papa = await import("papaparse");
      Papa.default.parse(ingresosFile, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: async (results: any) => {
          try {
            const records = results.data;
            if (!records || records.length === 0) {
              addLog("error", "El archivo de Ingresos está vacío.");
              setLoadingStep(null);
              return;
            }

            const headers = Object.keys(records[0]);
            addLog("info", `Cabeceras detectadas en el CSV: ${headers.join(", ")}`);
            setProgressText("Procesando cobros y vinculando documentos...");

            const batches: any[] = [];
            let currentBatch = writeBatch(db);
            let writeCount = 0;
            let successPayments = 0;

            for (const record of records) {
              const facturasColVal = String(getFlexibleValue(record, ["facturas", "factura", "documento", "folios"]) || "").trim();
              if (!facturasColVal) continue; // Skip if no document number

              // Clean document folio: F-     35163 -> 35163
              const cleanFolio = facturasColVal.replace(/[^0-9]/g, "");
              if (!cleanFolio) continue;

              const clientName = String(getFlexibleValue(record, ["cliente", "client", "nombre", "customer"]) || "").trim();
              
              // Resolve Client On the fly
              let clientId = await createClientOnTheFly(clientName, clientMap, currentBatch);

              // Date formatting
              let isoDate = new Date().toISOString();
              const dateStr = String(getFlexibleValue(record, ["fecha", "createdat", "created", "fechacreacion"]) || "");
              if (dateStr) {
                const parsedDate = parseDateStr(dateStr);
                if (parsedDate.getTime() > 0) {
                  isoDate = parsedDate.toISOString();
                }
              }

              // Account association: Cuenta -> bankAccountId
              const csvCuenta = String(getFlexibleValue(record, ["cuenta", "banco", "bank"]) || "").trim().toLowerCase();
              let bankAccountId = "";
              if (csvCuenta) {
                for (const [accName, accId] of accountsMap.entries()) {
                  if (accName.includes(csvCuenta) || csvCuenta.includes(accName)) {
                    bankAccountId = accId;
                    break;
                  }
                }
              }

              // Determine document link and type
              let documentId = "";
              let documentType: "factura" | "remision" = "factura";
              let collectionName = "facturas";

              if (facturasMap.has(cleanFolio.toLowerCase())) {
                documentId = facturasMap.get(cleanFolio.toLowerCase())!;
                documentType = "factura";
                collectionName = "facturas";
              } else if (remisionesMap.has(cleanFolio.toLowerCase())) {
                documentId = remisionesMap.get(cleanFolio.toLowerCase())!;
                documentType = "remision";
                collectionName = "remisiones";
              } else {
                // If not found locally, create a detached payment or placeholder reference
                documentId = `hist-doc-${cleanFolio}`;
                documentType = "factura";
                collectionName = "facturas";
              }

              const totalVal = getFlexibleValue(record, ["total", "monto", "amount", "montooriginal"]);
              const amountVal = round2(parseFloat(String(totalVal).replace(/[^0-9.-]/g, "")) || 0);

              // Generate deterministic payment ID to avoid duplicates and double increments
              const cleanClient = normalizeKey(clientName);
              const cleanDate = dateStr.replace(/[^0-9]/g, "");
              const cleanAmount = String(amountVal).replace(/[^0-9.]/g, "");
              const paymentId = `pay_${cleanClient}_${cleanDate}_${cleanAmount}_${cleanFolio}`;

              if (existingPaymentIds.has(paymentId)) {
                // Skip silently if payment has already been imported
                continue;
              }

              const paymentRef = doc(db, "companies", companyId, "payments", paymentId);
              
              const paymentData = {
                id: paymentId,
                amount: amountVal,
                date: isoDate.substring(0, 10),
                method: String(getFlexibleValue(record, ["tipo", "metodopago", "formapago", "paymentmethod"]) || "Transferencia").trim(),
                reference: String(getFlexibleValue(record, ["referencia", "ref", "notes"]) || "").trim(),
                documentId,
                documentType,
                documentNumber: cleanFolio,
                clientId: clientId || "",
                clientName: clientName,
                bankAccountId: bankAccountId || "hist-account",
                migrated: true,
                createdAt: isoDate
              };

              currentBatch.set(paymentRef, paymentData);
              existingPaymentIds.add(paymentId); // Add to local set to avoid duplicates within the same CSV upload
              successPayments++;
              writeCount++;

              // Update the matched document's paidAmount and status if linked in our database!
              if (documentId && !documentId.startsWith("hist-doc-")) {
                const docRef = doc(db, "companies", companyId, collectionName, documentId);
                
                // We increment paidAmount and set status as pagada
                currentBatch.update(docRef, {
                  paidAmount: increment(amountVal),
                  status: "pagada"
                });
                writeCount++;
              }

              if (writeCount >= 200) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                writeCount = 0;
              }
            }

            if (writeCount > 0) {
              batches.push(currentBatch);
            }

            setProgressText(`Guardando pagos en Firestore (${batches.length} lotes)...`);
            for (let i = 0; i < batches.length; i++) {
              await batches[i].commit();
              setProgressText(`Guardando lote ${i + 1} de ${batches.length}...`);
            }

            setStats(prev => ({
              ...prev,
              paymentsImported: prev.paymentsImported + successPayments
            }));
            addLog("success", `¡Sincronización completa! Se importaron ${successPayments} cobros históricos y se actualizaron los saldos de remisiones/facturas.`);
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

  // Función para migrar los anticipos legacy desde el root a la subcolección de la empresa
  const handleMigrateLegacyAnticipos = async () => {
    if (!companyId) return;
    setLoadingStep(10);
    setProgressText("Buscando anticipos en la raíz de Firestore...");
    addLog("info", "Iniciando migración de Anticipos Legacy...");

    try {
      // 1. Fetch from root /anticipos
      const rootRef = collection(db, "anticipos");
      const snap = await getDocs(rootRef);

      if (snap.empty) {
        addLog("warning", "No se encontraron anticipos legacy en la colección raíz.");
        alert("No se encontraron anticipos legacy en la colección raíz.");
        return;
      }

      addLog("info", `Encontrados ${snap.size} anticipos legacy. Copiando a tu empresa...`);
      
      const batches: any[] = [];
      let currentBatch = writeBatch(db);
      let count = 0;
      let migratedCount = 0;

      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const docId = docSnap.id;

        // Target path: companies/{companyId}/anticipos/{docId}
        const targetRef = doc(db, "companies", companyId, "anticipos", docId);
        
        // Preserve all fields exactly as they are
        currentBatch.set(targetRef, {
          ...data,
          migratedFromLegacy: true,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        count++;
        migratedCount++;

        if (count >= 200) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          count = 0;
        }
      });

      if (count > 0) {
        batches.push(currentBatch);
      }

      setProgressText(`Guardando anticipos en subcolección (${batches.length} lotes)...`);
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        setProgressText(`Guardando lote ${i + 1} de ${batches.length}...`);
      }

      setStats(prev => ({ ...prev, anticiposMigrated: migratedCount }));
      addLog("success", `¡Migración de anticipos completada! Se copiaron ${migratedCount} anticipos a tu empresa.`);
      alert(`Se han migrado con éxito ${migratedCount} anticipos legacy a tu subcolección de empresa.`);
    } catch (err: any) {
      console.error(err);
      addLog("error", `Error al migrar anticipos: ${err.message}`);
      alert(`Error al migrar anticipos: ${err.message}`);
    } finally {
      setLoadingStep(null);
      setProgressText("");
    }
  };

  // Función para borrar todos los ingresos y restablecer el historial
  const handleDeleteAllIngresos = async () => {
    if (!companyId) return;
    if (!confirm("¿Estás seguro de que deseas borrar todos los cobros/ingresos importados de la base de datos? Esta acción no se puede deshacer y restablecerá el saldo pendiente de las facturas/remisiones.")) return;
    
    setLoadingStep(96); // Código de carga personalizado para borrar ingresos
    setProgressText("Buscando cobros en la base de datos...");
    addLog("info", "Iniciando eliminación de todos los cobros...");
    
    try {
      const colRef = collection(db, "companies", companyId, "payments");
      const snap = await getDocs(colRef);
      
      if (snap.empty) {
        addLog("warning", "No se encontraron cobros para eliminar.");
        alert("No hay cobros en la base de datos.");
        return;
      }
      
      addLog("info", `Encontrados ${snap.size} cobros. Eliminando progresivamente y restaurando saldos...`);
      
      const batches: any[] = [];
      let currentBatch = writeBatch(db);
      let count = 0;
      
      // We will delete all payments
      snap.docs.forEach(docSnap => {
        currentBatch.delete(docSnap.ref);
        count++;
        if (count >= 200) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          count = 0;
        }
      });
      
      if (count > 0) {
        batches.push(currentBatch);
      }
      
      // Also, we must reset the paidAmount on all Remisiones and Facturas back to 0 so the database remains completely clean
      const [remisionesSnap, facturasSnap] = await Promise.all([
        getDocs(collection(db, "companies", companyId, "remisiones")),
        getDocs(collection(db, "companies", companyId, "facturas"))
      ]);
      
      let resetBatch = writeBatch(db);
      let resetCount = 0;
      
      remisionesSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        if (d.paidAmount && d.paidAmount > 0) {
          resetBatch.update(docSnap.ref, {
            paidAmount: 0,
            status: d.status === "pagada" ? "activa" : d.status // Revert pagada to activa
          });
          resetCount++;
          if (resetCount >= 200) {
            batches.push(resetBatch);
            resetBatch = writeBatch(db);
            resetCount = 0;
          }
        }
      });
      
      facturasSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        if (d.paidAmount && d.paidAmount > 0) {
          resetBatch.update(docSnap.ref, {
            paidAmount: 0,
            status: d.status === "pagada" ? "timbrada" : d.status // Revert pagada to timbrada
          });
          resetCount++;
          if (resetCount >= 200) {
            batches.push(resetBatch);
            resetBatch = writeBatch(db);
            resetCount = 0;
          }
        }
      });
      
      if (resetCount > 0) {
        batches.push(resetBatch);
      }
      
      setProgressText(`Eliminando cobros y restaurando saldos en Firestore (${batches.length} lotes)...`);
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        setProgressText(`Procesando lote ${i + 1} de ${batches.length}...`);
      }
      
      setStats(prev => ({ ...prev, paymentsImported: 0 }));
      addLog("success", `¡Limpieza completada! Se eliminaron ${snap.size} cobros y se restauraron los saldos de facturas/remisiones.`);
      alert(`Se han eliminado todos los cobros (${snap.size}) y se restauraron los saldos de tus remisiones y facturas.`);
    } catch (err: any) {
      console.error(err);
      addLog("error", `Error al eliminar cobros: ${err.message}`);
      alert(`Error al eliminar cobros: ${err.message}`);
    } finally {
      setLoadingStep(null);
      setProgressText("");
    }
  };

  // Función para borrar todos los anticipos migrados de la subcolección de la empresa
  const handleDeleteAllAnticipos = async () => {
    if (!companyId) return;
    if (!confirm("¿Estás seguro de que deseas eliminar permanentemente todos los anticipos de esta empresa? Esta acción no se puede deshacer.")) return;

    setLoadingStep(95); // Código de carga personalizado para borrar anticipos
    setProgressText("Buscando anticipos de la empresa...");
    addLog("info", "Iniciando eliminación de todos los anticipos...");

    try {
      const colRef = collection(db, "companies", companyId, "anticipos");
      const snap = await getDocs(colRef);

      if (snap.empty) {
        addLog("warning", "No se encontraron anticipos para eliminar.");
        alert("No hay anticipos en tu empresa.");
        return;
      }

      addLog("info", `Encontrados ${snap.size} anticipos. Eliminando...`);

      const batches: any[] = [];
      let currentBatch = writeBatch(db);
      let count = 0;

      snap.docs.forEach(docSnap => {
        currentBatch.delete(docSnap.ref);
        count++;
        if (count >= 200) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          count = 0;
        }
      });

      if (count > 0) {
        batches.push(currentBatch);
      }

      setProgressText(`Eliminando de Firestore (${batches.length} lotes)...`);
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        setProgressText(`Eliminando lote ${i + 1} de ${batches.length}...`);
      }

      setStats(prev => ({ ...prev, anticiposMigrated: 0 }));
      addLog("success", `¡Limpieza de anticipos completada! Se eliminaron ${snap.size} anticipos de la empresa.`);
      alert(`Se han eliminado todos los anticipos (${snap.size}) de tu empresa.`);
    } catch (err: any) {
      console.error(err);
      addLog("error", `Error al eliminar anticipos: ${err.message}`);
      alert(`Error al eliminar anticipos: ${err.message}`);
    } finally {
      setLoadingStep(null);
      setProgressText("");
    }
  };

  // Función para borrar todos los pedidos y resetear el contador de secuencias
  const handleDeleteAllPedidos = async () => {
    if (!companyId) return;
    if (!confirm("¿Estás seguro de que deseas borrar todos los pedidos de la base de datos? Esta acción no se puede deshacer.")) return;
    
    setLoadingStep(99); // Código de carga personalizado para borrar
    setProgressText("Buscando pedidos en la base de datos...");
    addLog("info", "Iniciando eliminación de todos los pedidos...");
    
    try {
      const pedidosColRef = collection(db, "companies", companyId, "pedidos");
      const pedidosSnap = await getDocs(pedidosColRef);
      
      if (pedidosSnap.empty) {
        addLog("warning", "No se encontraron pedidos para eliminar.");
        alert("No hay pedidos en la base de datos.");
        return;
      }
      
      addLog("info", `Encontrados ${pedidosSnap.size} pedidos. Eliminando progresivamente...`);
      
      const batches: any[] = [];
      let currentBatch = writeBatch(db);
      let count = 0;
      
      pedidosSnap.docs.forEach(pedidoDoc => {
        currentBatch.delete(pedidoDoc.ref);
        count++;
        if (count >= 300) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          count = 0;
        }
      });
      
      if (count > 0) {
        batches.push(currentBatch);
      }
      
      setProgressText(`Eliminando de Firestore (${batches.length} lotes)...`);
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        setProgressText(`Eliminando lote ${i + 1} de ${batches.length}...`);
      }
      
      // Intentar resetear el contador de secuencias
      try {
        const counterRef = doc(db, "companies", companyId, "counters", "sequences");
        const finalBatch = writeBatch(db);
        finalBatch.set(counterRef, { pedidos: 0 }, { merge: true });
        await finalBatch.commit();
        addLog("success", "Contador de secuencias de pedidos reiniciado a 0.");
      } catch (err: any) {
        addLog("warning", `No se pudo reiniciar el contador de secuencias: ${err.message}`);
      }
      
      setStats(prev => ({ ...prev, ordersImported: 0 }));
      addLog("success", `¡Eliminación completada! Se eliminaron ${pedidosSnap.size} pedidos de forma exitosa.`);
      alert(`Se han eliminado todos los pedidos (${pedidosSnap.size}) de la base de datos.`);
    } catch (err: any) {
      console.error(err);
      addLog("error", `Error al eliminar pedidos: ${err.message}`);
      alert(`Error al eliminar pedidos: ${err.message}`);
    } finally {
      setLoadingStep(null);
      setProgressText("");
    }
  };

  // Función para borrar todas las remisiones y resetear el contador de secuencias
  const handleDeleteAllRemisiones = async () => {
    if (!companyId) return;
    if (!confirm("¿Estás seguro de que deseas borrar todas las remisiones de la base de datos? Esta acción no se puede deshacer.")) return;
    
    setLoadingStep(98); // Código de carga personalizado para borrar remisiones
    setProgressText("Buscando remisiones en la base de datos...");
    addLog("info", "Iniciando eliminación de todas las remisiones...");
    
    try {
      const colRef = collection(db, "companies", companyId, "remisiones");
      const snap = await getDocs(colRef);
      
      if (snap.empty) {
        addLog("warning", "No se encontraron remisiones para eliminar.");
        alert("No hay remisiones en la base de datos.");
        return;
      }
      
      addLog("info", `Encontradas ${snap.size} remisiones. Eliminando progresivamente...`);
      
      const batches: any[] = [];
      let currentBatch = writeBatch(db);
      let count = 0;
      
      snap.docs.forEach(docSnap => {
        currentBatch.delete(docSnap.ref);
        count++;
        if (count >= 300) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          count = 0;
        }
      });
      
      if (count > 0) {
        batches.push(currentBatch);
      }
      
      setProgressText(`Eliminando de Firestore (${batches.length} lotes)...`);
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        setProgressText(`Eliminando lote ${i + 1} de ${batches.length}...`);
      }
      
      // Intentar resetear el contador de secuencias
      try {
        const counterRef = doc(db, "companies", companyId, "counters", "sequences");
        const finalBatch = writeBatch(db);
        finalBatch.set(counterRef, { remisiones: 0 }, { merge: true });
        await finalBatch.commit();
        addLog("success", "Contador de secuencias de remisiones reiniciado a 0.");
      } catch (err: any) {
        addLog("warning", `No se pudo reiniciar el contador de secuencias: ${err.message}`);
      }
      
      setStats(prev => ({ ...prev, remissionsImported: 0 }));
      addLog("success", `¡Eliminación completada! Se eliminaron ${snap.size} remisiones de forma exitosa.`);
      alert(`Se han eliminado todas las remisiones (${snap.size}) de la base de datos.`);
    } catch (err: any) {
      console.error(err);
      addLog("error", `Error al eliminar remisiones: ${err.message}`);
      alert(`Error al eliminar remisiones: ${err.message}`);
    } finally {
      setLoadingStep(null);
      setProgressText("");
    }
  };

  // Función para borrar todas las facturas y resetear el contador de secuencias
  const handleDeleteAllFacturas = async () => {
    if (!companyId) return;
    if (!confirm("¿Estás seguro de que deseas borrar todas las facturas de la base de datos? Esta acción no se puede deshacer.")) return;
    
    setLoadingStep(97); // Código de carga personalizado para borrar facturas
    setProgressText("Buscando facturas en la base de datos...");
    addLog("info", "Iniciando eliminación de todas las facturas...");
    
    try {
      const colRef = collection(db, "companies", companyId, "facturas");
      const snap = await getDocs(colRef);
      
      if (snap.empty) {
        addLog("warning", "No se encontraron facturas para eliminar.");
        alert("No hay facturas en la base de datos.");
        return;
      }
      
      addLog("info", `Encontradas ${snap.size} facturas. Eliminando progresivamente...`);
      
      const batches: any[] = [];
      let currentBatch = writeBatch(db);
      let count = 0;
      
      snap.docs.forEach(docSnap => {
        currentBatch.delete(docSnap.ref);
        count++;
        if (count >= 300) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          count = 0;
        }
      });
      
      if (count > 0) {
        batches.push(currentBatch);
      }
      
      setProgressText(`Eliminando de Firestore (${batches.length} lotes)...`);
      for (let i = 0; i < batches.length; i++) {
        await batches[i].commit();
        setProgressText(`Eliminando lote ${i + 1} de ${batches.length}...`);
      }
      
      // Intentar resetear el contador de secuencias
      try {
        const counterRef = doc(db, "companies", companyId, "counters", "sequences");
        const finalBatch = writeBatch(db);
        finalBatch.set(counterRef, { facturas: 0 }, { merge: true });
        await finalBatch.commit();
        addLog("success", "Contador de secuencias de facturas reiniciado a 0.");
      } catch (err: any) {
        addLog("warning", `No se pudo reiniciar el contador de secuencias: ${err.message}`);
      }
      
      setStats(prev => ({ ...prev, invoicesImported: 0 }));
      addLog("success", `¡Eliminación completada! Se eliminaron ${snap.size} facturas de forma exitosa.`);
      alert(`Se han eliminado todas las facturas (${snap.size}) de la base de datos.`);
    } catch (err: any) {
      console.error(err);
      addLog("error", `Error al eliminar facturas: ${err.message}`);
      alert(`Error al eliminar facturas: ${err.message}`);
    } finally {
      setLoadingStep(null);
      setProgressText("");
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
                  Paso 3 y 4: Remisiones y Facturaciones (Detalladas)
                  {(stats.remissionsImported > 0 || stats.invoicesImported > 0) && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                </h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Sube el archivo unificado <span className="font-bold font-mono">Ventas_Detalladas.csv</span> (creado al combinar el resumen de ventas y las partidas). Este paso clasificará e importará automáticamente las entregas activas (Remisiones) y facturas fiscales (CFDI), vinculando el desglose completo de productos (items) y UUIDs fiscales.
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
                {remisionesFacturasFile ? remisionesFacturasFile.name : "Seleccionar Ventas_Detalladas.csv"}
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

          {/* STEP 5: Ingresos Históricos */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-teal-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-teal-50 rounded-xl text-teal-600 shrink-0">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  Paso 5: Ingresos y Pagos Históricos
                  {stats.paymentsImported > 0 && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                </h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Sube el archivo <span className="font-bold font-mono">Ingresos (1).csv</span>. Mapeará los pagos e ingresos a las cuentas bancarias de la empresa y los vinculará con las facturas y remisiones ya cargadas para actualizar saldos de forma dinámica.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <input
                type="file"
                id="ingresos-upload"
                className="hidden"
                accept=".csv"
                onChange={(e) => setIngresosFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                className="justify-start gap-2 border-dashed border-2 hover:border-solid hover:bg-muted text-muted-foreground text-xs h-10 flex-1 truncate"
                onClick={() => document.getElementById("ingresos-upload")?.click()}
                disabled={loadingStep !== null}
              >
                <Upload className="w-4 h-4 shrink-0" />
                {ingresosFile ? ingresosFile.name : "Seleccionar Ingresos (1).csv"}
              </Button>
              <Button
                onClick={handleImportIngresos}
                disabled={!ingresosFile || loadingStep !== null}
                className="bg-teal-600 hover:bg-teal-700 text-white min-w-[140px] text-xs h-10 gap-2 shrink-0 shadow-md"
              >
                {loadingStep === 5 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loadingStep === 5 ? "Importando..." : "Ejecutar Paso 5"}
              </Button>
            </div>
          </div>

          {/* STEP 6: Anticipos Legacy */}
          <div className="bg-card border rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-amber-200 transition-all">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-50 rounded-xl text-amber-600 shrink-0">
                <Database className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  Paso 6 (Opcional): Migración de Anticipos Legacy (Desde Firebase)
                </h3>
                <p className="text-xs text-muted-foreground leading-normal">
                  Migra directamente todos los anticipos y abonos a clientes registrados en la colección raíz global de Firestore e intégralos a esta nueva estructura multi-tenant de forma segura y directa.
                </p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <div className="flex-1 text-xs text-muted-foreground/80 font-medium">
                Esta acción se ejecuta en el navegador usando tu sesión activa de desarrollador (sin requerir descargas ni archivos intermedios).
              </div>
              <Button
                onClick={handleMigrateLegacyAnticipos}
                disabled={loadingStep !== null}
                className="bg-amber-600 hover:bg-amber-700 text-white min-w-[180px] text-xs h-10 gap-2 shrink-0 shadow-md"
              >
                {loadingStep === 10 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loadingStep === 10 ? "Migrando..." : "Migrar Anticipos de Raíz"}
              </Button>
            </div>
          </div>

          {/* DANGER ZONE: Cleanup Tools */}
          <div className="bg-red-50/50 border border-red-100 rounded-2xl p-6 shadow-sm flex flex-col space-y-6 hover:border-red-200 transition-all dark:bg-red-950/10 dark:border-red-900/30 dark:hover:border-red-900/50">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-100 dark:bg-red-950/50 rounded-xl text-red-600 shrink-0">
                <Database className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-lg text-red-700 dark:text-red-400 flex items-center gap-2">
                  Zona de Peligro: Limpieza de Base de Datos
                </h3>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 leading-normal font-medium">
                  Borra selectivamente las cargas de prueba anteriores para preparar tu base de datos para la producción.
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 pt-2 border-t border-red-100 dark:border-red-900/20">
              {/* Option 1: Pedidos */}
              <div className="flex flex-col justify-between space-y-3 p-4 rounded-xl bg-background/50 border border-red-100/50 dark:border-red-950/40">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-500" />
                    Pedidos de Venta
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Elimina todos los pedidos y restablece el folio secuencial <span className="font-mono text-[10px] bg-muted px-1 rounded">PED-00000</span>.
                  </p>
                </div>
                <Button
                  onClick={handleDeleteAllPedidos}
                  disabled={loadingStep !== null}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white w-full text-xs h-9 gap-2 shadow-sm font-semibold"
                >
                  {loadingStep === 99 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  {loadingStep === 99 ? "Eliminando..." : "Borrar Pedidos"}
                </Button>
              </div>

              {/* Option 2: Remisiones */}
              <div className="flex flex-col justify-between space-y-3 p-4 rounded-xl bg-background/50 border border-red-100/50 dark:border-red-950/40">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-emerald-500" />
                    Remisiones
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Elimina todas las remisiones de entrega y restablece el folio secuencial <span className="font-mono text-[10px] bg-muted px-1 rounded">REM-00000</span>.
                  </p>
                </div>
                <Button
                  onClick={handleDeleteAllRemisiones}
                  disabled={loadingStep !== null}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white w-full text-xs h-9 gap-2 shadow-sm font-semibold"
                >
                  {loadingStep === 98 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  {loadingStep === 98 ? "Eliminando..." : "Borrar Remisiones"}
                </Button>
              </div>

              {/* Option 3: Facturas */}
              <div className="flex flex-col justify-between space-y-3 p-4 rounded-xl bg-background/50 border border-red-100/50 dark:border-red-950/40">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-teal-500" />
                    Facturas (CFDI)
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Elimina todas las facturas y restablece el folio secuencial <span className="font-mono text-[10px] bg-muted px-1 rounded">FAC-00000</span>.
                  </p>
                </div>
                <Button
                  onClick={handleDeleteAllFacturas}
                  disabled={loadingStep !== null}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white w-full text-xs h-9 gap-2 shadow-sm font-semibold"
                >
                  {loadingStep === 97 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  {loadingStep === 97 ? "Eliminando..." : "Borrar Facturas"}
                </Button>
              </div>

              {/* Option 4: Cobros/Ingresos */}
              <div className="flex flex-col justify-between space-y-3 p-4 rounded-xl bg-background/50 border border-red-100/50 dark:border-red-950/40">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <ArrowRightLeft className="w-4 h-4 text-teal-500" />
                    Cobros / Ingresos
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Elimina todos los cobros y pagos, y restablece los montos cobrados en remisiones/facturas.
                  </p>
                </div>
                <Button
                  onClick={handleDeleteAllIngresos}
                  disabled={loadingStep !== null}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white w-full text-xs h-9 gap-2 shadow-sm font-semibold"
                >
                  {loadingStep === 96 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  {loadingStep === 96 ? "Eliminando..." : "Borrar Cobros"}
                </Button>
              </div>

              {/* Option 5: Anticipos */}
              <div className="flex flex-col justify-between space-y-3 p-4 rounded-xl bg-background/50 border border-red-100/50 dark:border-red-950/40">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-amber-500" />
                    Anticipos Legacy
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-normal">
                    Elimina todos los anticipos migrados de la subcolección de esta empresa en Firestore.
                  </p>
                </div>
                <Button
                  onClick={handleDeleteAllAnticipos}
                  disabled={loadingStep !== null}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700 text-white w-full text-xs h-9 gap-2 shadow-sm font-semibold"
                >
                  {loadingStep === 95 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  {loadingStep === 95 ? "Eliminando..." : "Borrar Anticipos"}
                </Button>
              </div>
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
              <div className="py-2.5 flex justify-between">
                <span className="text-muted-foreground">Cobros Importados:</span>
                <span className="font-bold text-teal-600">{stats.paymentsImported}</span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-muted-foreground">Anticipos Migrados:</span>
                <span className="font-bold text-amber-600">{stats.anticiposMigrated}</span>
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
