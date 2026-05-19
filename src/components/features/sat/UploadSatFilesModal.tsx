"use client";

import React, { useState, useRef } from "react";
import { doc, writeBatch } from "firebase/firestore";
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
          status: "pending_review",
          createdAt: new Date().toISOString()
        });
      }
    }

    if (invoices.length === 0) {
      throw new Error("No se encontraron facturas válidas en el archivo.");
    }

    setStatus(`Guardando ${invoices.length} facturas en la base de datos...`);

    // Firestore batching (max 500 ops per batch)
    const chunkSize = 400;
    for (let i = 0; i < invoices.length; i += chunkSize) {
      const chunk = invoices.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      
      chunk.forEach(inv => {
        const docRef = doc(db, "companies", companyId, "expenses_inbox", inv.uuid);
        batch.set(docRef, inv, { merge: true });
      });

      await batch.commit();
    }

    setSuccess(`Se cargaron ${invoices.length} facturas correctamente.`);
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
        
        // Find a txt file inside the zip that looks like metadata
        const txtFiles = Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith(".txt"));
        
        let processedCount = 0;
        let foundMetadata = false;

        for (const txtFile of txtFiles) {
           const content = await txtFile.async("string");
           // Simple heuristic: check if it's the metadata file, not the 'tercero' file
           if (content.includes("Uuid~RfcEmisor~NombreEmisor")) {
               foundMetadata = true;
               await processTextContent(content);
               processedCount++;
               break; // Process only the primary metadata file
           }
        }

        if (!foundMetadata) {
            throw new Error("No se encontró ningún archivo de metadatos válido dentro del ZIP.");
        }

      } else if (file.name.toLowerCase().endsWith(".txt")) {
        const content = await file.text();
        await processTextContent(content);
      } else {
        throw new Error("Formato de archivo no soportado. Por favor sube el .zip o el .txt de metadatos.");
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
          <DialogTitle>Carga Manual de Metadatos SAT</DialogTitle>
          <DialogDescription>
            Sube el archivo ZIP o TXT descargado directamente del portal del SAT para registrar tus facturas recibidas masivamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/25 rounded-xl bg-muted/10 mt-4 relative transition-colors hover:bg-muted/20">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".zip,.txt"
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
                <p className="text-xs mt-1">Soporta .ZIP o .TXT</p>
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
              <strong>Nota:</strong> Los archivos de metadatos no contienen los conceptos individuales de las facturas, solo el total y los RFCs. Esto es suficiente para asociar pagos y conciliación.
            </p>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
