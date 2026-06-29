import { jsPDF } from "jspdf";

interface ErpClient {
  id: string;
  name: string;
}

interface AccountStatementLine {
  date: string;
  type: string;
  number: string;
  description: string;
  cargo: number;
  abono: number;
  runningBalance: number;
}

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

const TYPE_LABELS: Record<string, string> = {
  Order: "Pedido",
  Remission: "Remisión",
  Invoice: "Factura",
  Payment: "Pago",
  Anticipo: "Anticipo",
};

export async function generateClientStatementPDFAndUpload(
  companyId: string,
  client: ErpClient,
  adminDb: any,
  admin: any
): Promise<string> {
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

  // 1. Fetch all financial entities from Firestore
  const [pedidosSnap, remisionesSnap, facturasSnap, paymentsSnap, anticiposSnap] = await Promise.all([
    adminDb.collection("companies").doc(companyId).collection("pedidos").where("clientId", "==", client.id).get(),
    adminDb.collection("companies").doc(companyId).collection("remisiones").where("clientId", "==", client.id).get(),
    adminDb.collection("companies").doc(companyId).collection("facturas").where("clientId", "==", client.id).get(),
    adminDb.collection("companies").doc(companyId).collection("payments").where("clientId", "==", client.id).get(),
    adminDb.collection("companies").doc(companyId).collection("anticipos").where("clientId", "==", client.id).get()
  ]);

  const lines: AccountStatementLine[] = [];

  // Consolidate Orders (Pedidos)
  pedidosSnap.docs.forEach((docSnap: any) => {
    const d = docSnap.data();
    const status = String(d.status || "").trim().toLowerCase();
    if (status !== "cancelado" && status !== "cancelada" && status !== "surtido" && status !== "remisionado" && status !== "completado") {
      lines.push({
        date: extractDate(d.createdAt),
        type: "Order",
        number: d.orderNumber || d.number || `PED-${docSnap.id.substring(0, 6)}`,
        description: "Pedido de Venta (Pendiente)",
        cargo: parseFloat(d.totalAmount) || d.totalAmount || 0,
        abono: 0,
        runningBalance: 0
      });
    }
  });

  // Consolidate Remissions (Remisiones)
  remisionesSnap.docs.forEach((docSnap: any) => {
    const d = docSnap.data();
    const status = String(d.status || "").trim().toLowerCase();
    if (status !== "cancelada" && status !== "cancelado" && status !== "facturada") {
      lines.push({
        date: extractDate(d.createdAt),
        type: "Remission",
        number: d.remissionNumber || d.number || `REM-${docSnap.id.substring(0, 6)}`,
        description: "Remisión de Mercancía (Pendiente de Factura)",
        cargo: parseFloat(d.totalAmount) || d.totalAmount || 0,
        abono: 0,
        runningBalance: 0
      });
    }
  });

  // Consolidate Invoices (Facturas)
  facturasSnap.docs.forEach((docSnap: any) => {
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
        runningBalance: 0
      });
    }
  });

  // Consolidate Payments (Pagos Directos)
  paymentsSnap.docs.forEach((docSnap: any) => {
    const d = docSnap.data();
    const amt = parseFloat(d.amount) || 0;
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

  // Consolidate Anticipos
  anticiposSnap.docs.forEach((docSnap: any) => {
    const ant = docSnap.data();
    const folio = ant.folio ? `ANT-${String(ant.folio).padStart(4, "0")}` : `ANT-${docSnap.id?.substring(0, 5).toUpperCase()}`;
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
  });

  // Sort by date ASC
  lines.sort((a, b) => {
    const da = a.date || "0000-00-00";
    const db2 = b.date || "0000-00-00";
    return da.localeCompare(db2);
  });

  // Compute runningBalance and totals
  let totalCargos = 0;
  let totalAbonos = 0;
  let runningBalance = 0;

  for (const line of lines) {
    totalCargos += line.cargo;
    totalAbonos += line.abono;
    runningBalance += line.abono - line.cargo;
    line.runningBalance = runningBalance;
  }

  const saldoTotal = totalAbonos - totalCargos;

  // 2. Generate PDF using jsPDF
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  const TAUPE_DARK = [56, 52, 50];
  const TAUPE_MID = [120, 113, 108];
  const TAUPE_LIGHT = [210, 206, 201];
  const TAUPE_BG = [243, 241, 238];
  const ACCENT = [122, 107, 140];

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 14;

  // Title header
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
  doc.text("Estado de Cuenta", margin, y + 4);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.text("BIND AI", pageWidth - margin, y + 4, { align: "right" });
  y += 10;

  // Divider line
  doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
  doc.text(`Cliente: ${client.name}`, margin, y);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })}`,
    pageWidth - margin,
    y,
    { align: "right" }
  );
  y += 8;

  // Summary boxes
  const boxW = (pageWidth - margin * 2 - 10) / 3;
  const boxH = 14;
  const summaryData = [
    { label: "Total Cargos", value: formatCurrency(totalCargos), borderColor: TAUPE_MID, textColor: TAUPE_DARK },
    { label: "Total Abonos", value: formatCurrency(totalAbonos), borderColor: TAUPE_MID, textColor: TAUPE_DARK },
    { label: "Saldo Total", value: formatCurrency(saldoTotal), borderColor: ACCENT, textColor: ACCENT },
  ];

  summaryData.forEach((item, i) => {
    const x = margin + i * (boxW + 5);
    doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "F");
    doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "S");
    doc.setFontSize(7);
    doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
    doc.setFont("helvetica", "normal");
    doc.text(item.label, x + 4, y + 5);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(item.textColor[0], item.textColor[1], item.textColor[2]);
    doc.text(item.value, x + 4, y + 11);
  });
  y += boxH + 6;

  // Table header
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

  // Rows
  const maxY = doc.internal.pageSize.getHeight() - 16;

  for (let rowIdx = 0; rowIdx < lines.length; rowIdx++) {
    const line = lines[rowIdx];

    if (y > maxY) {
      doc.addPage();
      y = 14;
      renderTableHeader(y);
      y += 7;
    }

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
        if (i === 4 && line.cargo > 0) doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
        else if (i === 5 && line.abono > 0) doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
        else if (i === 6) doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        else doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
        doc.text(text, cx + colWidths[i] - 2, y + 4.5, { align: "right" });
      } else {
        doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
        doc.text(text, cx, y + 4.5);
      }
      cx += colWidths[i];
    });

    y += 6;
  }

  // 3. Upload to Firebase Storage
  const pdfArrayBuffer = doc.output("arraybuffer");
  const pdfBuffer = Buffer.from(pdfArrayBuffer);
  
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const app = admin.apps.find((a: any) => a?.name === '[DEFAULT]') || admin.apps[0];
  
  if (!bucketName || !app) {
    throw new Error("Storage bucket not initialized");
  }

  const bucket = admin.storage(app).bucket(bucketName);
  const fileName = `companies/${companyId}/statements/${client.id}_statement_${Date.now()}.pdf`;
  const file = bucket.file(fileName);

  await file.save(pdfBuffer, {
    metadata: { contentType: "application/pdf" }
  });

  // Generate public signed URL
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days expiry
  });

  return url;
}
