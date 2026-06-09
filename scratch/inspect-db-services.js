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
  console.log("=== Checking Collections for Services ===");
  
  // 1. List subcollections under company document
  const companyRef = db.collection('companies').doc(companyId);
  const subcollections = await companyRef.listCollections();
  console.log("Subcollections found under company document:");
  subcollections.forEach(col => {
    console.log(`- ${col.id}`);
  });

  // 2. Check if there are any products with productType: "Servicio" or similar
  const productsSnap = await companyRef.collection('products').where('productType', '==', 'Servicio').limit(5).get();
  console.log(`\nProducts with type 'Servicio': ${productsSnap.size}`);
  productsSnap.forEach(doc => {
    console.log(`- ${doc.id} => SKU: ${doc.data().variants?.[0]?.sku} | Title: ${doc.data().title}`);
  });

  // 3. Inspect items in quotes/pedidos/remisiones/facturas containing "Concepto de Venta" or "Concepto General"
  console.log("\nInspecting Quotes for 'Concepto de Venta' or 'Concepto General':");
  const quotesSnap = await companyRef.collection('quotes').limit(200).get();
  let qCount = 0;
  quotesSnap.forEach(doc => {
    const data = doc.data();
    if (data.items) {
      data.items.forEach(item => {
        if (item.productName && (item.productName.includes('Concepto') || item.productName === 'Concepto General')) {
          qCount++;
          if (qCount <= 5) {
            console.log(`- Quote ${data.quoteNumber} has item:`, item);
          }
        }
      });
    }
  });
  console.log(`Total quotes items matching 'Concepto': ${qCount}`);

  console.log("\nInspecting Pedidos for 'Concepto de Venta' or 'Concepto General':");
  const pedidosSnap = await companyRef.collection('pedidos').limit(200).get();
  let pCount = 0;
  pedidosSnap.forEach(doc => {
    const data = doc.data();
    if (data.items) {
      data.items.forEach(item => {
        if (item.productName && (item.productName.includes('Concepto') || item.productName === 'Concepto de Venta' || item.productName === 'Concepto General')) {
          pCount++;
          if (pCount <= 5) {
            console.log(`- Pedido ${data.orderNumber} has item:`, item);
          }
        }
      });
    }
  });
  console.log(`Total pedidos items matching 'Concepto': ${pCount}`);

  console.log("\nInspecting Remisiones for 'Concepto de Venta' or 'Concepto General':");
  const remisionesSnap = await companyRef.collection('remisiones').limit(200).get();
  let rCount = 0;
  remisionesSnap.forEach(doc => {
    const data = doc.data();
    if (data.items) {
      data.items.forEach(item => {
        if (item.productName && (item.productName.includes('Concepto') || item.productName === 'Concepto de Venta' || item.productName === 'Concepto General')) {
          rCount++;
          if (rCount <= 5) {
            console.log(`- Remisión ${data.remissionNumber} has item:`, item);
          }
        }
      });
    }
  });
  console.log(`Total remisiones items matching 'Concepto': ${rCount}`);

}

run().catch(console.error);
