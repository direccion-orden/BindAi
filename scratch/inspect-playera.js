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
  const snap = await db.collection('companies').doc(companyId).collection('products')
    .where('title', '==', 'Playera Test')
    .get();

  snap.forEach(doc => {
    console.log("Found Product ID:", doc.id);
    console.log("Data:", JSON.stringify(doc.data(), null, 2));
  });
}

run().catch(console.error);
