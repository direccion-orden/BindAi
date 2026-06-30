"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileText } from "lucide-react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

interface DetalleAnticipoModalProps {
  anticipo: any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DetalleAnticipoModal({ anticipo, isOpen, onOpenChange }: DetalleAnticipoModalProps) {
  const { companyId } = useAuth();
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [editingAppIndex, setEditingAppIndex] = useState<number | null>(null);
  const [editingAppAmount, setEditingAppAmount] = useState<string>("");

  useEffect(() => {
    if (anticipo) {
      setReference(anticipo.reference || "");
      setReceivedAt(anticipo.receivedAt || (anticipo.createdAt?.toDate ? anticipo.createdAt.toDate().toISOString().split("T")[0] : ""));
      setEditingAppIndex(null);
    }
  }, [anticipo]);

  const handleSave = async () => {
    if (!anticipo || !companyId) return;
    setIsSaving(true);
    try {
      const ref = doc(db, "companies", companyId, "anticipos", anticipo.id);
      await updateDoc(ref, {
        reference,
        receivedAt,
        updatedAt: new Date()
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating", error);
      alert("Hubo un error al guardar la información.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAnticipo = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar permanentemente este anticipo? Esta acción no se puede deshacer.")) return;
    if (!companyId) return;
    
    setIsUpdatingStatus(true);
    try {
      if (anticipo.imageUrl) {
        try {
          const imgRef = storageRef(storage, anticipo.imageUrl);
          await deleteObject(imgRef);
        } catch (storageErr) {
          console.error("Error al borrar de Storage (puede que no exista el archivo)", storageErr);
        }
      }
      await deleteDoc(doc(db, "companies", companyId, "anticipos", anticipo.id));
      onOpenChange(false);
    } catch (err) {
      console.error("Error eliminando anticipo", err);
      alert("Hubo un error al eliminar el anticipo.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelApplication = async (appIndex: number) => {
    const appToCancel = anticipo.applications[appIndex];
    if (appToCancel.erpDocumentType !== "Order") {
      if (!confirm("IMPORTANTE: Al cancelar esta aplicación revertiremos el saldo localmente para que puedas reasignarlo, pero deberás cancelarlo manualmente en Bind ERP ya que no hay integración de reversión automática. ¿Deseas continuar?")) {
        return;
      }
    } else {
      if (!confirm("¿Deseas cancelar esta aplicación a Pedido ciego?")) return;
    }
    if (!companyId) return;

    setIsUpdatingStatus(true);
    try {
      const newApps = [...anticipo.applications];
      newApps.splice(appIndex, 1);
      
      const revertedBalance = anticipo.balance + appToCancel.amount;
      const newStatus = revertedBalance === anticipo.amount ? "pending" : "partially_applied";

      await updateDoc(doc(db, "companies", companyId, "anticipos", anticipo.id), {
        applications: newApps,
        balance: revertedBalance,
        status: newStatus,
        updatedAt: new Date()
      });
    } catch(err) {
      console.error(err);
      alert("Ocurrió un error al cancelar la aplicación");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleEditAppSave = async (appIndex: number) => {
    const appToEdit = anticipo.applications[appIndex];
    const newAmount = parseFloat(editingAppAmount);

    if (isNaN(newAmount) || newAmount <= 0) {
      alert("Monto inválido"); return;
    }

    const maxAvailable = anticipo.balance + appToEdit.amount;
    if (newAmount > maxAvailable) {
      alert(`La aplicación no puede exceder el fondo disponible máximo ($${maxAvailable.toFixed(2)}).`);
      return;
    }

    if (appToEdit.erpDocumentType !== "Order") {
      if (!confirm(`IMPORTANTE: Modificaremos el saldo localmente de $${appToEdit.amount.toFixed(2)} a $${newAmount.toFixed(2)}. Deberás cuadrar y ajustar este nuevo monto manualmente en Bind ERP tú mismo. ¿Deseas continuar?`)) {
        return;
      }
    }
    if (!companyId) return;

    setIsUpdatingStatus(true);
    try {
      const delta = newAmount - appToEdit.amount;
      const newBalance = anticipo.balance - delta;
      
      const newApps = [...anticipo.applications];
      newApps[appIndex].amount = newAmount;

      const newStatus = newBalance <= 0 ? "applied" : "partially_applied";

      await updateDoc(doc(db, "companies", companyId, "anticipos", anticipo.id), {
        applications: newApps,
        balance: newBalance,
        status: newStatus,
        updatedAt: new Date()
      });

      setEditingAppIndex(null);
    } catch(err) {
      console.error(err);
      alert("Error al actualizar la aplicación");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const loadLogoAsDataUrl = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const svgW = 588;
      const svgH = 135;
      img.width = svgW;
      img.height = svgH;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 3;
        canvas.width = svgW * scale;
        canvas.height = svgH * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, svgW, svgH);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = '/logo.svg';
    });
  };

  const handleDownloadPDF = async () => {
    if (!anticipo) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

      const TAUPE_DARK = [56, 52, 50];      // HSL(38, 6%, 22%)
      const TAUPE_MID = [120, 113, 108];     // HSL(38, 6%, 45%)
      const TAUPE_LIGHT = [210, 206, 201];   // HSL(38, 8%, 85%)
      const TAUPE_BG = [243, 241, 238];      // HSL(38, 13%, 94%)
      const ACCENT = [122, 107, 140];        // HSL(266, 12%, 52%)

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let y = 20;

      // --- 1. Logo + Header ---
      const logoH = 11.5;
      const logoW = logoH * (293.75 / 67.31); // aspect ratio from logo SVG
      try {
        const logoDataUrl = await loadLogoAsDataUrl();
        doc.addImage(logoDataUrl, 'PNG', margin, y, logoW, logoH);
      } catch (err) {
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.text("BIND AI", margin, y + 8);
      }

      // Title on the right
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.text("RECIBO DE ANTICIPO", pageWidth - margin, y + 5, { align: "right" });
      
      const folio = anticipo.folio 
        ? `ANT-${String(anticipo.folio).padStart(4, '0')}` 
        : `ANT-${anticipo.id.substring(0, 5).toUpperCase()}`;
      
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.text(folio, pageWidth - margin, y + 10, { align: "right" });

      y += logoH + 5;

      // Thin divider
      doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // --- 2. Info Box (Client & General Info) ---
      doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 28, 2, 2, "F");

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      
      // Fecha
      const receivedDateStr = anticipo.receivedAt 
        ? new Date(anticipo.receivedAt + "T12:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })
        : (anticipo.createdAt?.toDate ? anticipo.createdAt.toDate().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : '—');
      
      doc.text("FECHA:", margin + 5, y + 6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.text(receivedDateStr, margin + 25, y + 6);

      // Cliente
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      doc.text("RECIBIDO DE:", margin + 5, y + 13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.text(anticipo.clientName || '—', margin + 25, y + 13);

      // Concepto
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      doc.text("CONCEPTO:", margin + 5, y + 20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      const referenceStr = anticipo.reference || 'Anticipo de fondos para futuras compras';
      doc.text(referenceStr, margin + 25, y + 20, { maxWidth: pageWidth - margin * 2 - 32 });

      y += 36;

      // --- 3. Table desglosada ---
      // Header
      doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.roundedRect(margin, y, pageWidth - margin * 2, 8, 1, 1, "F");

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("DESCRIPCIÓN", margin + 4, y + 5.5);
      doc.text("FORMA DE PAGO", margin + 70, y + 5.5);
      doc.text("CUENTA DESTINO", margin + 115, y + 5.5);
      doc.text("MONTO ORIGINAL", pageWidth - margin - 4, y + 5.5, { align: "right" });

      y += 8;

      // Row background
      doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
      doc.rect(margin, y, pageWidth - margin * 2, 9, "F");

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.text("Anticipo de Cliente", margin + 4, y + 6);
      doc.text(anticipo.paymentTermName || 'N/A', margin + 70, y + 6);
      doc.text(anticipo.bankAccountName || 'N/A', margin + 115, y + 6);
      
      const amountStr = (parseFloat(anticipo.amount) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
      doc.setFont("helvetica", "bold");
      doc.text(amountStr, pageWidth - margin - 4, y + 6, { align: "right" });

      y += 9;

      // Thin border line below row
      doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);

      y += 10;

      // --- 4. Summary box ---
      const totalBoxW = 75;
      const totalBoxH = 22;
      const totalBoxX = pageWidth - margin - totalBoxW;
      
      doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
      doc.roundedRect(totalBoxX, y, totalBoxW, totalBoxH, 1.5, 1.5, "F");

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      doc.text("Monto Total Recibido:", totalBoxX + 4, y + 6.5);
      
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.text(amountStr, pageWidth - margin - 4, y + 6.5, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      doc.text("Saldo Disponible:", totalBoxX + 4, y + 15);

      const balanceStr = (parseFloat(anticipo.balance) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
      doc.setFont("helvetica", "bold");
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.setFontSize(10.5);
      doc.text(balanceStr, pageWidth - margin - 4, y + 15, { align: "right" });

      y += totalBoxH + 30;

      // --- 5. Signatures ---
      const sigLineW = 50;
      const sigY = y + 15;
      
      // Cajero signature line
      const sigCajeroX = margin + 15;
      doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
      doc.setLineWidth(0.4);
      doc.line(sigCajeroX, sigY, sigCajeroX + sigLineW, sigY);
      
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      doc.text("Recibido por (Cajero)", sigCajeroX + sigLineW / 2, sigY + 5, { align: "center" });

      // Cliente signature line
      const sigClienteX = pageWidth - margin - 15 - sigLineW;
      doc.line(sigClienteX, sigY, sigClienteX + sigLineW, sigY);
      doc.text("Firma de Conformidad (Cliente)", sigClienteX + sigLineW / 2, sigY + 5, { align: "center" });

      // --- 6. Footer ---
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      const footerMsg = "Este documento es un comprobante de anticipo de fondos de control interno y no constituye un comprobante fiscal digital (CFDI) en este momento.";
      doc.text(footerMsg, pageWidth / 2, 262, { align: "center" });

      doc.save(`Recibo-Anticipo-${folio}.pdf`);
    } catch (err: any) {
      console.error("Error generating PDF", err);
      alert("Hubo un error al generar el PDF del recibo.");
    }
  };

  if (!anticipo) return null;

  const canDelete = !anticipo.applications || anticipo.applications.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Administrar Anticipo</DialogTitle>
          <DialogDescription>
            {anticipo.clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[65vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Folio</label>
              <Input className="h-8" disabled value={`ANT-${anticipo.folio ? String(anticipo.folio).padStart(4, '0') : anticipo.id.substring(0, 5).toUpperCase()}`} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Monto Original / Saldo</label>
              <Input className="h-8" disabled value={`$${anticipo.amount?.toFixed(2)} / $${anticipo.balance?.toFixed(2)}`} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Fecha de Recepción</label>
            <Input 
              className="h-8"
              type="date" 
              value={receivedAt} 
              onChange={e => setReceivedAt(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Referencia</label>
            <Input 
              className="h-8"
              value={reference} 
              onChange={e => setReference(e.target.value)} 
              placeholder="Referencia" 
            />
          </div>

          {anticipo.applications && anticipo.applications.length > 0 && (
            <div className="pt-4 border-t space-y-3">
              <h4 className="text-sm font-semibold">Historial de Aplicaciones</h4>
              <div className="space-y-2">
                {anticipo.applications.map((app: any, idx: number) => (
                  <div key={idx} className="bg-muted p-3 rounded-md text-sm border shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-primary">{app.erpDocumentNumber}</span>
                      <span className="text-[10px] text-muted-foreground uppercase bg-secondary px-2 py-0.5 rounded-full">{app.erpDocumentType}</span>
                    </div>
                    
                    {editingAppIndex === idx ? (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-semibold">$</span>
                        <Input 
                          type="number" 
                          step="0.01" 
                          className="h-8 flex-1" 
                          value={editingAppAmount} 
                          onChange={e => setEditingAppAmount(e.target.value)} 
                        />
                        <Button size="sm" variant="ghost" onClick={() => setEditingAppIndex(null)}>X</Button>
                        <Button size="sm" onClick={() => handleEditAppSave(idx)} disabled={isUpdatingStatus}>OK</Button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center mt-2">
                        <span className="font-semibold text-lg">${app.amount.toFixed(2)}</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => {
                            setEditingAppIndex(idx);
                            setEditingAppAmount(app.amount.toString());
                          }} disabled={isUpdatingStatus}>
                            Editar
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={() => handleCancelApplication(idx)} disabled={isUpdatingStatus}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row justify-between w-full items-center gap-4 border-t pt-4">
          <div className="w-full sm:w-auto">
            {canDelete && (
                <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDeleteAnticipo} disabled={isUpdatingStatus || isSaving}>
                  {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Eliminar Anticipo
                </Button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto font-medium">
            <Button 
              variant="outline"
              type="button"
              className="flex-1 sm:flex-none gap-1.5" 
              onClick={handleDownloadPDF}
              disabled={isSaving || isUpdatingStatus}
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              Descargar PDF
            </Button>
            <Button variant="ghost" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={isSaving || isUpdatingStatus}>
              Cerrar
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={handleSave} disabled={isSaving || isUpdatingStatus}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
