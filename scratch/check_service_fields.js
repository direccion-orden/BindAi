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
db.collection('companies').doc('0cb93750-138e-4b7d-832e-3a37b95c5093').collection('products')
  .where('isService', '==', true)
  .limit(2)
  .get()
  .then(snap => {
    console.log(`Found ${snap.size} services`);
    snap.forEach(d => {
      console.log(d.id, d.data());
    });
  });
