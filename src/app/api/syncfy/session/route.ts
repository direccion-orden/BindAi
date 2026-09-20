import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { SyncfyService } from '@/lib/services/syncfyService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, companyName } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Falta companyId' }, { status: 400 });
    }

    try {
      SyncfyService.getApiKey();
    } catch (e: any) {
      return NextResponse.json(
        {
          error: 'SYNCFY_API_KEY no está configurada en las variables de entorno (.env.local)',
          missingApiKey: true,
        },
        { status: 400 }
      );
    }

    let syncfyUserId: string | undefined = undefined;

    if (adminDb) {
      try {
        const companyDocRef = adminDb.collection('companies').doc(companyId);
        const companySnap = await companyDocRef.get();
        if (companySnap.exists) {
          const companyData = companySnap.data() || {};
          syncfyUserId = companyData.syncfyUserId;
        }
      } catch (err) {
        console.warn('Could not read syncfyUserId from Firestore:', err);
      }
    }

    if (!syncfyUserId) {
      // 2. Buscar o crear usuario en Syncfy
      const user = await SyncfyService.getOrCreateUser(companyId, companyName);
      syncfyUserId = user.id_user;

      if (adminDb) {
        try {
          await adminDb.collection('companies').doc(companyId).set(
            {
              syncfyUserId,
              syncfyUserCreatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (err) {
          console.warn('Could not save syncfyUserId to Firestore:', err);
        }
      }
    }

    // 3. Crear token de sesión para el Widget v3
    const token = await SyncfyService.createSessionToken(syncfyUserId);

    return NextResponse.json({
      success: true,
      token,
      id_user: syncfyUserId,
    });
  } catch (error: any) {
    console.error('Error en /api/syncfy/session:', error);
    return NextResponse.json(
      { error: error.message || 'Error al generar sesión de Syncfy' },
      { status: 500 }
    );
  }
}
