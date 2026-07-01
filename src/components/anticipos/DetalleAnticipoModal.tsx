"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, X, Trash2, Save } from "lucide-react";
import { doc, updateDoc, deleteDoc, collection, query as firestoreQuery, orderBy, onSnapshot, increment, addDoc } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { CheckCircle2, AlertCircle, Landmark } from "lucide-react";

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

  // Reconciliation states
  const [unreconciledTransactions, setUnreconciledTransactions] = useState<any[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>("manual");
  const [isReconciling, setIsReconciling] = useState(false);

  useEffect(() => {
    if (anticipo) {
      setReference(anticipo.reference || "");
      setReceivedAt(anticipo.receivedAt || (anticipo.createdAt?.toDate ? anticipo.createdAt.toDate().toISOString().split("T")[0] : ""));
      setEditingAppIndex(null);
      setIsReconciling(false);
      setSelectedTransactionId("manual");
    }
  }, [anticipo]);

  // Fetch unreconciled transactions if not reconciled
  useEffect(() => {
    if (!isOpen || !companyId || !anticipo || anticipo.bankTransactionId || !anticipo.bankAccountId) {
      setUnreconciledTransactions([]);
      return;
    }

    const q = firestoreQuery(
      collection(db, "companies", companyId, "bankAccounts", anticipo.bankAccountId, "transactions"),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const txs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const filtered = txs.filter(t => t.amount > 0 && !t.reconciled);
      setUnreconciledTransactions(filtered);
    }, (error) => {
      console.error("Error loading transactions:", error);
    });

    return () => unsubscribe();
  }, [isOpen, companyId, anticipo]);

  const handleSave = async () => {
    if (!anticipo || !companyId) return;
    setIsSaving(true);
    try {
      const updates: any = {
        reference,
        receivedAt,
        updatedAt: new Date()
      };

      // Handle reconciliation if requested
      if (isReconciling && !anticipo.bankTransactionId) {
        const folio = anticipo.folio 
          ? `ANT-${String(anticipo.folio).padStart(4, '0')}` 
          : `ANT-${anticipo.id.substring(0, 5).toUpperCase()}`;

        if (selectedTransactionId !== "manual") {
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", anticipo.bankAccountId, "transactions", selectedTransactionId), {
            reconciled: true,
            matchedAt: new Date().toISOString(),
            reconcileType: "match",
            matchedDocumentId: folio
          });
          updates.bankTransactionId = selectedTransactionId;
        } else if (String(anticipo.paymentTermId) === "1") { // 1 = Efectivo
          // Manual reconciliation ONLY for Efectivo
          const txData = {
            amount: parseFloat(anticipo.amount),
            date: receivedAt,
            concept: `Anticipo de Cliente (Efectivo): ${anticipo.clientName} - Ref: ${reference || "Sin Ref"}`,
            reference: reference || "",
            reconciled: true,
            matchedAt: new Date().toISOString(),
            reconcileType: "direct",
            matchedDocumentId: folio,
            createdAt: new Date().toISOString(),
          };
          const txRef = await addDoc(collection(db, "companies", companyId, "bankAccounts", anticipo.bankAccountId, "transactions"), txData);
          updates.bankTransactionId = txRef.id;

          // Update bank balance
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", anticipo.bankAccountId), {
            balance: increment(parseFloat(anticipo.amount))
          });
        }
      }

      const ref = doc(db, "companies", companyId, "anticipos", anticipo.id);
      await updateDoc(ref, updates);
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
      alert(`La aplicación no puede exceder el fondo disponible máximo ($${maxAvailable.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`);
      return;
    }

    if (appToEdit.erpDocumentType !== "Order") {
      if (!confirm(`IMPORTANTE: Modificaremos el saldo localmente de $${appToEdit.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} a $${newAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Deberás cuadrar y ajustar este nuevo monto manualmente en Bind ERP tú mismo. ¿Deseas continuar?`)) {
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Administrar Anticipo</DialogTitle>
          <DialogDescription>
            {anticipo.clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Folio</label>
              <Input className="h-9 bg-slate-50 font-mono text-xs" disabled value={`ANT-${anticipo.folio ? String(anticipo.folio).padStart(4, '0') : anticipo.id.substring(0, 5).toUpperCase()}`} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Monto Original / Saldo</label>
              <Input className="h-9 bg-slate-50 font-bold text-xs" disabled value={`$${(anticipo.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $${(anticipo.balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fecha de Recepción</label>
              <Input 
                className="h-9"
                type="date" 
                value={receivedAt} 
                onChange={e => setReceivedAt(e.target.value)} 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Referencia</label>
              <Input 
                className="h-9"
                value={reference} 
                onChange={e => setReference(e.target.value)} 
                placeholder="Referencia de pago" 
              />
            </div>
          </div>

          {/* Estado de Conciliación */}
          <div className="pt-4 border-t border-slate-100">
            {anticipo.bankTransactionId ? (
              <div className="bg-green-50 border border-green-100 p-3 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-green-500 p-1.5 rounded-full">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Conciliado con Banco</p>
                    <p className="text-xs text-green-600 font-medium">{anticipo.bankAccountName || 'Cuenta Bancaria'}</p>
                  </div>
                </div>
                <Landmark className="w-5 h-5 text-green-200" />
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-500 p-1.5 rounded-full">
                      <AlertCircle className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Pendiente de Conciliar</p>
                      <p className="text-xs text-amber-600 font-medium">No se ha vinculado con un ingreso bancario</p>
                    </div>
                  </div>
                  <Button 
                    variant="link" 
                    className="text-indigo-600 font-bold text-[10px] p-0 h-auto uppercase tracking-wider"
                    onClick={() => setIsReconciling(!isReconciling)}
                  >
                    {isReconciling ? 'Cancelar' : 'Conciliar Ahora'}
                  </Button>
                </div>

                {isReconciling && (
                  <div className="space-y-3 pt-2 border-t border-amber-200/50">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Seleccionar Movimiento Sugerido</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-amber-200 bg-white px-3 py-1 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                        value={selectedTransactionId}
                        onChange={(e) => setSelectedTransactionId(e.target.value)}
                      >
                        <option value="manual">-- Crear registro manual --</option>
                        {unreconciledTransactions.map((tx) => (
                          <option key={tx.id} value={tx.id}>
                            {new Date(tx.date).toLocaleDateString()} - ${tx.amount.toLocaleString('es-MX')} - {tx.concept || tx.reference || 'Sin concepto'}
                          </option>
                        ))}
                      </select>
                      {selectedTransactionId === "manual" ? (
                        <p className="text-[10px] text-amber-600 italic">
                          {String(anticipo.paymentTermId) === "1"
                            ? `Se creará un nuevo ingreso en la cuenta de Efectivo y se autoconciliará.`
                            : "No se recomienda registro manual para bancos (evita duplicados). El anticipo quedará pendiente."
                          }
                        </p>
                      ) : (
                        <p className="text-[10px] text-green-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Se vinculará con el movimiento seleccionado.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {anticipo.applications && anticipo.applications.length > 0 && (
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-tight">Historial de Aplicaciones</h4>
              </div>
              <div className="space-y-2.5">
                {anticipo.applications.map((app: any, idx: number) => (
                  <div key={idx} className="bg-slate-50/50 p-3 rounded-lg text-sm border border-slate-100 shadow-sm hover:border-slate-200 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-bold text-slate-800 block">{app.erpDocumentNumber}</span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          Aplicado el: {app.appliedAt ? new Date(app.appliedAt + "T12:00:00").toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                      <span className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 tracking-wide">{app.erpDocumentType}</span>
                    </div>
                    
                    {editingAppIndex === idx ? (
                      <div className="flex items-center gap-2 mt-2 bg-white p-2 rounded border border-indigo-200 shadow-inner">
                        <span className="text-xs font-bold text-slate-400">$</span>
                        <Input 
                          type="number" 
                          step="0.01" 
                          className="h-8 flex-1 border-none focus-visible:ring-0 font-bold" 
                          value={editingAppAmount} 
                          onChange={e => setEditingAppAmount(e.target.value)} 
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingAppIndex(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" className="h-7 px-3 bg-indigo-600 hover:bg-indigo-700" onClick={() => handleEditAppSave(idx)} disabled={isUpdatingStatus}>
                          OK
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100/50">
                        <span className="font-black text-lg text-slate-900">${app.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold px-3 border-slate-200 hover:bg-white hover:text-indigo-600" onClick={() => {
                            setEditingAppIndex(idx);
                            setEditingAppAmount(app.amount.toString());
                          }} disabled={isUpdatingStatus}>
                            EDITAR
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[10px] font-bold px-3 text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => handleCancelApplication(idx)} disabled={isUpdatingStatus}>
                            CANCELAR
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

        <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t pt-4 mt-2 sm:gap-2">
          <div className="flex-1 w-full sm:w-auto flex justify-start">
            {canDelete && (
                <Button 
                  variant="ghost" 
                  className="w-full sm:w-auto text-rose-500 hover:text-rose-600 hover:bg-rose-50 font-bold text-xs gap-2" 
                  onClick={handleDeleteAnticipo} 
                  disabled={isUpdatingStatus || isSaving}
                >
                  {isUpdatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  ELIMINAR ANTICIPO
                </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            <Button 
              variant="outline"
              type="button"
              className="h-10 px-4 font-bold text-xs gap-2 border-slate-200 flex-1 sm:flex-none" 
              onClick={handleDownloadPDF}
              disabled={isSaving || isUpdatingStatus}
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              PDF
            </Button>
            <Button 
              variant="ghost" 
              className="h-10 px-4 font-bold text-xs flex-1 sm:flex-none" 
              onClick={() => onOpenChange(false)} 
              disabled={isSaving || isUpdatingStatus}
            >
              CERRAR
            </Button>
            <Button 
              className="h-10 px-6 font-black text-xs bg-indigo-600 hover:bg-indigo-700 shadow-md flex-1 sm:flex-none gap-2" 
              onClick={handleSave} 
              disabled={isSaving || isUpdatingStatus}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="w-4 h-4" />}
              GUARDAR
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
