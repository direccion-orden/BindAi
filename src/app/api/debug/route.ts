import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Dynamically import to see the initialization result
    const { adminDb, isFirebaseAdminConfigured } = await import('@/lib/firebase/admin');

    const envInfo = {
      K_SERVICE: !!process.env.K_SERVICE,
      GOOGLE_CLOUD_PROJECT: !!process.env.GOOGLE_CLOUD_PROJECT,
      FIREBASE_CONFIG: !!process.env.FIREBASE_CONFIG,
      FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
      NODE_ENV: process.env.NODE_ENV,
    };

    const dbStatus = {
      isFirebaseAdminConfigured,
      adminDbAvailable: !!adminDb,
    };

    // Try a simple Firestore read
    let firestoreRead = 'not attempted';
    if (adminDb) {
      try {
        const testDoc = await adminDb.collection('_debug_test').doc('ping').get();
        firestoreRead = testDoc.exists ? 'doc exists' : 'doc does not exist (but read succeeded)';
      } catch (err: any) {
        firestoreRead = `Error: ${err.message}`;
      }
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      envInfo,
      dbStatus,
      firestoreRead,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'error',
      message: err.message,
      stack: err.stack?.substring(0, 500),
    }, { status: 500 });
  }
}
