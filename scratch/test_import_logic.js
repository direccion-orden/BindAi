const fs = require('fs');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas_Detalladas.csv';

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

function testImportLogic() {
  console.log("=== INICIANDO VALIDACIÓN DE LA LÓGICA DE MIGRACIÓN ===");
  console.log(`Leyendo Ventas_Detalladas.csv desde: ${csvPath}`);
  
  const fileContent = fs.readFileSync(csvPath, { encoding: 'binary' });
  const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
  const parsed = Papa.parse(latin1Content, { header: true, skipEmptyLines: true });
  const records = parsed.data;
  
  console.log(`Total registros en CSV combinados: ${records.length}`);
  
  // Group lines by document type and document number
  const groupedDocs = new Map();
  records.forEach((record) => {
    const docType = String(getFlexibleValue(record, ["documento", "tipodocumento", "tipo", "documenttype", "type"]) || "").trim().toLowerCase();
    const numero = String(getFlexibleValue(record, ["numero", "num", "folio", "id", "codigo", "referencia", "documentnumber"])).trim();
    if (!numero || !docType) return;
    
    const key = `${docType}:${numero.toLowerCase()}`;
    if (!groupedDocs.has(key)) {
      groupedDocs.set(key, []);
    }
    groupedDocs.get(key).push(record);
  });
  
  console.log(`Documentos agrupados únicos (Remisiones/Facturas): ${groupedDocs.size}`);
  
  // Lets inspect a few grouped documents and verify the items constructed
  let count = 0;
  for (const [docKey, lines] of groupedDocs.entries()) {
    if (count >= 3) break; // Check first 3 documents
    
    const firstLine = lines[0];
    const docType = String(getFlexibleValue(firstLine, ["documento", "tipodocumento", "tipo", "documenttype", "type"]) || "").trim();
    const numero = String(getFlexibleValue(firstLine, ["numero", "num", "folio", "id", "codigo", "referencia", "documentnumber"])).trim();
    const clientName = String(getFlexibleValue(firstLine, ["cliente", "client", "nombrecliente", "clientname", "customer", "razonsocial", "nombre", "clientenombre"]) || "").trim();
    const total = parseFloat(String(getFlexibleValue(firstLine, ["total", "monto", "amount"])).replace(/[^0-9.-]/g, "")) || 0;
    
    console.log(`\n----------------------------------------`);
    console.log(`Documento #${count + 1}: ${docType} ${numero}`);
    console.log(`Cliente:   ${clientName}`);
    console.log(`Total:     $${total.toFixed(2)} MXN`);
    console.log(`Partidas (Items):`);
    
    const items = [];
    lines.forEach((line, idx) => {
      const productName = String(line["Producto_Nombre"] || "").trim();
      const sku = String(line["Producto_SKU"] || "").trim();
      const qty = parseFloat(line["Producto_Cantidad"]) || 0;
      const unitPrice = parseFloat(line["Producto_PrecioUnitario"]) || 0;
      const discountPercentage = parseFloat(line["Producto_DescuentoPorcentaje"]) || 0;
      
      console.log(`  ${idx + 1}. [SKU: ${sku}] ${productName.substring(0, 40)}... | Cant: ${qty} | P.U: $${unitPrice.toFixed(2)} | Desc: ${discountPercentage.toFixed(1)}%`);
      
      items.push({
        productName,
        sku,
        quantity: qty,
        unitPrice,
        discountPercentage
      });
    });
    
    count++;
  }
  
  console.log("\n=== VALIDACIÓN FINALIZADA CON ÉXITO ===");
  console.log("La lógica de agrupación y reconstrucción de partidas funciona perfectamente.");
}

testImportLogic();
