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

  console.log("=== Quotes ===");
  const quotes = await db.collection('companies').doc(companyId).collection('quotes').limit(1).get();
  quotes.forEach(doc => console.log(doc.id, JSON.stringify(doc.data(), null, 2)));

  console.log("=== Pedidos ===");
  const pedidos = await db.collection('companies').doc(companyId).collection('pedidos').limit(1).get();
  pedidos.forEach(doc => console.log(doc.id, JSON.stringify(doc.data(), null, 2)));

  console.log("=== Remisiones ===");
  const remisiones = await db.collection('companies').doc(companyId).collection('remisiones').where('remissionNumber', '==', '3667').get();
  remisiones.forEach(doc => console.log(doc.id, JSON.stringify(doc.data(), null, 2)));

  console.log("=== Facturas ===");
  const facturas = await db.collection('companies').doc(companyId).collection('facturas').limit(1).get();
  facturas.forEach(doc => console.log(doc.id, JSON.stringify(doc.data(), null, 2)));
}

inspect().catch(console.error);
