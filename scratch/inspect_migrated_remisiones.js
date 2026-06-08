const fs = require('fs');
const path = require('path');
const os = require('os');

async function run() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error("Firebase CLI config not found at:", configPath);
      return;
    }
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    const targetNumbers = ["35779", "35819", "35818"];
    console.log(`Inspecting remisiones: ${targetNumbers.join(', ')}...`);

    for (const num of targetNumbers) {
      console.log(`\n=================== REMISSION ${num} ===================`);
      const queryRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}:runQuery`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{
              collectionId: "remisiones",
              allDescendants: false
            }],
            where: {
              fieldFilter: {
                field: { fieldPath: "remissionNumber" },
                op: "EQUAL",
                value: { stringValue: num }
              }
            }
          }
        })
      });

      if (!queryRes.ok) {
        console.error(`Failed to query remission ${num}:`, await queryRes.text());
        continue;
      }

      const results = await queryRes.json();
      const docs = results.filter(r => r.document).map(r => r.document);

      if (docs.length === 0) {
        console.log(`No documents found for remissionNumber: ${num}`);
        continue;
      }

      docs.forEach(doc => {
        console.log("Document Name:", doc.name);
        const fields = doc.fields || {};
        
        // Print key totals
        console.log("isPosSale:", fields.isPosSale?.booleanValue);
        console.log("status:", fields.status?.stringValue);
        console.log("createdAt:", fields.createdAt?.stringValue);
        console.log("clientName:", fields.clientName?.stringValue);
        console.log("totalAmount:", fields.totalAmount?.doubleValue || fields.totalAmount?.integerValue);
        console.log("subtotal:", fields.subtotal?.doubleValue || fields.subtotal?.integerValue);
        console.log("tax:", fields.tax?.doubleValue || fields.tax?.integerValue);
        
        // Print items
        const items = fields.items?.arrayValue?.values || [];
        console.log(`\nItems (${items.length}):`);
        items.forEach((item, index) => {
          const itemFields = item.mapValue?.fields || {};
          console.log(`  [Item ${index + 1}]`);
          console.log(`    productName:`, itemFields.productName?.stringValue || itemFields.title?.stringValue);
          console.log(`    quantity:`, itemFields.quantity?.doubleValue || itemFields.quantity?.integerValue);
          console.log(`    unitPrice:`, itemFields.unitPrice?.doubleValue || itemFields.unitPrice?.integerValue);
          console.log(`    discountPercentage:`, itemFields.discountPercentage?.doubleValue || itemFields.discountPercentage?.integerValue);
        });
      });
    }

  } catch (e) {
    console.error("Error running script:", e);
  }
}

run();
