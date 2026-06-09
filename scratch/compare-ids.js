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

async function lookup() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  
  const productsSnap = await db.collection('companies').doc(companyId).collection('products').get();
  console.log("Searching for SKU SER-FAB or other variants...");
  productsSnap.forEach(doc => {
    const data = doc.data();
    if (data.SKU === 'SER-FAB' || data.sku === 'SER-FAB') {
      console.log(`Found by root SKU: ${doc.id} | ${data.title}`);
    }
    if (data.variants) {
      data.variants.forEach(v => {
        if (v.sku === 'SER-FAB') {
          console.log(`Found by variant SKU: ${doc.id} | ${data.title} | variant: ${v.id}`);
        }
      });
    }
  });
}

lookup().catch(console.error);
