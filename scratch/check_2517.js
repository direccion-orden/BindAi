const fs = require('fs');
const Papa = require('papaparse');

const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Pedidos (7).csv';

async function check() {
  const fileContent = fs.readFileSync(csvPath, { encoding: 'binary' });
  const latin1Content = Buffer.from(fileContent, 'binary').toString('latin1');
  const parsed = Papa.parse(latin1Content, { header: true });
  
  const rows = parsed.data.filter(r => r.Pedido === '2517' && r.Estatus === 'Surtido');
  console.log(`Found ${rows.length} rows for Pedido 2517 with Estatus 'Surtido':`);
  
  rows.forEach((r, i) => {
    console.log(`${i+1}. SKU: ${r.Codigo} | Cant: ${r.Cantidad} | Precio: ${r.Precio} | Total: ${r.Total} | Creacion: ${r.Creacion}`);
  });
}

check();
