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
  // Check Product document in Firestore
  const pDoc = await db.collection('companies').doc(companyId).collection('products').doc('E80358').get();
  console.log(`Product E80358 exists: ${pDoc.exists}`);
  if (pDoc.exists) {
    console.log("Product data:", pDoc.data());
  }

  // Check how SKU matches in catalog query
  const productsSnap = await db.collection('companies').doc(companyId).collection('products').get();
  console.log(`Total Firestore products: ${productsSnap.size}`);
  let foundBySku = null;
  productsSnap.forEach(doc => {
    const data = doc.data();
    if (data.variants) {
      data.variants.forEach(v => {
        if (v.sku === 'E80358') {
          foundBySku = { id: doc.id, title: data.title, variant: v };
        }
      });
    }
  });
  console.log("Found product by scanning variants for SKU 'E80358':", foundBySku);

  // Check Pedido 2517 items directly
  const orderRef = db.collection('companies').doc(companyId).collection('pedidos').doc('order-2517');
  const orderSnap = await orderRef.get();
  console.log("\nPedido 2517 items:");
  orderSnap.data().items.forEach(item => {
    console.log(`- name: "${item.productName}" | SKU: "${item.sku}" | productId: "${item.productId}" | variantId: "${item.variantId}"`);
  });
}

run().catch(console.error);
