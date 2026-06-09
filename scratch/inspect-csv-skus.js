const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const downloadsDir = 'C:\\Users\\Elitebook 840 G11\\Downloads';
const targetSkus = ['E80358', 'B0DJHJ4HNF'];

function normalizeSku(sku) {
  return String(sku || '')
    .trim()
    .toLowerCase()
    .replace(/[\?\uFFFD]/g, 'n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const targetNorms = targetSkus.map(normalizeSku);

function checkCsv(file, isLatin1) {
  const filePath = path.join(downloadsDir, file);
  const buffer = fs.readFileSync(filePath);
  const decoder = new TextDecoder(isLatin1 ? 'iso-8859-1' : 'utf-8');
  const csvContent = decoder.decode(buffer);
  const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  
  parsed.data.forEach((row, index) => {
    // Check all fields for target SKUs
    for (const key in row) {
      const val = String(row[key] || '').trim();
      if (!val) continue;
      const valNorm = normalizeSku(val);
      if (targetNorms.includes(valNorm) || targetSkus.includes(val)) {
        console.log(`Found in file: ${file} | Line: ${index + 2} | Field: ${key} = "${val}"`);
        console.log(JSON.stringify(row, null, 2));
      }
    }
  });
}

const files = fs.readdirSync(downloadsDir);
files.forEach(file => {
  if (file.endsWith('.csv')) {
    try {
      checkCsv(file, true);
    } catch (e) {
      console.error(`Error reading ${file}:`, e);
    }
  }
});
