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
  console.log(`=== RUNNING SERVICES IMPORT & SANITATION (${isDryRun ? 'DRY-RUN SIMULATION' : 'REAL WRITE MODE'}) ===\n`);

  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found at ${csvPath}`);
    process.exit(1);
  }

  // 1. Read and decode the CSV file using Latin1 (ISO-8859-1) decoder
  console.log("Reading and decoding CSV file...");
  const buffer = fs.readFileSync(csvPath);
  const decoder = new TextDecoder('iso-8859-1');
  const csvContent = decoder.decode(buffer);

  // Parse CSV
  const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const serviceRows = parsed.data;
  console.log(`- Parsed ${serviceRows.length} services from CSV file.`);

  // Build Services Dictionary: Codigo -> Service Info
  const servicesDict = {};
  serviceRows.forEach(row => {
    const code = String(row.Codigo || '').trim();
    if (!code) return;
    
    servicesDict[code] = {
      codigo: code,
      nombre: String(row.Nombre || '').trim(),
      categoria1: String(row.Categoria1 || '').trim(),
      categoria2: String(row.Categoria2 || '').trim(),
      categoria3: String(row.Categoria3 || '').trim(),
      claveCfdi: String(row.ClaveCFDI || '').trim(),
      unidadCfdi: String(row.UnidadCFDI || '').trim(),
    };
  });
  console.log(`- Indexed ${Object.keys(servicesDict).length} unique service codes in memory.`);

  // 2. Step 1: Import Services into products collection
  console.log("\n--- Step 1: Importing Services to Products Collection ---");
  let servicesImportedCount = 0;
  const productsBatch = db.batch();
  let productsWriteCount = 0;
  const productsBatches = [];

  for (const code of Object.keys(servicesDict)) {
    const s = servicesDict[code];
    const docRef = db.collection('companies').doc(companyId).collection('products').doc(code);
    
    // Check if product already exists (we'll just overwrite/merge it with complete data)
    const handle = s.nombre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const satUnitName = s.unidadCfdi === 'E48' ? 'Unidad de servicio' : 'Actividad';

    const productData = {
      title: s.nombre,
      handle: handle,
      bodyHtml: "Concepto de venta/Servicio importado de Bind ERP.",
      vendor: "Bind ERP (Servicios)",
      productType: s.categoria1 || "Servicios",
      status: 'ACTIVE',
      tags: ["Servicios", s.categoria1, s.categoria2].filter(Boolean),
      currency: "MXN",
      cost: 0,
      iva: 16,
      satProductCode: s.claveCfdi || "",
      satProductName: s.nombre,
      satUnitCode: s.unidadCfdi || "",
      satUnitName: satUnitName,
      options: [
        { id: "opt-1", name: "Title", values: ["Default Title"] }
      ],
      variants: [
        {
          id: `var-${code}`,
          title: "Default Title",
          price: 0, // default price, actual price comes from historical documents or price lists
          sku: code,
          barcode: code,
          inventoryQuantity: 0,
          weight: 0,
          weightUnit: "kg",
          taxable: true
        }
      ],
      images: [],
      updatedAt: new Date().toISOString(),
      migrated: true,
      isService: true // Mark as service
    };

    if (!isDryRun) {
      productsBatch.set(docRef, productData, { merge: true });
      productsWriteCount++;
      if (productsWriteCount >= 400) {
        productsBatches.push(productsBatch);
        productsBatch = db.batch();
        productsWriteCount = 0;
      }
    }
    servicesImportedCount++;
  }
  if (productsWriteCount > 0) {
    productsBatches.push(productsBatch);
  }
  console.log(`Services to import/update: ${servicesImportedCount}`);

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
    console.log(`\n--- Step 2: Cleaning ${colName} ---`);
    const snap = await db.collection('companies').doc(companyId).collection(colName).get();
    
    snap.forEach(docRef => {
      const data = docRef.data();
      const id = docRef.id;
      updateStats[colName].checked++;

      if (!data.items || !Array.isArray(data.items)) return;

      let hasChanges = false;
      const updatedItems = data.items.map(item => {
        const itemSku = String(item.sku || '').trim();
        const service = servicesDict[itemSku];

        if (service) {
          const expectedName = service.nombre;
          const expectedProductId = service.codigo;
          const expectedVariantId = `var-${service.codigo}`;

          // Check if item details differ from our services catalog details
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
        
        if (colName === 'pedidos' && updateStats.pedidos.updated <= 3) {
          console.log(`  - Pedido ID: ${id} | Item fixed: "${data.items[0]?.productName}" (${data.items[0]?.sku}) -> "${updatedItems[0]?.productName}"`);
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
  console.log(`Services imported/updated: ${servicesImportedCount}`);
  for (const col of collectionsToClean) {
    console.log(`${col.toUpperCase()}: Checked: ${updateStats[col].checked} | Updated/Sanitized: ${updateStats[col].updated}`);
  }

  // 5. Run writes if not Dry-Run
  if (!isDryRun) {
    console.log("\nWriting service catalog to Firestore...");
    for (let i = 0; i < productsBatches.length; i++) {
      await productsBatches[i].commit();
      console.log(`  - Products batch ${i + 1}/${productsBatches.length} committed.`);
    }

    console.log("Writing document sanitation updates to Firestore...");
    for (let i = 0; i < docBatches.length; i++) {
      await docBatches[i].commit();
      console.log(`  - Document batch ${i + 1}/${docBatches.length} committed.`);
    }

    console.log("\n¡CATÁLOGO DE SERVICIOS IMPORTADO Y SANEAMIENTO COMPLETADO EXITOSAMENTE!");
  } else {
    console.log("\nDry-run complete. No changes were written. To run the migration, pass the '--run' flag.");
  }
}

run().catch(console.error);
