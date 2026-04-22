import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
let key = '';
for (const line of env.split('\n')) {
    if (line.startsWith('BIND_ERP_API_KEY=')) {
        key = line.split('=')[1].trim().replace(/"/g, '');
    }
}
const API_BASE = 'https://api.bind.com.mx/api';
async function run() {
    const res = await fetch(`${API_BASE}/AccountingJournals?$filter=Type eq 'Pago de Venta'&$top=50&$orderby=ApplicationDate desc`, {
        headers: { 'Authorization': 'Bearer ' + key }
    });
    const data = await res.json();
    const categories = {};
    for (const j of data.value || []) {
        for (const item of j.Items || []) {
            if (item.Charge > 0) {
                categories[item.AccountName] = (categories[item.AccountName] || 0) + item.Charge;
            }
        }
    }
    console.table(categories);
}
run().catch(console.error);
