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
    let skip = 0; let keep = true;
    while(keep) {
        const url = `${API_BASE}/AccountingJournals?$filter=year(CreationDate) eq 2026 and month(CreationDate) eq 4 and day(CreationDate) eq 24&$top=100&$skip=${skip}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` }});
        const data = await res.json();
        if(!data.value || data.value.length === 0) break;
        data.value.forEach(journal => {
            let match = false;
            journal.Items.forEach(i => {
                if (i.Description && i.Description.includes('#35429')) match = true;
                if (i.Description && i.Description.includes('Humberto Vargas Aguilar')) match = true;
            });
            if (match) {
                console.log('Match found by CreationDate:', journal.ID, 'Type:', journal.Type);
                console.log(JSON.stringify(journal, null, 2));
            }
        });
        if(data.value.length < 100) keep = false;
        skip += 100;
    }
}
check().catch(console.error);
