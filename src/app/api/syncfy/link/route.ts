import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      bankAccountId,
      syncfyAccountId,
      syncfyCredentialId,
      syncfyAccountName,
    } = body;

    if (!companyId || !bankAccountId || !syncfyAccountId) {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios (companyId, bankAccountId, syncfyAccountId)' },
        { status: 400 }
      );
    }

    const accountRef = adminDb
      .collection('companies')
      .doc(companyId)
      .collection('bankAccounts')
      .doc(bankAccountId);

    const accountSnap = await accountRef.get();
    if (!accountSnap.exists) {
      return NextResponse.json(
        { error: `Cuenta bancaria ${bankAccountId} no existe` },
        { status: 404 }
      );
    }

    await accountRef.update({
      syncProvider: 'syncfy',
      syncType: 'automatic',
      syncfyAccountId,
      syncfyCredentialId: syncfyCredentialId || null,
      syncfyAccountName: syncfyAccountName || null,
      linkedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Cuenta bancaria vinculada exitosamente con Syncfy',
    });
  } catch (error: any) {
    console.error('Error en /api/syncfy/link:', error);
    return NextResponse.json(
      { error: error.message || 'Error al vincular cuenta' },
      { status: 500 }
    );
  }
}
