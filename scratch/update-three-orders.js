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
const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
const locationId = '920225d4-fe1a-41ca-83b2-4f01f11829a4';
const locationName = 'PROYECTOS MONTERREY';

const targetOrders = ['2778', '2779', '2780'];

async function run() {
  console.log("=== Updating Branches for Orders 2778, 2779, 2780 ===");
  
  for (const num of targetOrders) {
    const orderId = `order-${num}`;
    const docRef = db.collection('companies').doc(companyId).collection('pedidos').doc(orderId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      console.log(`Order ${orderId} does not exist in Firestore.`);
      continue;
    }
    
    const data = docSnap.data();
    console.log(`\nBefore update for ${orderId}:`);
    console.log(`- clientName: ${data.clientName}`);
    console.log(`- locationId: ${data.locationId}`);
    console.log(`- locationName: ${data.locationName}`);
    
    await docRef.update({
      locationId: locationId,
      locationName: locationName,
      updatedAt: new Date().toISOString()
    });
    
    const updatedSnap = await docRef.get();
    const updatedData = updatedSnap.data();
    console.log(`After update:`);
    console.log(`- locationId: ${updatedData.locationId}`);
    console.log(`- locationName: ${updatedData.locationName}`);
  }
}

run().catch(console.error);
