const xlsx = require('xlsx');

const filePath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\FLUJO EFECTIVO MENSUAL 2025.xlsx';

try {
  const workbook = xlsx.readFile(filePath);
  
  console.log("=== Sheets ===");
  console.log(workbook.SheetNames);
  
  for (const sheetName of workbook.SheetNames) {
      console.log(`\n=== Structure of Sheet: ${sheetName} ===`);
      const sheet = workbook.Sheets[sheetName];
      // Convert to JSON, getting the first 50 rows
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      console.log(`Total Rows: ${data.length}`);
      console.log("First 15 Rows:");
      for (let i = 0; i < Math.min(15, data.length); i++) {
         console.log(JSON.stringify(data[i]));
      }
  }

} catch (err) {
  console.error("Error reading file:", err.message);
}
