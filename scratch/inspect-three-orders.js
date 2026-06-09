const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const downloadsDir = 'C:\\Users\\Elitebook 840 G11\\Downloads';
const targetOrders = ['2778', '2779', '2780'];

function run() {
  const files = fs.readdirSync(downloadsDir);
  
  console.log(`Searching for orders: ${targetOrders.join(', ')}...`);

  files.forEach(file => {
    if (file.startsWith('Pedidos') && file.endsWith('.csv')) {
      const filePath = path.join(downloadsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      const records = parsed.data;
      if (records.length === 0) return;
      
      const firstRecord = records[0];
      const pedidoKey = Object.keys(firstRecord).find(k => k.toLowerCase().trim() === 'pedido');
      const sucursalKey = Object.keys(firstRecord).find(k => k.toLowerCase().trim() === 'sucursal');
      
      if (!pedidoKey || !sucursalKey) return;
      
      records.forEach(row => {
        const folio = String(row[pedidoKey]).trim();
        if (targetOrders.includes(folio)) {
          console.log(`File: ${file} | Order: ${folio} | Sucursal: ${row[sucursalKey]} | Client: ${row['Cliente']}`);
        }
      });
    }
  });
}

run();
