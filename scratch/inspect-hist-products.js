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

async function findHistProducts() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const productsRef = db.collection('companies').doc(companyId).collection('products');
  
  const snapshot = await productsRef.get();
  let histProducts = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const sku = (data.SKU || data.sku || "").toString();
    const code = (data.Code || data.code || "").toString();
    
    if (sku.toUpperCase().startsWith("HIST") || code.toUpperCase().startsWith("HIST")) {
      histProducts.push({
        id: doc.id,
        title: data.title,
        sku: sku,
        code: code,
        status: data.status,
        vendor: data.vendor,
        productType: data.productType,
        isService: data.isService
      });
    }
  });
  
  console.log(`Found ${histProducts.length} products with "HIST" prefix:`);
  console.log(JSON.stringify(histProducts, null, 2));
}

findHistProducts().catch(err => {
  console.error("Error finding hist products:", err);
});
