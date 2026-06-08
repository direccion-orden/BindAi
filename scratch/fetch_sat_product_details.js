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

    console.log("Searching for product 'BIN REFRI 15x25x13' in Bind ERP...");
    // Let's search using the SKU '7502322950351'
    const searchUrl = `https://api.bind.com.mx/api/Products?$filter=SKU eq '7502322950351'`;
    const res = await fetch(searchUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BIND_API_KEY}`
      }
    });

    if (!res.ok) {
      console.error("Search failed:", res.status, res.statusText);
      return;
    }

    const searchData = await res.json();
    const items = searchData.value || [];
    if (items.length === 0) {
      console.log("Product not found by SKU '7502322950351'. Trying to search by Title...");
      const searchUrlTitle = `https://api.bind.com.mx/api/Products?$filter=substringof('BIN REFRI', Title)`;
      const resTitle = await fetch(searchUrlTitle, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BIND_API_KEY}`
        }
      });
      const searchDataTitle = await resTitle.json();
      const itemsTitle = searchDataTitle.value || [];
      if (itemsTitle.length === 0) {
        console.error("Product not found in Bind ERP by title search either.");
        return;
      }
      console.log(`Found ${itemsTitle.length} matching products by title.`);
      items.push(...itemsTitle);
    }

    const prod = items[0];
    console.log(`Found Product! ID: ${prod.ID}, Code: ${prod.Code}, Title: ${prod.Title}`);

    console.log("\nFetching full details...");
    const detailRes = await fetch(`https://api.bind.com.mx/api/Products/${prod.ID}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BIND_API_KEY}`
      }
    });

    if (!detailRes.ok) {
      console.error("Failed to fetch detailed info:", detailRes.statusText);
      return;
    }

    const detailData = await detailRes.json();
    console.log("\nFull Detailed JSON from Bind ERP:");
    console.log(JSON.stringify(detailData, null, 2));

  } catch (error) {
    console.error("Error:", error);
  }
}

run();
