const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    console.log("Querying Firestore for products statistics...");

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
      console.error(`Failed to query company specific products:`, await queryRes.text());
      return;
    }

    const productsData = await queryRes.json();
    const products = productsData.filter(p => p.document).map(p => p.document);
    
    console.log(`\nTotal products found: ${products.length}`);

    // Aggregate statistics
    let statusCounts = {};
    let vendorCounts = {};
    let noTitleCount = 0;
    let noSkuCount = 0;
    let duplicateSkus = {};
    let skuMap = new Map();

    products.forEach(doc => {
      const fields = doc.fields || {};
      const title = fields.title?.stringValue || fields.name?.stringValue;
      if (!title) noTitleCount++;

      const status = fields.status?.stringValue || "NO_STATUS";
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      const vendor = fields.vendor?.stringValue || "NO_VENDOR";
      vendorCounts[vendor] = (vendorCounts[vendor] || 0) + 1;

      // Extract SKU
      const variants = fields.variants?.arrayValue?.values || [];
      const sku = variants[0]?.mapValue?.fields?.sku?.stringValue || fields.sku?.stringValue;
      
      if (!sku) {
        noSkuCount++;
      } else {
        const cleanedSku = sku.trim();
        if (skuMap.has(cleanedSku)) {
          duplicateSkus[cleanedSku] = (duplicateSkus[cleanedSku] || 1) + 1;
        } else {
          skuMap.set(cleanedSku, true);
        }
      }
    });

    console.log("\n--- STATISTICS ---");
    console.log("By Status:");
    console.log(statusCounts);
    console.log("\nBy Vendor:");
    console.log(vendorCounts);
    console.log(`\nProducts with no title: ${noTitleCount}`);
    console.log(`Products with no SKU: ${noSkuCount}`);
    
    const duplicateSkuList = Object.keys(duplicateSkus);
    console.log(`Unique SKUs: ${skuMap.size}`);
    console.log(`Duplicate SKUs count: ${duplicateSkuList.length}`);
    if (duplicateSkuList.length > 0) {
      console.log("Examples of duplicate SKUs (SKU -> count):");
      duplicateSkuList.slice(0, 10).forEach(sku => {
        console.log(`  - "${sku}": ${duplicateSkus[sku]}`);
      });
    }

    // Let's print 5 examples of products without SKU
    if (noSkuCount > 0) {
      console.log("\nExamples of products without SKU:");
      let count = 0;
      for (const doc of products) {
        if (count >= 5) break;
        const fields = doc.fields || {};
        const title = fields.title?.stringValue || fields.name?.stringValue || "No Name";
        const variants = fields.variants?.arrayValue?.values || [];
        const sku = variants[0]?.mapValue?.fields?.sku?.stringValue || fields.sku?.stringValue;
        if (!sku) {
          console.log(`  - Title: "${title}", ID: "${doc.name.split('/').pop()}"`);
          count++;
        }
      }
    }

  } catch (e) {
    console.error(e);
  }
}

run();
