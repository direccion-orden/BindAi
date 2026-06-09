const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID?.replace(/^["']|["']$/g, ''),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.replace(/^["']|["']$/g, ''),
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')?.replace(/^["']|["']$/g, ''),
    })
  });
}

const db = admin.firestore();
const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';

const skus = ['E80358', 'E80642', '7503041331360', 'E80630', 'B0DJHJ4HNF', '43182723137667', '6610000000000', '8142855929987', 'SER-BAO'];

async function run() {
  console.log("=== Searching for SKUs in Firestore Products ===");
  const productsSnap = await db.collection('companies').doc(companyId).collection('products').get();
  
  const results = {};
  skus.forEach(sku => {
    results[sku.toLowerCase()] = [];
  });

  productsSnap.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const title = data.title;
    
    // Check if document ID matches
    const idLower = id.toLowerCase();
    if (results.hasOwnProperty(idLower)) {
      results[idLower].push({ foundIn: 'docId', id, title });
    }

    // Check SKU in variants
    if (data.variants && Array.isArray(data.variants)) {
      data.variants.forEach(v => {
        const vSku = String(v.sku || v.SKU || '').trim().toLowerCase();
        if (results.hasOwnProperty(vSku)) {
          results[vSku].push({ foundIn: 'variantSku', id, title, variant: v });
        }
        const vBarcode = String(v.barcode || '').trim().toLowerCase();
        if (results.hasOwnProperty(vBarcode)) {
          results[vBarcode].push({ foundIn: 'variantBarcode', id, title, variant: v });
        }
      });
    }
  });

  skus.forEach(sku => {
    const key = sku.toLowerCase();
    const found = results[key];
    console.log(`\nSKU: "${sku}"`);
    if (found.length === 0) {
      console.log("  - NOT found in Firestore products.");
    } else {
      found.forEach(f => {
        console.log(`  - Found in ${f.foundIn} | docId: ${f.id} | Title: "${f.title}"`);
      });
    }
  });
}

run().catch(console.error);
