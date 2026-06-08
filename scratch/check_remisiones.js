const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Find service account or config
const envLocalPath = path.join(__dirname, '../.env.local');
let companyId = 'companies'; // fallback
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  const match = envContent.match(/NEXT_PUBLIC_COMPANY_ID\s*=\s*(.*)/);
  if (match) {
    companyId = match[1].trim().replace(/['"]/g, '');
  }
}

// In our workspace, we can initialize admin SDK.
// Let's check if there's a firebase-admin credentials file or use default credentials.
// Next.js uses firebase admin, so let's look for how it's initialized.
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
if (fs.existsSync(serviceAccountPath)) {
  initializeApp({
    credential: cert(require(serviceAccountPath))
  });
} else {
  // Try default
  initializeApp();
}

const db = getFirestore();

async function run() {
  console.log("Using Company ID:", companyId);
  const colRef = db.collection('companies').doc(companyId).collection('remisiones');
  const snapshot = await colRef.orderBy('createdAt', 'desc').limit(5).get();
  
  console.log("Total remisiones found in last 5:", snapshot.size);
  snapshot.forEach(doc => {
    console.log("-----------------------------------------");
    console.log("ID:", doc.id);
    const data = doc.data();
    console.log("isPosSale:", data.isPosSale);
    console.log("createdAt:", data.createdAt);
    console.log("createdAt type:", typeof data.createdAt);
    console.log("remissionNumber:", data.remissionNumber);
    console.log("orderNumber:", data.orderNumber);
    console.log("clientName:", data.clientName);
  });
}

run().catch(console.error);
