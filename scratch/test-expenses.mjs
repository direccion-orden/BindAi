import fetch from 'node-fetch';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const match = env.match(/BIND_ERP_API_KEY=([^\r\n]+)/);
const apiKey = match ? match[1] : '';
const API_BASE = "https://api.bind.com.mx/api";

async function test() {
    const url = encodeURI(`${API_BASE}/Locations`);
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }});
    const data = await response.json();
    console.log("Locations:", data.value.map(l => ({ id: l.ID, name: l.Name })));
}
test();
