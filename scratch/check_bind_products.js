async function run() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  // Read firebase token
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  
  // Call the Bind API directly
  const apiKey = process.env.BIND_ERP_API_KEY;
  
  // Read from .env.local
  const envPath = path.join(process.cwd(), '.env.local');
  let bindKey = '';
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/BIND_ERP_API_KEY=(.+)/);
    if (match) bindKey = match[1].trim();
  }
  
  if (!bindKey) {
    console.error("No BIND_ERP_API_KEY found in .env.local");
    return;
  }

  console.log("Fetching first 3 products from Bind ERP...");
  const res = await fetch('https://api.bind.com.mx/api/Products?$top=3&$skip=0', {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + bindKey
    }
  });

  if (!res.ok) {
    console.error("Bind API Error:", res.status, await res.text());
    return;
  }

  const json = await res.json();
  const data = Array.isArray(json) ? json : (json.value || []);
  
  console.log(`Got ${data.length} products. Fields of first product:`);
  if (data[0]) {
    const keys = Object.keys(data[0]);
    console.log(`\nAll fields: ${keys.join(', ')}`);
    console.log(`\n--- Sample Product ---`);
    console.log(`  ID: ${data[0].ID}`);
    console.log(`  Title: ${data[0].Title}`);
    console.log(`  Code: ${data[0].Code}`);
    console.log(`  SKU: ${data[0].SKU}`);
    console.log(`  CategoryID: ${data[0].CategoryID}`);
    console.log(`  Category1ID: ${data[0].Category1ID}`);
    console.log(`  Category2ID: ${data[0].Category2ID}`);
    console.log(`  TypeText: ${data[0].TypeText}`);
    console.log(`  Status: ${data[0].Status}`);
    console.log(`  Cost: ${data[0].Cost}`);
  }
}

run();
