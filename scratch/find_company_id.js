const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  projectId: 'bind-ai-6f1fc'
});

const db = getFirestore();

async function run() {
  const snapshot = await db.collection('users').limit(5).get();
  console.log("Total users found:", snapshot.size);
  snapshot.forEach(doc => {
    console.log("User ID:", doc.id);
    console.log("Data:", doc.data());
  });
}

run().catch(console.error);
