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
const downloadsDir = 'C:\\Users\\Elitebook 840 G11\\Downloads';

function normalizeSku(sku) {
  return String(sku || '')
    .trim()
    .toLowerCase()
    .replace(/[\?\uFFFD]/g, 'n') // Normalize corrupt chars to 'n'
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents / tildes
    .replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric
}

async function run() {
  const isDryRun = process.argv.includes('--run') === false;
  console.log(`=== RUNNING FINAL CONCEPTOS DE VENTA SANITATION (${isDryRun ? 'DRY-RUN SIMULATION' : 'REAL WRITE MODE'}) ===\n`);

  // Dictionary: Normalized SKU -> { rawSku, id, title, variantId, isService, satProductCode, satUnitCode }
  const catalogDict = {};

  // 1. Load existing products from Firestore
  console.log("Loading existing products from Firestore...");
  const productsSnap = await db.collection('companies').doc(companyId).collection('products').get();
  const existingProductIds = new Set();
  const existingProductsByCode = new Map(); // normalizedCode -> productDetails

  productsSnap.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    existingProductIds.add(id);
    const title = data.title || data.Title || '';
    
    const productMeta = {
      id: id,
      title: title,
      isService: !!data.isService,
      satProductCode: data.satProductCode || '',
      satUnitCode: data.satUnitCode || ''
    };

    // Add doc ID to lookup maps
    const normDocId = normalizeSku(id);
    if (normDocId) {
      existingProductsByCode.set(normDocId, productMeta);
    }

    if (data.variants && Array.isArray(data.variants)) {
      data.variants.forEach(v => {
        const sku = String(v.sku || v.SKU || '').trim();
        const barcode = String(v.barcode || '').trim();
        const variantMeta = {
          ...productMeta,
          rawSku: sku || barcode || id,
          variantId: v.id || `var-${id}`
        };

        if (sku) {
          const normSku = normalizeSku(sku);
          existingProductsByCode.set(normSku, productMeta);
          catalogDict[normSku] = variantMeta;
        }

        if (barcode) {
          const normBarcode = normalizeSku(barcode);
          existingProductsByCode.set(normBarcode, productMeta);
          // Only overwrite catalogDict if SKU wasn't set, or barcode is the primary matching key
          if (!catalogDict[normBarcode]) {
            catalogDict[normBarcode] = variantMeta;
          }
        }
      });
    }

    // Default mapping for document ID itself if variant SKU/barcode didn't populate it
    if (normDocId && !catalogDict[normDocId]) {
      catalogDict[normDocId] = {
        ...productMeta,
        rawSku: id,
        variantId: `var-${id}`
      };
    }
  });
  console.log(`- Loaded ${existingProductIds.size} products representing ${Object.keys(catalogDict).length} unique SKUs.`);

  // 2. Parse all local CSV files in Downloads to populate missing SKUs
  console.log("\nParsing local CSV files to capture missing catalog entries...");
  const files = fs.readdirSync(downloadsDir);

  // Parse Services CSV (decoding as Latin1)
  const servicesFile = files.find(f => f.startsWith('Servicios') && f.endsWith('.csv'));
  if (servicesFile) {
    const filePath = path.join(downloadsDir, servicesFile);
    const buffer = fs.readFileSync(filePath);
    const decoder = new TextDecoder('iso-8859-1');
    const csvContent = decoder.decode(buffer);
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    
    parsed.data.forEach(row => {
      const code = String(row.Codigo || '').trim();
      const nombre = String(row.Nombre || '').trim();
      if (code && nombre) {
        const norm = normalizeSku(code);
        // Let's check if this is already mapped to an existing product in Firestore
        const existing = existingProductsByCode.get(norm);
        if (existing) {
          if (!catalogDict[norm]) {
            catalogDict[norm] = {
              rawSku: code.replace(/[\?\uFFFD]/g, 'Ñ'),
              id: existing.id,
              title: existing.title,
              variantId: `var-${existing.id}`,
              isService: true,
              satProductCode: existing.satProductCode || String(row.ClaveCFDI || '').trim(),
              satUnitCode: existing.satUnitCode || String(row.UnidadCFDI || '').trim()
            };
          }
        } else {
          // If not present, add new service details to catalogDict
          if (!catalogDict[norm]) {
            catalogDict[norm] = {
              rawSku: code.replace(/[\?\uFFFD]/g, 'Ñ'), // Restore Ñ if corrupted
              id: code.replace(/[\?\uFFFD]/g, 'Ñ'),
              title: nombre,
              variantId: `var-${code.replace(/[\?\uFFFD]/g, 'Ñ')}`,
              isService: true,
              satProductCode: String(row.ClaveCFDI || '').trim(),
              satUnitCode: String(row.UnidadCFDI || '').trim()
            };
          }
        }
      }
    });
  }

  // Parse Products CSVs (decoding as Latin1)
  const productsFiles = files.filter(f => f.startsWith('Productos') && f.endsWith('.csv'));
  productsFiles.forEach(file => {
    const filePath = path.join(downloadsDir, file);
    const buffer = fs.readFileSync(filePath);
    const decoder = new TextDecoder('iso-8859-1');
    const csvContent = decoder.decode(buffer);
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

    parsed.data.forEach(row => {
      // Columns: ID, Codigo, SKU, Nombre, etc.
      const csvId = String(row.ID || '').trim();
      const code = String(row.Codigo || '').trim();
      const sku = String(row.SKU || row.sku || '').trim();
      const name = String(row.Nombre || row.Titulo || '').trim();
      
      if (name && (sku || code || csvId)) {
        const normSku = sku ? normalizeSku(sku) : '';
        const normCode = code ? normalizeSku(code) : '';
        const normId = csvId ? normalizeSku(csvId) : '';

        // Check if any code maps to an existing product in Firestore
        let existing = null;
        if (normSku && existingProductsByCode.has(normSku)) existing = existingProductsByCode.get(normSku);
        else if (normCode && existingProductsByCode.has(normCode)) existing = existingProductsByCode.get(normCode);
        else if (normId && existingProductsByCode.has(normId)) existing = existingProductsByCode.get(normId);

        const targetId = existing ? existing.id : (csvId || sku || code);
        const targetTitle = existing ? existing.title : name;
        const targetIsService = existing ? existing.isService : false;
        const targetSatProductCode = existing ? existing.satProductCode : String(row.ClaveCFDI || row.ClaveProdServ || '').trim();
        const targetSatUnitCode = existing ? existing.satUnitCode : String(row.UnidadCFDI || row.ClaveUnidad || '').trim();

        const entry = {
          rawSku: sku || code || csvId,
          id: targetId,
          title: targetTitle,
          variantId: `var-${targetId}`,
          isService: targetIsService,
          satProductCode: targetSatProductCode,
          satUnitCode: targetSatUnitCode
        };

        // Register all available keys in catalogDict
        if (normSku && !catalogDict[normSku]) catalogDict[normSku] = entry;
        if (normCode && !catalogDict[normCode]) catalogDict[normCode] = entry;
        if (normId && !catalogDict[normId]) catalogDict[normId] = entry;
      }
    });
  });

  console.log(`- Catalog mapping expanded to ${Object.keys(catalogDict).length} total unique SKUs.`);

  // 3. Import any missing SKUs into the Firestore products collection
  console.log("\nChecking for missing products that need to be created in Firestore...");
  const missingProductsToCreate = [];
  
  // We'll inspect all quotes, pedidos, remisiones, facturas to see which SKUs actually need to be created
  const collectionsToCheck = ['quotes', 'pedidos', 'remisiones', 'facturas'];
  const skusInUse = new Set();

  for (const colName of collectionsToCheck) {
    const snap = await db.collection('companies').doc(companyId).collection(colName).get();
    snap.forEach(docRef => {
      const data = docRef.data();
      if (data.items) {
        data.items.forEach(item => {
          const sku = String(item.sku || '').trim();
          if (sku) {
            skusInUse.add(normalizeSku(sku));
          }
        });
      }
    });
  }

  // Create products in Firestore for any in-use SKUs that do not exist yet
  for (const normSku of skusInUse) {
    const entry = catalogDict[normSku];
    if (entry && !existingProductIds.has(entry.id)) {
      if (!missingProductsToCreate.some(p => p.id === entry.id)) {
        missingProductsToCreate.push(entry);
      }
    }
  }

  console.log(`- Found ${missingProductsToCreate.length} missing products that are referenced in documents.`);
  
  if (missingProductsToCreate.length > 0) {
    console.log("Details of missing products to create:");
    missingProductsToCreate.forEach(p => {
      console.log(`  - SKU: ${p.rawSku} | Title: ${p.title} | isService: ${p.isService}`);
    });

    if (!isDryRun) {
      const pBatch = db.batch();
      missingProductsToCreate.forEach(p => {
        const docRef = db.collection('companies').doc(companyId).collection('products').doc(p.id);
        const handle = p.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '');

        const satUnitName = p.satUnitCode === 'E48' ? 'Unidad de servicio' : 'Pieza';

        pBatch.set(docRef, {
          title: p.title,
          handle: handle,
          bodyHtml: p.isService ? "Concepto de venta/Servicio importado automáticamente." : "Producto importado automáticamente.",
          vendor: p.isService ? "Bind ERP (Servicios)" : "Bind ERP (Productos)",
          productType: p.isService ? "Servicios" : "Productos",
          status: 'ACTIVE',
          tags: [p.isService ? "Servicios" : "Productos", "Migrado"],
          currency: "MXN",
          cost: 0,
          iva: 16,
          satProductCode: p.satProductCode || "",
          satProductName: p.title,
          satUnitCode: p.satUnitCode || "",
          satUnitName: satUnitName,
          options: [
            { id: "opt-1", name: "Title", values: ["Default Title"] }
          ],
          variants: [
            {
              id: p.variantId,
              title: "Default Title",
              price: 0,
              sku: p.rawSku,
              barcode: p.rawSku,
              inventoryQuantity: 0,
              weight: 0,
              weightUnit: "kg",
              taxable: true
            }
          ],
          images: [],
          updatedAt: new Date().toISOString(),
          migrated: true,
          isService: p.isService
        }, { merge: true });
      });
      await pBatch.commit();
      console.log("  - Successfully created missing products in Firestore.");
    }
  }

  // 4. Sanitize all document items in Firestore
  console.log("\n--- Cleaning up Quotes, Pedidos, Remisiones, and Facturas ---");
  const docBatches = [];
  let currentDocBatch = db.batch();
  let docWriteCount = 0;
  
  const updateStats = {
    quotes: { checked: 0, updated: 0 },
    pedidos: { checked: 0, updated: 0 },
    remisiones: { checked: 0, updated: 0 },
    facturas: { checked: 0, updated: 0 },
  };

  for (const colName of collectionsToCheck) {
    console.log(`\n--- Cleaning ${colName} ---`);
    const snap = await db.collection('companies').doc(companyId).collection(colName).get();
    
    snap.forEach(docRef => {
      const data = docRef.data();
      const id = docRef.id;
      updateStats[colName].checked++;

      if (!data.items || !Array.isArray(data.items)) return;

      let hasChanges = false;
      const updatedItems = data.items.map(item => {
        const itemSku = normalizeSku(item.sku);
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

  // 5. Summarize results
  console.log("\n=== MIGRATION SUMMARY ===");
  for (const col of collectionsToCheck) {
    console.log(`${col.toUpperCase()}: Checked: ${updateStats[col].checked} | Sanitized: ${updateStats[col].updated}`);
  }

  // 6. Execute updates
  if (!isDryRun) {
    console.log("\nWriting document updates to Firestore...");
    for (let i = 0; i < docBatches.length; i++) {
      await docBatches[i].commit();
      console.log(`  - Document batch ${i + 1}/${docBatches.length} committed.`);
    }
    console.log("\n¡SANEAMIENTO Y REGISTRO DE CONCEPTOS DE VENTA COMPLETADO EXITOSAMENTE!");
  } else {
    console.log("\nDry-run complete. No changes were written. To run the migration, pass the '--run' flag.");
  }
}

run().catch(console.error);
