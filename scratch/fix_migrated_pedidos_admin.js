const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val.replace(/^["']|["']$/g, '');
    }
});

const privateKey = envVars['FIREBASE_PRIVATE_KEY'] ? envVars['FIREBASE_PRIVATE_KEY'].replace(/\\n/g, '\n') : undefined;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: envVars['FIREBASE_PROJECT_ID'] || envVars['NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
      clientEmail: envVars['FIREBASE_CLIENT_EMAIL'],
      privateKey: privateKey,
    }),
  });
}

const db = admin.firestore();

async function run() {
  const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";
  console.log("Fetching all orders from Firestore...");
  const snap = await db.collection("companies").doc(companyId).collection("pedidos").get();
  console.log(`Found ${snap.size} total orders in Firestore.`);

  let fixedCount = 0;
  const batch = db.batch();

  for (const doc of snap.docs) {
    const data = doc.data();
    const orderNumber = data.orderNumber;
    const totalAmount = parseFloat(data.totalAmount || 0);
    const tax = parseFloat(data.tax || 0);
    const items = data.items;

    if (!items || !Array.isArray(items) || items.length === 0) continue;

    // Calculate gross subtotal from items
    let grossSubtotal = 0;
    items.forEach(item => {
      const qty = parseFloat(item.quantity || 0);
      const price = parseFloat(item.unitPrice || 0);
      grossSubtotal += qty * price;
    });

    const expectedTotalNoDiscount = grossSubtotal * 1.16;
    const needsFix = tax < -0.01 || (grossSubtotal > 0 && totalAmount < expectedTotalNoDiscount - 1.00);

    if (needsFix) {
      console.log(`\nFixing Order #${orderNumber} (ID: ${doc.id}):`);
      console.log(`  Current subtotal: ${data.subtotal}`);
      console.log(`  Current tax: ${tax}`);
      console.log(`  Current totalAmount: ${totalAmount}`);
      console.log(`  Gross Subtotal from items: ${grossSubtotal}`);

      // Compute global discount percentage
      const taxableSubtotal = totalAmount / 1.16;
      const discountAmt = Math.max(0, grossSubtotal - taxableSubtotal);
      let orderDiscountPercentage = Math.round((discountAmt / grossSubtotal) * 100);
      if (isNaN(orderDiscountPercentage) || orderDiscountPercentage < 0) {
        orderDiscountPercentage = 0;
      }
      console.log(`  Calculated Discount: ${orderDiscountPercentage}%`);

      const totalDiscount = grossSubtotal * (orderDiscountPercentage / 100);
      const finalTaxable = grossSubtotal - totalDiscount;
      const finalTax = Math.max(0, totalAmount - finalTaxable);

      console.log(`  New subtotal: ${grossSubtotal}`);
      console.log(`  New totalDiscount: ${totalDiscount}`);
      console.log(`  New tax: ${finalTax}`);

      // Map items to include the discount percentage
      const updatedItems = items.map(item => ({
        ...item,
        discountPercentage: orderDiscountPercentage
      }));

      batch.update(doc.ref, {
        subtotal: grossSubtotal,
        totalDiscount: totalDiscount,
        tax: finalTax,
        items: updatedItems
      });

      fixedCount++;
    }
  }

  if (fixedCount > 0) {
    console.log(`\nCommitting updates to ${fixedCount} orders...`);
    await batch.commit();
    console.log("Database successfully updated!");
  } else {
    console.log("No orders needed fixing.");
  }
}

run().catch(console.error);
