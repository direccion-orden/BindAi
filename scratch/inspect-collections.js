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
  console.log("=== Listing root collections ===");
  const collections = await db.listCollections();
  collections.forEach(col => {
    console.log(`Root collection ID: ${col.id}`);
  });
}

run().catch(console.error);
