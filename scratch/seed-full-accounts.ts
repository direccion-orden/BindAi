import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import * as admin from 'firebase-admin';

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

import { FULL_SEED_ACCOUNTS } from '../src/lib/constants/satCatalog';

async function run() {
  const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';
  const accountsCol = db.collection('companies').doc(companyId).collection('accounts');
  
  console.log(`Checking existing accounts for company ${companyId}...`);
  const existingSnap = await accountsCol.limit(1).get();
  if (!existingSnap.empty) {
    console.log("Accounts already exist for this company. Skipping seed to prevent duplication.");
    return;
  }

  console.log(`Seeding ${FULL_SEED_ACCOUNTS.length} accounts to company ${companyId}...`);
  
  // Firestore batch limit is 500 documents. Since we have 104, we can do it in a single batch.
  const batch = db.batch();
  let count = 0;
  
  for (const acc of FULL_SEED_ACCOUNTS) {
    const docRef = accountsCol.doc();
    batch.set(docRef, {
      ...acc,
      balance: 0,
      createdAt: new Date().toISOString()
    });
    count++;
  }
  
  await batch.commit();
  console.log(`Successfully seeded ${count} accounts!`);
}

run().catch(console.error);
