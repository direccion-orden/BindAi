// Use eval('require') to make the import completely opaque to Turbopack.
// Turbopack has a bug where it renames external modules with a content hash
// (e.g., 'firebase-admin-a14c8a5423a75469') even when listed in
// serverExternalPackages. eval prevents static analysis of the require call.
// eslint-disable-next-line no-eval
const admin = eval('require')('firebase-admin') as typeof import('firebase-admin');

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
    if (!isConfigured || admin.apps.length === 0) return null as unknown as FirebaseFirestore.Firestore;
    const app = (admin.apps.find(a => a?.name === '[DEFAULT]') || admin.apps[0]) as any;
    return admin.firestore(app);
  } catch (e) {
    return null as unknown as FirebaseFirestore.Firestore;
  }
})();

export const adminAuth = (() => {
  try {
    if (!isConfigured || admin.apps.length === 0) return null as unknown as import('firebase-admin').auth.Auth;
    const app = (admin.apps.find(a => a?.name === '[DEFAULT]') || admin.apps[0]) as any;
    return admin.auth(app);
  } catch (e) {
    return null as unknown as import('firebase-admin').auth.Auth;
  }
})();

export { admin };


