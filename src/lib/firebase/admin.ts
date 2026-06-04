import * as admin from 'firebase-admin';

let isConfigured = false;

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
      isConfigured = true;
    } else {
      console.warn("⚠️ Firebase Admin credentials not found in process.env. Admin SDK will run as null.");
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
