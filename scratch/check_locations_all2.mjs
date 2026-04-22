import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
let key = '';
for (const line of env.split('\n')) {
    if (line.startsWith('BIND_ERP_API_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
}
async function run() {
    const filter = `year(ApplicationDate) eq 2026 and month(ApplicationDate) eq 4 and day(ApplicationDate) eq 21`;
    const res = await fetch(`https://api.bind.com.mx/api/AccountingJournals?$filter=${filter}&$top=100`, { 
      headers: { 'Authorization': 'Bearer ' + key }
    });
    
    if(!res.ok) {
       console.log("Error API:", res.status, await res.text());
       return;
    }

    const data = await res.json();
    for(const j of data.value) {
       if (j.Type === 'Pago de Venta') {
          console.log(`\n\nLocation: ${j.LocationID} Items:`, j.Items.map(i => i.AccountName));
       }
    }
}
run().catch(console.error);
