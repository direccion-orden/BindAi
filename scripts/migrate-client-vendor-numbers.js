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

const admin = require('firebase-admin');
const projectId = config.FIREBASE_PROJECT_ID;
const clientEmail = config.FIREBASE_CLIENT_EMAIL;
const privateKey = (config.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

const db = admin.firestore();

async function migrateEntities() {
  console.log("=== INICIANDO MIGRACIÓN DE CONSECUTIVOS PARA CLIENTES Y PROVEEDORES ===");
  const companiesSnap = await db.collection('companies').get();
  
  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    console.log(`\nProcesando Empresa: ${companyId}`);

    // 1. MIGRAR CLIENTES
    console.log("  -> Obteniendo clientes...");
    const clientsSnap = await db.collection('companies').doc(companyId).collection('clients').get();
    console.log(`  -> Total clientes encontrados: ${clientsSnap.size}`);

    if (clientsSnap.size > 0) {
      // Ordenar clientes por fecha de creación si existe, o por nombre
      const clients = clientsSnap.docs.map(d => ({
        id: d.id,
        ref: d.ref,
        data: d.data()
      }));

      clients.sort((a, b) => {
        // Si ya tiene número, respetarlo
        if (a.data.clientNumber && b.data.clientNumber) return a.data.clientNumber - b.data.clientNumber;
        if (a.data.clientNumber) return -1;
        if (b.data.clientNumber) return 1;

        const dateA = a.data.createdAt ? new Date(a.data.createdAt).getTime() : 0;
        const dateB = b.data.createdAt ? new Date(b.data.createdAt).getTime() : 0;
        if (dateA && dateB && dateA !== dateB) return dateA - dateB;

        const nameA = (a.data.name || a.data.LegalName || a.data.CommercialName || "").toUpperCase();
        const nameB = (b.data.name || b.data.LegalName || b.data.CommercialName || "").toUpperCase();
        return nameA.localeCompare(nameB, 'es');
      });

      let currentClientNum = 0;
      let batch = db.batch();
      let opCount = 0;
      let updatedClients = 0;

      for (let i = 0; i < clients.length; i++) {
        const item = clients[i];
        currentClientNum++;
        const targetNumber = `CLI-${String(currentClientNum).padStart(5, '0')}`;

        // Solo actualizar si no tiene asignado el número correcto
        if (item.data.number !== targetNumber || item.data.clientNumber !== currentClientNum) {
          batch.update(item.ref, {
            number: targetNumber,
            clientNumber: currentClientNum
          });
          opCount++;
          updatedClients++;

          if (opCount >= 450) {
            await batch.commit();
            console.log(`     ... Batch de ${opCount} clientes guardado.`);
            batch = db.batch();
            opCount = 0;
          }
        }
      }

      if (opCount > 0) {
        await batch.commit();
        console.log(`     ... Último batch de ${opCount} clientes guardado.`);
      }

      console.log(`  ✅ Clientes migrados: ${updatedClients}. Consecutivo actual fijado en: ${currentClientNum}`);

      // Actualizar contador en sequences
      await db.collection('companies').doc(companyId).collection('counters').doc('sequences').set({
        clients: currentClientNum
      }, { merge: true });
    }

    // 2. MIGRAR PROVEEDORES
    console.log("  -> Obteniendo proveedores...");
    const vendorsSnap = await db.collection('companies').doc(companyId).collection('vendors').get();
    console.log(`  -> Total proveedores encontrados: ${vendorsSnap.size}`);

    if (vendorsSnap.size > 0) {
      const vendors = vendorsSnap.docs.map(d => ({
        id: d.id,
        ref: d.ref,
        data: d.data()
      }));

      vendors.sort((a, b) => {
        if (a.data.vendorNumber && b.data.vendorNumber) return a.data.vendorNumber - b.data.vendorNumber;
        if (a.data.vendorNumber) return -1;
        if (b.data.vendorNumber) return 1;

        const dateA = a.data.createdAt ? new Date(a.data.createdAt).getTime() : 0;
        const dateB = b.data.createdAt ? new Date(b.data.createdAt).getTime() : 0;
        if (dateA && dateB && dateA !== dateB) return dateA - dateB;

        const nameA = (a.data.name || a.data.LegalName || "").toUpperCase();
        const nameB = (b.data.name || b.data.LegalName || "").toUpperCase();
        return nameA.localeCompare(nameB, 'es');
      });

      let currentVendorNum = 0;
      let batch = db.batch();
      let opCount = 0;
      let updatedVendors = 0;

      for (let i = 0; i < vendors.length; i++) {
        const item = vendors[i];
        currentVendorNum++;
        const targetNumber = `PROV-${String(currentVendorNum).padStart(5, '0')}`;

        if (item.data.number !== targetNumber || item.data.vendorNumber !== currentVendorNum) {
          batch.update(item.ref, {
            number: targetNumber,
            vendorNumber: currentVendorNum
          });
          opCount++;
          updatedVendors++;

          if (opCount >= 450) {
            await batch.commit();
            console.log(`     ... Batch de ${opCount} proveedores guardado.`);
            batch = db.batch();
            opCount = 0;
          }
        }
      }

      if (opCount > 0) {
        await batch.commit();
        console.log(`     ... Último batch de ${opCount} proveedores guardado.`);
      }

      console.log(`  ✅ Proveedores migrados: ${updatedVendors}. Consecutivo actual fijado en: ${currentVendorNum}`);

      // Actualizar contador en sequences
      await db.collection('companies').doc(companyId).collection('counters').doc('sequences').set({
        vendors: currentVendorNum
      }, { merge: true });
    }
  }

  console.log("\n=== MIGRACIÓN COMPLETADA CON ÉXITO ===");
}

migrateEntities().then(() => {
  process.exit(0);
}).catch(err => {
  console.error("Error durante la migración:", err);
  process.exit(1);
});
