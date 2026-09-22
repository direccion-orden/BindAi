export interface CfdiParsedItem {
  lineKey: string;
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string; // NoIdentificacion or ClaveProdServ
  quantity: number;
  unitCost: number;
  amount: number;
  claveProdServ?: string;
  claveUnidad?: string;
  unidad?: string;
  accountId?: string;
  costCenterId?: string;
  locationId?: string;
}

export interface CfdiSummary {
  uuid: string;
  total: number;
  subtotal: number;
  date: string;
  emisorRfc: string;
  emisorName: string;
  folio: string;
  serie: string;
  items: CfdiParsedItem[];
}

export function decodeBase64ToUtf8(base64: string): string {
  if (!base64) return "";
  try {
    const cleanBase64 = base64.trim().replace(/\s/g, "");
    if (typeof window !== "undefined" && typeof atob === "function") {
      const binaryString = atob(cleanBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    } else if (typeof Buffer !== "undefined") {
      return Buffer.from(cleanBase64, "base64").toString("utf8");
    }
    return atob(cleanBase64);
  } catch (e) {
    try {
      if (typeof atob === "function") return atob(base64);
    } catch {}
    return "";
  }
}

function unescapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

export function parseCfdiItems(xmlOrBase64: string): CfdiParsedItem[] {
  if (!xmlOrBase64) return [];
  let xml = xmlOrBase64.trim();
  if (!xml.startsWith("<") && !xml.includes("<?xml")) {
    xml = decodeBase64ToUtf8(xml);
  }

  const cleanXml = xml.replace(/^\uFEFF/, "");
  const conceptoRegex = /<(?:\w+:)?Concepto\b([^>]+?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?Concepto>)/gi;
  const items: CfdiParsedItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = conceptoRegex.exec(cleanXml)) !== null) {
    const attrs = match[1];
    const getAttr = (name: string): string => {
      const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
      return m ? m[1] : "";
    };

    const cantidad = parseFloat(getAttr("Cantidad") || "1") || 1;
    const descripcion = getAttr("Descripcion") || "Concepto sin descripción";
    const valorUnitario = parseFloat(getAttr("ValorUnitario") || "0") || 0;
    const importe = parseFloat(getAttr("Importe") || "0") || (cantidad * valorUnitario);
    const noIdentificacion = getAttr("NoIdentificacion") || getAttr("ClaveProdServ") || "";
    const claveProdServ = getAttr("ClaveProdServ") || "";
    const claveUnidad = getAttr("ClaveUnidad") || "";
    const unidad = getAttr("Unidad") || "PZA";
    const lineKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

    items.push({
      lineKey,
      productId: "custom",
      variantId: lineKey,
      productName: unescapeXml(descripcion),
      variantTitle: unescapeXml(noIdentificacion),
      quantity: cantidad,
      unitCost: valorUnitario,
      amount: importe,
      claveProdServ,
      claveUnidad,
      unidad,
      accountId: "",
      costCenterId: "",
      locationId: ""
    });
  }

  return items;
}

export function parseCfdiSummary(xmlOrBase64: string): CfdiSummary | null {
  if (!xmlOrBase64) return null;
  let xml = xmlOrBase64.trim();
  if (!xml.startsWith("<") && !xml.includes("<?xml")) {
    xml = decodeBase64ToUtf8(xml);
  }

  const cleanXml = xml.replace(/^\uFEFF/, "");
  
  // UUID
  let uuid = "";
  const uuidMatch = cleanXml.match(/\bUUID="([^"]{36})"/i);
  if (uuidMatch) uuid = uuidMatch[1];

  // Comprobante
  const totalMatch = cleanXml.match(/\bTotal="([^"]+)"/i);
  const subtotalMatch = cleanXml.match(/\bSubTotal="([^"]+)"/i);
  const fechaMatch = cleanXml.match(/\bFecha="([^"]+)"/i);
  const folioMatch = cleanXml.match(/\bFolio="([^"]+)"/i);
  const serieMatch = cleanXml.match(/\bSerie="([^"]+)"/i);

  const total = totalMatch ? parseFloat(totalMatch[1]) : 0;
  const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1]) : total;
  const date = fechaMatch ? fechaMatch[1].split("T")[0] : "";
  const folio = folioMatch ? folioMatch[1] : "";
  const serie = serieMatch ? serieMatch[1] : "";

  // Emisor
  let emisorRfc = "Desconocido";
  let emisorName = "Desconocido";
  const emisorMatch = cleanXml.match(/<(?:\w+:)?Emisor\b([^>]+?)\/?>/i);
  if (emisorMatch) {
    const attrs = emisorMatch[1];
    const rfcM = attrs.match(/\bRfc="([^"]+)"/i);
    const nombreM = attrs.match(/\bNombre="([^"]+)"/i);
    if (rfcM) emisorRfc = unescapeXml(rfcM[1]);
    if (nombreM) emisorName = unescapeXml(nombreM[1]);
  }

  const items = parseCfdiItems(cleanXml);

  return {
    uuid,
    total,
    subtotal,
    date,
    emisorRfc,
    emisorName,
    folio,
    serie,
    items
  };
}
