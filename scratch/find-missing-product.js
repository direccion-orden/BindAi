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

async function countStatuses() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const productsRef = db.collection('companies').doc(companyId).collection('products');
  
  const snapshot = await productsRef.get();
  const statusCounts = {};
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const status = data.status;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  console.log("Product status counts in Firestore:", statusCounts);
}

countStatuses().catch(err => {
  console.error("Error counting statuses:", err);
});
