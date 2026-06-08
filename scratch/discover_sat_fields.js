const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const envPath = path.resolve('.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val.replace(/^["']|["']$/g, '');
      }
    });

    const BIND_API_KEY = envVars['BIND_ERP_API_KEY'];
    if (!BIND_API_KEY) {
      console.error("Missing BIND_ERP_API_KEY");
      return;
    }

    console.log("Fetching first 50 products from Bind ERP to discover SAT/CFDI fields...");
    const res = await fetch("https://api.bind.com.mx/api/Products?$top=50", {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BIND_API_KEY}`
      }
    });

    if (!res.ok) {
      console.error("Error from Bind API:", res.status, res.statusText);
      return;
    }

    const data = await res.json();
    const products = data.value || [];
    console.log(`Found ${products.length} products to analyze.`);

    // Analyze first 5 products details to see if any detailed product endpoint has SAT/CFDI keys
    const sampleIds = products.slice(0, 8).map(p => p.ID);
    console.log("Fetching detailed info for a few products to check properties...");

    for (const id of sampleIds) {
      const detailRes = await fetch(`https://api.bind.com.mx/api/Products/${id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BIND_API_KEY}`
        }
      });
      if (!detailRes.ok) continue;
      const product = await detailRes.json();
      
      // Print keys containing SAT, CFDI, Code, Unit, Clave, Unidad
      const matchedKeys = {};
      Object.keys(product).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('sat') || 
          lowerKey.includes('cfdi') || 
          lowerKey.includes('clave') || 
          lowerKey.includes('unidad') ||
          lowerKey.includes('code') ||
          lowerKey.includes('unit')
        ) {
          matchedKeys[key] = product[key];
        }
      });
      
      console.log(`\nProduct [ID: ${id}] matches:`, JSON.stringify(matchedKeys, null, 2));
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
