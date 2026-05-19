import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccountPath = 'c:\\Users\\Elitebook 840 G11\\.gemini\\antigravity\\playground\\rogue-tyson\\serviceAccountKey.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkClients() {
    const snapshot = await db.collection('clients').limit(5).get();
    console.log(`Found ${snapshot.size} clients.`);
    snapshot.forEach(doc => console.log(doc.data()));
}

checkClients().catch(console.error);
