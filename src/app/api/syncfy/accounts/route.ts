import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { SyncfyService } from '@/lib/services/syncfyService';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, token, idCredential } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Falta companyId' }, { status: 400 });
    }

    let sessionToken = token;

    // Si no enviaron el token, generamos uno usando el syncfyUserId de la empresa
    if (!sessionToken) {
      const companyDoc = await adminDb.collection('companies').doc(companyId).get();
      const syncfyUserId = companyDoc.data()?.syncfyUserId;
      if (!syncfyUserId) {
        return NextResponse.json(
          { error: 'No hay usuario de Syncfy registrado para esta empresa.' },
          { status: 400 }
        );
      }
      sessionToken = await SyncfyService.createSessionToken(syncfyUserId);
    }

    const accounts = await SyncfyService.getAccounts(sessionToken, idCredential);

    // Obtener las cuentas bancarias locales de la empresa para ver mapeos actuales
    const localBankAccountsSnap = await adminDb
      .collection('companies')
      .doc(companyId)
      .collection('bankAccounts')
      .get();

    const localAccounts = localBankAccountsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({
      success: true,
      accounts,
      localAccounts,
    });
  } catch (error: any) {
    console.error('Error en /api/syncfy/accounts:', error);
    const isPaymentRequired = error.message?.includes('Payment Required') || error.message?.includes('402');
    return NextResponse.json(
      {
        error: isPaymentRequired
          ? 'Payment Required: Tu cuenta de Syncfy requiere activar un plan de facturación o créditos para consultar cuentas bancarias en producción.'
          : error.message || 'Error al obtener cuentas de Syncfy',
        paymentRequired: isPaymentRequired,
      },
      { status: isPaymentRequired ? 402 : 500 }
    );
  }
}
