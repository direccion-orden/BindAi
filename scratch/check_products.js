const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    console.error("firebase-tools.json not found!");
    return;
  }
  const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const accessToken = json.tokens.access_token;
  const projectId = "bind-ai-6f1fc";
  const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

  console.log("Querying products collection...");
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}:runQuery`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "products", allDescendants: false }],
          limit: 5
        }
      })
    }
  );

  if (!res.ok) {
    console.error("Error:", res.status, await res.text());
    return;
  }

  const data = await res.json();
  const docs = data.filter(d => d.document);
  console.log(`Found ${docs.length} products (showing up to 5)`);
  
  docs.forEach(d => {
    const name = d.document.name.split('/').pop();
    const fields = d.document.fields || {};
    console.log(`\n--- Product ID: ${name} ---`);
    console.log(`  title: ${fields.title?.stringValue || 'MISSING'}`);
    console.log(`  Title: ${fields.Title?.stringValue || 'MISSING'}`);
    console.log(`  status: ${fields.status?.stringValue || 'MISSING'}`);
    console.log(`  CategoryID: ${fields.CategoryID?.stringValue || 'MISSING'}`);
    
    const variants = fields.variants?.arrayValue?.values;
    if (variants && variants[0]) {
      const v = variants[0].mapValue?.fields || {};
      console.log(`  variant.sku: ${v.sku?.stringValue || 'MISSING'}`);
      console.log(`  variant.price: ${v.price?.doubleValue || v.price?.integerValue || 'MISSING'}`);
    }
  });
}

run();
