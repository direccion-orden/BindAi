const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables from .env.local
const envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
  console.error("No se encontró el archivo .env.local");
  process.exit(1);
}

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

const projectId = envVars['FIREBASE_PROJECT_ID'];
const clientEmail = envVars['FIREBASE_CLIENT_EMAIL'];
const privateKey = envVars['FIREBASE_PRIVATE_KEY'] ? envVars['FIREBASE_PRIVATE_KEY'].replace(/\\n/g, '\n') : null;
const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

if (!projectId || !clientEmail || !privateKey) {
  console.error("Faltan credenciales de Firebase en .env.local");
  process.exit(1);
}

// 2. Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey
  })
});

const db = admin.firestore();

async function run() {
  const companyRef = db.collection('companies').doc(companyId);
  const snap = await companyRef.get();
  
  if (!snap.exists) {
    console.error("No se encontró la empresa con ID:", companyId);
    return;
  }

  console.log("Empresa actual encontrada:", snap.data().name);
  
  // Set the companyCode to 100780
  await companyRef.set({
    companyCode: 100780
  }, { merge: true });

  console.log("¡Campo companyCode establecido en 100780 para la empresa actual!");
}

run().catch(console.error);
