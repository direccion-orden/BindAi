import fetch from 'node-fetch';
import fs from 'fs';

const envContent = fs.readFileSync('c:\\Users\\Elitebook 840 G11\\.gemini\\antigravity\\playground\\rogue-tyson\\.env.local', 'utf-8');
const apiKeyLine = envContent.split('\n').find(l => l.startsWith('BIND_ERP_API_KEY='));
const apiKey = apiKeyLine ? apiKeyLine.split('=')[1].trim() : '';

const API_BASE = "https://api.bind.com.mx/api";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function testPrices() {
    let res = await fetch(`${API_BASE}/PriceLists`, { headers });
    if(res.ok) {
        console.log("PriceLists:", await res.json());
    } else {
        console.log("PriceLists failed", res.status);
    }
}

testPrices().catch(console.error);
