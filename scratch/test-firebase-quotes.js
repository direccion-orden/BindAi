const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

async function testQuotes() {
    const envPath = path.join(__dirname, '..', '.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
            let key = parts[0].trim();
            let value = parts.slice(1).join('=').trim();
            // DO NOT STRIP QUOTES
            env[key] = value;
        }
    });

    console.log("PROJECT_ID:", env.FIREBASE_PROJECT_ID);
    console.log("PRIVATE_KEY starts with:", env.FIREBASE_PRIVATE_KEY ? env.FIREBASE_PRIVATE_KEY.substring(0, 30) : null);

    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: env.FIREBASE_PROJECT_ID,
                clientEmail: env.FIREBASE_CLIENT_EMAIL,
                // Simulate how Next.js/process.env might receive it if quotes aren't stripped
                privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });

        const db = admin.firestore();
        const snap = await db.collection('companies').limit(1).get();
        console.log("Success! Size:", snap.size);
    } catch (e) {
        console.error("FAIL:", e);
    }
}

testQuotes();
