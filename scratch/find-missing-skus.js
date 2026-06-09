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
  console.log("=== Inspecting Remaining Generic Items in Pedidos ===");
  const pedidosSnap = await db.collection('companies').doc(companyId).collection('pedidos').get();
  
  const missingSkus = new Set();
  
  pedidosSnap.forEach(doc => {
    const data = doc.data();
    if (data.items) {
      data.items.forEach(item => {
        if (item.productName === 'Concepto de Venta') {
          missingSkus.add(item.sku);
        }
      });
    }
  });

  console.log("Unique SKUs still labeled 'Concepto de Venta' in Pedidos:");
  console.log(Array.from(missingSkus));
}

run().catch(console.error);
