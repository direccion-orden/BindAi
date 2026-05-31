const fs = require('fs');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Pedidos (7).csv';

async function check() {
  const fileContent = fs.readFileSync(csvPath, { encoding: 'binary' });
  const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
  const parsed = Papa.parse(latin1Content, { header: true });
  
  const rows = parsed.data.filter(r => r.Pedido === '2519');
  console.log(`Found ${rows.length} rows for Pedido 2519:`);
  
  const uniqueGroups = {};
  rows.forEach((r, i) => {
    const key = `${r.Creacion} | ${r.Estatus}`;
    if (!uniqueGroups[key]) uniqueGroups[key] = 0;
    uniqueGroups[key]++;
  });
  
  console.log("\nUnique Date & Status Groups:");
  Object.keys(uniqueGroups).forEach(key => {
    console.log(`- ${key}: ${uniqueGroups[key]} rows`);
  });
  
  console.log("\nSample of rows:");
  rows.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. Estatus: ${r.Estatus} | Total: ${r.Total} | Creacion: ${r.Creacion} | SKU: ${r.Codigo}`);
  });
}

check();
