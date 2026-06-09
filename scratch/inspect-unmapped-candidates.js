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

async function findBotellaEtiqueta() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const productsRef = db.collection('companies').doc(companyId).collection('products');
  
  const snapshot = await productsRef.get();
  let allProducts = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const isHist = (data.variants || []).some(v => (v.sku || "").toUpperCase().startsWith("HIST-"));
    if (!isHist) {
      allProducts.push({ id: doc.id, title: data.title, sku: data.variants?.[0]?.sku || "", barcode: data.variants?.[0]?.barcode || "" });
    }
  });

  const searchTerms = ["botella", "etiqueta", "boquilla", "vinil"];
  
  searchTerms.forEach(term => {
    console.log(`\nSearching for term: "${term}"`);
    const matches = allProducts.filter(p => p.title.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term) || p.id.toLowerCase().includes(term));
    matches.forEach(m => {
      console.log(`  Match: ${m.title} (ID: ${m.id}, SKU: ${m.sku}, Barcode: ${m.barcode})`);
    });
  });
}

findBotellaEtiqueta().catch(err => console.error(err));
