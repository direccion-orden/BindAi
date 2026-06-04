const fs = require('fs');
const xlsx = require('xlsx');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (4).csv';
const xlsPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (30).xls';
const outputPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas_Detalladas.csv';

function parseCSV(path) {
  const fileContent = fs.readFileSync(path, { encoding: 'binary' });
  const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
  const parsed = Papa.parse(latin1Content, { header: true, skipEmptyLines: true });
  return parsed.data;
}

function parseXLS(path) {
  const workbook = xlsx.readFile(path);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
}

// Parse number with thousands separator comma safely
function parseNumber(val) {
  if (val === undefined || val === null) return 0;
  return parseFloat(String(val).replace(/[^0-9.-]/g, "")) || 0;
}

// Clean and extract all possible numbers from string
function getCleanNumbers(numStr) {
  if (!numStr) return [];
  const cleaned = String(numStr).replace(/\s+/g, '').trim().toLowerCase();
  if (!cleaned) return [];
  
  // Pattern "12345(67890)"
  const parenMatch = cleaned.match(/^([^(]+)\(([^)]+)\)$/);
  if (parenMatch) {
    return [parenMatch[1], parenMatch[2]];
  }
  return [cleaned];
}

function mergeData() {
  console.log("=== INICIANDO COMBINACIÓN DE DATOS DE VENTAS ===");
  console.log(`Leyendo resumen desde: ${csvPath}`);
  const csvRows = parseCSV(csvPath);
  
  console.log(`Leyendo detalle desde: ${xlsPath}`);
  const xlsRows = parseXLS(xlsPath);
  
  console.log(`Resumen: ${csvRows.length} documentos.`);
  console.log(`Detalle: ${xlsRows.length} líneas de partidas.`);
  
  // 1. Build search maps for fast and flexible lookup
  const remisionMap = new Map();
  const facturaMap = new Map();
  
  csvRows.forEach(row => {
    const numRaw = row['Numero'];
    const docType = String(row['Documento'] || '').trim().toLowerCase();
    if (!numRaw) return;
    
    const nums = getCleanNumbers(numRaw);
    const targetMap = docType.includes('factur') ? facturaMap : remisionMap;
    
    nums.forEach(num => {
      targetMap.set(num, row);
    });
  });
  
  console.log(`Mapas de búsqueda creados: Remisiones=${remisionMap.size} llaves, Facturas=${facturaMap.size} llaves.`);
  
  // 2. Perform join and construct enriched lines
  const enrichedRows = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let skippedRows = 0;
  
  xlsRows.forEach((row, index) => {
    const noRaw = row['No.'] || row['No'];
    const docTypeRaw = row['Tipo'];
    
    if (!noRaw || !docTypeRaw) {
      skippedRows++;
      return; // Skip empty/header spacing rows
    }
    
    const docType = String(docTypeRaw).trim().toLowerCase();
    const primaryMap = docType.includes('factur') ? facturaMap : remisionMap;
    const secondaryMap = docType.includes('factur') ? remisionMap : facturaMap;
    
    const xlsNums = getCleanNumbers(noRaw);
    
    // Find matching document summary
    let matchedDoc = null;
    for (const num of xlsNums) {
      if (primaryMap.has(num)) {
        matchedDoc = primaryMap.get(num);
        break;
      }
    }
    
    // Fallback cross-map search
    if (!matchedDoc) {
      for (const num of xlsNums) {
        if (secondaryMap.has(num)) {
          matchedDoc = secondaryMap.get(num);
          break;
        }
      }
    }
    
    if (!matchedDoc) {
      unmatchedCount++;
      console.warn(`[ADVERTENCIA] Fila ${index + 2} no coincidió con ningún documento de resumen. No: ${noRaw}, Tipo: ${docTypeRaw}`);
      return;
    }
    
    matchedCount++;
    
    // Extract product details
    const productRaw = String(row['Producto/Concepto'] || row['Grupo'] || '').trim();
    // Match pattern: "Product Name (Cód: SKU_CODE)"
    const skuMatch = productRaw.match(/^(.+?)\s*\(Cód:\s*([^)]+?)\s*\)$/);
    
    let productName = productRaw;
    let sku = String(row['Código Prod/Serv'] || '').trim();
    
    if (skuMatch) {
      productName = skuMatch[1].trim();
      if (!sku) {
        sku = skuMatch[2].trim();
      }
    }
    
    const qty = parseNumber(row['Cantidad']);
    const subtotalLine = parseNumber(row['Subtotal']);
    const discountLine = parseNumber(row['Descuento']);
    
    // Calculate values before discount
    const unitPrice = qty > 0 ? (subtotalLine / qty) : 0;
    const discountPercentage = subtotalLine > 0 ? ((discountLine / subtotalLine) * 100) : 0;
    
    // Combine fields: all summary fields + product details
    const enrichedRow = {
      // Document Summary Header Fields
      Numero: matchedDoc['Numero'],
      Documento: matchedDoc['Documento'],
      Fecha: matchedDoc['Fecha'],
      Cliente: matchedDoc['Cliente'],
      PurchaseOrder: matchedDoc['PurchaseOrder'] || '',
      Sucursal: matchedDoc['Sucursal'] || '',
      Almacen: matchedDoc['Almacen'] || '',
      Total: matchedDoc['Total'],
      Pendiente: matchedDoc['Pendiente'],
      Estatus: matchedDoc['Estatus'],
      Subtotal: matchedDoc['Subtotal'],
      Impuestos: matchedDoc['Impuestos'],
      UUID: matchedDoc['UUID'] || '',
      TC: matchedDoc['TC'] || '1.000000',
      TotalOriginal: matchedDoc['TotalOriginal'] || matchedDoc['Total'],
      NC: matchedDoc['NC'] || '0.000000',
      Vencimiento: matchedDoc['Vencimiento'] || matchedDoc['Fecha'],
      NoClient: matchedDoc['NoClient'] || '',
      Vendedor: matchedDoc['Vendedor'] || '',
      Fuente: matchedDoc['Fuente'] || '',
      MetodoPago: matchedDoc['MetodoPago'] || 'PUE',
      
      // Detailed Product Partida Fields
      Producto_Nombre: productName,
      Producto_SKU: sku,
      Producto_Cantidad: qty,
      Producto_PrecioUnitario: unitPrice,
      Producto_DescuentoPorcentaje: discountPercentage
    };
    
    enrichedRows.push(enrichedRow);
  });
  
  console.log(`\n=== RESULTADOS DE LA FUSIÓN ===`);
  console.log(`- Líneas procesadas: ${xlsRows.length}`);
  console.log(`- Unidas con éxito:  ${matchedCount} (${((matchedCount / (xlsRows.length - skippedRows)) * 100).toFixed(2)}%)`);
  console.log(`- Sin coincidencia:  ${unmatchedCount}`);
  console.log(`- Líneas vacías:     ${skippedRows}`);
  
  if (enrichedRows.length === 0) {
    console.error("Error: No se generó ninguna fila combinada.");
    return;
  }
  
  // 3. Convert back to CSV using papaparse and save
  console.log(`\nGenerando archivo CSV combinado en: ${outputPath}`);
  const csvContent = Papa.unparse(enrichedRows);
  
  // Save with latin1 encoding to support Mexican accents and match portal parsing
  const bufferContent = Buffer.from(csvContent, 'utf-8').toString('latin1');
  fs.writeFileSync(outputPath, bufferContent, { encoding: 'binary' });
  
  console.log("¡Combinación completada con éxito!");
  console.log(`Se guardaron ${enrichedRows.length} registros detallados.`);
}

mergeData();
