"use client";

import React, { useState, useEffect } from "react";
import { doc, onSnapshot, getDoc, updateDoc, getDocs, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, Download, FileText, CheckCircle2, Clock, DollarSign, Truck, Building2, ChevronDown, Edit2, Trash2, Save, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [shippingAddress, setShippingAddress] = useState<string>("");
  const [isEditingShipping, setIsEditingShipping] = useState<boolean>(false);

  // Editing and Dropdown States
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><Clock className="w-3.5 h-3.5"/> Borrador</span>;
      case "SENT":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><FileText className="w-3.5 h-3.5"/> Enviada</span>;
      case "PARTIAL":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800"><Truck className="w-3.5 h-3.5"/> Surtida Parcial</span>;
      case "COMPLETED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-3.5 h-3.5"/> Surtida</span>;
      case "CANCELLED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"><CheckCircle2 className="w-3.5 h-3.5"/> Cancelada</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  useEffect(() => {
    if (!companyId || !orderId) return;

    const unsub = onSnapshot(doc(db, "companies", companyId, "purchase_orders", orderId), (snap) => {
      if (snap.exists()) {
        const orderData = { id: snap.id, ...snap.data() } as PurchaseOrder;
        setOrder(orderData);
        
        // If there's an explicit shippingAddress, use it. Otherwise default to location's address
        if (orderData.shippingAddress) {
          setShippingAddress(orderData.shippingAddress);
        } else if (orderData.locationId) {
          getDoc(doc(db, "companies", companyId, "locations", orderData.locationId)).then((locSnap) => {
            if (locSnap.exists()) {
              const loc = locSnap.data();
              setShippingAddress(loc.address || loc.Address || "");
            }
          });
        }
      } else {
        alert("Orden no encontrada");
        router.push("/compras/ordenes");
      }
      setLoading(false);
    });

    // Fetch company profile for fiscal data
    getDoc(doc(db, "companies", companyId)).then((snap) => {
      if (snap.exists()) {
        setCompanyProfile(snap.data());
      }
    });

    return () => unsub();
  }, [companyId, orderId]);

  // Load catalogs on demand when editing is activated
  useEffect(() => {
    if (isEditing && products.length === 0 && companyId) {
      getDocs(collection(db, "companies", companyId, "products")).then(snap => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      getDocs(collection(db, "companies", companyId, "locations")).then(snap => {
        setLocations(snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, name: data.name || data.Name || "Sucursal sin nombre" };
        }));
      });
      getDocs(collection(db, "companies", companyId, "accounts")).then(snap => {
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }
  }, [isEditing, companyId, products.length]);

  const handleSaveShippingAddress = async () => {
    if (!companyId || !orderId) return;
    try {
      await updateDoc(doc(db, "companies", companyId, "purchase_orders", orderId), {
        shippingAddress: shippingAddress
      });
      setIsEditingShipping(false);
      alert("Dirección de envío actualizada.");
    } catch (e) {
      console.error(e);
      alert("Error al actualizar la dirección de envío.");
    }
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setEditData((prev: any) => ({
      ...prev,
      items: prev.items.map((item: any, i: number) => {
        return i === idx ? { ...item, [field]: value } : item;
      })
    }));
  };

  const removeItem = (idx: number) => {
    setEditData((prev: any) => ({
      ...prev,
      items: prev.items.filter((item: any, i: number) => i !== idx)
    }));
  };

  const getFilteredProducts = () => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p => 
      p.title?.toLowerCase().includes(term) || 
      p.variants?.some((v: any) => v.sku?.toLowerCase().includes(term) || v.barcode?.includes(term))
    );
  };

  const handleAddProduct = (product: any, variant: any) => {
    const exists = editData.items?.find((i: any) => i.variantId === variant.id);
    if (!exists) {
      setEditData((prev: any) => ({
        ...prev,
        items: [...(prev.items || []), {
          productId: product.id,
          variantId: variant.id,
          productName: product.title + (variant.title !== "Default Title" ? ` - ${variant.title}` : ''),
          quantity: 1,
          unitCost: variant.price || 0,
          isService: !!product.isService || variant.sku?.startsWith("SER-"),
          lineKey: crypto.randomUUID()
        }]
      }));
    } else {
      setEditData((prev: any) => ({
        ...prev,
        items: prev.items.map((item: any) => item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item)
      }));
    }
    setProductSearch("");
  };

  const handleSave = async () => {
    if (!companyId || !orderId) return;
    if (!editData.items || editData.items.length === 0) {
      alert("Debes agregar al menos un artículo a la orden.");
      return;
    }
    if (!editData.locationId || !editData.accountId) {
      alert("Debes seleccionar una sucursal y una cuenta de gasto.");
      return;
    }

    setLoading(true);
    try {
      const newTotal = editData.items.reduce((sum: number, item: any) => sum + (item.quantity * (Number(item.unitCost) || 0)), 0);
      const selectedLoc = locations.find(l => l.id === editData.locationId);
      const selectedAcc = accounts.find(a => a.id === editData.accountId);

      const updatedFields = {
        locationId: editData.locationId,
        locationName: selectedLoc ? selectedLoc.name : editData.locationName || "",
        accountId: editData.accountId,
        accountCode: selectedAcc ? selectedAcc.code : editData.accountCode || "",
        accountName: selectedAcc ? selectedAcc.name : editData.accountName || "",
        expectedDate: editData.expectedDate || null,
        notes: editData.notes || "",
        items: editData.items.map((i: any) => ({
          productId: i.productId || "",
          variantId: i.variantId || "",
          productName: i.productName || "",
          quantity: Number(i.quantity) || 0,
          unitCost: Number(i.unitCost) || 0,
          isService: !!i.isService,
          description: i.description || "",
          lineKey: i.lineKey || ""
        })),
        totalAmount: newTotal
      };

      await updateDoc(doc(db, "companies", companyId, "purchase_orders", orderId), updatedFields);
      setIsEditing(false);
      alert("Orden de compra actualizada exitosamente.");
    } catch (e) {
      console.error(e);
      alert("Error al actualizar la orden de compra.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!companyId || !orderId) return;
    if (!window.confirm("¿Estás seguro de cancelar esta orden de compra?")) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, "companies", companyId, "purchase_orders", orderId), {
        status: "CANCELLED"
      });
      alert("Orden de compra cancelada.");
    } catch (e) {
      console.error(e);
      alert("Error al cancelar la orden de compra.");
    } finally {
      setLoading(false);
    }
  };



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
        doc.text(new Date(order.expectedDate + "T12:00:00").toLocaleDateString("es-MX"), pageWidth - margin, y, { align: "right" });
      }

      y += 12;

      // --- Buyer & Shipping Info (Two Columns) ---
      const colWidth = (pageWidth - margin * 2 - 10) / 2;
      const blockStartY = y;
      
      // Left Column: Buyer Fiscal Data
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      doc.text("DATOS DE FACTURACIÓN (EMPRESA)", margin, y);
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.text(companyProfile?.razonSocial || "Razón Social no configurada", margin, y, { maxWidth: colWidth });
      
      doc.setFont("helvetica", "normal");
      y += 4;
      doc.text(`RFC: ${companyProfile?.rfc || "No especificado"}`, margin, y);
      
      y += 4;
      doc.text(companyProfile?.address || "Dirección física no configurada", margin, y, { maxWidth: colWidth });
      
      // Right Column: Shipping Address
      const rightColX = margin + colWidth + 10;
      let rightY = blockStartY;
      
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      doc.text("DIRECCIÓN DE ENVÍO", rightColX, rightY);
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      rightY += 4;
      doc.text(shippingAddress || "No especificada", rightColX, rightY, { maxWidth: colWidth });
      
      // Adjust y to be the maximum of both columns
      const linesLeft = companyProfile?.address ? doc.splitTextToSize(companyProfile.address, colWidth).length : 1;
      const linesRight = shippingAddress ? doc.splitTextToSize(shippingAddress, colWidth).length : 1;
      const leftHeight = 12 + linesLeft * 4;
      const rightHeight = 4 + linesRight * 4;
      y = blockStartY + Math.max(leftHeight, rightHeight) + 6;
      
      // Divider line
      doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

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
      const pdfSubtotal = order.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
      const pdfIva = pdfSubtotal * 0.16;
      const pdfTotal = pdfSubtotal + pdfIva;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);

      doc.text("Subtotal:", pageWidth - 55, y);
      doc.text(`$${pdfSubtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 2, y, { align: "right" });

      y += 5;
      doc.text("IVA (16%):", pageWidth - 55, y);
      doc.text(`$${pdfIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 2, y, { align: "right" });

      y += 6;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL:", pageWidth - 55, y);
      doc.text(`$${pdfTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth - margin - 2, y, { align: "right" });

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
            {getStatusBadge(order.status)}
          </div>
          <p className="text-muted-foreground">Requisición para {order.vendorName}</p>
        </div>
        
        {isEditing ? (
          <div className="flex gap-2">
            <Button 
              onClick={handleSave} 
              disabled={loading}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Cambios
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => { setIsEditing(false); setEditData(null); }} 
              className="text-slate-500 border border-slate-200 hover:bg-slate-50"
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Button 
              onClick={() => setShowDropdown(!showDropdown)} 
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md"
            >
              Acciones <ChevronDown className="w-4 h-4" />
            </Button>
            {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 mt-2 w-56 bg-white border rounded-xl shadow-xl py-2 z-50 animate-in fade-in-50 slide-in-from-top-2 duration-100">
                  <button 
                    onClick={() => { setShowDropdown(false); setEditData(JSON.parse(JSON.stringify(order))); setIsEditing(true); }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4 text-indigo-500" />
                    Editar Orden
                  </button>
                  
                  {(order.status === "SENT" || order.status === "PARTIAL") && (
                    <button 
                      onClick={() => { setShowDropdown(false); router.push(`/compras/recepciones/nueva?orderId=${order.id}`); }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                    >
                      <Truck className="w-4 h-4 text-indigo-500" />
                      Surtir Orden
                    </button>
                  )}

                  {(!order.paidAmount || order.paidAmount < order.totalAmount - 0.01) && (
                    <button 
                      onClick={() => { setShowDropdown(false); setIsPaymentModalOpen(true); }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                    >
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      Registrar Pago
                    </button>
                  )}

                  <button 
                    onClick={() => { setShowDropdown(false); handleDownloadPDF(); }}
                    disabled={generatingPdf}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm font-medium text-slate-700 flex items-center gap-2"
                  >
                    {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" /> : <Download className="w-4 h-4 text-slate-500" />}
                    Descargar PDF
                  </button>

                  {order.status !== "CANCELLED" && (
                    <>
                      <div className="border-t my-1" />
                      <button 
                        onClick={() => { setShowDropdown(false); handleCancelOrder(); }}
                        className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm font-medium text-red-600 flex items-center gap-2"
                      >
                        <XCircle className="w-4 h-4 text-red-500" />
                        Cancelar Orden
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden p-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-6 mb-8">
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
            {isEditing ? (
              <Input
                type="date"
                className="w-full text-xs font-semibold h-9 px-2"
                value={editData?.expectedDate ? editData.expectedDate.split("T")[0] : ""}
                onChange={(e) => setEditData({ ...editData, expectedDate: e.target.value })}
              />
            ) : (
              <p className="font-semibold">{order.expectedDate ? new Date(order.expectedDate + "T12:00:00").toLocaleDateString('es-MX') : "No especificada"}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Sucursal</p>
            {isEditing ? (
              <select
                className="w-full text-xs font-semibold border rounded h-9 px-2 bg-background focus:ring-1 focus:ring-indigo-500"
                value={editData?.locationId || ""}
                onChange={(e) => setEditData({ ...editData, locationId: e.target.value })}
              >
                <option value="">Seleccione Sucursal</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-semibold">{order.locationName || "No especificada"}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Cuenta de Gasto</p>
            {isEditing ? (
              <select
                className="w-full text-xs font-semibold border rounded h-9 px-2 bg-background focus:ring-1 focus:ring-indigo-500"
                value={editData?.accountId || ""}
                onChange={(e) => setEditData({ ...editData, accountId: e.target.value })}
              >
                <option value="">Seleccione Cuenta</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-semibold">{order.accountName ? `${order.accountCode} - ${order.accountName}` : "No asignada"}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Importe Total</p>
            <p className="font-bold text-lg text-indigo-700">
              $
              {(isEditing
                ? editData?.items?.reduce((sum: number, item: any) => sum + (item.quantity * (Number(item.unitCost) || 0)), 0)
                : order.totalAmount
              ).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Buyer Fiscal Data and Shipping Address Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div>
            <h4 className="font-bold text-sm text-indigo-950 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b pb-1.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Datos Fiscales de Facturación (Empresa)
            </h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-xs text-muted-foreground font-semibold uppercase block">Razón Social</span>
                <span className="font-semibold text-slate-800">{companyProfile?.razonSocial || "No especificada"}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-semibold uppercase block">RFC</span>
                <span className="font-semibold text-slate-800 font-mono">{companyProfile?.rfc || "No especificado"}</span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground font-semibold uppercase block">Dirección Fiscal</span>
                <span className="font-semibold text-slate-800">{companyProfile?.address || "No especificada"}</span>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold text-sm text-indigo-950 uppercase tracking-wider mb-3 flex items-center justify-between border-b pb-1.5">
              <span className="flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-indigo-600" />
                Dirección de Envío
              </span>
              {!isEditingShipping && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 px-2 text-xs text-indigo-600 font-semibold hover:bg-indigo-50"
                  onClick={() => setIsEditingShipping(true)}
                >
                  Editar
                </Button>
              )}
            </h4>
            
            {isEditingShipping ? (
              <div className="space-y-2">
                <textarea
                  className="w-full text-xs font-semibold border rounded p-2 bg-white resize-y shadow-sm focus:ring-1 focus:ring-indigo-500"
                  rows={3}
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Escribe la dirección de envío completa..."
                />
                <div className="flex gap-2 justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs text-slate-500 hover:bg-slate-100"
                    onClick={() => {
                      setIsEditingShipping(false);
                      setShippingAddress(order.shippingAddress || "");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    size="sm" 
                    className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm"
                    onClick={handleSaveShippingAddress}
                  >
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm">
                <p className="font-semibold text-slate-800 whitespace-pre-wrap">{shippingAddress || "No especificada"}</p>
              </div>
            )}
          </div>
        </div>

        {(isEditing || order.notes) && (
          <div className="mb-8 p-4 bg-muted/30 rounded-lg">
            <p className="text-sm font-semibold mb-1">Notas / Instrucciones</p>
            {isEditing ? (
              <textarea
                className="w-full text-xs font-semibold border rounded p-2 bg-white resize-y shadow-sm focus:ring-1 focus:ring-indigo-500"
                rows={3}
                value={editData?.notes || ""}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                placeholder="Notas o instrucciones especiales..."
              />
            ) : (
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            )}
          </div>
        )}

        <h3 className="font-semibold text-lg mb-4">Artículos Solicitados</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Cant. Requerida</th>
                <th className="px-4 py-3 text-right">Costo Estimado</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                {isEditing && <th className="px-4 py-3 text-center w-16">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(isEditing ? editData?.items || [] : order.items).map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{item.productName}</td>
                  <td className="px-4 py-3 text-right font-bold">
                    {isEditing ? (
                      <Input
                        type="number"
                        min="1"
                        className="w-20 text-right h-8 px-2"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", Number(e.target.value) || 0)}
                      />
                    ) : (
                      item.quantity
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {isEditing ? (
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24 text-right h-8 px-2"
                        value={item.unitCost}
                        onChange={(e) => updateItem(idx, "unitCost", Number(e.target.value) || 0)}
                      />
                    ) : (
                      `$${item.unitCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-indigo-700">
                    ${((item.quantity || 0) * (item.unitCost || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </td>
                  {isEditing && (
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => removeItem(idx)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isEditing && (
          <div className="p-5 border border-dashed rounded-lg bg-slate-50/50 mt-4 relative">
            <h4 className="text-xs font-bold text-indigo-900 uppercase mb-2">Agregar más productos a la orden</h4>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nombre, SKU o código de barras..." 
                className="pl-9 bg-background"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>
            {productSearch && (
              <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                {getFilteredProducts().map((product: any) => (
                  product.variants?.map((variant: any) => (
                    <div 
                      key={variant.id} 
                      className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm cursor-pointer"
                      onClick={() => {
                        handleAddProduct(product, variant);
                      }}
                    >
                      <div>
                        <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                        <div className="text-xs text-slate-500">Stock actual: {variant.stock || 0} | Costo: ${variant.price || 0}</div>
                      </div>
                      {editData.items?.some((i: any) => i.variantId === variant.id) && (
                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Agregado</span>
                      )}
                    </div>
                  ))
                ))}
                {getFilteredProducts().length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground text-center">No se encontraron productos</div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <div className="w-full max-w-sm bg-slate-50 p-6 rounded-xl border">
            <div className="space-y-2 text-sm">
              {(() => {
                const subtotal = isEditing
                  ? editData?.items?.reduce((sum: number, item: any) => sum + (item.quantity * (Number(item.unitCost) || 0)), 0) || 0
                  : (order.items?.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0) || order.totalAmount || 0);
                const iva = subtotal * 0.16;
                const total = subtotal + iva;
                return (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal Estimado</span>
                      <span className="font-medium">${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>IVA (16%)</span>
                      <span className="font-medium">${iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between font-black text-xl pt-2 border-t mt-2 text-slate-900">
                      <span>Total Requisición</span>
                      <span className="text-indigo-700">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                );
              })()}
              {(order.paidAmount || 0) > 0 && (
                <>
                  <div className="flex justify-between text-rose-600 font-medium pt-2">
                    <span>Pagado (Egreso)</span>
                    <span>${(order.paidAmount || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                  </div>
                  <div className="flex justify-between text-orange-600 font-bold border-t mt-2 pt-2">
                    <span>Saldo Pendiente</span>
                    <span>${Math.max(0, ((order.items?.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0) || order.totalAmount) * 1.16) - (order.paidAmount || 0)).toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
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
