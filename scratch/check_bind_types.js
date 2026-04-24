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
    let skip = 0;
    let hasMore = true;
    let count = 0;
    
    // Check all types from 1 to 10
    const typesToFetch = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const yearNum = 2026;
    const monthNum = 4;
    const startDate = `2026-04-01T00:00:00`;
    const endDate = `2026-04-30T23:59:59`;
    
    for(let type of typesToFetch) {
        let skipAJ = 0;
        let hasMoreAJ = true;
        let typeAmount = 0;
        let typeCount = 0;
        while (hasMoreAJ) {
            const url = `${API_BASE}/AccountingJournals?$filter=Type eq ${type} and ApplicationDate ge datetime'${startDate}' and ApplicationDate le datetime'${endDate}'&$top=100&$skip=${skipAJ}`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
            if (!res.ok) break;
            const data = await res.json();
            const items = data.value || [];
            
            items.forEach(exp => {
                const debit = (exp.Items || []).reduce((acc, item) => acc + (item.Debit || 0), 0);
                typeAmount += debit;
                typeCount++;
            });
            
            if (items.length === 100) { skipAJ += 100; }
            else { hasMoreAJ = false; }
        }
        if(typeCount > 0) {
            console.log(`Type ${type}: ${typeCount} items, Total Debit: ${typeAmount}`);
        }
    }
}

check().catch(console.error);
