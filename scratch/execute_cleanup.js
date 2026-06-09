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
  const remsCol = db.collection('companies').doc(companyId).collection('remisiones');
  
  const dup1 = remsCol.doc("remission-35908");
  const dup2 = remsCol.doc("remission-35909");
  
  const shop1 = remsCol.doc("6855385120899");
  const shop2 = remsCol.doc("6855822442627");
  
  console.log("Starting transaction/batch operations...");
  const batch = db.batch();
  
  // 1. Delete manual duplicate documents
  console.log("Queuing deletion of remission-35908...");
  batch.delete(dup1);
  console.log("Queuing deletion of remission-35909...");
  batch.delete(dup2);
  
  // 2. Update Shopify webhook documents with Ecom- prefix
  console.log("Queuing update of 6855385120899 to Ecom-3665...");
  batch.update(shop1, { remissionNumber: "Ecom-3665", updatedAt: new Date().toISOString() });
  
  console.log("Queuing update of 6855822442627 to Ecom-3666...");
  batch.update(shop2, { remissionNumber: "Ecom-3666", updatedAt: new Date().toISOString() });
  
  await batch.commit();
  console.log("SUCCESS: Deletions and updates completed successfully in Firestore.");
}

run();
