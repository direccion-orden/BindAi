import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. Load Environment Variables
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val.replace(/^["']|["']$/g, ''); // remove quotes
    }
});

const BIND_API_KEY = envVars['BIND_ERP_API_KEY'];
const FIREBASE_PROJECT_ID = envVars['FIREBASE_PROJECT_ID'];
const FIREBASE_CLIENT_EMAIL = envVars['FIREBASE_CLIENT_EMAIL'];
const FIREBASE_PRIVATE_KEY = envVars['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

if (!BIND_API_KEY || !FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.error("Missing necessary environment variables in .env.local");
    process.exit(1);
}

// 2. Initialize Firebase Admin
initializeApp({
    credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY,
    })
});

const db = getFirestore();

// 3. Bind ERP Fetch Setup
const API_BASE = "https://api.bind.com.mx/api";
const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${BIND_API_KEY}`
};

async function fetchAll(endpoint) {
    let allData = [];
    let skip = 0;
    const top = 100;
    let keepFetching = true;

    while (keepFetching) {
        const url = `${API_BASE}${endpoint}?$top=${top}&$skip=${skip}`;
        process.stdout.write(`Fetching ${endpoint} (skip: ${skip})...\r`);
        const res = await fetch(url, { headers });
        if (!res.ok) {
            console.error(`\nFailed to fetch ${endpoint}:`, res.status, res.statusText);
            break;
        }
        const data = await res.json();
        if (!data.value || data.value.length === 0) break;

        allData = allData.concat(data.value);
        skip += top;

        if (data.value.length < top) {
            keepFetching = false;
        }
    }
    console.log(`\nFetched ${allData.length} records from ${endpoint}.`);
    return allData;
}

async function migrateProducts() {
    console.log("--- Migrating Products ---");
    const products = await fetchAll("/Products");
    
    let count = 0;
    const batchSize = 400; // Firestore batch limit is 500
    let batch = db.batch();

    for (const prod of products) {
        const docRef = db.collection('products').doc(prod.ID);
        // Clean data for Firestore
        const productData = {
            id: prod.ID,
            code: prod.Code || '',
            title: prod.Title || '',
            description: prod.Description || '',
            cost: prod.Cost || 0,
            sku: prod.SKU || '',
            unit: prod.Unit || 'PZA',
            currency: prod.CurrencyCode || 'MXN',
            typeText: prod.TypeText || '',
            imageUrl: prod.ImageUrl || null,
            bindCurrentInventory: prod.CurrentInventory || 0, // Informative from Bind
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        batch.set(docRef, productData, { merge: true });
        count++;

        if (count % batchSize === 0) {
            await batch.commit();
            console.log(`Committed ${count} products to Firestore...`);
            batch = db.batch();
        }
    }

    if (count % batchSize !== 0) {
        await batch.commit();
        console.log(`Committed final batch. Total products migrated: ${count}`);
    }
}

async function migrateClients() {
    console.log("\n--- Migrating Clients ---");
    const clients = await fetchAll("/Clients");
    
    let count = 0;
    const batchSize = 400;
    let batch = db.batch();

    for (const client of clients) {
        const docRef = db.collection('clients').doc(client.ID);
        const clientData = {
            id: client.ID,
            number: client.Number || 0,
            clientName: client.ClientName || '',
            legalName: client.LegalName || '',
            rfc: client.RFC || 'XAXX010101000',
            email: client.Email || '',
            phone: client.Phone || '',
            locationId: client.LocationID || null,
            regimenFiscal: client.RegimenFiscal || null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        batch.set(docRef, clientData, { merge: true });
        count++;

        if (count % batchSize === 0) {
            await batch.commit();
            console.log(`Committed ${count} clients to Firestore...`);
            batch = db.batch();
        }
    }

    if (count % batchSize !== 0) {
        await batch.commit();
        console.log(`Committed final batch. Total clients migrated: ${count}`);
    }
}

async function main() {
    try {
        await migrateProducts();
        await migrateClients();
        console.log("\n✅ Migration completed successfully!");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

main();
