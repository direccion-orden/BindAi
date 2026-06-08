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

// Correct private key cleaning
let privateKey = env.FIREBASE_PRIVATE_KEY || '';
// Strip surrounding quotes
privateKey = privateKey.replace(/^["']|["']$/g, '');
// Replace literal \n with real newlines
privateKey = privateKey.replace(/\\n/g, '\n');

console.log("Private Key starts with:", privateKey.substring(0, 40));
console.log("Private Key ends with:", privateKey.substring(privateKey.length - 40));

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
  .limit(10)
  .get()
  .then(snap => {
    console.log("Found", snap.size, "recent errors:");
    snap.docs.forEach((doc, idx) => {
      const data = doc.data();
      console.log(`\n--- Error #${idx + 1} (${data.timestamp}) ---`);
      console.log("Action Name:", data.actionName);
      console.log("Company ID:", data.companyId);
      console.log("Message:", data.message);
      console.log("Stack:", data.stack);
    });
  })
  .catch(err => {
    console.error("Error reading logs from Firestore:", err);
  });
