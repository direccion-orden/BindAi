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

async function inspect() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';

  console.log("=== Inspecting Documents for Location Data ===");

  // 1. Cotizaciones (Quotes)
  const quotesSnap = await db.collection('companies').doc(companyId).collection('quotes').limit(5).get();
  console.log("\n--- Quotes ---");
  quotesSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Quote ${data.quoteNumber || doc.id}:`);
    const locFields = Object.keys(data).filter(k => k.toLowerCase().includes('loc') || k.toLowerCase().includes('suc') || k.toLowerCase().includes('wh') || k.toLowerCase().includes('alm') || k.toLowerCase().includes('branch'));
    console.log("  Location-related keys found:", locFields);
    locFields.forEach(k => console.log(`    ${k}:`, data[k]));
  });

  // 2. Pedidos (Orders)
  const pedidosSnap = await db.collection('companies').doc(companyId).collection('pedidos').limit(5).get();
  console.log("\n--- Pedidos ---");
  pedidosSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Pedido ${data.orderNumber || doc.id}:`);
    const locFields = Object.keys(data).filter(k => k.toLowerCase().includes('loc') || k.toLowerCase().includes('suc') || k.toLowerCase().includes('wh') || k.toLowerCase().includes('alm') || k.toLowerCase().includes('branch'));
    console.log("  Location-related keys found:", locFields);
    locFields.forEach(k => console.log(`    ${k}:`, data[k]));
  });

  // 3. Remisiones (Remissions)
  const remisionesSnap = await db.collection('companies').doc(companyId).collection('remisiones').limit(5).get();
  console.log("\n--- Remisiones ---");
  remisionesSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Remision ${data.remissionNumber || doc.id}:`);
    const locFields = Object.keys(data).filter(k => k.toLowerCase().includes('loc') || k.toLowerCase().includes('suc') || k.toLowerCase().includes('wh') || k.toLowerCase().includes('alm') || k.toLowerCase().includes('branch'));
    console.log("  Location-related keys found:", locFields);
    locFields.forEach(k => console.log(`    ${k}:`, data[k]));
  });

  // 4. Facturas (Invoices)
  const facturasSnap = await db.collection('companies').doc(companyId).collection('facturas').limit(5).get();
  console.log("\n--- Facturas ---");
  facturasSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Factura ${data.invoiceNumber || doc.id}:`);
    const locFields = Object.keys(data).filter(k => k.toLowerCase().includes('loc') || k.toLowerCase().includes('suc') || k.toLowerCase().includes('wh') || k.toLowerCase().includes('alm') || k.toLowerCase().includes('branch'));
    console.log("  Location-related keys found:", locFields);
    locFields.forEach(k => console.log(`    ${k}:`, data[k]));
  });
}

inspect().catch(console.error);
