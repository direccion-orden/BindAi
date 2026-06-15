"use client";

import React, { useState, useEffect } from "react";
import { collection, query as firestoreQuery, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Loader2,
  FileDown,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ErpClient {
  id: string;
  legalName: string;
  rfc?: string;
}

interface AccountStatementLine {
  date: string;
  type: 'Order' | 'Remission' | 'Invoice' | 'Payment' | 'Anticipo';
  number: string;
  description: string;
  cargo: number;
  abono: number;
  runningBalance: number;
  items?: any[];
}

interface AccountStatement {
  client: { id: string; legalName: string };
  generatedAt: string;
  lines: AccountStatementLine[];
  summary: {
    totalCargos: number;
    totalAbonos: number;
    saldoTotal: number;
  };
}

const TYPE_LABELS: Record<string, string> = {
  Order: "Pedido",
  Remission: "Remisión",
  Invoice: "Factura",
  Payment: "Pago",
  Anticipo: "Anticipo",
};

const TYPE_COLORS: Record<string, string> = {
  Order:
    "bg-stone-200/60 text-stone-700 dark:bg-stone-700/40 dark:text-stone-300",
  Remission:
    "bg-stone-300/50 text-stone-600 dark:bg-stone-600/40 dark:text-stone-300",
  Invoice:
    "bg-stone-100 text-stone-700 dark:bg-stone-800/40 dark:text-stone-200",
  Payment:
    "bg-stone-200/80 text-stone-500 dark:bg-stone-700/50 dark:text-stone-400",
  Anticipo:
    "bg-accent/10 text-accent dark:bg-accent/20 dark:text-accent",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function EstadoCuentaPage() {
  const { companyId } = useAuth();
  
  // Client search
  const [query, setQuery] = useState("");
  const [allClients, setAllClients] = useState<ErpClient[]>([]);
  const [clients, setClients] = useState<ErpClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<ErpClient | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Statement
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [docSearch, setDocSearch] = useState("");

  const handleDateFilterChange = (option: string) => {
    setDateFilterOption(option);
    
    const getLocalDateString = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    
    if (option === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (option === "today") {
      const todayStr = getLocalDateString(now);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (option === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setDateFrom(yesterdayStr);
      setDateTo(yesterdayStr);
    } else if (option === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(getLocalDateString(startOfMonth));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(getLocalDateString(startOfLastMonth));
      setDateTo(getLocalDateString(endOfLastMonth));
    } else if (option === "this_year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setDateFrom(getLocalDateString(startOfYear));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setDateFrom(getLocalDateString(thirtyDaysAgo));
      setDateTo(getLocalDateString(now));
    }
  };

  // Helper to extract YYYY-MM-DD from various date formats, in browser's local timezone
  const extractDate = (val: any): string => {
    if (!val) return "";
    let d: Date;
    if (typeof val === "string") {
      d = new Date(val);
    } else if (val.seconds || val._seconds) {
      const secs = val.seconds || val._seconds;
      d = new Date(secs * 1000);
    } else if (val instanceof Date) {
      d = val;
    } else {
      return "";
    }
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    if (!companyId) return;

    // Listen to local clients for reactive, fast search
    const q = firestoreQuery(collection(db, "companies", companyId, "clients"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(docSnap => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          legalName: d.LegalName || d.CommercialName || d.ClientName || d.legalName || d.name || d.razonSocial || "Cliente sin nombre",
          rfc: d.RFC || d.rfc || ""
        };
      });
      setAllClients(list);
    }, (error) => {
      console.error("Error cargando clientes locales:", error);
    });

    return () => unsubscribe();
  }, [companyId]);

  const handleSearch = () => {
    if (!query.trim()) {
      setClients([]);
      return;
    }
    setIsSearching(true);
    const term = query.toLowerCase();
    const results = allClients.filter(c => 
      c.legalName.toLowerCase().includes(term) || (c.rfc && c.rfc.toLowerCase().includes(term))
    );
    setClients(results);
    setIsSearching(false);
  };

  const handleSelectClient = async (client: ErpClient) => {
    setSelectedClient(client);
    setClients([]);
    setQuery("");
    setIsLoading(true);
    try {
      if (!companyId) throw new Error("No company ID");

      // 1. Fetch all financial entities from local Firestore in parallel
      const [pedidosSnap, remisionesSnap, facturasSnap, paymentsSnap, anticiposSnap] = await Promise.all([
        getDocs(firestoreQuery(collection(db, "companies", companyId, "pedidos"), where("clientId", "==", client.id))),
        getDocs(firestoreQuery(collection(db, "companies", companyId, "remisiones"), where("clientId", "==", client.id))),
        getDocs(firestoreQuery(collection(db, "companies", companyId, "facturas"), where("clientId", "==", client.id))),
        getDocs(firestoreQuery(collection(db, "companies", companyId, "payments"), where("clientId", "==", client.id))),
        getDocs(firestoreQuery(collection(db, "companies", companyId, "anticipos"), where("clientId", "==", client.id)))
      ]);

      const lines: AccountStatementLine[] = [];

      // Consolidate Orders (Pedidos)
      pedidosSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const status = String(d.status || "").trim().toLowerCase();
        // Omit orders that are already delivered/remisioned or billed/completed (only show active pending orders)
        if (status !== "cancelado" && status !== "cancelada" && status !== "surtido" && status !== "remisionado" && status !== "completado") {
          lines.push({
            date: extractDate(d.createdAt),
            type: "Order",
            number: d.orderNumber || d.number || `PED-${docSnap.id.substring(0, 6)}`,
            description: "Pedido de Venta (Pendiente)",
            cargo: parseFloat(d.totalAmount) || d.totalAmount || 0,
            abono: 0,
            runningBalance: 0,
            items: d.items || []
          });
        }
      });

      // Consolidate Remissions (Remisiones)
      remisionesSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const status = String(d.status || "").trim().toLowerCase();
        // Omit remisiones that are already invoiced/facturadas (show active or paid remisiones since their cargo is final)
        if (status !== "cancelada" && status !== "cancelado" && status !== "facturada") {
          lines.push({
            date: extractDate(d.createdAt),
            type: "Remission",
            number: d.remissionNumber || d.number || `REM-${docSnap.id.substring(0, 6)}`,
            description: "Remisión de Mercancía (Pendiente de Factura)",
            cargo: parseFloat(d.totalAmount) || d.totalAmount || 0,
            abono: 0,
            runningBalance: 0,
            items: d.items || []
          });
        }
      });

      // Consolidate Invoices (Facturas)
      facturasSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const status = String(d.status || "").trim().toLowerCase();
        if (status !== "cancelada" && status !== "cancelado") {
          lines.push({
            date: extractDate(d.createdAt),
            type: "Invoice",
            number: d.invoiceNumber ? `FAC-${d.invoiceNumber}` : `FAC-${docSnap.id.substring(0, 6)}`,
            description: "Factura de Venta (CFDI)",
            cargo: parseFloat(d.totalAmount) || d.totalAmount || 0,
            abono: 0,
            runningBalance: 0,
            items: d.items || []
          });
        }
      });

      // Consolidate Payments (Pagos Directos)
      paymentsSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const amt = parseFloat(d.amount) || 0;

        // Exclude payments that are applications of anticipos to avoid double-counting
        const refLower = (d.reference || "").toLowerCase();
        if (refLower.includes("anticipo")) {
          return;
        }

        if (amt > 0.01) {
          lines.push({
            date: extractDate(d.createdAt),
            type: "Payment",
            number: d.reference ? `PAG | ${d.reference}` : `PAG-${docSnap.id.substring(0, 6)}`,
            description: `Pago aplicado a ${(d.documentType || "Documento").toUpperCase()} - ${d.documentNumber || ""}`,
            cargo: 0,
            abono: amt,
            runningBalance: 0
          });
        }
      });

      // Extract local Anticipo applications (amortizaciones)
      const anticiposList = anticiposSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      
      // Consolidate Anticipos
      anticiposList.forEach(ant => {
        const folio = ant.folio ? `ANT-${String(ant.folio).padStart(4, "0")}` : `ANT-${ant.id?.substring(0, 5).toUpperCase()}`;
        const date = extractDate(ant.receivedAt) || extractDate(ant.createdAt);

        lines.push({
          date,
          type: "Anticipo",
          number: folio,
          description: `Anticipo - ${ant.paymentTermName || "Pago"}${ant.reference ? " | Ref: " + ant.reference : ""}`,
          cargo: 0,
          abono: parseFloat(ant.amount) || 0,
          runningBalance: 0
        });

        // If anticipo was applied locally (amortizaciones), show them as information lines (0 abono/cargo)
        if (ant.applications) {
          ant.applications.forEach((app: any) => {
            lines.push({
              date: extractDate(app.appliedAt) || date,
              type: "Anticipo",
              number: `AMORT-${folio}`,
              description: `(Amortizado con ${app.erpDocumentNumber || "Documento"} por $${(app.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
              cargo: 0,
              abono: 0,
              runningBalance: 0
            });
          });
        }
      });

      // 2. Sort by date ASC
      lines.sort((a, b) => {
        const da = a.date || "0000-00-00";
        const db2 = b.date || "0000-00-00";
        return da.localeCompare(db2);
      });

      // 3. Compute runningBalance and totals
      let totalCargos = 0;
      let totalAbonos = 0;
      let runningBalance = 0;

      for (const line of lines) {
        totalCargos += line.cargo;
        totalAbonos += line.abono;
        runningBalance += line.abono - line.cargo;
        line.runningBalance = runningBalance;
      }

      setStatement({
        client: { id: client.id, legalName: client.legalName },
        generatedAt: new Date().toISOString(),
        lines,
        summary: {
          totalCargos,
          totalAbonos,
          saldoTotal: totalCargos - totalAbonos
        }
      });
    } catch (error) {
      console.error(error);
      alert("Error al obtener el estado de cuenta.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeClient = () => {
    setSelectedClient(null);
    setStatement(null);
    setTypeFilter("all");
    setDateFilterOption("all");
    setDateFrom("");
    setDateTo("");
    setDocSearch("");
  };


  // Filter lines
  const filteredLines: AccountStatementLine[] = (statement?.lines || []).filter(
    (line) => {
      if (typeFilter !== "all" && line.type !== typeFilter) return false;
      if (dateFrom && line.date < dateFrom) return false;
      if (dateTo && line.date > dateTo) return false;
      if (
        docSearch &&
        !line.number.toLowerCase().includes(docSearch.toLowerCase()) &&
        !line.description.toLowerCase().includes(docSearch.toLowerCase())
      )
        return false;
      return true;
    }
  );

  const filteredSummary = {
    totalCargos: filteredLines.reduce((acc, line) => acc + (line.cargo || 0), 0),
    totalAbonos: filteredLines.reduce((acc, line) => acc + (line.abono || 0), 0),
    get saldoTotal() { return this.totalAbonos - this.totalCargos; }
  };

  // Convert SVG logo to PNG data URL for jsPDF
  const loadLogoAsDataUrl = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      // SVG viewBox is 293.75 x 67.31 — set explicit dimensions since SVGs
      // without width/height attributes report incorrect naturalWidth/Height
      const svgW = 588; // 293.75 * 2 for good base resolution
      const svgH = 135; // 67.31 * 2
      img.width = svgW;
      img.height = svgH;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 3; // hi-res for crisp PDF rendering
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

  // PDF generation with jsPDF — taupe-grey palette
  const handleDownloadPDF = async () => {
    if (!statement) return;

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

    // Palette: warm taupe-greys matching CSS variables
    const TAUPE_DARK = [56, 52, 50];      // hsl(38,6%,22%) — foreground
    const TAUPE_MID = [120, 113, 108];     // hsl(38,6%,45%) — primary
    const TAUPE_LIGHT = [210, 206, 201];   // hsl(38,8%,85%) — border
    const TAUPE_BG = [243, 241, 238];      // hsl(38,13%,94%) — background
    const ACCENT = [122, 107, 140];        // hsl(266,12%,52%) — accent

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 14;

    // --- Logo + Header ---
    const logoH = 10;
    const logoW = logoH * (293.75 / 67.31); // aspect ratio from SVG viewBox
    try {
      const logoDataUrl = await loadLogoAsDataUrl();
      doc.addImage(logoDataUrl, 'PNG', margin, y, logoW, logoH);
    } catch {
      // Fallback: text-only header if logo fails
    }

    // Title on the right, same line as logo
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
    doc.text("Estado de Cuenta", pageWidth - margin, y + 7, { align: "right" });
    y += logoH + 3;

    // Divider line
    doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
    doc.text(`Cliente: ${statement.client.legalName}`, margin, y);
    doc.text(
      `Generado: ${new Date(statement.generatedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`,
      pageWidth - margin,
      y,
      { align: "right" }
    );
    y += 8;

    // --- Summary boxes — subtle taupe borders with text ---
    const boxW = (pageWidth - margin * 2 - 10) / 3;
    const boxH = 14;
    const summaryData = [
      { label: "Total Cargos", value: formatCurrency(filteredSummary.totalCargos), borderColor: TAUPE_MID, textColor: TAUPE_DARK },
      { label: "Total Abonos", value: formatCurrency(filteredSummary.totalAbonos), borderColor: TAUPE_MID, textColor: TAUPE_DARK },
      { label: "Saldo Total", value: formatCurrency(filteredSummary.saldoTotal), borderColor: ACCENT, textColor: ACCENT },
    ];

    summaryData.forEach((item, i) => {
      const x = margin + i * (boxW + 5);
      // Light fill
      doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
      doc.roundedRect(x, y, boxW, boxH, 2, 2, "F");
      // Border
      doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(x, y, boxW, boxH, 2, 2, "S");
      // Label
      doc.setFontSize(7);
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, x + 4, y + 5);
      // Value
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(item.textColor[0], item.textColor[1], item.textColor[2]);
      doc.text(item.value, x + 4, y + 11);
    });
    y += boxH + 6;

    // --- Table header — warm dark taupe ---
    const colWidths = [24, 22, 30, 80, 30, 30, 36];
    const colHeaders = ["Fecha", "Tipo", "Folio", "Descripción", "Cargo", "Abono", "Saldo Acum."];

    const renderTableHeader = (yPos: number) => {
      doc.setFillColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.rect(margin, yPos, pageWidth - margin * 2, 7, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(240, 238, 235);
      let hx = margin + 2;
      colHeaders.forEach((header, i) => {
        if (i >= 4) {
          doc.text(header, hx + colWidths[i] - 2, yPos + 5, { align: "right" });
        } else {
          doc.text(header, hx, yPos + 5);
        }
        hx += colWidths[i];
      });
    };

    renderTableHeader(y);
    y += 7;

    // --- Table rows ---
    const linesToRender = filteredLines.length > 0 ? filteredLines : statement.lines;
    const maxY = doc.internal.pageSize.getHeight() - 16;

    for (let rowIdx = 0; rowIdx < linesToRender.length; rowIdx++) {
      const line = linesToRender[rowIdx];

      if (y > maxY) {
        doc.addPage();
        y = 14;
        renderTableHeader(y);
        y += 7;
      }

      // Alternate row — very subtle warm tint
      if (rowIdx % 2 === 0) {
        doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
        doc.rect(margin, y, pageWidth - margin * 2, 6, "F");
      }

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      let cx = margin + 2;

      const rowData = [
        formatDate(line.date),
        TYPE_LABELS[line.type] || line.type,
        line.number,
        line.description.length > 55 ? line.description.substring(0, 55) + "…" : line.description,
        line.cargo > 0 ? formatCurrency(line.cargo) : "",
        line.abono > 0 ? formatCurrency(line.abono) : "",
        formatCurrency(line.runningBalance),
      ];

      rowData.forEach((text, i) => {
        if (i >= 4) {
          // Subtle color differentiation
          if (i === 4 && line.cargo > 0) doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
          else if (i === 5 && line.abono > 0) doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
          else if (i === 6) doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
          else doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
          doc.text(text, cx + colWidths[i] - 2, y + 4.5, { align: "right" });
        } else {
          if (i === 0) {
             doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]); // date muted
             doc.setFont("helvetica", "normal");
          } else if (i === 3 && line.description.includes('(Amortizado')) {
             doc.setTextColor(46, 125, 50); // Muted green (rgb 46, 125, 50)
             doc.setFont("helvetica", "italic");
          } else {
             doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
             doc.setFont("helvetica", "normal");
          }
          doc.text(text, cx, y + 4.5);
        }
        cx += colWidths[i];
      });
      y += 6;
    }

    // --- Footer ---
    y += 3;
    doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(`Saldo Total: ${formatCurrency(filteredSummary.saldoTotal)}`, pageWidth - margin, y, { align: "right" });

    doc.save(`EdoCta_${statement.client.legalName.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  // New PDF generation grouped by Products & Services
  const handleDownloadPDFGrouped = async () => {
    if (!statement) return;

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

    // Palette: warm taupe-greys matching CSS variables
    const TAUPE_DARK = [56, 52, 50];      // hsl(38,6%,22%) — foreground
    const TAUPE_MID = [120, 113, 108];     // hsl(38,6%,45%) — primary
    const TAUPE_LIGHT = [210, 206, 201];   // hsl(38,8%,85%) — border
    const TAUPE_BG = [243, 241, 238];      // hsl(38,13%,94%) — background
    const ACCENT = [122, 107, 140];        // hsl(266,12%,52%) — accent

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 14;
    const maxY = doc.internal.pageSize.getHeight() - 16;

    // Helper to truncate text based on target width in mm
    const truncateText = (text: string, maxWidth: number, fontSize: number) => {
      doc.setFontSize(fontSize);
      const textWidth = doc.getTextWidth(text);
      if (textWidth <= maxWidth) return text;
      
      let truncated = text;
      while (truncated.length > 0 && doc.getTextWidth(truncated + "…") > maxWidth) {
        truncated = truncated.slice(0, -1);
      }
      return truncated + "…";
    };

    // --- Logo + Header ---
    const logoH = 10;
    const logoW = logoH * (293.75 / 67.31); // aspect ratio from SVG viewBox
    try {
      const logoDataUrl = await loadLogoAsDataUrl();
      doc.addImage(logoDataUrl, 'PNG', margin, y, logoW, logoH);
    } catch {
      // Fallback: text-only header if logo fails
    }

    // Title on the right, same line as logo
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
    doc.text("Estado de Cuenta (Prod/Serv)", pageWidth - margin, y + 7, { align: "right" });
    y += logoH + 3;

    // Divider line
    doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
    doc.text(`Cliente: ${statement.client.legalName}`, margin, y);
    doc.text(
      `Generado: ${new Date(statement.generatedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`,
      pageWidth - margin,
      y,
      { align: "right" }
    );
    y += 8;

    // --- Process movement lines into Products, Services, and Abonos ---
    const linesToProcess = filteredLines.length > 0 ? filteredLines : statement.lines;
    const productsList: any[] = [];
    const servicesList: any[] = [];
    const abonosList: any[] = [];

    let totalProductCargos = 0;
    let totalServiceCargos = 0;
    let totalAbonos = 0;

    linesToProcess.forEach(line => {
      if (line.abono > 0) {
        abonosList.push({
          date: line.date,
          type: TYPE_LABELS[line.type] || line.type,
          number: line.number,
          description: line.description,
          amount: line.abono
        });
        totalAbonos += line.abono;
      } else if (line.cargo > 0) {
        const docItems = line.items || [];
        if (docItems.length === 0) {
          // Fallback if no items inside document, treat as product cargo
          productsList.push({
            date: line.date,
            number: line.number,
            concept: line.description || "Cargo General",
            quantity: 1,
            unitPrice: line.cargo,
            total: line.cargo
          });
          totalProductCargos += line.cargo;
        } else {
          // Compute raw item totals to get proportions
          let rawDocTotal = 0;
          const processedItems = docItems.map((item: any) => {
            const qty = parseFloat(item.quantity) || 1;
            const price = parseFloat(item.unitPrice) || 0;
            const disc = parseFloat(item.discountPercentage) || 0;
            const rawTotal = qty * price * (1 - disc / 100);
            rawDocTotal += rawTotal;
            return { item, qty, price, rawTotal };
          });

          processedItems.forEach(({ item, qty, price, rawTotal }) => {
            const itemShare = rawDocTotal > 0 ? rawTotal / rawDocTotal : 1 / docItems.length;
            const allocatedTotal = line.cargo * itemShare;
            
            const skuVal = (item.sku || item.variantSku || "").toUpperCase().trim();
            const isExcludedService = skuVal === "SER-PROD" || skuVal === "SER-FAB" || skuVal === "SER-PRODUCTO";
            const isService = !isExcludedService && (!!item.isService || (typeof item.sku === 'string' && item.sku.startsWith("SER-")) || (typeof item.variantSku === 'string' && item.variantSku.startsWith("SER-")));
            const conceptName = isService ? (item.description || item.productName) : item.productName;

            const targetList = isService ? servicesList : productsList;
            targetList.push({
              date: line.date,
              number: line.number,
              concept: conceptName || "Concepto sin nombre",
              quantity: qty,
              unitPrice: price,
              total: allocatedTotal
            });

            if (isService) {
              totalServiceCargos += allocatedTotal;
            } else {
              totalProductCargos += allocatedTotal;
            }
          });
        }
      }
    });

    // Proportional division of abonos
    const totalCargos = totalProductCargos + totalServiceCargos;
    let ratioProducts = 0.5;
    let ratioServices = 0.5;

    if (totalCargos > 0.01) {
      ratioProducts = totalProductCargos / totalCargos;
      ratioServices = totalServiceCargos / totalCargos;
    }

    const allocatedAbonosProducts = totalAbonos * ratioProducts;
    const allocatedAbonosServices = totalAbonos * ratioServices;
    const saldoTotal = totalCargos - totalAbonos;

    const owedProducts = totalProductCargos - allocatedAbonosProducts;
    const owedServices = totalServiceCargos - allocatedAbonosServices;

    // --- Summary Box ---
    doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, "F");
    doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 22, 2, 2, "S");

    const colW = (pageWidth - margin * 2) / 3;

    // Col 1: Products
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
    doc.text("PRODUCTOS", margin + 6, y + 5);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
    doc.text(`Total Cargos: ${formatCurrency(totalProductCargos)}`, margin + 6, y + 10);
    doc.text(`Abonos Asignados: ${formatCurrency(allocatedAbonosProducts)}`, margin + 6, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
    doc.text(`Saldo Pendiente: ${formatCurrency(owedProducts)}`, margin + 6, y + 18);

    // Col 2: Services
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
    doc.text("SERVICIOS", margin + colW + 6, y + 5);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
    doc.text(`Total Cargos: ${formatCurrency(totalServiceCargos)}`, margin + colW + 6, y + 10);
    doc.text(`Abonos Asignados: ${formatCurrency(allocatedAbonosServices)}`, margin + colW + 6, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
    doc.text(`Saldo Pendiente: ${formatCurrency(owedServices)}`, margin + colW + 6, y + 18);

    // Col 3: Consolidated
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text("RESUMEN CONSOLIDADO", margin + colW * 2 + 6, y + 5);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
    doc.text(`Total Cargos: ${formatCurrency(totalCargos)}`, margin + colW * 2 + 6, y + 10);
    doc.text(`Total Abonos: ${formatCurrency(totalAbonos)}`, margin + colW * 2 + 6, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(`Saldo Total: ${formatCurrency(saldoTotal)}`, margin + colW * 2 + 6, y + 19);

    y += 28;

    // --- Table Renderer helper ---
    const checkPageBreak = (heightNeeded: number) => {
      if (y + heightNeeded > maxY) {
        doc.addPage();
        y = 14;
        return true;
      }
      return false;
    };

    const renderTable = (
      title: string,
      headers: string[],
      widths: number[],
      alignments: ("left" | "right" | "center")[],
      rows: any[][],
      sumValue: number,
      sumLabel: string
    ) => {
      // Draw Table Title
      checkPageBreak(12);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.text(title, margin, y + 5);
      y += 8;

      const drawHeader = (yPos: number) => {
        doc.setFillColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
        doc.rect(margin, yPos, pageWidth - margin * 2, 6, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(240, 238, 235);
        let hx = margin + 2;
        headers.forEach((h, i) => {
          if (alignments[i] === "right") {
            doc.text(h, hx + widths[i] - 4, yPos + 4.5, { align: "right" });
          } else if (alignments[i] === "center") {
            doc.text(h, hx + widths[i]/2 - 2, yPos + 4.5, { align: "center" });
          } else {
            doc.text(h, hx, yPos + 4.5);
          }
          hx += widths[i];
        });
      };

      checkPageBreak(7);
      drawHeader(y);
      y += 6;

      if (rows.length === 0) {
        checkPageBreak(8);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
        doc.text("No hay movimientos en esta sección.", margin + 4, y + 5);
        y += 8;
        return;
      }

      rows.forEach((row, rowIdx) => {
        checkPageBreak(6);
        if (y === 14) {
          drawHeader(y);
          y += 6;
        }

        if (rowIdx % 2 === 0) {
          doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
          doc.rect(margin, y, pageWidth - margin * 2, 5.5, "F");
        }

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);

        let cx = margin + 2;
        row.forEach((cell, cellIdx) => {
          const text = String(cell);
          const align = alignments[cellIdx];
          
          if (align === "right") {
            doc.text(text, cx + widths[cellIdx] - 4, y + 4, { align: "right" });
          } else if (align === "center") {
            doc.text(text, cx + widths[cellIdx]/2 - 2, y + 4, { align: "center" });
          } else {
            const maxW = widths[cellIdx] - 4;
            const truncated = truncateText(text, maxW, 7);
            doc.text(truncated, cx, y + 4);
          }
          cx += widths[cellIdx];
        });

        y += 5.5;
      });

      checkPageBreak(7);
      doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 1.5;

      checkPageBreak(6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      
      const totalText = formatCurrency(sumValue);
      doc.text(sumLabel, pageWidth - margin - 50, y + 4, { align: "right" });
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.text(totalText, pageWidth - margin - 4, y + 4, { align: "right" });
      y += 9;
    };

    // --- Render Tables ---
    const productRows = productsList.map(item => [
      formatDate(item.date),
      item.number,
      item.concept,
      String(item.quantity),
      formatCurrency(item.unitPrice),
      formatCurrency(item.total)
    ]);
    renderTable(
      "Detalle de Productos",
      ["Fecha", "Documento", "Producto / Concepto", "Cant.", "P. Unitario", "Importe"],
      [24, 30, 115, 18, 30, 34],
      ["left", "left", "left", "center", "right", "right"],
      productRows,
      totalProductCargos,
      "Total Cargos Productos:"
    );

    const serviceRows = servicesList.map(item => [
      formatDate(item.date),
      item.number,
      item.concept,
      String(item.quantity),
      formatCurrency(item.unitPrice),
      formatCurrency(item.total)
    ]);
    renderTable(
      "Detalle de Servicios",
      ["Fecha", "Documento", "Servicio / Concepto", "Cant.", "P. Unitario", "Importe"],
      [24, 30, 115, 18, 30, 34],
      ["left", "left", "left", "center", "right", "right"],
      serviceRows,
      totalServiceCargos,
      "Total Cargos Servicios:"
    );

    const abonoRows = abonosList.map(item => [
      formatDate(item.date),
      item.type,
      item.number,
      item.description,
      formatCurrency(item.amount)
    ]);
    renderTable(
      "Abonos y Anticipos",
      ["Fecha", "Tipo", "Folio / Referencia", "Descripción", "Importe"],
      [24, 30, 40, 123, 34],
      ["left", "left", "left", "left", "right"],
      abonoRows,
      totalAbonos,
      "Total Abonos y Anticipos:"
    );

    // --- Footer ---
    checkPageBreak(12);
    doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(`Saldo Total: ${formatCurrency(saldoTotal)}`, pageWidth - margin, y, { align: "right" });

    doc.save(`EdoCta_ProdServ_${statement.client.legalName.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Estado de Cuenta</h1>
        <p className="text-muted-foreground">
          Consulta el saldo consolidado de un cliente con información de ventas, cobros y anticipos locales.
        </p>
      </div>

      {/* Client Selector */}
      <div className="bg-card p-5 rounded-lg border shadow-sm space-y-3">
        <label className="text-sm font-medium">Buscar Cliente</label>
        {selectedClient ? (
          <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
            <span className="font-medium text-primary">
              {selectedClient.legalName}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleChangeClient}
            >
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre o RFC..."
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button
                type="button"
                onClick={handleSearch}
                disabled={isSearching}
                variant="secondary"
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            {clients.length > 0 && (
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {clients.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 hover:bg-muted cursor-pointer text-sm transition-colors"
                    onClick={() => handleSelectClient(c)}
                  >
                    <div className="font-medium">{c.legalName}</div>
                    {c.rfc && <div className="text-xs text-muted-foreground">RFC: {c.rfc}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center items-center p-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Statement content */}
      {statement && !isLoading && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card border rounded-lg p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-md bg-muted">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  Total Cargos
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(filteredSummary.totalCargos)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Pedidos + Remisiones + Facturas
              </p>
            </div>
            <div className="bg-card border rounded-lg p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-md bg-muted">
                  <TrendingDown className="h-5 w-5 text-secondary" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  Total Abonos
                </span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(filteredSummary.totalAbonos)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Pagos + Anticipos
              </p>
            </div>
            <div className="bg-card border rounded-lg p-5 shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-accent/10">
                    <DollarSign className="h-5 w-5 text-accent" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    Saldo Total
                  </span>
                </div>
                <p className="text-3xl font-bold text-accent">
                  {formatCurrency(filteredSummary.saldoTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Abonos − Cargos
                </p>
              </div>
            </div>
          </div>

          {/* Filters + Actions bar */}
          <div className="flex flex-col md:flex-row gap-4 items-end justify-between bg-card p-4 rounded-md border shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3 items-end flex-1 w-full">
              <div className="space-y-1 w-full sm:w-40">
                <span className="text-xs text-muted-foreground">
                  Tipo de documento
                </span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="Order">Pedidos</option>
                  <option value="Remission">Remisiones</option>
                  <option value="Invoice">Facturas</option>
                  <option value="Payment">Pagos</option>
                  <option value="Anticipo">Anticipos</option>
                </select>
              </div>
              <div className="space-y-1 w-full sm:w-44">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Fecha
                </span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
                  value={dateFilterOption}
                  onChange={(e) => handleDateFilterChange(e.target.value)}
                >
                  <option value="all">Cualquier fecha</option>
                  <option value="today">Hoy</option>
                  <option value="yesterday">Ayer</option>
                  <option value="this_month">Este Mes</option>
                  <option value="last_month">Mes Anterior</option>
                  <option value="last_30_days">Últimos 30 Días</option>
                  <option value="this_year">Este Año</option>
                  <option value="custom">Rango Personalizado</option>
                </select>
              </div>

              {dateFilterOption === "custom" && (
                <>
                  <div className="space-y-1 w-full sm:w-36">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Desde</span>
                    <Input
                      type="date"
                      className="h-9 bg-background"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1 w-full sm:w-36">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Hasta</span>
                    <Input
                      type="date"
                      className="h-9 bg-background"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="space-y-1 w-full sm:w-48">
                <span className="text-xs text-muted-foreground">
                  Buscar folio
                </span>
                <Input
                  className="h-9"
                  placeholder="Ej: FACT-0012"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
                onClick={handleDownloadPDF}
              >
                <FileDown className="h-4 w-4" />
                Descargar PDF (Folio)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 shrink-0 bg-stone-100 hover:bg-stone-200 border-stone-300 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:border-stone-700 dark:text-stone-200"
                onClick={handleDownloadPDFGrouped}
              >
                <FileDown className="h-4 w-4" />
                Descargar PDF (Prod/Serv)
              </Button>
            </div>
          </div>

          {/* Statement Table */}
          <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
            {filteredLines.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                No se encontraron movimientos con los filtros aplicados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">
                        <span className="flex items-center gap-1">
                          <ArrowUpDown className="h-3 w-3" /> Fecha
                        </span>
                      </TableHead>
                      <TableHead className="w-[100px]">Tipo</TableHead>
                      <TableHead className="w-[130px]">Folio</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right w-[120px]">
                        Cargo
                      </TableHead>
                      <TableHead className="text-right w-[120px]">
                        Abono
                      </TableHead>
                      <TableHead className="text-right w-[140px]">
                        Saldo Acum.
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLines.map((line, idx) => (
                      <TableRow
                        key={`${line.number}-${idx}`}
                        className="transition-colors hover:bg-muted/50"
                      >
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatDate(line.date)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider whitespace-nowrap ${TYPE_COLORS[line.type] || "bg-gray-100 text-gray-800"}`}
                          >
                            {TYPE_LABELS[line.type] || line.type}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-sm whitespace-nowrap">
                          {line.number}
                        </TableCell>
                        <TableCell className={`text-sm max-w-[300px] truncate ${line.description.includes('(Amortizado') ? 'text-green-600 dark:text-green-500 font-medium italic' : 'text-muted-foreground'}`}>
                          {line.description}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {line.cargo > 0 ? formatCurrency(line.cargo) : ""}
                        </TableCell>
                        <TableCell className="text-right font-medium text-secondary">
                          {line.abono > 0 ? formatCurrency(line.abono) : ""}
                        </TableCell>
                        <TableCell
                          className={`text-right font-bold ${
                            line.runningBalance > 0
                              ? "text-foreground"
                              : line.runningBalance < 0
                                ? "text-secondary"
                                : "text-muted-foreground"
                          }`}
                        >
                          {formatCurrency(line.runningBalance)}
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Totals row */}
                    <TableRow className="bg-muted/30 border-t-2 font-bold">
                      <TableCell
                        colSpan={4}
                        className="text-right text-sm uppercase tracking-wider"
                      >
                        Totales
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatCurrency(filteredSummary.totalCargos)}
                      </TableCell>
                      <TableCell className="text-right text-secondary">
                        {formatCurrency(filteredSummary.totalAbonos)}
                      </TableCell>
                      <TableCell className="text-right text-accent text-lg">
                        {formatCurrency(filteredSummary.saldoTotal)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Generation timestamp */}
          <p className="text-xs text-muted-foreground text-right">
            Generado el:{" "}
            {new Date(statement.generatedAt).toLocaleString("es-MX", {
              dateStyle: "long",
              timeStyle: "short",
            })}
          </p>
        </div>
      )}
    </div>
  );
}
