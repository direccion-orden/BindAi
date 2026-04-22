import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
let key = '';
for (const line of env.split('\n')) {
    if (line.startsWith('BIND_ERP_API_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
}
async function run() {
    const filter = `year(ApplicationDate) eq 2026 and month(ApplicationDate) eq 4 and day(ApplicationDate) eq 21 and LocationID eq guid'8671227a-c779-4f54-b26f-c6e2cbcf4f2a'`;
    const res = await fetch(`https://api.bind.com.mx/api/AccountingJournals?$filter=${filter}&$top=1`, { 
      headers: { 'Authorization': 'Bearer ' + key }
    });
    
    if(!res.ok) {
       console.log("STATUS:", res.status);
       console.log(await res.text());
       return;
    }
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}
run().catch(console.error);
