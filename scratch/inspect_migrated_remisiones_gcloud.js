const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const tokenPath = path.join(__dirname, 'temp_token.txt');
    if (!fs.existsSync(tokenPath)) {
      console.error("Access token file not found. Run scratch/get_firebase_token.js first.");
      return;
    }
    const accessToken = fs.readFileSync(tokenPath, 'utf8').trim();
    console.log("Access token loaded successfully.");

    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";
    const targetNumbers = ["35779", "35819", "35818"];

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
        
        // Helper to format values
        const formatVal = (f) => {
          if (!f) return null;
          if (f.doubleValue !== undefined) return f.doubleValue;
          if (f.integerValue !== undefined) return parseInt(f.integerValue, 10);
          if (f.stringValue !== undefined) return f.stringValue;
          if (f.booleanValue !== undefined) return f.booleanValue;
          return JSON.stringify(f);
        };

        // Print key totals
        console.log("isPosSale:", formatVal(fields.isPosSale));
        console.log("status:", formatVal(fields.status));
        console.log("createdAt:", formatVal(fields.createdAt));
        console.log("clientName:", formatVal(fields.clientName));
        console.log("totalAmount:", formatVal(fields.totalAmount));
        console.log("subtotal:", formatVal(fields.subtotal));
        console.log("tax:", formatVal(fields.tax));
        
        // Print items
        const items = fields.items?.arrayValue?.values || [];
        console.log(`\nItems (${items.length}):`);
        items.forEach((item, index) => {
          const itemFields = item.mapValue?.fields || {};
          console.log(`  [Item ${index + 1}]`);
          console.log(`    productName:`, formatVal(itemFields.productName) || formatVal(itemFields.title));
          console.log(`    quantity:`, formatVal(itemFields.quantity));
          console.log(`    unitPrice:`, formatVal(itemFields.unitPrice));
          console.log(`    discountPercentage:`, formatVal(itemFields.discountPercentage));
        });
      });
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
