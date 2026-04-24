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
    
    let allExpenses = [];
    const typesToFetch = [1, 2, 3, 4];
        
    await Promise.all(typesToFetch.map(async (journalType) => {
        let skipAJ = 0;
        let hasMoreAJ = true;
        while (hasMoreAJ) {
            const ajUrl = `${API_BASE}/AccountingJournals?$filter=Type eq ${journalType} and ApplicationDate ge datetime'${startDate.split('T')[0]}T00:00:00' and ApplicationDate le datetime'${endDate.split('T')[0]}T23:59:59'&$top=100&$skip=${skipAJ}`;
            const response = await fetch(ajUrl, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }});
            if (!response.ok) break;
            const data = await response.json();
            const items = data.value || [];
            
            items.forEach((exp) => {
                const date = new Date(exp.ApplicationDate || exp.CreationDate);
                const totalAmount = (exp.Items || []).reduce((acc, item) => acc + (item.Debit || 0), 0);
                
                if (totalAmount > 0) {
                    let pName = 'Gastos Generales';
                    let desc = (exp.JournalType || exp.Type || 'Gasto') + (exp.Number ? ` #${exp.Number}` : '');
                    
                    const mainItem = exp.Items.find(i => i.Description && i.Description.includes(' - '));
                    if (mainItem) {
                        const parts = mainItem.Description.split(' - ');
                        if (parts.length > 1) {
                            pName = parts.slice(1).join(' - ').trim();
                        }
                        if (parts[0].length < 50) {
                            desc = parts[0];
                        }
                    }
                    
                    allExpenses.push({
                        id: exp.ID,
                        costCenterId: pName,
                        providerName: pName,
                        day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear(),
                        amount: totalAmount,
                        concept: desc,
                        isProgrammed: false,
                        statusText: 'Afectado',
                        status: 2,
                        _isPO: false,
                        _journalType: journalType,
                        _number: exp.Number,
                        _desc: (exp.Items || []).map(i => i.Description || '').join(' ')
                    });
                }
            });
            
            if (items.length === 100) skipAJ += 100;
            else hasMoreAJ = false;
        }
    }));

    const type2Desc = allExpenses.filter(e => e._journalType === 2).map(e => e._desc || '');
    const type4Desc = allExpenses.filter(e => e._journalType === 4).map(e => e._desc || '');
    
    const deduplicatedExpenses = allExpenses.filter(e => {
        if (e._journalType === 1 && e._number) {
            const fuePagado = type2Desc.some(desc => desc.includes(`#${e._number}`));
            if (fuePagado) return false; 
        }
        if (e._journalType === 3 && e._number) {
            const fuePagado = type4Desc.some(desc => desc.includes(`#${e._number}`));
            if (fuePagado) return false; 
        }
        return true;
    });

    console.log(`Original count: ${allExpenses.length}`);
    console.log(`Deduplicated count: ${deduplicatedExpenses.length}`);
    const totalOriginal = allExpenses.reduce((s, x) => s + x.amount, 0);
    const totalDedup = deduplicatedExpenses.reduce((s, x) => s + x.amount, 0);
    console.log(`Total Original Amount: ${totalOriginal}`);
    console.log(`Total Deduplicated Amount: ${totalDedup}`);
}

check().catch(console.error);
