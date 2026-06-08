const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val.replace(/^["']|["']$/g, '');
    }
});

const privateKey = envVars['FIREBASE_PRIVATE_KEY'] ? envVars['FIREBASE_PRIVATE_KEY'].replace(/\\n/g, '\n') : undefined;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: envVars['FIREBASE_PROJECT_ID'] || envVars['NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
      clientEmail: envVars['FIREBASE_CLIENT_EMAIL'],
      privateKey: privateKey,
    }),
  });
}

const db = admin.firestore();

async function run() {
  const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";
  const snap = await db.collection("companies").doc(companyId).collection("locations").get();
  console.log("LOCATIONS COUNT:", snap.size);
  snap.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

run().catch(console.error);
