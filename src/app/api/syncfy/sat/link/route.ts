import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, syncfyCredentialId, rfc, action } = body;

    if (!companyId) {
      return NextResponse.json(
        { error: 'Falta parámetro requerido: companyId.' },
        { status: 400 }
      );
    }

    const companyRef = adminDb.collection('companies').doc(companyId);
    const companySnap = await companyRef.get();

    if (!companySnap.exists) {
      return NextResponse.json(
        { error: `Empresa ${companyId} no encontrada.` },
        { status: 404 }
      );
    }

    if (action === 'unlink') {
      await companyRef.update({
        syncfySatCredentialId: null,
        syncfySatRfc: null,
        syncfySatStatus: 'disconnected',
        syncfySatUnlinkedAt: new Date().toISOString(),
      });
      return NextResponse.json({
        success: true,
        message: 'Credencial SAT desvinculada exitosamente.',
      });
    }

    if (!syncfyCredentialId) {
      return NextResponse.json(
        { error: 'Falta syncfyCredentialId para vincular.' },
        { status: 400 }
      );
    }

    await companyRef.update({
      syncfySatCredentialId: syncfyCredentialId,
      syncfySatRfc: rfc ? rfc.toUpperCase().trim() : null,
      syncfySatLinkedAt: new Date().toISOString(),
      syncfySatStatus: 'active',
      satSyncProvider: 'syncfy',
    });

    return NextResponse.json({
      success: true,
      message: 'Credencial del SAT vinculada exitosamente con Syncfy.',
    });
  } catch (error: any) {
    console.error('Error en /api/syncfy/sat/link:', error);
    return NextResponse.json(
      { error: error.message || 'Error al vincular credencial SAT.' },
      { status: 500 }
    );
  }
}
