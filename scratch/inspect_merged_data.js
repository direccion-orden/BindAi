const fs = require('fs');
const xlsx = require('xlsx');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (4).csv';
const xlsPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (30).xls';

function parseCSV(path) {
  const fileContent = fs.readFileSync(path, { encoding: 'binary' });
  const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
  const parsed = Papa.parse(latin1Content, { header: true, skipEmptyLines: true });
  return parsed.data;
}

function run() {
  const csvRows = parseCSV(csvPath);
  const workbook = xlsx.readFile(xlsPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const xlsRows = xlsx.utils.sheet_to_json(sheet);

  console.log("=== REMISSION 35818 IN CSV ===");
  const csvMatches = csvRows.filter(r => String(r['Numero'] || '').trim().includes('35818'));
  console.log(csvMatches);

  console.log("\n=== ITEMS FOR REMISSION 35818 IN XLS ===");
  xlsRows.forEach((row, idx) => {
    const noRaw = String(row['No.'] || row['No'] || '').trim();
    if (noRaw.includes('35818')) {
      console.log(`Row ${idx + 2}:`);
      console.log(`  Grupo: "${row['Grupo']}"`);
      console.log(`  Subtotal: "${row['Subtotal']}" (type: ${typeof row['Subtotal']})`);
      console.log(`  Cantidad: "${row['Cantidad']}" (type: ${typeof row['Cantidad']})`);
      console.log(`  Descuento: "${row['Descuento']}"`);
    }
  });
}

run();
