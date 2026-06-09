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

async function inspectAllCodes() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const productsRef = db.collection('companies').doc(companyId).collection('products');
  
  const snapshot = await productsRef.get();
  let matches = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    
    // Collect all text from key identification fields
    const docId = doc.id;
    const sku = (data.SKU || data.sku || "").toString();
    const code = (data.Code || data.code || "").toString();
    
    let variantMatches = [];
    if (data.variants) {
      data.variants.forEach((v, index) => {
        const vSku = (v.sku || "").toString();
        const vBarcode = (v.barcode || "").toString();
        const vId = (v.id || "").toString();
        if (
          vSku.toUpperCase().includes("HIST") || 
          vBarcode.toUpperCase().includes("HIST") ||
          vId.toUpperCase().includes("HIST")
        ) {
          variantMatches.push({ index, id: vId, sku: vSku, barcode: vBarcode });
        }
      });
    }
    
    if (
      docId.toUpperCase().includes("HIST") ||
      sku.toUpperCase().includes("HIST") ||
      code.toUpperCase().includes("HIST") ||
      variantMatches.length > 0
    ) {
      matches.push({
        id: docId,
        title: data.title,
        sku: sku,
        code: code,
        variantMatches
      });
    }
  });
  
  console.log(`Found ${matches.length} products with any code/ID/variant containing "HIST":`);
  console.log(JSON.stringify(matches, null, 2));
}

inspectAllCodes().catch(err => {
  console.error(err);
});
