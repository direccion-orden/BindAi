const xlsx = require('xlsx');

const xlsPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Ventas (29).xls';

try {
  const workbook = xlsx.readFile(xlsPath);
  const sheetName = workbook.SheetNames[0];
  console.log(`Reading Sheet: ${sheetName}`);
  
  const sheet = workbook.Sheets[sheetName];
  // Parse sheet into JSON array of objects
  const data = xlsx.utils.sheet_to_json(sheet);
  
  console.log(`Total Rows in XLS: ${data.length}`);
  console.log("\nFirst 10 Rows keys:");
  if (data.length > 0) {
    console.log(Object.keys(data[0]));
  }
  
  console.log("\nFirst 10 Rows Preview:");
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    console.log(`Row ${i + 1}:`);
    console.log(`  No.: ${row['No.'] || row['No']}`);
    console.log(`  Tipo: ${row['Tipo']}`);
    console.log(`  Estatus: ${row['Estatus']}`);
    console.log(`  Cliente: ${row['Cliente']}`);
    console.log(`  Producto: ${row['Producto/Concepto']}`);
    console.log(`  Cantidad: ${row['Cantidad']}`);
    console.log(`  Subtotal: ${row['Subtotal']}`);
    console.log(`  Total: ${row['Total']}`);
  }
  
  // Find a Factura to see how document numbers are formatted
  const facturas = data.filter(r => String(r['Tipo']).toLowerCase().includes('factur'));
  console.log(`\nFound ${facturas.length} Facturas in XLS.`);
  console.log("Sample Facturas document numbers (No.):");
  for (let i = 0; i < Math.min(5, facturas.length); i++) {
    console.log(`  - No.: ${facturas[i]['No.']}, Cliente: ${facturas[i]['Cliente']}, Producto: ${facturas[i]['Producto/Concepto']}`);
  }

} catch (err) {
  console.error("Error:", err);
}
