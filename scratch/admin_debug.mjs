import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        envVars[key] = val.replace(/^["']|["']$/g, '');
    }
});

const FIREBASE_PROJECT_ID = envVars['FIREBASE_PROJECT_ID'];
const FIREBASE_CLIENT_EMAIL = envVars['FIREBASE_CLIENT_EMAIL'];
const FIREBASE_PRIVATE_KEY = envVars['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

initializeApp({
    credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY,
    })
});

const db = getFirestore();

async function run() {
  const companies = await db.collection("companies").get();
  const company = companies.docs[0];
  console.log("Company:", company.id);

  const productsSnap = await db.collection("companies").doc(company.id).collection("products").get();
  const products = productsSnap.docs.map(d => d.data());
  const closetProducts = products.filter(p => p.productType?.toLowerCase() === "closet" || (p.tags && p.tags.includes("Closet")) || p.title.toLowerCase().includes("closet"));
  console.log("Closet Products:", closetProducts.map(p => ({ title: p.title, productType: p.productType, tags: p.tags })));

  const discountsSnap = await db.collection("companies").doc(company.id).collection("discounts").get();
  const discounts = discountsSnap.docs.map(d => d.data());
  console.log("Discounts:", discounts);
}
run();
