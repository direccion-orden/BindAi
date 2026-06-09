const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const downloadsDir = 'C:\\Users\\Elitebook 840 G11\\Downloads';

function run() {
  const files = fs.readdirSync(downloadsDir);
  const sucursales = new Set();
  
  console.log("Analyzing CSV files in Downloads for 'Sucursal' values...");

  files.forEach(file => {
    if ((file.startsWith('Ventas') || file.startsWith('Pedidos')) && file.endsWith('.csv')) {
      const filePath = path.join(downloadsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      const records = parsed.data;
      if (records.length === 0) return;
      
      const firstRecord = records[0];
      const sucursalKey = Object.keys(firstRecord).find(k => k.toLowerCase().trim() === 'sucursal');
      if (!sucursalKey) return;
      
      records.forEach(r => {
        const val = r[sucursalKey];
        if (val) {
          sucursales.add(val.trim());
        }
      });
      console.log(`- File: ${file} | Sample size: ${records.length} | Sucursal column found: ${sucursalKey}`);
    }
  });

  console.log("\n=== UNIQUE SUCURSAL VALUES FOUND ===");
  console.log(Array.from(sucursales));
}

run();
