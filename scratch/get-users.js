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
  const snap = await db.collection('users').limit(5).get();
  console.log("=== Users in DB ===");
  snap.forEach(doc => {
    console.log(`UID: ${doc.id}`);
    console.log("Data:", JSON.stringify(doc.data(), null, 2));
  });
}

run().catch(console.error);
