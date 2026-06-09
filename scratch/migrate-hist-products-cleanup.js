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
const isRun = process.argv.includes('--run');

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

async function runMigration() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const companyRef = db.collection('companies').doc(companyId);
  
  console.log(`=== STARTING HIST CLEANUP MIGRATION (Mode: ${isRun ? 'EXECUTION' : 'DRY-RUN'}) ===\n`);
  
  // 1. Fetch all products to resolve mappings
  console.log("Fetching products to build mappings...");
  const productsSnap = await companyRef.collection('products').get();
  
  let histProducts = [];
  let realProducts = [];
  let realProductsMap = {};
  
  productsSnap.forEach(doc => {
    const data = doc.data();
    const docId = doc.id;
    const variants = data.variants || [];
    const hasHistVariant = variants.some(v => (v.sku || "").toUpperCase().startsWith("HIST-"));
    const isService = !!data.isService || data.productType === "Servicios" || data.title.toLowerCase().includes("servicio");
    
    const info = {
      id: docId,
      title: data.title,
      normTitle: normalizeText(data.title),
      sku: variants[0]?.sku || "",
      barcode: variants[0]?.barcode || "",
      isService,
      variants
    };
    
    if (hasHistVariant) {
      histProducts.push(info);
    } else {
      realProducts.push(info);
      realProductsMap[docId] = info;
    }
  });
  
  const mappings = {}; // histId -> realId
  const toArchive = []; // hist products to keep but archive
  
  for (const hist of histProducts) {
    // A. Match by normalized title
    let match = realProducts.find(p => p.normTitle === hist.normTitle);
    
    // B. Keyword-based matching for services
    if (!match && hist.isService) {
      if (hist.normTitle.includes("alacena")) {
        match = realProducts.find(p => p.id === "SER-ALACENA");
      } else if (hist.normTitle.includes("blancos") || hist.normTitle.includes("clset de blancos")) {
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
      } else if (
        hist.normTitle.includes("closet de hombre") || 
        hist.normTitle.includes("closet hombre") || 
        hist.normTitle.includes("clset de hombre") || 
        hist.normTitle.includes("clset hombre")
      ) {
        match = realProducts.find(p => p.id === "SER-CLOSET-HOMBRE");
      } else if (
        hist.normTitle.includes("closet de mujer") || 
        hist.normTitle.includes("closet mujer") || 
        hist.normTitle.includes("clset de mujer") || 
        hist.normTitle.includes("clset mujer")
      ) {
        match = realProducts.find(p => p.id === "SER-CLOSET-MUJER");
      } else if (
        hist.normTitle.includes("closet de nina") || 
        hist.normTitle.includes("closet nina") || 
        hist.normTitle.includes("clset de nia") || 
        hist.normTitle.includes("clset nia")
      ) {
        match = realProducts.find(p => p.id === "SER-CLOSET-NIÑA");
      } else if (
        hist.normTitle.includes("closet nino") || 
        hist.normTitle.includes("closet de nino") || 
        hist.normTitle.includes("clset nio") || 
        hist.normTitle.includes("clset de nio")
      ) {
        match = realProducts.find(p => p.id === "SER-CLOSET-NIÑO");
      } else if (hist.normTitle.includes("bufetero")) {
        match = realProducts.find(p => p.id === "SER-BUFETERO");
      } else if (hist.normTitle.includes("fabricacion de disenos") || hist.normTitle.includes("ser fab")) {
        match = realProducts.find(p => p.id === "SER-FAB");
      } else if (hist.normTitle.includes("envio")) {
        match = realProducts.find(p => p.id === "SER-ENVIO" || p.id === "CPE");
      }
    }
    
    // C. Fallbacks for physical catalog variations
    if (!match) {
      if (hist.normTitle.includes("relleno para bolsa chico")) {
        match = realProducts.find(p => p.id === "7503041331438");
      } else if (hist.normTitle.includes("relleno para bolsa mediano")) {
        match = realProducts.find(p => p.id === "7503041331445");
      } else if (hist.normTitle.includes("contenedor de acrilico con asas 40x12x10")) {
        match = realProducts.find(p => p.id === "8422672924803");
      } else if (
        hist.normTitle.includes("organizador acrilico hojas tamano carta") || 
        hist.normTitle.includes("hojas tamao carta") || 
        hist.normTitle.includes("hojas tamano carta")
      ) {
        match = realProducts.find(p => p.id === "91131");
      } else if (hist.normTitle.includes("ebook inspiracion y usos")) {
        match = realProducts.find(p => p.id === "8215263215747");
      } else if (hist.normTitle.includes("concepto de venta")) {
        match = realProducts.find(p => p.id === "SER-ORG");
      }
    }
    
    if (match) {
      mappings[hist.id] = match.id;
    } else {
      // Products without matching counterparts will be archived rather than deleted to protect documents integrity
      toArchive.push(hist);
    }
  }
  
  console.log(`Mapped ${Object.keys(mappings).length} historical products to catalog real IDs.`);
  console.log(`Archiving ${toArchive.length} historical products (no counterpart found).\n`);
  
  // 2. Loop transaction collections to re-link references
  const collectionsToUpdate = ['quotes', 'pedidos', 'remisiones', 'facturas'];
  let totalDocsUpdated = 0;
  
  for (const collName of collectionsToUpdate) {
    console.log(`Scanning collection "${collName}"...`);
    const snap = await companyRef.collection(collName).get();
    
    let collUpdated = 0;
    
    for (const doc of snap.docs) {
      const docData = doc.data();
      const docId = doc.id;
      
      if (!docData.items || !Array.isArray(docData.items)) continue;
      
      let docNeedsUpdate = false;
      const updatedItems = docData.items.map(item => {
        const histId = item.productId;
        if (mappings[histId]) {
          const realId = mappings[histId];
          const realProduct = realProductsMap[realId];
          const realVariantId = realProduct?.variants?.[0]?.id || realId;
          
          docNeedsUpdate = true;
          return {
            ...item,
            productId: realId,
            variantId: realVariantId
          };
        }
        return item;
      });
      
      if (docNeedsUpdate) {
        collUpdated++;
        totalDocsUpdated++;
        console.log(`  [MATCH] doc ${docId} in "${collName}" references mapped historical items.`);
        
        if (isRun) {
          await companyRef.collection(collName).doc(docId).update({ items: updatedItems });
        }
      }
    }
    console.log(`Finished "${collName}". Mapped documents: ${collUpdated}\n`);
  }
  
  // 3. Loop inventory movements
  console.log('Scanning collection "inventory_movements"...');
  const movSnap = await companyRef.collection('inventory_movements').get();
  let movementsUpdated = 0;
  
  for (const doc of movSnap.docs) {
    const movData = doc.data();
    const docId = doc.id;
    const histId = movData.productId;
    
    if (mappings[histId]) {
      movementsUpdated++;
      const realId = mappings[histId];
      const realProduct = realProductsMap[realId];
      const realVariantId = realProduct?.variants?.[0]?.id || realId;
      
      console.log(`  [MATCH] movement ${docId} references mapped historical item (product ${histId} -> ${realId}).`);
      
      if (isRun) {
        await companyRef.collection('inventory_movements').doc(docId).update({
          productId: realId,
          variantId: realVariantId
        });
      }
    }
  }
  console.log(`Finished inventory movements. Mapped documents: ${movementsUpdated}\n`);
  
  // 4. Delete mapped duplicate products and Archive unmappable ones
  console.log('Cleaning up duplicate products in collection "products"...');
  
  let deletedCount = 0;
  let archivedCount = 0;
  
  for (const [histId, realId] of Object.entries(mappings)) {
    deletedCount++;
    console.log(`  Deleting duplicate product document ${histId} ("${histProducts.find(p => p.id === histId)?.title}")...`);
    if (isRun) {
      await companyRef.collection('products').doc(histId).delete();
    }
  }
  
  for (const hist of toArchive) {
    archivedCount++;
    let cleanSku = "";
    if (hist.normTitle.includes("boquilla")) {
      cleanSku = "BOQUILLA-BOTELLA-ARCH";
    } else if (hist.normTitle.includes("etiqueta")) {
      cleanSku = "ETIQ-VINIL-ARCH";
    } else {
      cleanSku = `ARCH-${hist.id.substring(0, 8).toUpperCase()}`;
    }
    
    console.log(`  Archiving product document ${hist.id} ("${hist.title}") -> changing SKU to "${cleanSku}"...`);
    
    if (isRun) {
      const updatedVariants = hist.variants.map(v => ({
        ...v,
        sku: cleanSku,
        barcode: cleanSku
      }));
      
      await companyRef.collection('products').doc(hist.id).update({
        status: 'ARCHIVED',
        variants: updatedVariants,
        tags: ['Archivado', 'Histórico', 'Migrado']
      });
    }
  }
  
  console.log(`\n=== CLEANUP COMPLETED ===`);
  console.log(`Total Sales Documents Remapped: ${totalDocsUpdated}`);
  console.log(`Total Inventory Movements Remapped: ${movementsUpdated}`);
  console.log(`Total Products Deleted: ${deletedCount}`);
  console.log(`Total Products Archived: ${archivedCount}`);
  if (!isRun) {
    console.log(`\nNOTE: Run script with '--run' parameter to commit changes to Firestore.`);
  }
}

runMigration().catch(err => {
  console.error("Migration error:", err);
});
