const fs = require('fs');
const path = require('path');
const os = require('os');

async function fixOrders() {
  try {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error("firebase-tools.json not found! Try authenticating with firebase login first.");
      return;
    }
    const json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = json.tokens.access_token;
    const projectId = "bind-ai-6f1fc";
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

    console.log("Fetching all orders from Firestore...");
    
    const queryRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/companies/${companyId}:runQuery`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{
            collectionId: "pedidos",
            allDescendants: false
          }]
        }
      })
    });

    if (!queryRes.ok) {
      console.error(`Failed to query orders:`, await queryRes.text());
      return;
    }

    const resJson = await queryRes.json();
    const orders = resJson.filter(p => p.document).map(p => p.document);
    console.log(`Found ${orders.length} total orders in Firestore.`);

    let fixedCount = 0;
    const writes = [];

    for (const docObj of orders) {
      const docName = docObj.name;
      const fields = docObj.fields;
      const orderNumber = fields.orderNumber?.stringValue;
      const totalAmount = parseFloat(fields.totalAmount?.doubleValue || fields.totalAmount?.integerValue || 0);
      const tax = parseFloat(fields.tax?.doubleValue || fields.tax?.integerValue || 0);
      
      const itemsVal = fields.items?.arrayValue?.values;
      if (!itemsVal || !Array.isArray(itemsVal)) continue;

      // Calculate gross subtotal from items
      let grossSubtotal = 0;
      itemsVal.forEach(item => {
        const itemFields = item.mapValue?.fields || {};
        const qty = parseFloat(itemFields.quantity?.integerValue || itemFields.quantity?.doubleValue || 0);
        const price = parseFloat(itemFields.unitPrice?.doubleValue || itemFields.unitPrice?.integerValue || 0);
        grossSubtotal += qty * price;
      });

      // Check if we need to fix this order:
      // Either tax is negative, or totalAmount is less than grossSubtotal * 1.16 by more than $1
      const expectedTotalNoDiscount = grossSubtotal * 1.16;
      const needsFix = tax < -0.01 || (grossSubtotal > 0 && totalAmount < expectedTotalNoDiscount - 1.00);

      if (needsFix) {
        console.log(`\nFixing Order #${orderNumber} (${docName.split('/').pop()}):`);
        console.log(`  Current subtotal: ${fields.subtotal?.doubleValue || fields.subtotal?.integerValue}`);
        console.log(`  Current tax: ${tax}`);
        console.log(`  Current totalAmount: ${totalAmount}`);
        console.log(`  Gross Subtotal from items: ${grossSubtotal}`);

        // Compute global discount percentage
        const taxableSubtotal = totalAmount / 1.16;
        const discountAmt = Math.max(0, grossSubtotal - taxableSubtotal);
        const orderDiscountPercentage = Math.round((discountAmt / grossSubtotal) * 100);
        console.log(`  Calculated Discount: ${orderDiscountPercentage}%`);

        const totalDiscount = grossSubtotal * (orderDiscountPercentage / 100);
        const finalTaxable = grossSubtotal - totalDiscount;
        const finalTax = Math.max(0, totalAmount - finalTaxable);

        console.log(`  New subtotal: ${grossSubtotal}`);
        console.log(`  New totalDiscount: ${totalDiscount}`);
        console.log(`  New tax: ${finalTax}`);

        // Map items to include the discount percentage
        const updatedItems = itemsVal.map(item => {
          const itemFields = item.mapValue?.fields || {};
          return {
            mapValue: {
              fields: {
                ...itemFields,
                discountPercentage: { integerValue: orderDiscountPercentage }
              }
            }
          };
        });

        // Setup Firestore write payload
        const updatedFields = {
          ...fields,
          subtotal: { doubleValue: grossSubtotal },
          totalDiscount: { doubleValue: totalDiscount },
          tax: { doubleValue: finalTax },
          items: { arrayValue: { values: updatedItems } }
        };

        writes.push({
          update: {
            name: docName,
            fields: updatedFields
          }
        });
        
        fixedCount++;
      }
    }

    if (writes.length === 0) {
      console.log("No orders needed fixing.");
      return;
    }

    console.log(`\nCommitting corrections to ${writes.length} orders...`);
    const commitRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ writes })
    });

    if (!commitRes.ok) {
      console.error(`Failed to commit order updates:`, await commitRes.text());
      return;
    }

    console.log(`\nSuccessfully fixed ${fixedCount} orders in Firestore!`);

  } catch (e) {
    console.error("Fix error:", e);
  }
}

fixOrders();
