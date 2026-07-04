const admin = require('firebase-admin');

const serviceAccount = {
  projectId: "bind-ai-6f1fc",
  clientEmail: "firebase-adminsdk-fbsvc@bind-ai-6f1fc.iam.gserviceaccount.com",
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDk7X49UAPUO3vL\nC65f/hrhGv0zT/Xt3T+Yb1YghJZ5+77thXVY9tKH6Z4vAM+KQBNlt6M10vWZvMcx\n0cnQFieK5XV/0iKdNiDjakIRp2BuHrtKNsX/el8SZ96hcECY3mOG202iKj44+vRd\nHKBa07uBt+v2AMlkXrm9alPW/Wd3JNDDEslfydji46DkaJHAQTQWm63Xuy0sSS91\nASic4FJ3FYRm96akH11pNpUHH4l4iBFXVN4l7wsdMjz+9sePh7hU1RDvb6oPbFA/\n4TLMoTrpv2/gihduoJFRqJlqADQ4h3caLPrszCfBeG9foQZixWGeF1xcQKVrKJhE\ndKBFFMNlAgMBAAECggEAEqja/9NhpIRpXY5TsHECrt4nd5hpEsd/E1qL2iBZ2ufZ\nUvyW/ovhHYE+IABVv6Pju4hBg4sbnWQvllDOaCl4yqT+XqSkUU0kAXVb8kVtd5Gw\nsWa6h82T1JO70qEsMBRRvMsWTlqux1qJMtJjrajmy+F6bbWjCg0rNZRmRgv8ns+C\nxPtG1pxpeZhmbApZa5HgkMb+Q6p6hCMB/pLjqunEZeIJJL5qrtqly1tmmTkTNxIf\nwXJkHfXKdJyHebQWRvv7xpqxyS56bYg2woHFKbWLplxZh1Gqrrh/ouJ+YZnOCo7f\nf94Q+zBzakhYP8vyVA0SKTNVsfQgTIJCVx0xTNWa9wKBgQDyIf0WHWgmYOsIaVFg\nyYakz1V1Sc0YLlhH8fNuaYBoWfGvqVWUemyV3Nq1JmCwFsijJcO6IBMiJLL1tmAc\n0A2KF72Kl5wvzYq2YnfZbZA5PktS37hwLk/9b+8sXsdwduK2TrU87lLezc6dhsUg\nn3gUyNdxIA61K0G246uUe+M4hwKBgQDyCeZFwFAa7tPcgNYe8L1x0F97j1snydjO\n9pAn6EYDSl34FkXekW/pMsvXmuujAWewy8tK//oQ51tzjcd+fLDx4fNZA2VeKFrp\n5xlAqu99nuXJEqc1eluI+goRk7syrqVdiJAuttCzXO5dbQV9Pdj0k55VWy2jIET+\nXrUClVIbswKBgEYMrzuGpmrz/wsf7PsjUmC72u1jvIISZlfqF5MJ0qxd2R4Iz0l1\nYZS5oExoHfDTppgMhOOEBAUMuPl9GbE8P66Dz8IYuobZ4BeDxUiR+feVnhULxEAw\nJdQcXgVoJirTOiOkAarvB+qNgAjyxHT7rbHVqP6BV7/yE8DlfO4oKURhAoGBAJoL\noOp95r3tiRvLR/wzPm+krlCmwd6GAh5fIQq1M3I+r6YJDvkD2ZUzRjd4G0cIyuTk\nIAQg/RgrF7Jo5zJiy/92znm1xptx1cMO2ayl3n02V4ts+sz3jjCU6zmaq8crDoaE\nNzf0FMpDeFYv4BGA/odTOK+cs2QiUqcOwefd/38vAoGACORvoQufY8VjWLiKNLWI\ngQgkMliXcyIXLHsquxXqBpPw3VuZ2iduM8es4OlTPnjvDgAZOPZ0TgcNKsjYD/Tv\nxVP4YfLtrbqfkCTZxQGD5El2v5t8lzxY2SmDqc0Ql4iwnRCPxj73H4EchEmwJ6VJ\n23lq35bt7D8Q5q5dyaz+Ro8=\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n')
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function findSofia() {
  console.log("Buscando a SOFIA GARCIA...");
  const clientsRef = db.collection('clientes');
  const snapshot = await clientsRef.limit(5).get();
  
  if (snapshot.empty) {
    console.log('No se encontraron clientes.');
    return;
  }

  snapshot.forEach(doc => {
    console.log('ID:', doc.id);
    console.log('Datos:', JSON.stringify(doc.data(), null, 2));
  });
}

findSofia().catch(console.error);
