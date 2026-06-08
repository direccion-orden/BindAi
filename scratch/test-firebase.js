const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

async function testFirebase() {
    const envPath = path.join(__dirname, '..', '.env.local');
    
    if (!fs.existsSync(envPath)) {
        console.error("No .env.local found at " + envPath);
        return;
    }
    
    const envFile = fs.readFileSync(envPath, 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
            let key = parts[0].trim();
            let value = parts.slice(1).join('=').trim();
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            }
            env[key] = value;
        }
    });

    console.log("FIREBASE_PROJECT_ID:", env.FIREBASE_PROJECT_ID);
    console.log("FIREBASE_CLIENT_EMAIL:", env.FIREBASE_CLIENT_EMAIL);
    console.log("FIREBASE_PRIVATE_KEY length:", env.FIREBASE_PRIVATE_KEY ? env.FIREBASE_PRIVATE_KEY.length : 0);

    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: env.FIREBASE_PROJECT_ID,
                clientEmail: env.FIREBASE_CLIENT_EMAIL,
                privateKey: env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        });

        const db = admin.firestore();
        console.log("Intentando consultar colección 'companies'...");
        const snap = await db.collection('companies').limit(1).get();
        console.log("¡Consulta exitosa! Número de documentos:", snap.size);
    } catch (e) {
        console.error("Error durante la prueba de Firebase Admin:", e);
    }
}

testFirebase();
