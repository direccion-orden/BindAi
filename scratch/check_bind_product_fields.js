const fs = require('fs');
const path = require('path');

async function run() {
  try {
    // Load Env
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

    console.log("Fetching detailed product info from Bind ERP...");
    const res = await fetch("https://api.bind.com.mx/api/Products/a045009b-3722-40fb-a3b2-00002d005f59", {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BIND_API_KEY}`
      }
    });

    if (!res.ok) {
      console.error("Error from Bind API:", res.status, res.statusText);
      return;
    }

    const product = await res.json();
    if (!product) {
      console.error("No product found in Bind ERP.");
      return;
    }

    console.log("\nDetailed Product from Bind ERP:");
    console.log(JSON.stringify(product, null, 2));

    // Also let's fetch a specific product by ID if we want, but top=1 is fine
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
