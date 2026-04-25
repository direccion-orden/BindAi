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
    const url = `${API_BASE}/AccountingJournals?$filter=year(ApplicationDate) eq 2026 and month(ApplicationDate) eq 4 and day(ApplicationDate) eq 24&$top=100`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
    const data = await res.json();
    const items = data.value || [];
    items.forEach(journal => {
        let match = false;
        if (journal.DocumentID === 'f19d5f73-374c-4c38-b842-0efc23c9d121') match = true;
        journal.Items.forEach(i => {
            if (i.Description && i.Description.includes('#35429')) match = true;
            if (i.Description && i.Description.includes('Humberto Vargas Aguilar')) match = true;
        });
        if (match) {
            console.log('Match found in journal ID:', journal.ID, 'Type:', journal.Type);
            console.log(JSON.stringify(journal, null, 2));
        }
    });
}
check().catch(console.error);
