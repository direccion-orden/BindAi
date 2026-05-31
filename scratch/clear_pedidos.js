const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const config = {};
env.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) {
    let val = vals.join('=').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    config[key.trim()] = val;
  }
});

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, deleteDoc, updateDoc } = require('firebase/firestore');

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

async function run() {
  try {
    console.log("Firebase initialized for project:", firebaseConfig.projectId);
    
    // 1. Get all companies
    const companiesSnap = await getDocs(collection(db, "companies"));
    if (companiesSnap.empty) {
      console.log("No companies found.");
      return;
    }
    
    for (const companyDoc of companiesSnap.docs) {
      const companyId = companyDoc.id;
      console.log(`\nProcessing company: ${companyId}`);
      
      // 2. Get all pedidos under companies/{companyId}/pedidos
      const pedidosColRef = collection(db, "companies", companyId, "pedidos");
      const pedidosSnap = await getDocs(pedidosColRef);
      
      console.log(`Found ${pedidosSnap.size} pedidos to delete.`);
      
      let deletedCount = 0;
      for (const pedidoDoc of pedidosSnap.docs) {
        const pedidoId = pedidoDoc.id;
        const ref = doc(db, "companies", companyId, "pedidos", pedidoId);
        await deleteDoc(ref);
        deletedCount++;
      }
      console.log(`Deleted ${deletedCount} pedidos.`);
      
      // 3. Reset the pedidos sequence counter
      const counterRef = doc(db, "companies", companyId, "counters", "sequences");
      try {
        await updateDoc(counterRef, {
          pedidos: 0
        });
        console.log(`Reset 'pedidos' sequence counter to 0 for company: ${companyId}`);
      } catch (err) {
        console.log(`Could not reset sequence counter (it might not exist or field doesn't exist yet): ${err.message}`);
      }
    }
    
    console.log("\nFinished successfully!");
  } catch (error) {
    console.error("Error during execution:", error);
  }
}

run();
