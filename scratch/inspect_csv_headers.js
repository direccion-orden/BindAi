const fs = require('fs');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Pedidos (7).csv';

async function check() {
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found at " + csvPath);
    return;
  }
  const fileContent = fs.readFileSync(csvPath, { encoding: 'binary' });
  const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
  const parsed = Papa.parse(latin1Content, { header: true });
  
  console.log("Headers:", Object.keys(parsed.data[0]));
  console.log("First 10 rows:");
  parsed.data.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. Pedido: "${r.Pedido}" | Cliente: "${r.Cliente}" | Total: "${r.Total}" | Creacion: "${r.Creacion}"`);
  });

  // Search for any Pedido that contains "273" or "27"
  const matches = parsed.data.filter(r => String(r.Pedido).includes("27"));
  console.log(`\nFound ${matches.length} orders containing '27' in Pedido:`);
  matches.slice(0, 15).forEach((r, i) => {
    console.log(`- Pedido: "${r.Pedido}" | Cliente: "${r.Cliente}" | Total: "${r.Total}"`);
  });
}

check();
