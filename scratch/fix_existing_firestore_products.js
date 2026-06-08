const fs = require('fs');
const path = require('path');
const os = require('os');

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
      console.error(`Failed to query products:`, await queryRes.text());
      return;
    }

    const productsData = await queryRes.json();
    const products = productsData.filter(p => p.document).map(p => p.document);
    console.log(`Found ${products.length} products total in Firestore.`);

    let toMigrate = [];
    products.forEach(doc => {
      const fields = doc.fields || {};
      const hasRawTitle = fields.Title && fields.Title.stringValue;
      const hasPosTitle = fields.title && fields.title.stringValue;
      const status = fields.status && fields.status.stringValue;

      // If it has raw Title and does not have POS status/title, it needs migration
      if (hasRawTitle && !hasPosTitle && !status) {
        toMigrate.push(doc);
      }
    });

    console.log(`Identified ${toMigrate.length} raw products needing migration.`);

    if (toMigrate.length === 0) {
      console.log("No products need migration!");
      return;
    }

    // Migrate in batches of 400
    let batchCount = 0;
    let successCount = 0;
    const batchSize = 400;

    for (let i = 0; i < toMigrate.length; i += batchSize) {
      const chunk = toMigrate.slice(i, i + batchSize);
      console.log(`Processing batch ${++batchCount} (${chunk.length} items)...`);

      // Firestore REST API writes batch using commit
      const writes = chunk.map(doc => {
        const fields = doc.fields || {};
        const itemId = doc.name.split('/').pop();
        
        const title = fields.Title?.stringValue || fields.Code?.stringValue || "Sin título";
        const handle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        const cost = parseFloat(fields.Cost?.integerValue || fields.Cost?.doubleValue || 0);
        const sku = fields.SKU?.stringValue || fields.Code?.stringValue || "";
        const barcode = fields.Code?.stringValue || "";
        const currentInventory = parseInt(fields.CurrentInventory?.integerValue || fields.CurrentInventory?.doubleValue || 0, 10);
        const weight = parseFloat(fields.Weight?.integerValue || fields.Weight?.doubleValue || 0);
        const typeText = fields.TypeText?.stringValue || "";
        const currencyCode = fields.CurrencyCode?.stringValue || "MXN";
        const chargeVAT = fields.ChargeVAT?.booleanValue || false;

        const mappedProduct = {
          title: { stringValue: title },
          handle: { stringValue: handle },
          bodyHtml: { stringValue: fields.Description?.stringValue || "" },
          vendor: { stringValue: "Bind ERP" },
          productType: { stringValue: typeText },
          status: { stringValue: 'ACTIVE' },
          tags: { arrayValue: { values: [] } },
          currency: { stringValue: currencyCode },
          cost: { doubleValue: cost },
          iva: { integerValue: chargeVAT ? 16 : 0 },
          variants: {
            arrayValue: {
              values: [
                {
                  mapValue: {
                    fields: {
                      id: { stringValue: `var-${itemId}` },
                      title: { stringValue: "Default Title" },
                      price: { doubleValue: cost },
                      sku: { stringValue: sku },
                      barcode: { stringValue: barcode },
                      inventoryQuantity: { integerValue: currentInventory },
                      weight: { doubleValue: weight }
                    }
                  }
                }
              ]
            }
          },
          options: {
            arrayValue: {
              values: [
                {
                  mapValue: {
                    fields: {
                      id: { stringValue: "opt-1" },
                      name: { stringValue: "Title" },
                      values: { arrayValue: { values: [{ stringValue: "Default Title" }] } }
                    }
                  }
                }
              ]
            }
          },
          images: { arrayValue: { values: [] } },
          updatedAt: { stringValue: new Date().toISOString() }
        };

        // We merge with existing document to preserve the other raw fields if wanted, or completely overwrite
        return {
          update: {
            name: doc.name,
            fields: {
              ...fields,
              ...mappedProduct
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
        console.error(`Failed to commit batch ${batchCount}:`, await commitRes.text());
        return;
      }

      successCount += chunk.length;
      console.log(`Batch ${batchCount} committed successfully.`);
    }

    console.log(`\n=================================`);
    console.log(`MIGRATED ${successCount} PRODUCTS SUCCESSFULLY!`);
    console.log(`=================================`);

  } catch (e) {
    console.error("Migration error:", e);
  }
}

run();
