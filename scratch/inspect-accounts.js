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

async function run() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const snap = await db.collection('companies').doc(companyId).collection('accounts').get();
  
  console.log(`=== Accounts found: ${snap.size} ===`);
  const samples = [];
  snap.forEach(doc => {
    samples.push({ id: doc.id, ...doc.data() });
  });

  // Print all distinct types and levels
  const types = new Set();
  const levels = new Set();
  samples.forEach(a => {
    types.add(a.type);
    levels.add(a.level);
  });
  console.log("Distinct types:", Array.from(types));
  console.log("Distinct levels:", Array.from(levels));

  // Print some samples of accounts that might be ingresos
  console.log("\n=== Samples of accounts with code starting with '4' ===");
  const code4 = samples.filter(a => a.code?.startsWith('4'));
  code4.forEach(a => {
    console.log(`ID: ${a.id}, Code: ${a.code}, Name: ${a.name}, Type: ${a.type}, Level: ${a.level}`);
  });

  // Print first 5 overall accounts as reference
  console.log("\n=== First 5 Accounts ===");
  samples.slice(0, 5).forEach(a => {
    console.log(`ID: ${a.id}, Code: ${a.code}, Name: ${a.name}, Type: ${a.type}, Level: ${a.level}`);
  });
}

run().catch(console.error);
