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

async function check() {
  const ids = ['8957481b-acad-48bd-a244-24adc4f3b267', 'e4714385-cb43-4fe2-a5d9-bd1d86257870', '6610000000000', '95006'];
  for (const id of ids) {
    const doc = await db.collection('companies').doc(companyId).collection('products').doc(id).get();
    console.log(`Document ID: "${id}" exists? ${doc.exists}`);
    if (doc.exists) {
      console.log(`  Title: "${doc.data().title}"`);
      console.log(`  Variants:`, JSON.stringify(doc.data().variants));
    }
  }

  // Also query by variant SKU or barcode
  console.log("\nSearching for any product with SKU '95006' or barcode '95006'...");
  const snap = await db.collection('companies').doc(companyId).collection('products').get();
  snap.forEach(doc => {
    const data = doc.data();
    if (data.variants && Array.isArray(data.variants)) {
      data.variants.forEach(v => {
        if (v.sku === '95006' || v.barcode === '95006') {
          console.log(`Found variant SKU/barcode '95006' in product: ${doc.id} - "${data.title}"`);
        }
        if (v.sku === '6610000000000' || v.barcode === '6610000000000') {
          console.log(`Found variant SKU/barcode '6610000000000' in product: ${doc.id} - "${data.title}"`);
        }
      });
    }
  });
}

check().catch(console.error);
