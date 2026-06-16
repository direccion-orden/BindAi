"use client";

import React, { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, Download, FileText, CheckCircle2, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PurchaseOrder } from "../page";
import { ExpensePaymentModal } from "@/components/payments/ExpensePaymentModal";

export default function DetalleOrdenCompraPage() {
  const { companyId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  useEffect(() => {
    if (!companyId || !orderId) return;

    const unsub = onSnapshot(doc(db, "companies", companyId, "purchase_orders", orderId), (snap) => {
      if (snap.exists()) {
        setOrder({ id: snap.id, ...snap.data() } as PurchaseOrder);
      } else {
        alert("Orden no encontrada");
        router.push("/compras/ordenes");
      }
      setLoading(false);
    });

    return () => unsub();
  }, [companyId, orderId]);

  // Convert SVG logo to PNG data URL for jsPDF
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
    if (!order) return;
    setGeneratingPdf(true);

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

      // Palette: warm taupe-greys matching CSS variables
      const TAUPE_DARK = [56, 52, 50];
      const TAUPE_MID = [120, 113, 108];
      const TAUPE_LIGHT = [210, 206, 201];
      const TAUPE_BG = [243, 241, 238];
      const ACCENT = [122, 107, 140];

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      let y = 14;

      // --- Logo + Header ---
      const logoH = 10;
      const logoW = logoH * (293.75 / 67.31);
      try {
        const logoDataUrl = await loadLogoAsDataUrl();
        doc.addImage(logoDataUrl, 'PNG', margin, y, logoW, logoH);
      } catch {
        // Fallback
      }

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.text("ORDEN DE COMPRA", pageWidth - margin, y + 7, { align: "right" });
      y += logoH + 3;

      // Divider line
      doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      // --- Order Info ---
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Proveedor:", margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(order.vendorName, margin + 22, y);

      doc.setFont("helvetica", "bold");
      doc.text("Folio:", pageWidth - 70, y);
      doc.setFont("helvetica", "normal");
      doc.text(order.orderNumber, pageWidth - margin, y, { align: "right" });
      
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.text("Fecha:", pageWidth - 70, y);
      doc.setFont("helvetica", "normal");
      doc.text(new Date(order.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }), pageWidth - margin, y, { align: "right" });
      
      if (order.expectedDate) {
        y += 6;
        doc.setFont("helvetica", "bold");
        doc.text("Entrega Esperada:", pageWidth - 70, y);
        doc.setFont("helvetica", "normal");
        doc.text(new Date(order.expectedDate).toLocaleDateString("es-MX"), pageWidth - margin, y, { align: "right" });
      }

      y += 12;

      // --- Items Table Header ---
      doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
      doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      
      doc.text("PRODUCTO", margin + 2, y + 5);
      doc.text("CANTIDAD", pageWidth - 70, y + 5, { align: "right" });
      doc.text("COSTO U.", pageWidth - 40, y + 5, { align: "right" });
      doc.text("SUBTOTAL", pageWidth - margin - 2, y + 5, { align: "right" });
      
      y += 12;

      // --- Items List ---
      doc.setFont("helvetica", "normal");
      
      for (const item of order.items) {
        if (y > 250) {
          doc.addPage();
          y = 20;
        }
        
        doc.text(item.productName, margin + 2, y, { maxWidth: 100 });
        doc.text(item.quantity.toString(), pageWidth - 70, y, { align: "right" });
        doc.text(`$${item.unitCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, pageWidth - 40, y, { align: "right" });
        doc.text(`$${(item.quantity * item.unitCost).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, pageWidth - margin - 2, y, { align: "right" });
        
        y += 8;
        
        // subtle line
        doc.setDrawColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
        doc.setLineWidth(0.2);
        doc.line(margin, y - 4, pageWidth - margin, y - 4);
      }

      y += 6;

      // --- Totals ---
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL:", pageWidth - 40, y, { align: "right" });
      doc.text(`$${order.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, pageWidth - margin - 2, y, { align: "right" });

      // --- Notes ---
      if (order.notes) {
        y += 20;
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("NOTAS:", margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(order.notes, margin, y + 5, { maxWidth: pageWidth - margin * 2 });
      }

      // Output PDF
      const pdfBlobUrl = doc.output("bloburl");
      const a = document.createElement("a");
      a.href = pdfBlobUrl.toString();
      a.download = `OrdenCompra_${order.orderNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

    } catch (e) {
      console.error(e);
      alert("Hubo un error al generar el PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!order) return null;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/compras/ordenes">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Orden {order.orderNumber}</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {order.status === "SENT" ? <FileText className="w-3.5 h-3.5"/> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {order.status}
            </span>
          </div>
          <p className="text-muted-foreground">Requisición para {order.vendorName}</p>
        </div>
        
        {(!order.paidAmount || order.paidAmount < order.totalAmount - 0.01) && (
          <Button onClick={() => setIsPaymentModalOpen(true)} className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
            <DollarSign className="w-4 h-4" /> Registrar Pago
          </Button>
        )}

        <Button onClick={handleDownloadPDF} disabled={generatingPdf} className="gap-2 bg-[hsl(38,6%,22%)] text-white hover:bg-[hsl(38,6%,30%)]">
          {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Descargar PDF
        </Button>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden p-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Proveedor</p>
            <p className="font-semibold">{order.vendorName}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Fecha de Creación</p>
            <p className="font-semibold">{new Date(order.createdAt).toLocaleDateString('es-MX')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Entrega Esperada</p>
            <p className="font-semibold">{order.expectedDate ? new Date(order.expectedDate).toLocaleDateString('es-MX') : "No especificada"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Sucursal</p>
            <p className="font-semibold">{order.locationName || "No especificada"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Importe Total</p>
            <p className="font-bold text-lg text-indigo-700">${order.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {order.notes && (
          <div className="mb-8 p-4 bg-muted/30 rounded-lg">
            <p className="text-sm font-semibold mb-1">Notas / Instrucciones</p>
            <p className="text-sm text-muted-foreground">{order.notes}</p>
          </div>
        )}

        <h3 className="font-semibold text-lg mb-4">Artículos Solicitados</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Cant. Requerida</th>
                <th className="px-4 py-3 text-right">Costo Estimado</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{item.productName}</td>
                  <td className="px-4 py-3 text-right font-bold">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">${item.unitCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right font-medium text-indigo-700">${(item.quantity * item.unitCost).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex justify-end">
          <div className="w-full max-w-sm bg-slate-50 p-6 rounded-xl border">
            <div className="space-y-2">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal Estimado</span>
                <span>${order.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              <div className="flex justify-between font-black text-xl pt-2 border-t mt-2 text-slate-900">
                <span>Total Requisición</span>
                <span className="text-indigo-700">${order.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              {(order.paidAmount || 0) > 0 && (
                <>
                  <div className="flex justify-between text-rose-600 font-medium pt-2">
                    <span>Pagado (Egreso)</span>
                    <span>${(order.paidAmount || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                  </div>
                  <div className="flex justify-between text-orange-600 font-bold border-t mt-2 pt-2">
                    <span>Saldo Pendiente</span>
                    <span>${Math.max(0, order.totalAmount - (order.paidAmount || 0)).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ExpensePaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        document={order}
        documentType="orden_compra"
        companyId={companyId || ""}
      />
    </div>
  );
}
