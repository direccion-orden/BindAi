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
    let totalDebit = 0;
    let byType = {};
    const startDate = `2026-04-01T00:00:00`;
    const endDate = `2026-04-30T23:59:59`;
    
    while (hasMore) {
        const url = `${API_BASE}/AccountingJournals?$filter=ApplicationDate ge datetime'${startDate}' and ApplicationDate le datetime'${endDate}'&$top=100&$skip=${skip}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
        if (!res.ok) break;
        const data = await res.json();
        const items = data.value || [];
        
        items.forEach(exp => {
            const debit = (exp.Items || []).reduce((acc, item) => acc + (item.Debit || 0), 0);
            if(debit > 0) {
                const t = exp.Type || 'unknown';
                if(!byType[t]) byType[t] = { count: 0, amount: 0, desc: [] };
                byType[t].count++;
                byType[t].amount += debit;
                if(byType[t].desc.length < 2) {
                    byType[t].desc.push((exp.Items || []).map(i => i.Description).join(' | '));
                }
            }
        });
        
        if (items.length === 100) { skip += 100; }
        else { hasMore = false; }
    }
    
    for(let t in byType) {
        console.log(`Type ${t}: ${byType[t].count} items, Total Debit: ${byType[t].amount.toFixed(2)}`);
        console.log(`  Examples: ${byType[t].desc[0]}`);
    }
}

check().catch(console.error);
