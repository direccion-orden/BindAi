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
                if(res.statusCode === 200) resolve(JSON.parse(data));
                else reject(res.statusCode + ' ' + data);
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function analyze() {
    try {
        const startDate = '2026-04-01T00:00:00';
        const endDate = '2026-04-30T23:59:59';
        
        let poTotal = 0;
        let poCount = 0;
        let skip = 0;
        let hasMore = true;
        while(hasMore) {
            const pos = await fetchBind(`/api/Purchases/GetPurchaseOrders?$filter=CreationDate ge datetime'${startDate.split('T')[0]}T00:00:00' and CreationDate le datetime'${endDate.split('T')[0]}T23:59:59'&$top=100&$skip=${skip}`);
            const items = pos.value || [];
            items.forEach(p => { poTotal += p.TotalImport; poCount++; });
            if(items.length === 100) skip += 100;
            else hasMore = false;
        }

        let ajTotalWithGasto = 0;
        let ajCountWithGasto = 0;
        let ajTotalAllType1 = 0;
        let ajCountAllType1 = 0;
        let ajTypes = {};
        
        skip = 0;
        hasMore = true;
        while(hasMore) {
            const ajs = await fetchBind(`/api/AccountingJournals?$filter=ApplicationDate ge datetime'${startDate.split('T')[0]}T00:00:00' and ApplicationDate le datetime'${endDate.split('T')[0]}T23:59:59'&$top=100&$skip=${skip}`);
            const items = ajs.value || [];
            items.forEach(aj => {
                const amount = (aj.Items || []).reduce((acc, item) => acc + (item.Debit || 0), 0);
                ajTotalAllType1 += amount;
                ajCountAllType1++;
                
                ajTypes[aj.JournalType || aj.Type] = (ajTypes[aj.JournalType || aj.Type] || 0) + amount;
                
                if (aj.JournalType === 'Gasto' || aj.Type === 'Gasto') {
                    ajTotalWithGasto += amount;
                    ajCountWithGasto++;
                }
            });
            if(items.length === 100) skip += 100;
            else hasMore = false;
        }

        console.log(JSON.stringify({
            POs: { count: poCount, total: poTotal },
            JournalsType1: { count: ajCountAllType1, total: ajTotalAllType1 },
            JournalsWithGastoOnly: { count: ajCountWithGasto, total: ajTotalWithGasto },
            JournalTypesFound: ajTypes
        }, null, 2));
    } catch(e) {
        console.error(e);
    }
}
analyze();
