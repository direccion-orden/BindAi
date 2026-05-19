import fetch from 'node-fetch';
import fs from 'fs';

const envContent = fs.readFileSync('c:\\Users\\Elitebook 840 G11\\.gemini\\antigravity\\playground\\rogue-tyson\\.env.local', 'utf-8');
const apiKeyLine = envContent.split('\n').find(l => l.startsWith('BIND_ERP_API_KEY='));
const apiKey = apiKeyLine ? apiKeyLine.split('=')[1].trim() : '';

const API_BASE = "https://api.bind.com.mx/api";
const headers = { "Authorization": `Bearer ${apiKey}` };

async function checkCategories() {
    console.log("Checking /Categories...");
    let res = await fetch(`${API_BASE}/Categories`, { headers });
    if (res.ok) {
        let data = await res.json();
        console.log("/Categories found:", data.value ? data.value.slice(0, 3) : data);
        return;
    }
    console.log("Checking /ProductCategories...");
    res = await fetch(`${API_BASE}/ProductCategories`, { headers });
    if (res.ok) {
        let data = await res.json();
        console.log("/ProductCategories found:", data.value ? data.value.slice(0, 3) : data);
        return;
    }
    console.log("Checking /InventoryCategories...");
    res = await fetch(`${API_BASE}/InventoryCategories`, { headers });
    if (res.ok) {
        let data = await res.json();
        console.log("/InventoryCategories found:", data.value ? data.value.slice(0, 3) : data);
        return;
    }
    console.log("Could not find categories endpoint");
}

checkCategories().catch(console.error);
