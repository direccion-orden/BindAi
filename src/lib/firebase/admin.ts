import * as admin from 'firebase-admin';

let isConfigured = false;

const projectId = process.env.FIREBASE_PROJECT_ID?.replace(/^["']|["']$/g, '');
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.replace(/^["']|["']$/g, '');
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')?.replace(/^["']|["']$/g, '');

if (!admin.apps.length) {
  try {
    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      isConfigured = true;
      console.log("🚀 Firebase Admin SDK initialized successfully with Project ID:", projectId);
    } else if (process.env.FIREBASE_CONFIG || process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT) {
      admin.initializeApp();
      isConfigured = true;
      console.log("🚀 Firebase Admin SDK initialized using GCP environment credentials");
    } else {
      console.warn("⚠️ Firebase Admin credentials not found in process.env. Admin SDK will run as null. Missing:", {
        projectId: !projectId,
        clientEmail: !clientEmail,
        privateKey: !privateKey
      });
    }
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
} else {
  isConfigured = true;
}

export const isFirebaseAdminConfigured = isConfigured;

export const adminDb = (() => {
  try {
    if (!isConfigured) return null as unknown as admin.firestore.Firestore;
    return admin.firestore();
  } catch (e) {
    return null as unknown as admin.firestore.Firestore;
  }
})();

export const adminAuth = (() => {
  try {
    if (!isConfigured) return null as unknown as admin.auth.Auth;
    return admin.auth();
  } catch (e) {
    return null as unknown as admin.auth.Auth;
  }
})();
