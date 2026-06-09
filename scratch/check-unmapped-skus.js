const fs = require('fs');
const path = require('path');
const { loadEnvConfig } = require('@next/env');
const Papa = require('papaparse');

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
    .replace(/[\?\uFFFD]/g, 'n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function run() {
  const catalogDict = {};

  // 1. Load Firestore products
  const productsSnap = await db.collection('companies').doc(companyId).collection('products').get();
  productsSnap.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    const title = data.title || data.Title || '';
    const productMeta = { id, title, isService: !!data.isService };

    if (data.variants && Array.isArray(data.variants)) {
      data.variants.forEach(v => {
        const sku = String(v.sku || v.SKU || '').trim();
        const barcode = String(v.barcode || '').trim();
        if (sku) catalogDict[normalizeSku(sku)] = { ...productMeta, rawSku: sku };
        if (barcode) catalogDict[normalizeSku(barcode)] = { ...productMeta, rawSku: barcode };
      });
    }
    catalogDict[normalizeSku(id)] = { ...productMeta, rawSku: id };
  });

  // 2. Parse local CSVs
  const files = fs.readdirSync(downloadsDir);
  const servicesFile = files.find(f => f.startsWith('Servicios') && f.endsWith('.csv'));
  if (servicesFile) {
    const filePath = path.join(downloadsDir, servicesFile);
    const parsed = Papa.parse(fs.readFileSync(filePath, 'binary'), { header: true });
    parsed.data.forEach(row => {
      const code = String(row.Codigo || '').trim();
      if (code) {
        const norm = normalizeSku(code);
        if (!catalogDict[norm]) {
          catalogDict[norm] = { id: code, title: String(row.Nombre || '').trim(), rawSku: code };
        }
      }
    });
  }

  const productsFiles = files.filter(f => f.startsWith('Productos') && f.endsWith('.csv'));
  productsFiles.forEach(file => {
    const filePath = path.join(downloadsDir, file);
    const parsed = Papa.parse(fs.readFileSync(filePath, 'binary'), { header: true });
    parsed.data.forEach(row => {
      const sku = String(row.SKU || row.sku || '').trim();
      const code = String(row.Codigo || '').trim();
      const csvId = String(row.ID || '').trim();
      const name = String(row.Nombre || row.Titulo || '').trim();
      
      const normSku = sku ? normalizeSku(sku) : '';
      const normCode = code ? normalizeSku(code) : '';
      const normId = csvId ? normalizeSku(csvId) : '';

      const entry = { id: csvId || sku || code, title: name, rawSku: sku || code || csvId };
      if (normSku && !catalogDict[normSku]) catalogDict[normSku] = entry;
      if (normCode && !catalogDict[normCode]) catalogDict[normCode] = entry;
      if (normId && !catalogDict[normId]) catalogDict[normId] = entry;
    });
  });

  // 3. Scan database documents for generic items
  const collections = ['quotes', 'pedidos', 'remisiones', 'facturas'];
  const unmapped = [];

  for (const col of collections) {
    const snap = await db.collection('companies').doc(companyId).collection(col).get();
    snap.forEach(doc => {
      const data = doc.data();
      if (data.items) {
        data.items.forEach(item => {
          const name = String(item.productName || item.ProductName || '').trim();
          if (name === 'Concepto de Venta' || name === 'Concepto General') {
            const normSku = normalizeSku(item.sku);
            if (!catalogDict[normSku]) {
              unmapped.push({
                collection: col,
                docId: doc.id,
                sku: item.sku,
                productName: name,
                price: item.price
              });
            }
          }
        });
      }
    });
  }

  console.log(`=== SCAN COMPLETED ===`);
  console.log(`Total generic items that cannot be mapped: ${unmapped.length}`);
  if (unmapped.length > 0) {
    console.log(JSON.stringify(unmapped, null, 2));
  } else {
    console.log("ALL historical generic items can be mapped successfully!");
  }
}

run().catch(console.error);
