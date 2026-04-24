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
    const typesToFetch = [7, 10];
    const yearNum = 2026;
    const monthNum = 4;
    const startDate = `2026-04-01T00:00:00`;
    const endDate = `2026-04-30T23:59:59`;
    
    for(let type of typesToFetch) {
        const url = `${API_BASE}/AccountingJournals?$filter=Type eq ${type} and ApplicationDate ge datetime'${startDate}' and ApplicationDate le datetime'${endDate}'&$top=1`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
        if (!res.ok) break;
        const data = await res.json();
        const items = data.value || [];
        if(items.length > 0) {
            console.log(`Type ${type}:`);
            console.log(`Comments: ${items[0].Comments}`);
            console.log(`Desc: ${(items[0].Items || []).map(i => i.Description).join(', ')}`);
        }
    }
}

check().catch(console.error);
