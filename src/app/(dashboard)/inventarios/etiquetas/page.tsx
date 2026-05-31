"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Printer, Plus, Minus, Trash2, Barcode } from "lucide-react";
import { ShopifyProduct } from "@/types/product";
import { LabelFormat } from "./formatos/page";
import Link from "next/link";
import Image from "next/image";
import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";

const getBase64ImageFromURL = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = error => reject(error);
    img.src = url;
  });
};

interface PrintItem {
  product: ShopifyProduct;
  quantity: number;
}

export default function PrintLabelsPage() {
  const { companyId } = useAuth();
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [printQueue, setPrintQueue] = useState<PrintItem[]>([]);
  
  const [formats, setFormats] = useState<LabelFormat[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string>("");

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "products"), orderBy("title"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShopifyProduct));
      setProducts(data);
      setLoading(false);
    });

    const qF = query(collection(db, "companies", companyId, "label_formats"));
    const unsubF = onSnapshot(qF, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LabelFormat));
      setFormats(data);
      if (data.length > 0 && !selectedFormatId) {
        setSelectedFormatId(data[0].id);
      }
    });

    return () => {
      unsub();
      unsubF();
    };
  }, [companyId, selectedFormatId]);

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.variants && p.variants[0]?.barcode?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addToQueue = (product: ShopifyProduct) => {
    if (!product.variants || !product.variants[0]?.barcode) {
      alert("Este producto no tiene un código de barras (Barcode) asignado.");
      return;
    }
    const existing = printQueue.find(item => item.product.id === product.id);
    if (existing) {
      updateQuantity(product.id, existing.quantity + 1);
    } else {
      setPrintQueue([...printQueue, { product, quantity: 1 }]);
    }
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setPrintQueue(printQueue.filter(item => item.product.id !== productId));
      return;
    }
    setPrintQueue(printQueue.map(item => 
      item.product.id === productId ? { ...item, quantity } : item
    ));
  };

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handlePrint = async () => {
    if (!selectedFormatId) {
      alert("Por favor selecciona un formato de impresión primero.");
      return;
    }
    const format = formats.find(f => f.id === selectedFormatId);
    if (!format) return;
    
    setIsGeneratingPdf(true);
    
    try {
      const doc = new jsPDF({
        orientation: format.widthMm > format.heightMm ? "landscape" : "portrait",
        unit: "mm",
        format: [format.widthMm, format.heightMm]
      });

      const defaultElements = {
        title: { visible: true, xPct: 5, yPct: 5, wPct: 90, hPct: 20 },
        price: { visible: true, xPct: 5, yPct: 75, wPct: 90, hPct: 20 },
        sku: { visible: false, xPct: 5, yPct: 25, wPct: 90, hPct: 15 },
        barcode: { visible: true, xPct: 5, yPct: 40, wPct: 90, hPct: 35 },
        logo: { visible: !!format.logoUrl, xPct: 5, yPct: 5, wPct: 30, hPct: 20 },
      };
      const els = format.elements || defaultElements;

      let logoBase64 = null;
      if (els.logo?.visible && format.logoUrl) {
        try {
          logoBase64 = await getBase64ImageFromURL(format.logoUrl);
        } catch (e) {
          console.warn("Could not load logo for PDF due to CORS", e);
        }
      }

      for (let i = 0; i < barcodesToRender.length; i++) {
        if (i > 0) doc.addPage([format.widthMm, format.heightMm], format.widthMm > format.heightMm ? "landscape" : "portrait");
        
        const item = barcodesToRender[i];
        const getMm = (pct: number, maxMm: number) => (pct / 100) * maxMm;

        // Draw Logo
        if (logoBase64) {
          const x = getMm(els.logo.xPct, format.widthMm);
          const y = getMm(els.logo.yPct, format.heightMm);
          const w = getMm(els.logo.wPct, format.widthMm);
          const h = getMm(els.logo.hPct, format.heightMm);
          doc.addImage(logoBase64, 'PNG', x, y, w, h, undefined, "FAST");
        }

        doc.setTextColor(0, 0, 0);

        // Draw Title
        if (els.title?.visible) {
          const hMm = getMm(els.title.hPct, format.heightMm);
          const maxW = getMm(els.title.wPct, format.widthMm);
          let fontSize = hMm * 2.83 * 0.7;
          doc.setFontSize(fontSize);
          doc.setFont("helvetica", "bold");
          
          let textWidth = doc.getTextWidth(item.title);
          if (textWidth > maxW) {
             fontSize = fontSize * (maxW / textWidth) * 0.95;
             doc.setFontSize(fontSize);
          }
          
          const cX = getMm(els.title.xPct, format.widthMm) + (maxW / 2);
          const cY = getMm(els.title.yPct, format.heightMm) + (hMm / 2);
          doc.text(item.title, cX, cY, { align: "center", baseline: "middle" });
        }

        // Draw SKU
        if (els.sku?.visible) {
          const hMm = getMm(els.sku.hPct, format.heightMm);
          const maxW = getMm(els.sku.wPct, format.widthMm);
          let fontSize = hMm * 2.83 * 0.7;
          doc.setFontSize(fontSize);
          doc.setFont("helvetica", "normal");
          
          const skuText = `SKU: ${item.sku}`;
          let textWidth = doc.getTextWidth(skuText);
          if (textWidth > maxW) {
             fontSize = fontSize * (maxW / textWidth) * 0.95;
             doc.setFontSize(fontSize);
          }
          
          const cX = getMm(els.sku.xPct, format.widthMm) + (maxW / 2);
          const cY = getMm(els.sku.yPct, format.heightMm) + (hMm / 2);
          doc.text(skuText, cX, cY, { align: "center", baseline: "middle" });
        }

        // Draw Barcode
        if (els.barcode?.visible) {
          const canvas = document.createElement("canvas");
          JsBarcode(canvas, item.barcode, { 
            format: "CODE128", 
            displayValue: true, 
            margin: 0,
            fontSize: 40,
            height: 100
          });
          const barcodeBase64 = canvas.toDataURL("image/jpeg");
          const pdfW = getMm(els.barcode.wPct, format.widthMm);
          const pdfH = getMm(els.barcode.hPct, format.heightMm);
          
          const imgRatio = canvas.width / canvas.height;
          const boxRatio = pdfW / pdfH;
          
          let drawW = pdfW;
          let drawH = pdfH;
          
          if (imgRatio > boxRatio) {
            drawH = pdfW / imgRatio;
          } else {
            drawW = pdfH * imgRatio;
          }
          
          const drawX = getMm(els.barcode.xPct, format.widthMm) + (pdfW - drawW) / 2;
          const drawY = getMm(els.barcode.yPct, format.heightMm) + (pdfH - drawH) / 2;
          
          doc.addImage(barcodeBase64, 'JPEG', drawX, drawY, drawW, drawH, undefined, "FAST");
        }

        // Draw Price
        if (els.price?.visible) {
          const hMm = getMm(els.price.hPct, format.heightMm);
          const maxW = getMm(els.price.wPct, format.widthMm);
          let fontSize = hMm * 2.83 * 0.8;
          doc.setFontSize(fontSize);
          doc.setFont("helvetica", "bold");
          
          const priceText = `$${item.price}`;
          let textWidth = doc.getTextWidth(priceText);
          if (textWidth > maxW) {
             fontSize = fontSize * (maxW / textWidth) * 0.95;
             doc.setFontSize(fontSize);
          }
          
          const cX = getMm(els.price.xPct, format.widthMm) + (maxW / 2);
          const cY = getMm(els.price.yPct, format.heightMm) + (hMm / 2);
          doc.text(priceText, cX, cY, { align: "center", baseline: "middle" });
        }
      }

      window.open(doc.output('bloburl'), '_blank');
    } catch (e) {
      console.error(e);
      alert("Hubo un error al generar el PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Generate the flattened array of barcodes to render
  const barcodesToRender = printQueue.flatMap(item => 
    Array.from({ length: item.quantity }).map((_, i) => ({
      key: `${item.product.id}-${i}`,
      title: item.product.title,
      sku: item.product.variants?.[0]?.sku || "N/A",
      price: item.product.variants?.[0]?.price || "0.00",
      barcode: item.product.variants?.[0]?.barcode || ""
    }))
  );

  return (
    <div className="space-y-6">
      {/* NO-PRINT UI */}
      <div className="print:hidden space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Impresión de Etiquetas</h1>
            <p className="text-muted-foreground">Genera códigos de barras para tu inventario físico.</p>
          </div>
          <Link href="/inventarios/etiquetas/formatos">
            <Button variant="outline">Configurar Formatos</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Product Selection */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Seleccionar Productos</h3>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nombre o código..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="h-[400px] overflow-y-auto pr-2 space-y-2">
              {loading ? (
                <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : filteredProducts.map(p => {
                const barcode = p.variants?.[0]?.barcode;
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="font-medium text-sm line-clamp-1">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {barcode ? `Código: ${barcode}` : '⚠️ Sin código de barras'}
                      </p>
                    </div>
                    <Button 
                      size="sm" 
                      variant={barcode ? "secondary" : "ghost"}
                      disabled={!barcode}
                      onClick={() => addToQueue(p)}
                    >
                      Añadir
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Print Queue */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 flex flex-col">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-semibold text-lg">Lista de Impresión</h3>
              <div className="flex items-center gap-3">
                <select 
                  className="border rounded-md px-2 py-1.5 text-sm"
                  value={selectedFormatId}
                  onChange={e => setSelectedFormatId(e.target.value)}
                >
                  <option value="" disabled>Seleccionar formato...</option>
                  {formats.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.widthMm}x{f.heightMm}mm)</option>
                  ))}
                </select>
                <Button onClick={handlePrint} disabled={printQueue.length === 0 || !selectedFormatId || isGeneratingPdf} className="gap-2">
                  {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} 
                  {isGeneratingPdf ? "Generando..." : `Imprimir (${barcodesToRender.length})`}
                </Button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 min-h-[400px]">
              {printQueue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <Barcode className="w-12 h-12 opacity-20 mb-2" />
                  <p>Añade productos para imprimir sus etiquetas.</p>
                </div>
              ) : printQueue.map(item => (
                <div key={item.product.id} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                  <div className="flex-1">
                    <p className="font-medium text-sm line-clamp-1">{item.product.title}</p>
                    <p className="text-xs text-muted-foreground">Precio: ${item.product.variants[0]?.price}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center border rounded-md">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => updateQuantity(item.product.id, 0)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
