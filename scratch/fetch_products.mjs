import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Parse .env.local to get BIND_ERP_API_KEY
const envPath = 'c:\\Users\\Elitebook 840 G11\\.gemini\\antigravity\\playground\\rogue-tyson\\.env.local';
const envContent = fs.readFileSync(envPath, 'utf-8');
const apiKeyLine = envContent.split('\n').find(l => l.startsWith('BIND_ERP_API_KEY='));
const apiKey = apiKeyLine ? apiKeyLine.split('=')[1].trim() : '';

const API_BASE = "https://api.bind.com.mx/api";

const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
};

async function fetchClients() {
    console.log("Fetching first page of clients to inspect structure...");
    const url = `${API_BASE}/Clients?$top=2`;
    const res = await fetch(url, { headers });
    
    if (!res.ok) {
        console.error("Failed to fetch:", res.status, res.statusText);
        return;
    }
    
    const data = await res.json();
    console.log(JSON.stringify(data.value, null, 2));
}

fetchClients().catch(console.error);
