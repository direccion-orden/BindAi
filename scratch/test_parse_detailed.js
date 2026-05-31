const fs = require('fs');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Pedidos (7).csv';

const normalizeKey = (key) => {
  return String(key || "")
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
};

const getFlexibleValue = (record, possibleKeys, defaultValue = "") => {
  if (!record) return defaultValue;
  const targetKeys = possibleKeys.map(k => normalizeKey(k));
  const recordKeys = Object.keys(record);
  for (const key of recordKeys) {
    const normalizedRecordKey = normalizeKey(key);
    if (targetKeys.includes(normalizedRecordKey)) {
      return record[key];
    }
  }
  return defaultValue;
};

const parseDateStr = (str) => {
  if (!str) return new Date(0);
  const parts = String(str).trim().split(" ");
  const dateStr = parts[0];
  const separator = dateStr.includes("/") ? "/" : "-";
  const dateParts = dateStr.split(separator);
  if (dateParts.length === 3) {
    const part1 = parseInt(dateParts[0]);
    const part2 = parseInt(dateParts[1]);
    const part3 = parseInt(dateParts[2]);
    if (dateParts[0].length === 4) {
      return new Date(part1, part2 - 1, part3);
    } else {
      return new Date(part3, part2 - 1, part1);
    }
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

async function testDetailed() {
  try {
    const fileContent = fs.readFileSync(csvPath, { encoding: 'binary' });
    const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
    const parsed = Papa.parse(latin1Content, { header: true, skipEmptyLines: true });
    const records = parsed.data;

    // Group all CSV rows by their Pedido ID
    const grouped = new Map();
    records.forEach((record) => {
      const num = String(getFlexibleValue(record, ["numero", "num", "folio", "pedido", "id", "codigo", "referencia", "ordernumber", "order", "numerodepedido", "foliodepedido"])).trim();
      if (!num) return;
      if (!grouped.has(num)) {
        grouped.set(num, []);
      }
      grouped.get(num).push(record);
    });

    console.log(`Analyzing Detailed Item Mapping for Order #2517...\n`);
    const numero = "2517";
    const rows = grouped.get(numero);

    if (!rows) {
      console.log("Order 2517 not found.");
      return;
    }

    console.log(`Total rows in CSV for Pedido 2517: ${rows.length}`);

    // Sort to find latest update
    rows.sort((a, b) => {
      const dateA = String(getFlexibleValue(a, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
      const dateB = String(getFlexibleValue(b, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
      return parseDateStr(dateA).getTime() - parseDateStr(dateB).getTime();
    });

    const latestRecord = rows[rows.length - 1];
    const latestDateStr = String(getFlexibleValue(latestRecord, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
    const latestStatus = String(getFlexibleValue(latestRecord, ["estatus", "status", "estado", "situacion", "estatuspedido", "statuspedido"]));

    console.log(`Latest state detected for Pedido 2517:`);
    console.log(`- Date: ${latestDateStr}`);
    console.log(`- Status: ${latestStatus}`);

    // Filter rows belonging to this latest active state
    const activeLines = rows.filter(row => {
      const rowDate = String(getFlexibleValue(row, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
      const rowStatus = String(getFlexibleValue(row, ["estatus", "status", "estado", "situacion", "estatuspedido", "statuspedido"]));
      return rowDate === latestDateStr && rowStatus === latestStatus;
    });

    console.log(`\nFiltered active lines: ${activeLines.length}`);

    let sumSubtotal = 0;
    console.log("\nItems Preview:");
    activeLines.forEach((line, idx) => {
      const sku = String(getFlexibleValue(line, ["codigo", "code", "sku", "barcode", "upc"]) || "").trim();
      const desc = String(getFlexibleValue(line, ["producto", "product", "articulo", "concepto", "descripcion", "description", "item"]) || "Concepto General").trim();
      const qty = parseFloat(String(getFlexibleValue(line, ["cantidad", "quantity", "cant"])).replace(/[^0-9.-]/g, "")) || 1;
      const price = parseFloat(String(getFlexibleValue(line, ["precio", "unitprice", "preciounitario", "rate"])).replace(/[^0-9.-]/g, "")) || 0;
      
      const lineSubtotal = qty * price;
      sumSubtotal += lineSubtotal;
      console.log(`  ${idx + 1}. [SKU: ${sku}] ${desc.substring(0, 45)}... | Cant: ${qty} | UnitPrice: $${price.toFixed(2)} | Subtotal: $${lineSubtotal.toFixed(2)}`);
    });

    const orderTotal = parseFloat(String(getFlexibleValue(latestRecord, ["total", "monto", "amount", "importetotal", "importe", "totalamount"])).replace(/[^0-9.-]/g, "")) || 0;
    const expectedSubtotal = orderTotal / 1.16;

    console.log(`\nCalculated Summary:`);
    console.log(`- Sum of Line Subtotals (Excl. Tax): $${sumSubtotal.toFixed(4)} MXN`);
    console.log(`- Sum * 1.16 (Calculated Total):     $${(sumSubtotal * 1.16).toFixed(4)} MXN`);
    console.log(`- Order Total from CSV (Incl. Tax):  $${orderTotal.toFixed(4)} MXN`);
    console.log(`- Expected Subtotal (Total / 1.16):  $${expectedSubtotal.toFixed(4)} MXN`);
    console.log(`- Difference:                         $${Math.abs(sumSubtotal - expectedSubtotal).toFixed(4)} MXN`);

  } catch (err) {
    console.error(err);
  }
}

testDetailed();
