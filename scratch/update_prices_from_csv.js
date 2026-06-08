const fs = require('fs');
const path = require('path');
const os = require('os');
const Papa = require('papaparse');

async function run() {
  try {
    const csvFile = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Precios (6).csv';
    if (!fs.existsSync(csvFile)) {
      console.error(`CSV file not found at: ${csvFile}`);
      return;
    }

    console.log(`Reading CSV file from: ${csvFile}...`);
    const content = fs.readFileSync(csvFile, 'utf8');
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    const csvRecords = parsed.data;
    console.log(`Parsed ${csvRecords.length} records from CSV.`);

    // 1. Connect to production Firestore
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error("firebase-tools.json not found!");
      return;
    }
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    console.log("Fetching all current products from Firestore...");
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

    // Map Firestore products by ID and SKU/Code for robust matching
    const firestoreMapById = new Map();
    const firestoreMapBySku = new Map();
    products.forEach(doc => {
      const itemId = doc.name.split('/').pop();
      firestoreMapById.set(itemId.toLowerCase(), doc);

      const fields = doc.fields || {};
      const variants = fields.variants?.arrayValue?.values || [];
      const sku = variants[0]?.mapValue?.fields?.sku?.stringValue;
      const barcode = variants[0]?.mapValue?.fields?.barcode?.stringValue;

      if (sku) firestoreMapBySku.set(sku.trim().toLowerCase(), doc);
      if (barcode) firestoreMapBySku.set(barcode.trim().toLowerCase(), doc);
      if (fields.SKU?.stringValue) firestoreMapBySku.set(fields.SKU.stringValue.trim().toLowerCase(), doc);
      if (fields.Code?.stringValue) firestoreMapBySku.set(fields.Code.stringValue.trim().toLowerCase(), doc);
    });

    let updates = [];
    let unmatchedCount = 0;

    csvRecords.forEach((record, idx) => {
      const id = record.ID || record.id || record["ï»¿ID"];
      const code = record.Codigo || record.SKU || record.sku || record.codigo;
      
      let doc = null;
      if (id) {
        doc = firestoreMapById.get(id.trim().toLowerCase());
      }
      if (!doc && code) {
        doc = firestoreMapBySku.get(code.trim().toLowerCase());
      }

      if (!doc) {
        unmatchedCount++;
        return;
      }

      // Parse price A (P-A)
      const rawPrice = record["P-A"] || record["Price"] || record["price"];
      if (!rawPrice) return;

      const parsedPrice = parseFloat(String(rawPrice).replace(/[^0-9.-]+/g, ""));
      if (isNaN(parsedPrice)) return;

      updates.push({
        doc,
        sellingPrice: parsedPrice
      });
    });

    console.log(`Matched ${updates.length} products to update. Unmatched CSV records: ${unmatchedCount}`);

    if (updates.length === 0) {
      console.log("No product price updates found!");
      return;
    }

    console.log("Committing Firestore batch updates...");
    let batchCount = 0;
    let successCount = 0;
    const batchSize = 400;

    for (let i = 0; i < updates.length; i += batchSize) {
      const chunk = updates.slice(i, i + batchSize);
      console.log(`Committing Firestore update batch ${++batchCount} (${chunk.length} items)...`);

      const writes = chunk.map(update => {
        const doc = update.doc;
        const fields = doc.fields || {};
        const sellingPrice = update.sellingPrice;

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
      console.log(`Firestore batch ${batchCount} committed successfully.`);
    }

    console.log(`\n=================================`);
    console.log(`SUCCESSFULLY UPDATED ${successCount} SELLING PRICES FROM LOCAL CSV!`);
    console.log(`=================================`);

  } catch (error) {
    console.error("CSV Price update error:", error);
  }
}

run();
