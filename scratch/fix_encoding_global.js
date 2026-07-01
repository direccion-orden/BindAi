const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = {
  projectId: "bind-ai-6f1fc",
  clientEmail: "firebase-adminsdk-fbsvc@bind-ai-6f1fc.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDk7X49UAPUO3vL\nC65f/hrhGv0zT/Xt3T+Yb1YghJZ5+77thXVY9tKH6Z4vAM+KQBNlt6M10vWZvMcx\n0cnQFieK5XV/0iKdNiDjakIRp2BuHrtKNsX/el8SZ96hcECY3mOG202iKj44+vRd\nHKBa07uBt+v2AMlkXrm9alPW/Wd3JNDDEslfydji46DkaJHAQTQWm63Xuy0sSS91\nASic4FJ3FYRm96akH11pNpUHH4l4iBFXVN4l7wsdMjz+9sePh7hU1RDvb6oPbFA/\n4TLMoTrpv2/gihduoJFRqJlqADQ4h3caLPrszCfBeG9foQZixWGeF1xcQKVrKJhE\ndKBFFMNlAgMBAAECggEAEqja/9NhpIRpXY5TsHECrt4nd5hpEsd/E1qL2iBZ2ufZ\nUvyW/ovhHYE+IABVv6Pju4hBg4sbnWQvllDOaCl4yqT+XqSkUU0kAXVb8kVtd5Gw\nsWa6h82T1JO70qEsMBRRvMsWTlqux1qJMtJjrajmy+F6bbWjCg0rNZRmRgv8ns+C\nxPtG1pxpeZhmbApZa5HgkMb+Q6p6hCMB/pLjqunEZeIJJL5qrtqly1tmmTkTNxIf\nwXJkHfXKdJyHebQWRvv7xpqxyS56bYg2woHFKbWLplxZh1Gqrrh/ouJ+YZnOCo7f\nf94Q+zBzakhYP8vyVA0SKTNVsfQgTIJCVx0xTNWa9wKBgQDyIf0WHWgmYOsIaVFg\nyYakz1V1Sc0YLlhH8fNuaYBoWfGvqVWUemyV3Nq1JmCwFsijJcO6IBMiJLL1tmAc\n0A2KF72Kl5wvzYq2YnfZbZA5PktS37hwLk/9b+8sXsdwduK2TrU87lLezc6dhsUg\nn3gUyNdxIA61K0G246uUe+M4hwKBgQDyCeZFwFAa7tPcgNYe8L1x0F97j1snydjO\n9pAn6EYDSl34FkXekW/pMsvXmuujAWewy8tK//oQ51tzjcd+fLDx4fNZA2VeKFrp\n5xlAqu99nuXJEqc1eluI+goRk7syrqVdiJAuttCzXO5dbQV9Pdj0k55VWy2jIET+\nXrUClVIbswKBgEYMrzuGpmrz/wsf7PsjUmC72u1jvIISZlfqF5MJ0qxd2R4Iz0l1\YZS5oExoHfDTppgMhOOEBAUMuPl9GbE8P66Dz8IYuobZ4BeDxUiR+feVnhULxEAw\JdQcXgVoJirTOiOkAarvB+qNgAjyxHT7rbHVqP6BV7/yE8DlfO4oKURhAoGBAJoL\noOp95r3tiRvLR/wzPm+krlCmwd6GAh5fIQq1M3I+r6YJDvkD2ZUzRjd4G0cIyuTk\nIAQg/RgrF7Jo5zJiy/92znm1xptx1cMO2ayl3n02V4ts+sz3jjCU6zmaq8crDoaE\nNzf0FMpDeFYv4BGA/odTOK+cs2QiUqcOwefd/38vAoGACORvoQufY8VjWLiKNLWI\ngQgkMliXcyIXLHsquxXqBpPw3VuZ2iduM8es4OlTPnjvDgAZOPZ0TgcNKsjYD/Tv\nxVP4YfLtrbqfkCTZxQGD5El2v5t8lzxY2SmDqc0Ql4iwnRCPxj73H4EchEmwJ6VJ\n23lq35bt7D8Q5q5dyaz+Ro8=\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n')
};

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const companyId = '0cb93750-138e-4b7d-832e-3a37b95c5093';

function fixEncoding(str) {
  if (!str) return str;
  return str
    .replace(/Ã¡/g, 'á').replace(/Ã\u0081/g, 'Á')
    .replace(/Ã©/g, 'é').replace(/Ã\u0089/g, 'É')
    .replace(/Ã­/g, 'í').replace(/Ã\u008D/g, 'Í')
    .replace(/Ã³/g, 'ó').replace(/Ã\u0093/g, 'Ó')
    .replace(/Ãº/g, 'ú').replace(/Ã\u009A/g, 'Ú')
    .replace(/Ã±/g, 'ñ').replace(/Ã\u0091/g, 'Ñ')
    .replace(/Ã /g, 'Á')
    .replace(/Ã\u00b1/g, 'ñ')
    .replace(/Ã\u00ba/g, 'ú')
    .replace(/Ã\u00b3/g, 'ó')
    .replace(/Ã\u00a1/g, 'á')
    .replace(/Ã\u00a9/g, 'é')
    .replace(/Ã\u00ad/g, 'í')
    .replace(/Ã\u0092/g, 'Ò')
    .replace(/Ã‘/g, 'Ñ');
}

async function runGlobalFix() {
  console.log('--- Starting Global Encoding Sweep ---');
  
  // 1. Clients
  const clientsSnap = await db.collection('companies').doc(companyId).collection('clients').get();
  for (const clientDoc of clientsSnap.docs) {
    const data = clientDoc.data();
    const name = data.ClientName || data.clientName || '';
    const fixedName = fixEncoding(name);
    if (name !== fixedName) {
      console.log(`Fixing Client ${clientDoc.id}: ${name} -> ${fixedName}`);
      await clientDoc.ref.update({ ClientName: fixedName, LegalName: fixedName, CommercialName: fixedName });
    }
  }

  // 2. Documents
  const collections = ['pedidos', 'remisiones', 'anticipos', 'facturas'];
  for (const coll of collections) {
    console.log(`Sweeping collection: ${coll}...`);
    const snap = await db.collection('companies').doc(companyId).collection(coll).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const name = data.clientName || data.ClientName || '';
      const fixedName = fixEncoding(name);
      if (name !== fixedName) {
        console.log(`Fixing ${coll} ${doc.id}: ${name} -> ${fixedName}`);
        await doc.ref.update({ clientName: fixedName });
      }
    }
  }

  console.log('--- Global Sweep Completed ---');
}

runGlobalFix().catch(console.error);
