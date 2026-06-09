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

async function migrate() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';

  // 1. Get all remisiones
  console.log("Fetching remisiones...");
  const remisionesSnap = await db.collection('companies').doc(companyId).collection('remisiones').get();
  console.log(`Loaded ${remisionesSnap.size} remisiones.`);

  // 2. Accumulate sales
  const salesCountMap = {};
  remisionesSnap.forEach(doc => {
    const data = doc.data();
    if (data.items && Array.isArray(data.items)) {
      data.items.forEach(item => {
        const prodId = item.productId;
        if (prodId) {
          const qty = parseFloat(item.quantity) || 1;
          salesCountMap[prodId] = (salesCountMap[prodId] || 0) + qty;
        }
      });
    }
  });

  // 3. Get all active products to see which ones exist
  console.log("Fetching active products...");
  const productsSnap = await db.collection('companies').doc(companyId).collection('products').get();
  console.log(`Loaded ${productsSnap.size} total products in database.`);

  // 4. Update products with salesCount
  let updatedCount = 0;
  let batch = db.batch();
  let batchSize = 0;

  for (const doc of productsSnap.docs) {
    const prodId = doc.id;
    const count = salesCountMap[prodId] || 0;
    
    const docRef = db.collection('companies').doc(companyId).collection('products').doc(prodId);
    batch.update(docRef, { salesCount: count });
    batchSize++;
    updatedCount++;

    if (batchSize === 400) {
      console.log(`Committing batch of ${batchSize} products...`);
      await batch.commit();
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    console.log(`Committing final batch of ${batchSize} products...`);
    await batch.commit();
  }

  console.log(`Successfully updated salesCount for ${updatedCount} products!`);
}

migrate().catch(console.error);
