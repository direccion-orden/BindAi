"use client";

import React, { useState } from "react";
import { collection, query as firestoreQuery, where, getDocs } from "firebase/firestore";
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
import { ErpClient } from "@/app/actions/erp";
import type { AccountStatement, AccountStatementLine } from "@/app/actions/erp";

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
  // Client search
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ErpClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<ErpClient | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Statement
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [docSearch, setDocSearch] = useState("");

  const handleSearch = async () => {
    if (!query) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/erp/clients?q=${encodeURIComponent(query)}`
      );
      const results = await res.json();
      setClients(results || []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectClient = async (client: ErpClient) => {
    setSelectedClient(client);
    setClients([]);
    setQuery("");
    setIsLoading(true);
    try {
      // Fetch anticipos from Firestore client-side
      const q = firestoreQuery(collection(db, "anticipos"), where("clientId", "==", client.id));
      const snapshot = await getDocs(q);
      const anticipos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // POST to API with anticipos data
      const res = await fetch('/api/erp/account-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          clientName: client.legalName,
          anticipos
        })
      });
      if (!res.ok) throw new Error("Error al obtener estado de cuenta");
      const data: AccountStatement = await res.json();
      setStatement(data);
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
      { label: "Total Cargos", value: formatCurrency(statement.summary.totalCargos), borderColor: TAUPE_MID, textColor: TAUPE_DARK },
      { label: "Total Abonos", value: formatCurrency(statement.summary.totalAbonos), borderColor: TAUPE_MID, textColor: TAUPE_DARK },
      { label: "Saldo Total", value: formatCurrency(statement.summary.saldoTotal), borderColor: ACCENT, textColor: ACCENT },
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
          doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
          if (i === 0) doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]); // date muted
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
    doc.text(`Saldo Total: ${formatCurrency(statement.summary.saldoTotal)}`, pageWidth - margin, y, { align: "right" });

    doc.save(`EdoCta_${statement.client.legalName.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Estado de Cuenta</h1>
        <p className="text-muted-foreground">
          Consulta el saldo consolidado de un cliente con información del ERP y anticipos locales.
        </p>
      </div>

      {/* Client Selector */}
      <div className="bg-card p-5 rounded-lg border shadow-sm space-y-3">
        <label className="text-sm font-medium">Buscar Cliente (ERP)</label>
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
                    {c.legalName}
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
                {formatCurrency(statement.summary.totalCargos)}
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
                {formatCurrency(statement.summary.totalAbonos)}
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
                  {formatCurrency(statement.summary.saldoTotal)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Cargos − Abonos
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
              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs text-muted-foreground">Desde</span>
                <Input
                  type="date"
                  className="h-9"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs text-muted-foreground">Hasta</span>
                <Input
                  type="date"
                  className="h-9"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
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
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={handleDownloadPDF}
            >
              <FileDown className="h-4 w-4" />
              Descargar PDF
            </Button>
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
                        <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
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
                        {formatCurrency(statement.summary.totalCargos)}
                      </TableCell>
                      <TableCell className="text-right text-secondary">
                        {formatCurrency(statement.summary.totalAbonos)}
                      </TableCell>
                      <TableCell className="text-right text-accent text-lg">
                        {formatCurrency(statement.summary.saldoTotal)}
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
