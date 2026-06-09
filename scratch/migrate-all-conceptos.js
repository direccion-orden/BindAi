const fs = require('fs');
const path = require('path');
const { loadEnvConfig } = require('@next/env');
const Papa = require('papaparse');

// Load environment variables
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
const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
const csvPath = 'C:\\Users\\Elitebook 840 G11\\Downloads\\Servicios (2).csv';

async function run() {
  const isDryRun = process.argv.includes('--run') === false;
  console.log(`=== RUNNING EXTENDED CONCEPTOS DE VENTA SANITATION (${isDryRun ? 'DRY-RUN SIMULATION' : 'REAL WRITE MODE'}) ===\n`);

  // 1. Load all current products from Firestore
  console.log("Loading all existing products from Firestore...");
  const productsSnap = await db.collection('companies').doc(companyId).collection('products').get();
  
  // Dictionary: SKU -> { id, title, variantId }
  const catalogDict = {};
  
  productsSnap.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const title = data.title || data.Title || '';
    
    if (data.variants && Array.isArray(data.variants)) {
      data.variants.forEach(v => {
        const sku = String(v.sku || v.SKU || '').trim();
        if (sku) {
          catalogDict[sku.toLowerCase()] = {
            id: id,
            title: title,
            variantId: v.id || `var-${id}`
          };
        }
      });
    }
  });
  console.log(`- Loaded ${Object.keys(catalogDict).length} SKUs from Firestore products.`);

  // 2. Read and decode the CSV file if it exists, to ensure Services entries are fully updated in memory
  if (fs.existsSync(csvPath)) {
    console.log("Reading services CSV to supplement catalog dictionary...");
    const buffer = fs.readFileSync(csvPath);
    const decoder = new TextDecoder('iso-8859-1');
    const csvContent = decoder.decode(buffer);
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    
    parsed.data.forEach(row => {
      const code = String(row.Codigo || '').trim();
      const nombre = String(row.Nombre || '').trim();
      if (code && nombre) {
        catalogDict[code.toLowerCase()] = {
          id: code,
          title: nombre,
          variantId: `var-${code}`
        };
      }
    });
  }

  // 3. Step 2: Saneamiento de documentos históricos (quotes, pedidos, remisiones, facturas)
  const collectionsToClean = ['quotes', 'pedidos', 'remisiones', 'facturas'];
  const updateStats = {
    quotes: { checked: 0, updated: 0 },
    pedidos: { checked: 0, updated: 0 },
    remisiones: { checked: 0, updated: 0 },
    facturas: { checked: 0, updated: 0 },
  };

  const docBatches = [];
  let currentDocBatch = db.batch();
  let docWriteCount = 0;

  for (const colName of collectionsToClean) {
    console.log(`\n--- Cleaning ${colName} ---`);
    const snap = await db.collection('companies').doc(companyId).collection(colName).get();
    
    snap.forEach(docRef => {
      const data = docRef.data();
      const id = docRef.id;
      updateStats[colName].checked++;

      if (!data.items || !Array.isArray(data.items)) return;

      let hasChanges = false;
      const updatedItems = data.items.map(item => {
        const itemSku = String(item.sku || '').trim().toLowerCase();
        const entry = catalogDict[itemSku];

        if (entry) {
          const expectedName = entry.title;
          const expectedProductId = entry.id;
          const expectedVariantId = entry.variantId;

          // Check if item details differ
          if (
            item.productName !== expectedName ||
            item.productId !== expectedProductId ||
            item.variantId !== expectedVariantId
          ) {
            hasChanges = true;
            return {
              ...item,
              productName: expectedName,
              productId: expectedProductId,
              variantId: expectedVariantId,
            };
          }
        }
        return item;
      });

      if (hasChanges) {
        updateStats[colName].updated++;
        
        if (colName === 'pedidos' && updateStats.pedidos.updated <= 5) {
          const changed = updatedItems.filter((item, idx) => item.productName !== data.items[idx].productName);
          console.log(`  - Pedido ID: ${id} | Sanitized items: ${changed.map(c => `"${c.productName}" (${c.sku})`).join(', ')}`);
        }

        if (!isDryRun) {
          currentDocBatch.update(docRef.ref, {
            items: updatedItems,
            updatedAt: new Date().toISOString()
          });
          docWriteCount++;
          if (docWriteCount >= 400) {
            docBatches.push(currentDocBatch);
            currentDocBatch = db.batch();
            docWriteCount = 0;
          }
        }
      }
    });
  }
  if (docWriteCount > 0) {
    docBatches.push(currentDocBatch);
  }

  // 4. Summarize results
  console.log("\n=== MIGRATION SUMMARY ===");
  for (const col of collectionsToClean) {
    console.log(`${col.toUpperCase()}: Checked: ${updateStats[col].checked} | Sanitized: ${updateStats[col].updated}`);
  }

  // 5. Run writes if not Dry-Run
  if (!isDryRun) {
    console.log("\nWriting document updates to Firestore...");
    for (let i = 0; i < docBatches.length; i++) {
      await docBatches[i].commit();
      console.log(`  - Document batch ${i + 1}/${docBatches.length} committed.`);
    }
    console.log("\n¡SANEAMIENTO COMPLETO DE CONCEPTOS DE VENTA COMPLETADO EXITOSAMENTE!");
  } else {
    console.log("\nDry-run complete. No changes were written. To run the migration, pass the '--run' flag.");
  }
}

run().catch(console.error);
