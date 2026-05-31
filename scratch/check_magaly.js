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
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

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
    console.log("Connecting to Firebase Project:", firebaseConfig.projectId);
    
    // 1. Find client
    const clientsSnap = await getDocs(collection(db, "companies"));
    if (clientsSnap.empty) {
      console.log("No companies found.");
      return;
    }
    
    const companyId = clientsSnap.docs[0].id;
    console.log("Active Company ID:", companyId);
    
    const clientsRef = collection(db, "companies", companyId, "clients");
    const allClientsSnap = await getDocs(clientsRef);
    let magaly = null;
    
    allClientsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const name = data.legalName || data.name || "";
      if (name.toLowerCase().includes("magaly") && name.toLowerCase().includes("maldonado")) {
        magaly = { id: docSnap.id, name };
      }
    });
    
    if (!magaly) {
      console.log("Magaly Maldonado not found in the current company's clients list.");
      return;
    }
    
    console.log(`Found Magaly Maldonado: ID = ${magaly.id}, Name = ${magaly.name}`);
    
    // 2. Fetch payments under companies/{companyId}/payments
    const paymentsRef = collection(db, "companies", companyId, "payments");
    const paymentsQuery = query(paymentsRef, where("clientId", "==", magaly.id));
    const paymentsSnap = await getDocs(paymentsQuery);
    
    let paymentsTotal = 0;
    console.log("\n--- Payments (Pagos) ---");
    paymentsSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const amt = parseFloat(d.amount) || 0;
      paymentsTotal += amt;
      console.log(`- Pago [ID: ${docSnap.id}]: Date = ${d.date}, Amount = $${amt}, Doc = ${d.documentNumber}, Ref = ${d.reference}`);
    });
    console.log(`Total Payments Amount: $${paymentsTotal}`);
    
    // 3. Fetch anticipos under companies/{companyId}/anticipos
    const anticiposRef = collection(db, "companies", companyId, "anticipos");
    const anticiposQuery = query(anticiposRef, where("clientId", "==", magaly.id));
    const anticiposSnap = await getDocs(anticiposQuery);
    
    let anticiposTotal = 0;
    console.log("\n--- Anticipos ---");
    anticiposSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const amt = parseFloat(d.amount) || 0;
      anticiposTotal += amt;
      console.log(`- Anticipo [ID: ${docSnap.id}]: Date = ${d.receivedAt || d.createdAt}, Amount = $${amt}, Ref = ${d.reference}, Balance = $${d.balance}`);
    });
    console.log(`Total Anticipos Amount: $${anticiposTotal}`);
    
    console.log(`\n===========================================`);
    console.log(`TOTAL ABONOS IN DEVELOPER INSTANCE: $${paymentsTotal + anticiposTotal}`);
    console.log(`===========================================`);
    
  } catch (error) {
    console.error("Error checking Magaly's account statement:", error);
  }
}

run();
