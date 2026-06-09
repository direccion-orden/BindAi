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

function normalizeText(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .toLowerCase()
    .replace(/\uFFFD/g, "") // remove corrupt char
    .replace(/organizacion/g, "organizacion")
    .replace(/closet/g, "closet")
    .replace(/nino/g, "nino")
    .replace(/nina/g, "nina")
    .replace(/\(cod:.*?\)/gi, "") // remove (Cód: ...)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function findMappings() {
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
      normTitle: normalizeText(data.title),
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
  
  const mappings = [];
  const unmapped = [];
  
  for (const hist of histProducts) {
    // 1. Try exact normalized match
    let match = realProducts.find(p => p.normTitle === hist.normTitle);
    
    // 2. Try matching services by service keywords
    if (!match && hist.isService) {
      if (hist.normTitle.includes("alacena")) {
        match = realProducts.find(p => p.id === "SER-ALACENA");
      } else if (hist.normTitle.includes("blancos")) {
        match = realProducts.find(p => p.id === "SER-BLANCOS");
      } else if (hist.normTitle.includes("bodega")) {
        match = realProducts.find(p => p.id === "SER-BODEGA");
      } else if (hist.normTitle.includes("cocina")) {
        match = realProducts.find(p => p.id === "SER-COCINA");
      } else if (hist.normTitle.includes("oficina")) {
        match = realProducts.find(p => p.id === "SER-OFICINA");
      } else if (hist.normTitle.includes("refrigerador")) {
        match = realProducts.find(p => p.id === "SER-REFRIGERADOR");
      } else if (hist.normTitle.includes("vanity")) {
        match = realProducts.find(p => p.id === "SER-VANITY");
      } else if (hist.normTitle.includes("lavanderia")) {
        match = realProducts.find(p => p.id === "SER-LAVANDERIA");
      } else if (hist.normTitle.includes("closet de hombre") || hist.normTitle.includes("closet hombre")) {
        match = realProducts.find(p => p.id === "SER-HOMBRE");
      } else if (hist.normTitle.includes("closet de mujer") || hist.normTitle.includes("closet mujer")) {
        match = realProducts.find(p => p.id === "SER-MUJER");
      } else if (hist.normTitle.includes("closet de nina") || hist.normTitle.includes("closet nina")) {
        match = realProducts.find(p => p.id === "SER-NINA");
      } else if (hist.normTitle.includes("closet nino") || hist.normTitle.includes("closet de nino")) {
        match = realProducts.find(p => p.id === "SER-NINO");
      } else if (hist.normTitle.includes("bufetero")) {
        match = realProducts.find(p => p.id === "SER-VAJILLAS");
      } else if (hist.normTitle.includes("fabricacion de disenos") || hist.normTitle.includes("ser fab")) {
        match = realProducts.find(p => p.id === "SER-FAB");
      } else if (hist.normTitle.includes("envio")) {
        match = realProducts.find(p => p.id === "SER-ENVIO" || p.id === "CPE");
      }
    }
    
    // 3. Fallbacks for specific products
    if (!match) {
      if (hist.normTitle.includes("relleno para bolsa chico")) {
        match = realProducts.find(p => p.id === "7503041331438");
      } else if (hist.normTitle.includes("relleno para bolsa mediano")) {
        match = realProducts.find(p => p.id === "7503041331445");
      } else if (hist.normTitle.includes("boquilla para botella")) {
        // Look up by ID or SKU
        match = realProducts.find(p => p.sku === "7503041331421" || p.title.toLowerCase().includes("boquilla"));
      } else if (hist.normTitle.includes("contenedor de acrilico con asas 40x12x10")) {
        match = realProducts.find(p => p.sku === "7503041404194" || p.title.includes("40x12x10") || p.title.includes("40 x 12 x 10"));
      } else if (hist.normTitle.includes("organizador acrilico hojas tamano carta")) {
        match = realProducts.find(p => p.sku === "7502322950948" || p.title.toLowerCase().includes("hojas"));
      }
    }
    
    if (match) {
      mappings.push({
        histId: hist.id,
        histTitle: hist.title,
        histSku: hist.sku,
        realId: match.id,
        realTitle: match.title,
        realSku: match.sku
      });
    } else {
      unmapped.push(hist);
    }
  }
  
  console.log(`=== MAPPED PRODUCTS (${mappings.length}) ===`);
  console.log(JSON.stringify(mappings, null, 2));
  
  console.log(`\n=== UNMAPPED PRODUCTS (${unmapped.length}) ===`);
  console.log(JSON.stringify(unmapped, null, 2));
}

findMappings().catch(err => {
  console.error(err);
});
