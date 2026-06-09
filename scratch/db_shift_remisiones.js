const fs = require('fs');
const path = require('path');

const DRY_RUN = false; // set to false to execute the writes

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

if (projectId && clientEmail && privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
} else {
  console.error("Missing credentials");
  process.exit(1);
}

const db = admin.firestore();
const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";

async function run() {
  try {
    const remsCol = db.collection('companies').doc(companyId).collection('remisiones');
    const movementsCol = db.collection('companies').doc(companyId).collection('inventory_movements');
    const sequenceRef = db.collection('companies').doc(companyId).collection('counters').doc('sequences');
    
    // 1. Query today's remisiones in ERP (excluding Shopify)
    const snap = await remsCol.get();
    const today = "2026-06-08";
    const erpRemsToShift = [];
    
    snap.docs.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt || "";
      const isShopify = data.isShopifySale || false;
      const isMigrated = data.migrated || false;
      
      if (createdAt.startsWith(today) && !isShopify && !isMigrated) {
        const numStr = String(data.remissionNumber);
        const match = numStr.match(/(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= 35910 && num <= 35915) {
            erpRemsToShift.push({
              id: doc.id,
              currentNum: numStr,
              num: num,
              newNum: `REM-${num + 9}`, // Shifts 35910 -> 35919, ..., 35915 -> 35924
              ref: doc.ref
            });
          }
        }
      }
    });
    
    // Sort ascending by current number
    erpRemsToShift.sort((a, b) => a.num - b.num);
    
    console.log(`Found ${erpRemsToShift.length} remisiones to shift:`);
    erpRemsToShift.forEach(r => {
      console.log(`  - Doc ${r.id}: ${r.currentNum} -> ${r.newNum}`);
    });
    
    if (erpRemsToShift.length === 0) {
      console.log("No remisiones found to shift. Exiting.");
      return;
    }
    
    // 2. Identify corresponding inventory movements to update
    const allMovements = [];
    const movSnap = await movementsCol.get();
    
    erpRemsToShift.forEach(r => {
      movSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.referenceId === r.id) {
          let newReason = data.reason || "";
          if (r.currentNum) {
            newReason = newReason.replace(r.currentNum, r.newNum);
            newReason = newReason.replace(r.currentNum.replace('REM-', ''), r.newNum.replace('REM-', ''));
          }
          allMovements.push({
            id: doc.id,
            ref: doc.ref,
            currentReason: data.reason,
            newReason: newReason,
            remissionDocId: r.id
          });
        }
      });
    });
    
    console.log(`\nFound ${allMovements.length} inventory movements to update:`);
    allMovements.forEach(m => {
      console.log(`  - Mov ${m.id} (Remission ${m.remissionDocId}): "${m.currentReason}" -> "${m.newReason}"`);
    });
    
    // 3. Set counter update plan
    const newCounterVal = 35924;
    console.log(`\nProposed sequence counter update for 'remisiones': ${newCounterVal}`);
    
    if (DRY_RUN) {
      console.log("\n*** DRY RUN mode is ON. No writes performed. ***");
      return;
    }
    
    console.log("\n*** Executing updates... ***");
    
    const batch = db.batch();
    
    // Shift remisiones
    erpRemsToShift.forEach(r => {
      batch.update(r.ref, {
        remissionNumber: r.newNum,
        updatedAt: new Date().toISOString(),
        shiftedFrom: r.currentNum
      });
    });
    
    // Update inventory movements reasons
    allMovements.forEach(m => {
      batch.update(m.ref, {
        reason: m.newReason
      });
    });
    
    // Update counter
    batch.set(sequenceRef, {
      remisiones: newCounterVal
    }, { merge: true });
    
    await batch.commit();
    console.log("SUCCESS: Shift complete and counter updated in database.");
    
  } catch (err) {
    console.error("Error running script:", err);
  }
}

run();
