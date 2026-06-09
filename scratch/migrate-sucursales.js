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

// Normalized string helper to avoid typos / encoding issues
function normalizeName(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function run() {
  const isDryRun = process.argv.includes('--run') === false;
  console.log(`=== RUNNING SUCURSALES MIGRATION (${isDryRun ? 'DRY-RUN SIMULATION' : 'REAL WRITE MODE'}) ===\n`);

  // 1. Fetch active locations from Firestore
  console.log("Fetching active locations from Firestore...");
  const locationsSnap = await db.collection('companies').doc(companyId).collection('locations').get();
  const locationMap = {}; // Normalized Name -> { id, name }
  const locationIdToName = {};

  locationsSnap.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const name = data.Name || data.name || 'Sin Nombre';
    locationIdToName[id] = name;
    
    const norm = normalizeName(name);
    locationMap[norm] = { id, name };
    console.log(`- Location found: ${name} (${id})`);
  });

  // Add custom synonyms/mappings for CSV values that differ slightly
  locationMap[normalizeName('Páginas Web')] = locationMap[normalizeName('eCOMMERCE')];
  locationMap[normalizeName('PROYECTOS MONTERREY 2')] = locationMap[normalizeName('PROYECTOS MONTERREY')];
  locationMap[normalizeName('Monterrey')] = locationMap[normalizeName('VENTA DIRECTA')]; // Bind's Monterrey warehouse is generally direct sales
  locationMap[normalizeName('San Pedro')] = locationMap[normalizeName('ARBOLEDA')]; // Arboleda is in San Pedro

  // 2. Parse CSV files and construct mapping indices
  console.log("\nReading and parsing local CSV files in Downloads...");
  const files = fs.readdirSync(downloadsDir);
  
  // Mapping indices: folio -> normalized sucursal name
  const pedidosMapping = {};
  const remisionesMapping = {};
  const facturasMapping = {};

  files.forEach(file => {
    if (!file.endsWith('.csv')) return;
    const filePath = path.join(downloadsDir, file);

    if (file.startsWith('Pedidos')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      parsed.data.forEach(row => {
        // Pedido column holds the order number
        const folio = String(row['Pedido'] || row['pedido'] || row['Numero'] || row['numero'] || '').trim();
        const sucursal = String(row['Sucursal'] || row['sucursal'] || '').trim();
        if (folio && sucursal) {
          pedidosMapping[folio] = sucursal;
        }
      });
    } else if (file.startsWith('Ventas')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      parsed.data.forEach(row => {
        const folio = String(row['Numero'] || row['numero'] || row['Folio'] || '').trim();
        const docType = String(row['Documento'] || row['documento'] || '').trim().toLowerCase();
        const sucursal = String(row['Sucursal'] || row['sucursal'] || '').trim();
        
        if (folio && sucursal) {
          if (docType.includes('remis')) {
            remisionesMapping[folio] = sucursal;
          } else if (docType.includes('factur')) {
            facturasMapping[folio] = sucursal;
          }
        }
      });
    }
  });

  console.log(`- Mappings parsed:`);
  console.log(`  - Pedidos folios mapped: ${Object.keys(pedidosMapping).length}`);
  console.log(`  - Remisiones folios mapped: ${Object.keys(remisionesMapping).length}`);
  console.log(`  - Facturas folios mapped: ${Object.keys(facturasMapping).length}`);

  // Helper function to resolve CSV sucursal name to Firestore location ID and Name
  function resolveLocation(csvSucursal) {
    if (!csvSucursal) return null;
    const norm = normalizeName(csvSucursal);
    const loc = locationMap[norm];
    if (loc) return loc;
    
    // Check fuzzy match
    for (const key of Object.keys(locationMap)) {
      if (key.includes(norm) || norm.includes(key)) {
        return locationMap[key];
      }
    }
    return null;
  }

  // 3. Iterate over Pedidos
  console.log("\n--- Processing Pedidos ---");
  const pedidosSnap = await db.collection('companies').doc(companyId).collection('pedidos').get();
  let pedMatched = 0, pedSkipped = 0, pedUnresolved = 0, pedUpdates = 0;
  const pedBatches = [];
  let currentPedBatch = db.batch();
  let pedWriteCount = 0;

  // We will build a helper mapping of quoteNumber -> location so we can resolve quotes later
  const quoteNumberToLocation = {};
  const orderNumberToLocation = {};

  pedidosSnap.forEach(docRef => {
    const data = docRef.data();
    const id = docRef.id;
    const folio = String(data.orderNumber !== undefined ? data.orderNumber : id.replace('order-', '')).trim();

    // Store quote connection if exists
    if (data.quoteNumber) {
      quoteNumberToLocation[data.quoteNumber] = { id: data.locationId, name: data.locationName };
    }

    if (data.locationId && data.locationName) {
      pedSkipped++;
      orderNumberToLocation[folio] = { id: data.locationId, name: data.locationName };
      if (data.quoteNumber) {
        quoteNumberToLocation[data.quoteNumber] = { id: data.locationId, name: data.locationName };
      }
      return;
    }

    // Resolve sucursal from CSV mapping
    const csvSucursal = pedidosMapping[folio];
    const resolved = resolveLocation(csvSucursal);

    if (resolved) {
      pedMatched++;
      orderNumberToLocation[folio] = resolved;
      if (data.quoteNumber) {
        quoteNumberToLocation[data.quoteNumber] = resolved;
      }
      
      if (!isDryRun) {
        currentPedBatch.update(docRef.ref, {
          locationId: resolved.id,
          locationName: resolved.name,
          updatedAt: new Date().toISOString()
        });
        pedWriteCount++;
        if (pedWriteCount >= 400) {
          pedBatches.push(currentPedBatch);
          currentPedBatch = db.batch();
          pedWriteCount = 0;
        }
      }
      pedUpdates++;
    } else {
      // Shopify default logic
      if (folio.startsWith('Ecom-') || folio.startsWith('SHOPIFY-')) {
        const ecomLoc = locationMap[normalizeName('eCOMMERCE')];
        pedMatched++;
        orderNumberToLocation[folio] = ecomLoc;
        if (data.quoteNumber) {
          quoteNumberToLocation[data.quoteNumber] = ecomLoc;
        }

        if (!isDryRun) {
          currentPedBatch.update(docRef.ref, {
            locationId: ecomLoc.id,
            locationName: ecomLoc.name,
            updatedAt: new Date().toISOString()
          });
          pedWriteCount++;
          if (pedWriteCount >= 400) {
            pedBatches.push(currentPedBatch);
            currentPedBatch = db.batch();
            pedWriteCount = 0;
          }
        }
        pedUpdates++;
      } else {
        pedUnresolved++;
      }
    }
  });
  if (pedWriteCount > 0) pedBatches.push(currentPedBatch);

  console.log(`Pedidos Summary: Total: ${pedidosSnap.size} | Already set (skipped): ${pedSkipped} | Matched & update-ready: ${pedMatched} | Unresolved: ${pedUnresolved}`);

  // 4. Iterate over Remisiones
  console.log("\n--- Processing Remisiones ---");
  const remisionesSnap = await db.collection('companies').doc(companyId).collection('remisiones').get();
  let remMatched = 0, remSkipped = 0, remUnresolved = 0, remUpdates = 0;
  const remBatches = [];
  let currentRemBatch = db.batch();
  let remWriteCount = 0;

  remisionesSnap.forEach(docRef => {
    const data = docRef.data();
    const id = docRef.id;
    const folio = String(data.remissionNumber !== undefined ? data.remissionNumber : id.replace('remission-', '')).trim();

    if (data.locationId && data.locationName) {
      remSkipped++;
      return;
    }

    // Shopify default logic
    if (folio.startsWith('Ecom-') || folio.startsWith('SHOPIFY-') || folio.startsWith('Ecom')) {
      const ecomLoc = locationMap[normalizeName('eCOMMERCE')];
      remMatched++;
      if (!isDryRun) {
        currentRemBatch.update(docRef.ref, {
          locationId: ecomLoc.id,
          locationName: ecomLoc.name,
          updatedAt: new Date().toISOString()
        });
        remWriteCount++;
        if (remWriteCount >= 400) {
          remBatches.push(currentRemBatch);
          currentRemBatch = db.batch();
          remWriteCount = 0;
        }
      }
      remUpdates++;
      return;
    }

    // Resolve sucursal from CSV mapping
    let csvSucursal = remisionesMapping[folio];
    
    // Fallback: If not in CSV, check if order exists with location
    if (!csvSucursal && data.orderNumber && orderNumberToLocation[data.orderNumber]) {
      const ordLoc = orderNumberToLocation[data.orderNumber];
      csvSucursal = ordLoc.name;
    }

    const resolved = resolveLocation(csvSucursal);

    if (resolved) {
      remMatched++;
      if (!isDryRun) {
        currentRemBatch.update(docRef.ref, {
          locationId: resolved.id,
          locationName: resolved.name,
          updatedAt: new Date().toISOString()
        });
        remWriteCount++;
        if (remWriteCount >= 400) {
          remBatches.push(currentRemBatch);
          currentRemBatch = db.batch();
          remWriteCount = 0;
        }
      }
      remUpdates++;
    } else {
      remUnresolved++;
    }
  });
  if (remWriteCount > 0) remBatches.push(currentRemBatch);

  console.log(`Remisiones Summary: Total: ${remisionesSnap.size} | Already set (skipped): ${remSkipped} | Matched & update-ready: ${remMatched} | Unresolved: ${remUnresolved}`);

  // 5. Iterate over Facturas
  console.log("\n--- Processing Facturas ---");
  const facturasSnap = await db.collection('companies').doc(companyId).collection('facturas').get();
  let facMatched = 0, facSkipped = 0, facUnresolved = 0, facUpdates = 0;
  const facBatches = [];
  let currentFacBatch = db.batch();
  let facWriteCount = 0;

  facturasSnap.forEach(docRef => {
    const data = docRef.data();
    const id = docRef.id;
    const folio = String(data.invoiceNumber !== undefined ? data.invoiceNumber : id.replace('invoice-', '')).trim();

    if (data.locationId && data.locationName) {
      facSkipped++;
      return;
    }

    // Shopify default logic
    if (folio.startsWith('Ecom-') || folio.startsWith('SHOPIFY-')) {
      const ecomLoc = locationMap[normalizeName('eCOMMERCE')];
      facMatched++;
      if (!isDryRun) {
        currentFacBatch.update(docRef.ref, {
          locationId: ecomLoc.id,
          locationName: ecomLoc.name,
          updatedAt: new Date().toISOString()
        });
        facWriteCount++;
        if (facWriteCount >= 400) {
          facBatches.push(currentFacBatch);
          currentFacBatch = db.batch();
          facWriteCount = 0;
        }
      }
      facUpdates++;
      return;
    }

    // Resolve sucursal from CSV mapping
    const csvSucursal = facturasMapping[folio];
    const resolved = resolveLocation(csvSucursal);

    if (resolved) {
      facMatched++;
      if (!isDryRun) {
        currentFacBatch.update(docRef.ref, {
          locationId: resolved.id,
          locationName: resolved.name,
          updatedAt: new Date().toISOString()
        });
        facWriteCount++;
        if (facWriteCount >= 400) {
          facBatches.push(currentFacBatch);
          currentFacBatch = db.batch();
          facWriteCount = 0;
        }
      }
      facUpdates++;
    } else {
      facUnresolved++;
    }
  });
  if (facWriteCount > 0) facBatches.push(currentFacBatch);

  console.log(`Facturas Summary: Total: ${facturasSnap.size} | Already set (skipped): ${facSkipped} | Matched & update-ready: ${facMatched} | Unresolved: ${facUnresolved}`);

  // 6. Iterate over Cotizaciones (Quotes)
  console.log("\n--- Processing Quotes ---");
  const quotesSnap = await db.collection('companies').doc(companyId).collection('quotes').get();
  let qMatched = 0, qSkipped = 0, qUnresolved = 0, qUpdates = 0;
  const qBatches = [];
  let currentQBatch = db.batch();
  let qWriteCount = 0;

  quotesSnap.forEach(docRef => {
    const data = docRef.data();
    const id = docRef.id;
    const folio = String(data.quoteNumber !== undefined ? data.quoteNumber : id.replace('quote-', '')).trim();

    if (data.locationId && data.locationName) {
      qSkipped++;
      return;
    }

    // Cascaded Quotes Resolution:
    // A) Check quoteNumberToLocation filled from pedidos loop
    let resolved = quoteNumberToLocation[folio];

    // B) Fallback: Check seller name mapping
    if (!resolved && data.createdBy) {
      const seller = data.createdBy.trim().toLowerCase();
      // Map sellers to their default branches:
      // eCommerce / eCommerce sellers
      if (seller.includes('magaly') || seller.includes('martha') || seller.includes('shopify')) {
        resolved = locationMap[normalizeName('eCOMMERCE')];
      } 
      // Arboleda sellers
      else if (seller.includes('ana mier') || seller.includes('irene') || seller.includes('arboleda')) {
        resolved = locationMap[normalizeName('ARBOLEDA')];
      }
      // Proyectos / Venta Directa
      else if (seller.includes('humberto') || seller.includes('proyectos')) {
        resolved = locationMap[normalizeName('VENTA DIRECTA')];
      }
    }

    // C) Global Fallback: VENTA DIRECTA as default for legacy bind quotes if still unresolved
    if (!resolved) {
      resolved = locationMap[normalizeName('VENTA DIRECTA')];
    }

    if (resolved && resolved.id) {
      qMatched++;
      if (!isDryRun) {
        currentQBatch.update(docRef.ref, {
          locationId: resolved.id,
          locationName: resolved.name,
          updatedAt: new Date().toISOString()
        });
        qWriteCount++;
        if (qWriteCount >= 400) {
          qBatches.push(currentQBatch);
          currentQBatch = db.batch();
          qWriteCount = 0;
        }
      }
      qUpdates++;
    } else {
      qUnresolved++;
    }
  });
  if (qWriteCount > 0) qBatches.push(currentQBatch);

  console.log(`Quotes Summary: Total: ${quotesSnap.size} | Already set (skipped): ${qSkipped} | Matched & update-ready: ${qMatched} | Unresolved: ${qUnresolved}`);

  // 7. Write Execution
  if (!isDryRun) {
    console.log("\nExecuting Firestore updates in batches...");
    
    console.log(`- Writing Pedidos batches (${pedBatches.length})...`);
    for (let i = 0; i < pedBatches.length; i++) {
      await pedBatches[i].commit();
      console.log(`  - Pedidos batch ${i + 1}/${pedBatches.length} committed.`);
    }

    console.log(`- Writing Remisiones batches (${remBatches.length})...`);
    for (let i = 0; i < remBatches.length; i++) {
      await remBatches[i].commit();
      console.log(`  - Remisiones batch ${i + 1}/${remBatches.length} committed.`);
    }

    console.log(`- Writing Facturas batches (${facBatches.length})...`);
    for (let i = 0; i < facBatches.length; i++) {
      await facBatches[i].commit();
      console.log(`  - Facturas batch ${i + 1}/${facBatches.length} committed.`);
    }

    console.log(`- Writing Quotes batches (${qBatches.length})...`);
    for (let i = 0; i < qBatches.length; i++) {
      await qBatches[i].commit();
      console.log(`  - Quotes batch ${i + 1}/${qBatches.length} committed.`);
    }

    console.log("\n¡MIGRACIÓN COMPLETADA EXITOSAMENTE!");
  } else {
    console.log("\nDry-run complete. No changes were written. To write the updates, run the script with '--run' flag.");
  }
}

run().catch(console.error);
