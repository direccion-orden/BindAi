"use client";

import React, { useState, useRef } from "react";
import { doc, writeBatch, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import JSZip from "jszip";

interface UploadSatFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

// Helper to parse CFDI XML in browser
const parseXmlInvoice = (xmlText: string): any => {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      console.error("XML parse error inside upload modal");
      return null;
    }

    // 1. UUID
    let uuid = "";
    const timbreNode = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] 
                   || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
    if (timbreNode) {
      uuid = timbreNode.getAttribute("UUID") || "";
    } else {
      const uuidMatch = xmlText.match(/UUID="([^"]{36})"/i);
      if (uuidMatch) uuid = uuidMatch[1];
    }

    if (!uuid || uuid.length !== 36) return null;

    // 2. Comprobante (Total, Fecha)
    const comprobanteNode = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0]
                        || xmlDoc.getElementsByTagName("Comprobante")[0];
    let total = 0;
    let date = "";
    if (comprobanteNode) {
      total = parseFloat(comprobanteNode.getAttribute("Total") || "0") || 0;
      date = comprobanteNode.getAttribute("Fecha") || "";
    } else {
      const totalMatch = xmlText.match(/Total="([^"]+)"/i);
      const fechaMatch = xmlText.match(/Fecha="([^"]+)"/i);
      if (totalMatch) total = parseFloat(totalMatch[1]) || 0;
      if (fechaMatch) date = fechaMatch[1];
    }

    // 3. Emisor (Rfc, Nombre)
    const emisorNode = xmlDoc.getElementsByTagName("cfdi:Emisor")[0]
                   || xmlDoc.getElementsByTagName("Emisor")[0];
    let emisorRfc = "Desconocido";
    let emisorName = "Desconocido";
    if (emisorNode) {
      emisorRfc = emisorNode.getAttribute("Rfc") || "Desconocido";
      emisorName = emisorNode.getAttribute("Nombre") || "Desconocido";
    } else {
      const emisorMatch = xmlText.match(/<cfdi:Emisor[^>]+Rfc="([^"]+)"[^>]+Nombre="([^"]+)"/i);
      if (emisorMatch) {
        emisorRfc = emisorMatch[1];
        emisorName = emisorMatch[2];
      }
    }

    // Safe Base64 encoding for UTF-8 in browser
    const xmlBase64 = btoa(unescape(encodeURIComponent(xmlText)));

    return {
      uuid,
      total,
      date,
      emisorRfc,
      emisorName,
      xmlBase64,
      status: "pending_review",
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    console.error("Error parsing XML in parseXmlInvoice:", err);
    return null;
  }
};

export function UploadSatFilesModal({ isOpen, onClose, companyId }: UploadSatFilesModalProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setStatus("");
    setError("");
    setSuccess("");
    onClose();
  };

  const saveInvoices = async (invoices: any[]) => {
    if (invoices.length === 0) return;

    setStatus(`Guardando ${invoices.length} facturas en la base de datos...`);

    // Fetch existing invoice UUIDs in order to merge without overwriting
    const qSnap = await getDocs(collection(db, "companies", companyId, "expenses_inbox"));
    const existingUuids = new Set(qSnap.docs.map(doc => doc.id));

    // Firestore batching (max 500 ops per batch)
    const chunkSize = 400;
    for (let i = 0; i < invoices.length; i += chunkSize) {
      const chunk = invoices.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      
      chunk.forEach(inv => {
        const docRef = doc(db, "companies", companyId, "expenses_inbox", inv.uuid);
        if (existingUuids.has(inv.uuid)) {
          // If invoice already exists, only update the xmlBase64 if present, avoiding status overwrite
          if (inv.xmlBase64) {
            batch.update(docRef, { xmlBase64: inv.xmlBase64 });
          }
        } else {
          // If invoice is new, set the complete document
          batch.set(docRef, inv);
        }
      });

      await batch.commit();
    }
  };

  const processTextContent = async (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) {
      throw new Error("El archivo no contiene datos válidos o está vacío.");
    }

    const header = lines[0].split("~");
    if (!header.includes("Uuid") || !header.includes("RfcEmisor")) {
      throw new Error("El formato del archivo no coincide con un metadata del SAT.");
    }

    setStatus(`Procesando ${lines.length - 1} facturas...`);
    const invoices = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split("~");
      if (cols.length < 10) continue;

      const uuid = cols[0];
      const emisorRfc = cols[1];
      const emisorName = cols[2];
      const date = cols[6];
      const total = parseFloat(cols[8] || "0");

      if (uuid && uuid.length === 36) {
        invoices.push({
          uuid,
          emisorRfc,
          emisorName,
          date,
          total,
          xmlBase64: "",
          status: "pending_review",
          createdAt: new Date().toISOString()
        });
      }
    }

    if (invoices.length === 0) {
      throw new Error("No se encontraron facturas válidas en el archivo.");
    }

    await saveInvoices(invoices);
    setSuccess(`Se cargaron ${invoices.length} facturas de metadatos correctamente.`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setSuccess("");
    setStatus(`Analizando archivo: ${file.name}...`);

    try {
      if (file.name.toLowerCase().endsWith(".zip")) {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // 1. Check if it's a metadata zip
        const txtFiles = Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith(".txt"));
        let foundMetadata = false;

        for (const txtFile of txtFiles) {
           const content = await txtFile.async("string");
           if (content.includes("Uuid~RfcEmisor~NombreEmisor")) {
               foundMetadata = true;
               await processTextContent(content);
               break;
           }
        }

        // 2. If not a metadata zip, check for xml files inside
        if (!foundMetadata) {
          const xmlFiles = Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith(".xml"));
          if (xmlFiles.length === 0) {
            throw new Error("No se encontraron archivos XML ni metadatos válidos dentro del ZIP.");
          }

          setStatus(`Extrayendo y parseando ${xmlFiles.length} archivos XML...`);
          const parsedInvoices = [];

          for (const xmlFile of xmlFiles) {
            const content = await xmlFile.async("string");
            const parsed = parseXmlInvoice(content);
            if (parsed) {
              parsedInvoices.push(parsed);
            }
          }

          if (parsedInvoices.length === 0) {
            throw new Error("No se pudo parsear ninguna factura XML válida del ZIP.");
          }

          await saveInvoices(parsedInvoices);
          setSuccess(`Se cargaron ${parsedInvoices.length} facturas XML correctamente.`);
        }

      } else if (file.name.toLowerCase().endsWith(".txt")) {
        const content = await file.text();
        await processTextContent(content);
      } else if (file.name.toLowerCase().endsWith(".xml")) {
        const content = await file.text();
        const parsed = parseXmlInvoice(content);
        if (!parsed) {
          throw new Error("El archivo XML no tiene un formato CFDI válido o carece de UUID.");
        }

        await saveInvoices([parsed]);
        setSuccess(`Se cargó la factura XML ${parsed.uuid.slice(0, 8)}... correctamente.`);
      } else {
        throw new Error("Formato de archivo no soportado. Sube un .ZIP (con XMLs o metadatos), un XML individual o un TXT de metadatos.");
      }
    } catch (err: any) {
      console.error("Error processing file:", err);
      setError(err.message || "Error desconocido al procesar el archivo.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // reset input
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Carga Manual de Facturas y Metadatos SAT</DialogTitle>
          <DialogDescription>
            Sube el archivo ZIP de XMLs, archivo XML individual o archivo TXT de metadatos descargado del portal del SAT.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/25 rounded-xl bg-muted/10 mt-4 relative transition-colors hover:bg-muted/20">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".zip,.txt,.xml"
            disabled={loading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          
          {loading ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <span className="text-sm font-medium">{status}</span>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3 text-emerald-600">
              <CheckCircle2 className="w-12 h-12" />
              <span className="text-sm font-medium text-center">{success}</span>
              <Button onClick={handleClose} className="mt-2" variant="outline">Cerrar y Ver Facturas</Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-muted-foreground pointer-events-none">
              <div className="p-4 bg-background rounded-full shadow-sm border">
                <UploadCloud className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Haz clic o arrastra tu archivo aquí</p>
                <p className="text-xs mt-1">Soporta .ZIP, .XML o .TXT</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 text-rose-600 rounded-md border border-rose-200 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {!loading && !success && !error && (
          <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded-md border border-blue-200 text-xs flex items-start gap-2">
            <FileText className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              <strong>Nota:</strong> Si subes archivos XML (individuales o en un ZIP), el sistema extraerá automáticamente el detalle de las partidas. Si subes metadatos (TXT/ZIP de metadatos), solo se cargará el total y los datos generales.
            </p>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
