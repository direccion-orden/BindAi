const https = require('https');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/BIND_ERP_API_KEY=([^\r\n]+)/);
const apiKey = match ? match[1] : '';

function fetchBind(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.bind.com.mx',
            port: 443,
            path: encodeURI(path),
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + apiKey }
        };
        const req = https.request(options, res => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if(res.statusCode === 200) {
                    try { resolve(JSON.parse(data)); } catch(e) { resolve({ value: [] }); }
                } else reject(res.statusCode + ' ' + data);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function analyze() {
    try {
        const startDate = '2024-04-01T00:00:00';
        const endDate = '2024-04-30T23:59:59';
        
        for (let i = 6; i <= 15; i++) {
            const res = await fetchBind(`/api/AccountingJournals?$filter=Type eq ${i} and ApplicationDate ge datetime'${startDate.split('T')[0]}T00:00:00' and ApplicationDate le datetime'${endDate.split('T')[0]}T23:59:59'&$top=10`);
            const items = res.value || [];
            if(items.length > 0) {
                const uniqueTypes = [...new Set(items.map(aj => aj.JournalType || aj.Type))];
                let sum = items.reduce((acc, aj) => acc + (aj.Items||[]).reduce((a, it) => a + (it.Debit||0), 0), 0);
                console.log(`Type eq ${i} text names:`, uniqueTypes, "Sum of first 10:", sum);
            }
        }
    } catch(e) {
        console.error(e);
    }
}
analyze();
