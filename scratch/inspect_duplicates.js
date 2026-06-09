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
  const snap = await remsCol.get();
  
  console.log("Looking for remisiones matching 35908 or 35909:");
  snap.docs.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const remissionNumber = String(data.remissionNumber || "");
    const orderNumber = String(data.orderNumber || "");
    
    // Check if it matches 35908 or 35909 in either field
    if (
      id.includes("35908") || id.includes("35909") ||
      remissionNumber.includes("35908") || remissionNumber.includes("35909") ||
      orderNumber.includes("35908") || orderNumber.includes("35909") ||
      // Or if orderNumber is SHOPIFY-3666 or SHOPIFY-3665 (which correspond to 35909 and 35908)
      orderNumber.includes("3666") || orderNumber.includes("3667")
    ) {
      console.log(`Document ID: ${id}`);
      console.log(`  remissionNumber: ${data.remissionNumber} (${typeof data.remissionNumber})`);
      console.log(`  orderNumber: ${data.orderNumber}`);
      console.log(`  clientName: ${data.clientName}`);
      console.log(`  isShopifySale: ${data.isShopifySale}`);
      console.log(`  migrated: ${data.migrated}`);
      console.log(`  createdAt: ${data.createdAt}`);
      console.log(`  totalAmount: ${data.totalAmount}`);
      console.log("--------------------------------------");
    }
  });
}

run();
