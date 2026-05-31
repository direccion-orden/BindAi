const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const config = {};
env.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) config[key.trim()] = vals.join('=').trim();
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
    // Assuming companyId is the first one or we can search all
    const snap = await getDocs(collection(db, "companies"));
    if (snap.empty) { console.log("No companies"); return; }
    const companyId = snap.docs[0].id;
    console.log("Using company:", companyId);

    const clientsSnap = await getDocs(collection(db, "companies", companyId, "clients"));
    const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`Found ${clients.length} clients`);

    // Group by name
    const grouped = {};
    clients.forEach(c => {
      const key = (c.name || c.LegalName || c.CommercialName || "UNKNOWN").trim().toLowerCase();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    });

    let deleted = 0;
    let updated = 0;

    // Deduplicate
    for (const key of Object.keys(grouped)) {
      const group = grouped[key];
      if (group.length > 1) {
        // Find the one with UUID (Bind ID)
        const bindClient = group.find(c => c.id.length > 30); // UUIDs are 36 chars, Firebase random are 20
        // Find the one with address (CSV imported)
        const csvClient = group.find(c => c.id.length === 20 && c.address);

        if (bindClient && csvClient) {
          // Update Bind client with CSV data
          const ref = doc(db, "companies", companyId, "clients", bindClient.id);
          await updateDoc(ref, {
            address: csvClient.address || "",
            zipCode: csvClient.zipCode || "",
            city: csvClient.city || "",
            state: csvClient.state || "",
            neighborhood: csvClient.neighborhood || ""
          });
          updated++;
          // Delete CSV client
          const delRef = doc(db, "companies", companyId, "clients", csvClient.id);
          await deleteDoc(delRef);
          deleted++;
        } else if (group.length === 2 && !bindClient && csvClient) {
           // Maybe none is UUID?
        }
      }
    }
    console.log(`Deduplication complete! Updated ${updated} records and deleted ${deleted} duplicates.`);

  } catch (e) {
    console.error("Error:", e.message);
  }
}
run();
