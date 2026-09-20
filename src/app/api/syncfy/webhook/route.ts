import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { SyncfyService } from '@/lib/services/syncfyService';

export const dynamic = 'force-dynamic';

/**
 * Webhook listener para recibir notificaciones automáticas de Syncfy
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log('[Syncfy Webhook] Evento recibido:', JSON.stringify(payload));

    const { id_user, id_credential, id_account, event } = payload;

    if (!id_user) {
      return NextResponse.json({ message: 'Webhook ignorado: falta id_user' }, { status: 200 });
    }

    // 1. Buscar la empresa en Firestore que tenga este syncfyUserId
    const companiesSnap = await adminDb
      .collection('companies')
      .where('syncfyUserId', '==', id_user)
      .limit(1)
      .get();

    if (companiesSnap.empty) {
      console.warn(`[Syncfy Webhook] No se encontró empresa con syncfyUserId=${id_user}`);
      return NextResponse.json({ message: 'Empresa no encontrada' }, { status: 200 });
    }

    const companyDoc = companiesSnap.docs[0];
    const companyId = companyDoc.id;

    // 2. Si se especifica la cuenta bancaria, sincronizar directamente
    if (id_account) {
      const bankAccountsSnap = await companyDoc.ref
        .collection('bankAccounts')
        .where('syncfyAccountId', '==', id_account)
        .limit(1)
        .get();

      if (!bankAccountsSnap.empty) {
        const bankAccountDoc = bankAccountsSnap.docs[0];
        const bankAccountId = bankAccountDoc.id;

        // Generar token y obtener movimientos de los últimos 7 días
        const token = await SyncfyService.createSessionToken(id_user);
        const todayStr = new Date().toISOString().split('T')[0];
        const past7Days = new Date();
        past7Days.setDate(past7Days.getDate() - 7);

        const txs = await SyncfyService.getTransactions(token, {
          id_account,
          id_credential,
          dt_transaction_from: past7Days.toISOString().split('T')[0],
          dt_transaction_to: todayStr,
        });

        const txsColRef = bankAccountDoc.ref.collection('transactions');
        const existingTxsSnap = await txsColRef.get();
        const existingIds = new Set(existingTxsSnap.docs.map((d) => d.id));

        let imported = 0;
        const batch = adminDb.batch();

function parseTransactionDate(rawDate: any, fallbackStr: string): string {
  if (!rawDate) return fallbackStr;
  if (typeof rawDate === 'string') {
    if (rawDate.includes('T')) return rawDate.split('T')[0];
    if (rawDate.includes(' ')) return rawDate.split(' ')[0];
    return rawDate;
  }
  if (typeof rawDate === 'number') {
    const ms = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
    return new Date(ms).toISOString().split('T')[0];
  }
  if (rawDate instanceof Date) {
    return rawDate.toISOString().split('T')[0];
  }
  return String(rawDate).split(' ')[0] || fallbackStr;
}

        for (const tx of txs) {
          if (!tx.id_transaction || existingIds.has(tx.id_transaction)) continue;

          const amountNum = Number(tx.amount);
          batch.set(txsColRef.doc(tx.id_transaction), {
            id: tx.id_transaction,
            date: parseTransactionDate(tx.dt_transaction, todayStr),
            concept: tx.description || 'Movimiento Syncfy Webhook',
            reference: tx.reference || '',
            amount: amountNum,
            type: amountNum < 0 ? 'EXPENSE' : 'INCOME',
            syncProvider: 'syncfy',
            syncfyAccountId: id_account,
            createdAt: Date.now(),
            reconciled: false,
          });
          imported++;
        }

        if (imported > 0) {
          await batch.commit();
        }

        await bankAccountDoc.ref.update({
          lastSync: new Date().toISOString(),
          lastWebhookEvent: event || 'sync',
        });

        console.log(`[Syncfy Webhook] Sincronizados ${imported} movimientos para cuenta ${bankAccountId}`);
      }
    }

    return NextResponse.json({ success: true, processed: true });
  } catch (error: any) {
    console.error('[Syncfy Webhook] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
