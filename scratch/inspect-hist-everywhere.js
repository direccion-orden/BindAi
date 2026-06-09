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

async function searchEverywhere() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const companyRef = db.collection('companies').doc(companyId);
  
  const collections = ['quotes', 'pedidos', 'remisiones', 'facturas', 'products', 'inventory_movements'];
  
  for (const collName of collections) {
    console.log(`Checking collection "${collName}"...`);
    const snap = await companyRef.collection(collName).get();
    let matchCount = 0;
    
    snap.forEach(doc => {
      const data = doc.data();
      const docStr = JSON.stringify(data).toUpperCase();
      if (docStr.includes('"HIST') || docStr.includes(':HIST') || docStr.includes('/HIST')) {
        matchCount++;
        if (matchCount <= 5) {
          console.log(`  Match found in doc: ${doc.id}`);
          // Print some fields
          if (data.items) {
            const histItems = data.items.filter(item => {
              const str = JSON.stringify(item).toUpperCase();
              return str.includes('HIST');
            });
            console.log(`    Matching items:`, JSON.stringify(histItems, null, 2));
          } else {
            console.log(`    Doc keys matching:`, Object.keys(data).filter(k => k.toUpperCase().includes('HIST')));
            console.log(`    Doc snippet:`, JSON.stringify(data).slice(0, 150));
          }
        }
      }
    });
    console.log(`Collection "${collName}" had ${matchCount} matches containing "HIST".\n`);
  }
}

searchEverywhere().catch(err => {
  console.error(err);
});
