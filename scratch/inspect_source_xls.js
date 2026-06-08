const fs = require('fs');
const xlsx = require('xlsx');

const xlsPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (30).xls';
const targetNum = "35818";

function run() {
  if (!fs.existsSync(xlsPath)) {
    console.error("XLS file not found at " + xlsPath);
    return;
  }
  
  console.log("Reading workbook...");
  const workbook = xlsx.readFile(xlsPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet);
  
  console.log(`Total rows in XLS: ${rows.length}`);
  
  rows.forEach((row, idx) => {
    const noRaw = String(row['No.'] || row['No'] || '').trim();
    if (noRaw === targetNum) {
      console.log(`\nRow ${idx + 2} in XLS:`);
      console.log(`  Grupo: ${row['Grupo']}`);
      console.log(`  Cantidad: ${row['Cantidad']}`);
      console.log(`  Subtotal: ${row['Subtotal']}`);
      console.log(`  Descuento: ${row['Descuento']}`);
      console.log(`  Total: ${row['Total']}`);
      console.log(`  Costo: ${row['Costo']}`);
    }
  });
}

run();
