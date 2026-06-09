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

async function listRealProducts() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const productsRef = db.collection('companies').doc(companyId).collection('products');
  
  const snapshot = await productsRef.get();
  let items = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const variants = data.variants || [];
    const hasHistVariant = variants.some(v => (v.sku || "").toUpperCase().startsWith("HIST-"));
    
    if (!hasHistVariant) {
      items.push({
        id: doc.id,
        title: data.title,
        sku: variants[0]?.sku || "",
        isService: !!data.isService || data.productType === "Servicios"
      });
    }
  });
  
  // Sort alphabetically
  items.sort((a, b) => a.title.localeCompare(b.title));
  
  console.log("Real Catalog Products:");
  items.forEach(p => {
    console.log(`- [${p.isService ? 'Service' : 'Product'}] ${p.title} (ID: ${p.id}, SKU: ${p.sku})`);
  });
}

listRealProducts().catch(err => {
  console.error(err);
});
