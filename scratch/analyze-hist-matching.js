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

async function analyzeMatching() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const productsRef = db.collection('companies').doc(companyId).collection('products');
  
  const snapshot = await productsRef.get();
  
  let histProducts = [];
  let realProducts = [];
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const docId = doc.id;
    const variants = data.variants || [];
    const hasHistVariant = variants.some(v => (v.sku || "").toUpperCase().startsWith("HIST-"));
    const isService = !!data.isService || data.productType === "Servicios";
    
    const info = {
      id: docId,
      title: data.title,
      cleanTitle: data.title.trim().toLowerCase(),
      sku: variants[0]?.sku || "",
      barcode: variants[0]?.barcode || "",
      isService
    };
    
    if (hasHistVariant) {
      histProducts.push(info);
    } else {
      realProducts.push(info);
    }
  });
  
  console.log(`Summary:`);
  console.log(`  Historical products (with HIST- variants): ${histProducts.length}`);
  console.log(`  Real catalog products: ${realProducts.length}\n`);
  
  let exactMatches = [];
  let unmapped = [];
  
  for (const hist of histProducts) {
    // Look for exact match by name in real products
    const match = realProducts.find(p => p.cleanTitle === hist.cleanTitle);
    if (match) {
      exactMatches.push({
        hist,
        real: match
      });
    } else {
      // Look for fuzzy matches (e.g. one contains another)
      const partials = realProducts.filter(p => 
        p.cleanTitle.includes(hist.cleanTitle) || hist.cleanTitle.includes(p.cleanTitle)
      );
      unmapped.push({
        hist,
        partials: partials.map(p => ({ id: p.id, title: p.title, sku: p.sku }))
      });
    }
  }
  
  console.log(`--- Exact Matches Found (${exactMatches.length}) ---`);
  exactMatches.forEach(m => {
    console.log(`HIST Product: "${m.hist.title}" (${m.hist.id}) -> SKU: ${m.hist.sku}`);
    console.log(`REAL Product: "${m.real.title}" (${m.real.id}) -> SKU: ${m.real.sku}`);
    console.log(`----------------------------------------`);
  });
  
  console.log(`\n--- Unmapped/No Exact Match (${unmapped.length}) ---`);
  unmapped.forEach(u => {
    console.log(`HIST Product: "${u.hist.title}" (${u.hist.id}) -> SKU: ${u.hist.sku} | Service: ${u.hist.isService}`);
    if (u.partials.length > 0) {
      console.log(`  Suggested Partials:`, u.partials);
    } else {
      console.log(`  No suggestions.`);
    }
    console.log(`----------------------------------------`);
  });
}

analyzeMatching().catch(err => {
  console.error(err);
});
