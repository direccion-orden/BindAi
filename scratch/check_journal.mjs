import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
let key = '';
for (const line of env.split('\n')) {
    if (line.startsWith('BIND_ERP_API_KEY=')) key = line.split('=')[1].trim().replace(/"/g, '');
}
async function run() {
    const res = await fetch('https://api.bind.com.mx/api/AccountingJournals?$top=1', { headers: { 'Authorization': 'Bearer ' + key }});
    console.log(JSON.stringify(await res.json(), null, 2));
}
run();
