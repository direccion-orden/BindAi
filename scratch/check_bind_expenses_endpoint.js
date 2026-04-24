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
    const yearNum = 2026;
    const monthNum = 4;
    const startDate = `2026-04-01T00:00:00`;
    const endDate = `2026-04-30T23:59:59`;
    
    let skip = 0;
    let hasMore = true;
    let totalAmount = 0;
    let count = 0;
    while (hasMore) {
        // Query /Expenses endpoint
        const url = `${API_BASE}/Expenses?$filter=Date ge datetime'${startDate}' and Date le datetime'${endDate}'&$top=100&$skip=${skip}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
        if (!res.ok) break;
        const data = await res.json();
        const items = data.value || [];
        
        items.forEach(exp => {
            totalAmount += exp.Amount || 0;
            count++;
        });
        
        if (items.length === 100) { skip += 100; }
        else { hasMore = false; }
    }
    console.log(`/Expenses endpoint: ${count} items, Total Amount: ${totalAmount}`);
}

check().catch(console.error);
