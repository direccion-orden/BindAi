const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Parse .env.local manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    env[match[1]] = value;
  }
});

let privateKey = env.FIREBASE_PRIVATE_KEY || '';
privateKey = privateKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey
  })
});

const db = admin.firestore();
db.collection('server_errors')
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get()
  .then(snap => {
    if (snap.empty) {
      console.log("No errors found in collection.");
      return;
    }
    const data = snap.docs[0].data();
    console.log("LATEST ERROR LOGGED IN FIRESTORE:");
    console.log("Timestamp:", data.timestamp);
    console.log("Action Name:", data.actionName);
    console.log("Company ID:", data.companyId);
    console.log("Message:", (data.message || '').substring(0, 500));
    console.log("Stack:", (data.stack || '').substring(0, 1000));
  })
  .catch(err => {
    console.error("Error reading logs:", err);
  });
