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

async function listSerServices() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const productsRef = db.collection('companies').doc(companyId).collection('products');
  
  const snapshot = await productsRef.get();
  let services = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if (doc.id.startsWith("SER-") || data.isService || data.productType === "Servicios") {
      services.push({
        id: doc.id,
        title: data.title,
        sku: data.SKU || data.sku || (data.variants && data.variants[0]?.sku) || ""
      });
    }
  });
  
  console.log("Services in Database:");
  console.log(JSON.stringify(services, null, 2));
}

listSerServices().catch(err => {
  console.error(err);
});
