const fs = require('fs');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ingresos (1).csv';

function inspectIngresos() {
  console.log("=== ANALIZANDO INGRESOS (1).CSV ===");
  const fileContent = fs.readFileSync(csvPath, { encoding: 'binary' });
  const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
  const parsed = Papa.parse(latin1Content, { header: true, skipEmptyLines: true });
  const records = parsed.data;
  
  console.log(`Total registros de ingresos: ${records.length}`);
  
  const formats = new Map();
  let emptyCount = 0;
  let multipleCount = 0;
  
  records.forEach((row, idx) => {
    const factText = String(row['Facturas'] || '').trim();
    if (!factText) {
      emptyCount++;
      return;
    }
    
    // Check if it has multiple documents (e.g. separated by comma or semicolon)
    if (factText.includes(',') || factText.includes(';') || factText.includes('&') || factText.split(/\s+/).filter(x => x.startsWith('F-')).length > 1) {
      multipleCount++;
    }
    
    // Categorize format pattern
    let pattern = 'otro';
    if (/^F-\s*\d+$/.test(factText)) {
      pattern = 'F- [numero]';
    } else if (/^F-\s*\d+\s*\/\s*F-\s*\d+/.test(factText)) {
      pattern = 'múltiples F-';
    } else if (/^\d+$/.test(factText)) {
      pattern = 'solo dígitos';
    }
    
    formats.set(pattern, (formats.get(pattern) || 0) + 1);
  });
  
  console.log(`\nResumen de formatos en columna 'Facturas':`);
  console.log(`- Celdas vacías (posibles anticipos o cobros sin asignar): ${emptyCount}`);
  console.log(`- Celdas con múltiples folios vinculados: ${multipleCount}`);
  
  formats.forEach((val, key) => {
    console.log(`- Formato "${key}": ${val} registros`);
  });
  
  console.log("\nMuestra de registros vacíos (primeros 5):");
  const emptySamples = records.filter(r => !String(r['Facturas'] || '').trim()).slice(0, 5);
  emptySamples.forEach(r => {
    console.log(`  - Cliente: "${r['Cliente']}", Total: $${r['Total']}, Referencia: "${r['Referencia']}", Comment: "${r['Comment'] || ''}"`);
  });

  console.log("\nMuestra de registros con múltiples folios (primeros 5):");
  const multSamples = records.filter(r => {
    const factText = String(r['Facturas'] || '').trim();
    return factText.includes(',') || factText.includes(';') || factText.split(/\s+/).filter(x => x.startsWith('F-')).length > 1;
  }).slice(0, 5);
  multSamples.forEach(r => {
    console.log(`  - Facturas: "${r['Facturas']}", Cliente: "${r['Cliente']}", Total: $${r['Total']}`);
  });
  
  console.log("\nMuestra de formatos especiales o no estándar (primeros 5):");
  const specialSamples = records.filter(r => {
    const factText = String(r['Facturas'] || '').trim();
    return factText && !/^F-\s*\d+$/.test(factText) && !factText.includes(',') && !factText.includes(';');
  }).slice(0, 5);
  specialSamples.forEach(r => {
    console.log(`  - Facturas: "${r['Facturas']}", Cliente: "${r['Cliente']}", Total: $${r['Total']}`);
  });
}

inspectIngresos();
