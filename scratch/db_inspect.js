const fs = require('fs');
const path = require('path');

// Helper to load env files manually
function loadEnvFile(envPath) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        // Remove quotes if present
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    });
  }
}

// Load .env.production first, then .env.local
loadEnvFile(path.join(__dirname, '../.env.production'));
loadEnvFile(path.join(__dirname, '../.env.local'));

console.log("Project ID:", process.env.FIREBASE_PROJECT_ID);

const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID?.replace(/^["']|["']$/g, '');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.replace(/^["']|["']$/g, '');
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')?.replace(/^["']|["']$/g, '');

if (projectId && clientEmail && privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
  console.log("SDK Initialized");
} else {
  console.error("Missing credentials");
  process.exit(1);
}

const db = admin.firestore();
const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093"; // from previous screenshot/context

async function run() {
  try {
    const remsCol = db.collection('companies').doc(companyId).collection('remisiones');
    // Query all remisiones created today (since 2026-06-08T00:00:00.000Z)
    const snap = await remsCol.get();
    console.log("Total remisiones in DB:", snap.size);
    
    const today = "2026-06-08";
    const todayRems = [];
    snap.docs.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt || "";
      if (createdAt.startsWith(today)) {
        todayRems.push({ id: doc.id, remissionNumber: data.remissionNumber, orderNumber: data.orderNumber, status: data.status, createdAt: data.createdAt, totalAmount: data.totalAmount });
      }
    });
    
    console.log(`\n--- Remisiones created today (${today}) ---`);
    console.log("Count:", todayRems.length);
    console.log(JSON.stringify(todayRems, null, 2));
  } catch (err) {
    console.error("Error running query:", err);
  }
}

run();
