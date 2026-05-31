const fs = require('fs');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Pedidos (7).csv';

// Helpers copied from Next.js importar/page.tsx
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

async function testParse() {
  try {
    const fileContent = fs.readFileSync(csvPath, { encoding: 'binary' }); // Read raw binary
    // Convert to ISO-8859-1 representation
    const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
    
    console.log("Analyzing CSV File...");
    console.log("File path:", csvPath);
    console.log("File size:", fs.statSync(csvPath).size, "bytes\n");

    const parsed = Papa.parse(latin1Content, {
      header: true,
      skipEmptyLines: true
    });

    if (parsed.errors && parsed.errors.length > 0) {
      console.log("Parsing Warnings/Errors found by PapaParse:");
      parsed.errors.forEach(e => console.log(`- Line ${e.row}: ${e.message}`));
      console.log("");
    } else {
      console.log("✓ No CSV structural errors found by PapaParse.\n");
    }

    const records = parsed.data;
    if (records.length === 0) {
      console.log("Error: CSV is empty.");
      return;
    }

    const headers = Object.keys(records[0]);
    console.log("Headers detected:", headers.join(", "));
    
    // Check if critical columns are matched
    const testNum = getFlexibleValue(records[0], ["numero", "num", "folio", "pedido", "id", "codigo", "referencia", "ordernumber", "order", "numerodepedido", "foliodepedido"]);
    const testClient = getFlexibleValue(records[0], ["cliente", "client", "nombrecliente", "clientname", "customer", "razonsocial", "nombre", "clientenombre"]);
    const testStatus = getFlexibleValue(records[0], ["estatus", "status", "estado", "situacion", "estatuspedido", "statuspedido"]);
    const testTotal = getFlexibleValue(records[0], ["total", "monto", "amount", "importetotal", "importe", "totalamount"]);
    const testDate = getFlexibleValue(records[0], ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]);
    const testUser = getFlexibleValue(records[0], ["empleado", "vendedor", "vendedorasignado", "agent", "salesagent", "user", "usuario", "creadoby", "creadopor"]);

    console.log("\nFlex Mappings Verification:");
    console.log(`- Pedido Number: ${testNum ? `Matched ("${testNum}")` : "❌ FAILED"}`);
    console.log(`- Client Name: ${testClient ? `Matched ("${testClient}")` : "❌ FAILED"}`);
    console.log(`- Status: ${testStatus ? `Matched ("${testStatus}")` : "❌ FAILED"}`);
    console.log(`- Total Amount: ${testTotal ? `Matched ("${testTotal}")` : "❌ FAILED"}`);
    console.log(`- Creation Date: ${testDate ? `Matched ("${testDate}")` : "❌ FAILED"}`);
    console.log(`- Vendor/User: ${testUser ? `Matched ("${testUser}")` : "❌ FAILED"}`);

    // Grouping / Deduplication analysis
    const groupedPedidos = new Map();
    records.forEach((record, index) => {
      const num = String(getFlexibleValue(record, ["numero", "num", "folio", "pedido", "id", "codigo", "referencia", "ordernumber", "order", "numerodepedido", "foliodepedido"])).trim();
      if (!num) {
        console.log(`Warning: Row ${index + 2} has no valid Pedido ID.`);
        return;
      }
      if (!groupedPedidos.has(num)) {
        groupedPedidos.set(num, []);
      }
      groupedPedidos.get(num).push(record);
    });

    console.log(`\nDeduplication Summary:`);
    console.log(`- Total CSV rows analyzed: ${records.length}`);
    console.log(`- Unique Pedidos detected: ${groupedPedidos.size}`);

    // Sample details of first 3 unique pedidos
    console.log(`\nSample of the first unique orders to be imported:`);
    let sampleCount = 0;
    for (const [numero, rows] of groupedPedidos.entries()) {
      if (sampleCount >= 3) break;
      
      // Sort to find latest status just like next.js importer
      rows.sort((a, b) => {
        const dateA = String(getFlexibleValue(a, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
        const dateB = String(getFlexibleValue(b, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]));
        return parseDateStr(dateA).getTime() - parseDateStr(dateB).getTime();
      });
      const latestRecord = rows[rows.length - 1];

      const clientName = String(getFlexibleValue(latestRecord, ["cliente", "client", "nombrecliente", "clientname", "customer", "razonsocial", "nombre", "clientenombre"]) || "").trim();
      const bindStatus = String(getFlexibleValue(latestRecord, ["estatus", "status", "estado", "situacion", "estatuspedido", "statuspedido"]) || "").trim();
      const totalAmountVal = getFlexibleValue(latestRecord, ["total", "monto", "amount", "importetotal", "importe", "totalamount"]);
      const totalAmount = parseFloat(String(totalAmountVal).replace(/[^0-9.-]/g, "")) || 0;
      const creationDateStr = String(getFlexibleValue(latestRecord, ["creacion", "fecha", "date", "createdat", "created", "fechacreacion", "fechadecreacion"]) || "");
      const vendorName = String(getFlexibleValue(latestRecord, ["empleado", "vendedor", "vendedorasignado", "agent", "salesagent", "user", "usuario", "creadoby", "creadopor"]) || "").trim();

      let mappedStatus = "por_surtir";
      const statusLower = bindStatus.toLowerCase();
      if (statusLower.includes("cancelado")) {
        mappedStatus = "cancelado";
      } else if (statusLower.includes("surtido") || statusLower.includes("listo")) {
        mappedStatus = "surtido";
      } else if (statusLower.includes("remisionado") || statusLower.includes("terminado")) {
        mappedStatus = "remisionado";
      }

      console.log(`\n→ Pedido #${numero}:`);
      console.log(`  - Cliente: "${clientName}"`);
      console.log(`  - Estatus original: "${bindStatus}" (Se mapeará a: "${mappedStatus}")`);
      console.log(`  - Fecha Creación: "${creationDateStr}" (Parsea a: ${parseDateStr(creationDateStr).toLocaleDateString()})`);
      console.log(`  - Total: $${totalAmount.toFixed(2)} MXN`);
      console.log(`  - Vendedor: "${vendorName}"`);
      console.log(`  - Filas duplicadas asociadas: ${rows.length}`);

      sampleCount++;
    }

  } catch (error) {
    console.error("Error during CSV parsing test:", error);
  }
}

testParse();
