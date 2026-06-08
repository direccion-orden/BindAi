const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'bind-ai-6f1fc'
});
const db = admin.firestore();
db.collection('companies').get().then(snap => {
  console.log("Companies count:", snap.size);
  snap.docs.forEach(doc => console.log(doc.id));
}).catch(err => {
  console.error("Error connecting using Application Default Credentials:", err);
});
