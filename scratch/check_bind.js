const fs = require('fs');

// Simple .env.local parser
const envFile = fs.readFileSync('.env.local', 'utf8');
let apiKey = '';
envFile.split('\n').forEach(line => {
    if(line.startsWith('BIND_ERP_API_KEY=')) {
        apiKey = line.split('=')[1].trim();
    }
});

const API_BASE = "https://api.bind.com.mx/api";

async function check() {
    const year = 2026;
    const month = 4;
    const startDate = `2026-04-01T00:00:00`;
    const endDate = `2026-04-30T23:59:59`;
    
    let totalItems = 0;

    const types = [1, 2, 3, 4];
    for (let type of types) {
        let skip = 0;
        let hasMore = true;
        let count = 0;
        let amount = 0;
        while(hasMore) {
            const url = `${API_BASE}/AccountingJournals?$filter=Type eq ${type} and ApplicationDate ge datetime'${startDate}' and ApplicationDate le datetime'${endDate}'&$top=100&$skip=${skip}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
            if (!res.ok) {
                console.error("API error", await res.text());
                break;
            }
            const data = await res.json();
            const items = data.value || [];
            count += items.length;
            
            items.forEach(exp => {
                const debit = (exp.Items || []).reduce((acc, item) => acc + (item.Debit || 0), 0);
                amount += debit;
            });
            
            if (items.length === 100) { skip += 100; }
            else { hasMore = false; }
        }
        console.log(`Type ${type}: ${count} items, Total Debit: ${amount}`);
        totalItems += count;
    }
    console.log(`Total Journals: ${totalItems}`);
}

check().catch(console.error);
