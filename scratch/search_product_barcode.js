const fs = require('fs');
const path = require('path');
const os = require('os');

const BIND_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const API_BASE = "https://api.bind.com.mx/api";

async function run() {
  const searchTerm = "7503041331919";
  console.log(`=== SEARCHING FOR PRODUCT: "${searchTerm}" ===\n`);

  try {
    // 1. Search in Bind ERP API
    console.log("Searching in Bind ERP API...");
    const bindHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BIND_API_KEY}`
    };

    // We can filter by Code or SKU or Title
    const bindRes = await fetch(`${API_BASE}/Products?$filter=Code eq '${searchTerm}' or SKU eq '${searchTerm}'`, { headers: bindHeaders });
    if (bindRes.ok) {
      const bindData = await bindRes.json();
      const items = bindData.value || [];
      console.log(`Bind ERP API matches found: ${items.length}`);
      if (items.length > 0) {
        console.log("Bind ERP Product Details:");
        console.log(JSON.stringify(items[0], null, 2));
      }
    } else {
      console.error("Bind ERP API returned error:", await bindRes.text());
    }

    // 2. Search in production Firestore
    console.log("\nSearching in Production Firestore...");
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (fs.existsSync(configPath)) {
      const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const accessToken = json.tokens.access_token;
      const projectId = "bind-ai-6f1fc";
      const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

      // Query all products in Firestore and filter locally for maximum accuracy
      const queryRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}:runQuery`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{
              collectionId: "products",
              allDescendants: false
            }]
          }
        })
      });

      if (queryRes.ok) {
        const productsData = await queryRes.json();
        const products = productsData.filter(p => p.document).map(p => p.document);
        
        const matches = [];
        products.forEach(doc => {
          const fields = doc.fields || {};
          
          // Check uppercase fields
          const rawSku = fields.SKU?.stringValue;
          const rawCode = fields.Code?.stringValue;
          const rawTitle = fields.Title?.stringValue;

          // Check lowercase fields
          const title = fields.title?.stringValue;
          const variants = fields.variants?.arrayValue?.values || [];
          const sku = variants[0]?.mapValue?.fields?.sku?.stringValue;
          const barcode = variants[0]?.mapValue?.fields?.barcode?.stringValue;

          const id = doc.name.split('/').pop();

          if (
            rawSku === searchTerm || 
            rawCode === searchTerm || 
            sku === searchTerm || 
            barcode === searchTerm
          ) {
            matches.push({
              id,
              rawTitle,
              title,
              rawSku,
              sku,
              rawCode,
              barcode,
              status: fields.status?.stringValue
            });
          }
        });

        console.log(`Firestore matches found: ${matches.length}`);
        if (matches.length > 0) {
          console.log("Firestore Product Details:");
          console.log(JSON.stringify(matches[0], null, 2));
        }
      } else {
        console.error("Firestore query returned error:", await queryRes.text());
      }
    } else {
      console.error("No firebase-tools.json found to query Firestore!");
    }

  } catch (error) {
    console.error("Error during search:", error);
  }
}

run();
