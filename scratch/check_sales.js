const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
let apiKey = '';
envFile.split('\n').forEach(line => {
    if(line.startsWith('BIND_ERP_API_KEY=')) {
        apiKey = line.split('=')[1].trim();
    }
});

const API_BASE = "https://api.bind.com.mx/api";

async function check() {
    // 2026-04-24
    const url = `${API_BASE}/AccountingJournals?$filter=year(ApplicationDate) eq 2026 and month(ApplicationDate) eq 4 and day(ApplicationDate) eq 24&$top=100`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
    const data = await res.json();
    const items = data.value || [];
    
    items.forEach(journal => {
        if (journal.Type === 'Pago de Venta') {
            console.log(`Journal ID: ${journal.ID}`);
            journal.Items.forEach(item => {
                console.log(`  Account: ${item.AccountName}, Charge: ${item.Charge}, Credit: ${item.Credit}, Desc: ${item.Description}`);
            });
        }
    });
}

check().catch(console.error);
