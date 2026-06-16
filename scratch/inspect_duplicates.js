const fs = require('fs');
const path = require('path');

function loadEnvFile(envPath) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    });
  }
}

loadEnvFile(path.join(__dirname, '../.env.production'));
loadEnvFile(path.join(__dirname, '../.env.local'));

const admin = require('firebase-admin');
const projectId = process.env.FIREBASE_PROJECT_ID?.replace(/^["']|["']$/g, '');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.replace(/^["']|["']$/g, '');
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')?.replace(/^["']|["']$/g, '');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const db = admin.firestore();
const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

async function run() {
  const clientsCol = db.collection('companies').doc(companyId).collection('clients');
  
  console.log("=== CARRUSELLO Clients ===");
  const carruselloSnap = await clientsCol.get();
  carruselloSnap.docs.forEach(doc => {
    const data = doc.data();
    const name = (data.name || data.LegalName || data.CommercialName || "").trim();
    if (name.toUpperCase().includes("CARRUSELLO")) {
      console.log(`ID: ${doc.id}`);
      console.log(`  Name: "${name}"`);
      console.log(`  RFC: "${data.RFC || data.rfc || ''}"`);
      console.log(`  Email: "${data.Email || data.email || ''}"`);
      console.log(`  Phone: "${data.Phone || data.phone || ''}"`);
      console.log("------------------------");
    }
  });

  console.log("\n=== Vania / Méndez search ===");
  carruselloSnap.docs.forEach(doc => {
    const data = doc.data();
    const name = (data.name || data.LegalName || data.CommercialName || "").trim();
    if (name.toUpperCase().includes("VANIA") || name.toUpperCase().includes("MÉNDEZ") || name.toUpperCase().includes("MENDEZ")) {
      console.log(`ID: ${doc.id}`);
      console.log(`  Name: "${name}"`);
      console.log(`  RFC: "${data.RFC || data.rfc || ''}"`);
      console.log(`  Email: "${data.Email || data.email || ''}"`);
      console.log("------------------------");
    }
  });

  console.log("\n=== Dulce / Vazquez search ===");
  carruselloSnap.docs.forEach(doc => {
    const data = doc.data();
    const name = (data.name || data.LegalName || data.CommercialName || "").trim();
    if (name.toUpperCase().includes("DULCE") || name.toUpperCase().includes("VAZQUEZ") || name.toUpperCase().includes("VÁSQUEZ")) {
      console.log(`ID: ${doc.id}`);
      console.log(`  Name: "${name}"`);
      console.log(`  RFC: "${data.RFC || data.rfc || ''}"`);
      console.log(`  Email: "${data.Email || data.email || ''}"`);
      console.log("------------------------");
    }
  });
}

run().catch(console.error);
