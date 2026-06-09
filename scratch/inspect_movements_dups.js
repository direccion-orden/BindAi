const fs = require('fs');
const path = require('path');

function loadEnvFile(envPath) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    });
  }
}

loadEnvFile(path.join(__dirname, '../.env.production'));
loadEnvFile(path.join(__dirname, '../.env.local'));

const admin = require('firebase-admin');
const projectId = process.env.FIREBASE_PROJECT_ID?.replace(/^["']|["']$/g, '');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.replace(/^["']|["']$/g, '');
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')?.replace(/^["']|["']$/g, '');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const db = admin.firestore();
const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

async function run() {
  const movsCol = db.collection('companies').doc(companyId).collection('inventory_movements');
  const ids = ["remission-35908", "remission-35909", "6855385120899", "6855822442627"];
  
  const snap = await movsCol.get();
  console.log("Looking for movements matching the IDs:");
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (ids.includes(data.referenceId)) {
      console.log(`Movement ID: ${doc.id}`);
      console.log(`  referenceId: ${data.referenceId}`);
      console.log(`  productId: ${data.productId}`);
      console.log(`  variantId: ${data.variantId}`);
      console.log(`  quantity: ${data.quantity}`);
      console.log(`  reason: ${data.reason}`);
      console.log("--------------------------------------");
    }
  });
}

run();
