const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. Load Environment Variables from .env.local
const envPath = path.resolve('.env.local');
if (!fs.existsSync(envPath)) {
  console.error("No se encontró el archivo .env.local");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    envVars[key] = val.replace(/^["']|["']$/g, '');
  }
});

const projectId = envVars['FIREBASE_PROJECT_ID'];
const clientEmail = envVars['FIREBASE_CLIENT_EMAIL'];
const privateKey = envVars['FIREBASE_PRIVATE_KEY'] ? envVars['FIREBASE_PRIVATE_KEY'].replace(/\\n/g, '\n') : null;
const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093"; // Loaded from prior context

if (!projectId || !clientEmail || !privateKey) {
  console.error("Faltan credenciales de Firebase en .env.local");
  process.exit(1);
}

// 2. Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey
  })
});

const db = admin.firestore();

// Helper to extract numbers from folios
function extractNumericValue(val) {
  if (val === undefined || val === null) return 0;
  const match = String(val).match(/^[A-Z]*[- ]*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) || 0;
  }
  const cleaned = String(val).replace(/[^0-9]/g, "");
  return parseInt(cleaned, 10) || 0;
}

async function inspect() {
  console.log("=== INSPECCIONANDO NÚMEROS DE FOLIO MÁXIMOS ===");
  console.log("Company ID:", companyId);

  // A. Cotizaciones
  console.log("\nProcesando Cotizaciones...");
  const quotesSnap = await db.collection('companies').doc(companyId).collection('quotes').get();
  let maxQuote = { num: 0, original: null };
  quotesSnap.forEach(doc => {
    const data = doc.data();
    const val = extractNumericValue(data.quoteNumber);
    if (val > maxQuote.num) {
      maxQuote = { num: val, original: data.quoteNumber };
    }
  });
  console.log(`Max Cotización Encontrada: ${maxQuote.original} (Valor numérico: ${maxQuote.num})`);

  // B. Pedidos
  console.log("\nProcesando Pedidos...");
  const pedidosSnap = await db.collection('companies').doc(companyId).collection('pedidos').get();
  let maxPedido = { num: 0, original: null };
  pedidosSnap.forEach(doc => {
    const data = doc.data();
    const val = extractNumericValue(data.orderNumber);
    if (val > maxPedido.num) {
      maxPedido = { num: val, original: data.orderNumber };
    }
  });
  console.log(`Max Pedido Encontrado: ${maxPedido.original} (Valor numérico: ${maxPedido.num})`);

  // C. Remisiones
  console.log("\nProcesando Remisiones...");
  const remisionesSnap = await db.collection('companies').doc(companyId).collection('remisiones').get();
  let maxRemision = { num: 0, original: null };
  remisionesSnap.forEach(doc => {
    const data = doc.data();
    const val = extractNumericValue(data.remissionNumber);
    if (val > maxRemision.num) {
      maxRemision = { num: val, original: data.remissionNumber };
    }
  });
  console.log(`Max Remisión Encontrada: ${maxRemision.original} (Valor numérico: ${maxRemision.num})`);

  // D. Facturas
  console.log("\nProcesando Facturas...");
  const facturasSnap = await db.collection('companies').doc(companyId).collection('facturas').get();
  let maxFactura = { num: 0, original: null };
  facturasSnap.forEach(doc => {
    const data = doc.data();
    const val = extractNumericValue(data.invoiceNumber);
    if (val > maxFactura.num) {
      maxFactura = { num: val, original: data.invoiceNumber };
    }
  });
  console.log(`Max Factura Encontrada: ${maxFactura.original} (Valor numérico: ${maxFactura.num})`);

  console.log("\n=== RESUMEN DE MÁXIMOS ===");
  console.log(`Cotizaciones: ${maxQuote.num} (${maxQuote.original})`);
  console.log(`Pedidos:      ${maxPedido.num} (${maxPedido.original})`);
  console.log(`Remisiones:   ${maxRemision.num} (${maxRemision.original})`);
  console.log(`Facturas:     ${maxFactura.num} (${maxFactura.original})`);
}

inspect().catch(console.error);
