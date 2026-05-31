const fs = require('fs');
const xlsx = require('xlsx');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (3).csv';
const xlsPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (29).xls';

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

// Clean and extract all possible numbers from string
function getCleanNumbers(numStr) {
  if (!numStr) return [];
  // Remove all spaces
  const cleaned = String(numStr).replace(/\s+/g, '').trim().toLowerCase();
  if (!cleaned) return [];
  
  // Pattern "12345(67890)"
  const parenMatch = cleaned.match(/^([^(]+)\(([^)]+)\)$/);
  if (parenMatch) {
    return [parenMatch[1], parenMatch[2]];
  }
  return [cleaned];
}

function runMatch() {
  console.log("Loading files...");
  const csvRows = parseCSV(csvPath);
  const xlsRows = parseXLS(xlsPath);
  
  console.log(`Loaded ${csvRows.length} documents from CSV summary.`);
  console.log(`Loaded ${xlsRows.length} product lines from XLS detailed report.`);
  
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
  
  console.log(`\nBuilt search maps: Remisión keys=${remisionMap.size}, Factura keys=${facturaMap.size}.`);
  
  // Perform match for each XLS row
  let matchedCount = 0;
  let unmatchedCount = 0;
  let skippedRows = 0;
  
  const unmatchedSample = [];
  
  xlsRows.forEach((row, index) => {
    const noRaw = row['No.'] || row['No'];
    const docTypeRaw = row['Tipo'];
    
    if (!noRaw || !docTypeRaw) {
      skippedRows++;
      return; // Skip empty rows
    }
    
    const docType = String(docTypeRaw).trim().toLowerCase();
    const primaryMap = docType.includes('factur') ? facturaMap : remisionMap;
    const secondaryMap = docType.includes('factur') ? remisionMap : facturaMap;
    
    const xlsNums = getCleanNumbers(noRaw);
    
    // Check if any of the numbers exist in the primary map
    let matchFound = false;
    let matchedDoc = null;
    
    for (const num of xlsNums) {
      if (primaryMap.has(num)) {
        matchFound = true;
        matchedDoc = primaryMap.get(num);
        break;
      }
    }
    
    // Fallback: check secondary map
    if (!matchFound) {
      for (const num of xlsNums) {
        if (secondaryMap.has(num)) {
          matchFound = true;
          matchedDoc = secondaryMap.get(num);
          break;
        }
      }
    }
    
    if (matchFound) {
      matchedCount++;
    } else {
      unmatchedCount++;
      if (unmatchedSample.length < 10) {
        unmatchedSample.push({ index, noRaw, docTypeRaw, client: row['Cliente'], product: row['Producto/Concepto'] });
      }
    }
  });
  
  console.log(`\nMatch Results with Cross-Map Fallback:`);
  console.log(`- Total XLS lines processed: ${xlsRows.length}`);
  console.log(`- Matched successfully:      ${matchedCount} (${((matchedCount / (xlsRows.length - skippedRows)) * 100).toFixed(2)}%)`);
  console.log(`- Unmatched:                 ${unmatchedCount}`);
  console.log(`- Skipped (empty rows):      ${skippedRows}`);
  
  if (unmatchedCount > 0) {
    console.log("\nStill Unmatched Samples:");
    unmatchedSample.forEach(s => {
      console.log(`  - Row ${s.index + 2}: No="${s.noRaw}", Tipo="${s.docTypeRaw}", Cliente="${s.client}", Producto="${s.product}"`);
    });
  }
}

runMatch();
