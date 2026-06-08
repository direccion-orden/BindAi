const fs = require('fs');
const admin = require('firebase-admin');

// Load environment variables from .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

// Configure Firebase Admin
const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const db = admin.firestore();

async function run() {
  const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";
  const targetClientId = "c7adc103-b269-4c42-8ee8-0eef3a4645e9";
  
  try {
    console.log("Searching payments for ANGELICA GALVAN...");
    const paySnap = await db.collection("companies").doc(companyId).collection("payments")
      .where("clientId", "==", targetClientId)
      .get();
    console.log(`Found ${paySnap.size} payments:`);
    paySnap.docs.forEach(doc => {
      console.log(`\nPayment ID: ${doc.id}`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });

    console.log("\nSearching anticipos for ANGELICA GALVAN...");
    const antSnap = await db.collection("companies").doc(companyId).collection("anticipos")
      .where("clientId", "==", targetClientId)
      .get();
    console.log(`Found ${antSnap.size} anticipos:`);
    antSnap.docs.forEach(doc => {
      console.log(`\nAnticipo ID: ${doc.id}`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });

  } catch (err) {
    console.error(err);
  }
}

run();
