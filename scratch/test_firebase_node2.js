const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const config = {};
env.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) config[key.trim()] = vals.join('=').trim();
});

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, writeBatch, doc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: config.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: config.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: config.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: config.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: config.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: config.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function run() {
  try {
    // If auth is required, we would need credentials. Let's try anonymous or just write directly.
    console.log("Firebase initialized");
    // Parse CSV
    const csv = fs.readFileSync('C:\\Users\\Elitebook 840 G11\\Downloads\\Proveedores.csv', 'latin1');
    const lines = csv.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    const records = lines.slice(1).map(line => {
      // Very basic CSV parser. Doesn't handle commas inside quotes.
      // Wait, let's use a better approach if needed.
      const vals = line.split(',');
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = vals[i] ? vals[i].trim() : '';
      });
      return obj;
    });

    console.log("Found " + records.length + " records");
    
    // Upload
    // We don't know the companyId. It's usually 'default' or something. Let's find out!
    console.log(records[0]);
    
  } catch (e) {
    console.error(e);
  }
}
run();
