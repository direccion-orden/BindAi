const fs = require('fs');
const path = require('path');
const os = require('os');

const BIND_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1bmlxdWVfbmFtZSI6ImFkbWlufDEwMDc4MCIsIkludGVybmFsSUQiOiI5Mzg2ZjgzMS1iNWI0LTQ1ZWYtODhhNi0zNWFkMDgyZTZiZWYiLCJuYmYiOjE3NzUxNjIwMTQsImV4cCI6MTgwNjY5ODAxNCwiaWF0IjoxNzc1MTYyMDE0LCJpc3MiOiJNaW5udF9Tb2x1dGlvbnNfU0FfREVfQ1YiLCJhdWQiOiJCaW5kX0VSUF9BUElfVXNlcnMifQ.IwmIJDQf1pNLiYC65dGhjJmdulrAGw5k_PuGvkJNOMY";
const API_BASE = "https://api.bind.com.mx/api";
const bindHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${BIND_API_KEY}`
};

// Custom helper to run promises in parallel with concurrency limit
async function mapLimit(items, limit, fn) {
  const running = new Set();
  const promises = [];
  let index = 0;

  for (const item of items) {
    const currentIndex = ++index;
    if (running.size >= limit) {
      await Promise.race(running);
    }
    const p = (async () => {
      try {
        return await fn(item, currentIndex);
      } finally {
        running.delete(p);
      }
    })();
    running.add(p);
    promises.push(p);
  }
  return Promise.all(promises);
}

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error("firebase-tools.json not found!");
      return;
    }
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    console.log("Fetching all products from Firestore...");
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

    if (!queryRes.ok) {
      console.error(`Failed to query Firestore products:`, await queryRes.text());
      return;
    }

    const productsData = await queryRes.json();
    const products = productsData.filter(p => p.document).map(p => p.document);
    console.log(`Found ${products.length} products total in Firestore.`);

    // We only need to fetch details for products that came from Bind ERP
    const bindProducts = products.filter(doc => {
      const fields = doc.fields || {};
      const vendor = fields.vendor?.stringValue;
      return vendor === "Bind ERP" || vendor === "Bind ERP (Migrado)";
    });

    console.log(`Identified ${bindProducts.length} products originating from Bind ERP to update prices.`);

    console.log("Starting parallel fetching of prices from Bind ERP...");
    let skippedCount = 0;
    
    // Map with limit of 30 parallel requests
    const updatesList = await mapLimit(bindProducts, 30, async (doc, idx) => {
      const itemId = doc.name.split('/').pop();
      const fields = doc.fields || {};

      try {
        if (idx % 200 === 0) {
          console.log(`  -> Progress: Fetched ${idx}/${bindProducts.length}...`);
        }

        const res = await fetch(`${API_BASE}/Products/${itemId}`, { headers: bindHeaders });
        if (!res.ok) {
          // If product not found in Bind, skip it
          skippedCount++;
          return null;
        }

        const detail = await res.json();
        let sellingPrice = 0;

        if (detail.Prices && detail.Prices.Items && detail.Prices.Items.length > 0) {
          // Look for price list "A" first
          const priceA = detail.Prices.Items.find(p => p.Name === "A");
          if (priceA) {
            sellingPrice = priceA.Price;
          } else {
            const firstValid = detail.Prices.Items.find(p => p.Price > 0);
            sellingPrice = firstValid ? firstValid.Price : detail.Prices.Items[0].Price;
          }
        }

        // Return update info
        return {
          doc,
          sellingPrice
        };
      } catch (e) {
        console.error(`Error fetching Bind product ${itemId}:`, e.message);
        return null;
      }
    });

    const validUpdates = updatesList.filter(u => u !== null);
    console.log(`Finished fetching from Bind. Success: ${validUpdates.length}, Skipped: ${skippedCount}`);

    console.log("Preparing Firestore batch updates...");
    
    let batchCount = 0;
    let successCount = 0;
    const batchSize = 400;

    for (let i = 0; i < validUpdates.length; i += batchSize) {
      const chunk = validUpdates.slice(i, i + batchSize);
      console.log(`Committing Firestore update batch ${++batchCount} (${chunk.length} items)...`);

      const writes = chunk.map(update => {
        const doc = update.doc;
        const fields = doc.fields || {};
        const sellingPrice = update.sellingPrice;

        // Preserve current variants array and overwrite only the price property in variants[0]
        const variants = fields.variants?.arrayValue?.values || [];
        const updatedVariants = [...variants];
        if (updatedVariants.length > 0) {
          const firstVariant = updatedVariants[0].mapValue?.fields || {};
          updatedVariants[0] = {
            mapValue: {
              fields: {
                ...firstVariant,
                price: { doubleValue: sellingPrice }
              }
            }
          };
        }

        return {
          update: {
            name: doc.name,
            fields: {
              ...fields,
              variants: {
                arrayValue: {
                  values: updatedVariants
                }
              }
            }
          }
        };
      });

      const commitRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ writes })
      });

      if (!commitRes.ok) {
        console.error(`Failed to commit Firestore batch ${batchCount}:`, await commitRes.text());
        return;
      }

      successCount += chunk.length;
      console.log(`Firestore batch ${batchCount} committed.`);
    }

    console.log(`\n=================================`);
    console.log(`SUCCESSFULLY UPDATED ${successCount} SELLING PRICES IN PRODUCTION!`);
    console.log(`=================================`);

  } catch (error) {
    console.error("Migration prices error:", error);
  }
}

run();
