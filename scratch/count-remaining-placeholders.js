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

async function run() {
  const collections = ['quotes', 'pedidos', 'remisiones', 'facturas'];
  const results = {};

  for (const col of collections) {
    let count = 0;
    const snap = await db.collection('companies').doc(companyId).collection(col).get();
    snap.forEach(doc => {
      const data = doc.data();
      if (data.items) {
        data.items.forEach(item => {
          const name = String(item.productName || item.ProductName || '').trim();
          if (name === 'Concepto de Venta' || name === 'Concepto General') {
            count++;
          }
        });
      }
    });
    results[col] = count;
  }

  console.log("=== REMAINING GENERIC PLACEHOLDERS IN DATABASE ===");
  console.log(JSON.stringify(results, null, 2));
}

run().catch(console.error);
