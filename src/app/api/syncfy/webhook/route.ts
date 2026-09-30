import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { SyncfyService } from '@/lib/services/syncfyService';
import { performSatSync } from '@/app/api/syncfy/sat/sync/route';
import { normalizeDate, findMatchingTransaction } from '@/lib/services/bankTransactionMatcher';

export const dynamic = 'force-dynamic';

/**
 * Webhook listener para recibir notificaciones automáticas de Syncfy
 * Soporta tanto movimientos bancarios como facturas fiscales del SAT.
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
    const companyData = companyDoc.data() || {};

    // 2. Si se especifica cuenta bancaria, sincronizar movimientos bancarios
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
        const existingList = existingTxsSnap.docs.map((d) => ({ id: d.id, docId: d.id, ...d.data() } as any));
        const existingIds = new Set(existingList.map((d) => d.id));
        const usedExistingIds = new Set<string>();

        const existingSyncfyTxIds = new Set<string>();
        existingList.forEach((d) => {
          if (d.syncfyTransactionId) existingSyncfyTxIds.add(d.syncfyTransactionId);
          if (d.id && d.id.length === 24) existingSyncfyTxIds.add(d.id);
        });

        const bankAccountData = bankAccountDoc.data() || {};
        const isCredit = Boolean(bankAccountData.isCredit || bankAccountData.type === 'credit');

        let imported = 0;
        let linked = 0;
        const batch = adminDb.batch();

        for (const tx of txs) {
          const txId = tx.id_transaction;
          if (!txId) continue;

          // Si ya existe este ID o syncfyTransactionId, omitir
          if (existingIds.has(txId) || existingSyncfyTxIds.has(txId)) continue;

          const amountNum = Number(tx.amount);
          const isExpense = amountNum < 0;
          const txDateStr = normalizeDate(tx.dt_transaction, todayStr);

          const incomingCandidate = {
            id: txId,
            date: txDateStr,
            amount: amountNum,
            concept: tx.description || 'Movimiento Syncfy Webhook',
            reference: tx.reference || '',
          };

          const match = findMatchingTransaction(incomingCandidate, existingList, usedExistingIds, isCredit);

          if (match) {
            // Vincular sin duplicar
            usedExistingIds.add(match.id);
            existingSyncfyTxIds.add(txId);

            const updateFields: any = {
              syncfyTransactionId: txId,
              syncProvider: 'syncfy',
              syncfyAccountId: id_account,
            };
            if (tx.reference && !match.reference) {
              updateFields.reference = tx.reference;
            }

            batch.update(txsColRef.doc(match.id), updateFields);
            linked++;
          } else {
            // Movimiento nuevo
            batch.set(txsColRef.doc(txId), {
              id: txId,
              date: txDateStr,
              concept: tx.description || 'Movimiento Syncfy Webhook',
              reference: tx.reference || '',
              amount: amountNum,
              type: isExpense ? 'EXPENSE' : 'INCOME',
              syncProvider: 'syncfy',
              syncfyAccountId: id_account,
              syncfyTransactionId: txId,
              createdAt: Date.now(),
              reconciled: false,
            });
            existingIds.add(txId);
            existingSyncfyTxIds.add(txId);
            imported++;
          }
        }

        if (imported > 0 || linked > 0) {
          await batch.commit();
        }

        const updateAccountData: any = {
          lastSync: new Date().toISOString(),
          lastWebhookEvent: event || 'sync',
        };

        if (imported > 0) {
          const allTxsSnap = await txsColRef.select('amount').get();
          const totalTxsAmount = allTxsSnap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
          const initBal = Number(bankAccountData.initialBalance || 0);
          updateAccountData.balance = initBal + totalTxsAmount;
          updateAccountData.Balance = initBal + totalTxsAmount;
        }

        await bankAccountDoc.ref.update(updateAccountData);

        console.log(`[Syncfy Webhook] Procesados ${txs.length} movimientos (Nuevos importados: ${imported}, Vinculados existentes: ${linked}) para cuenta ${bankAccountId}`);
      }
    }

    // 3. Si el webhook corresponde a documentos del SAT o a la credencial SAT vinculada
    const isSatCredential = id_credential && companyData.syncfySatCredentialId === id_credential;
    const isDocEvent = typeof event === 'string' && (event.includes('document') || event.includes('attachment'));

    if (isSatCredential || isDocEvent) {
      console.log(`[Syncfy Webhook] Procesando sincronización de facturas SAT para empresa ${companyId}...`);
      try {
        const satResult = await performSatSync(companyId, {
          idCredential: id_credential || companyData.syncfySatCredentialId,
          type: 'received',
        });
        console.log(`[Syncfy Webhook] SAT Sync completado:`, satResult);
      } catch (satErr: any) {
        console.error(`[Syncfy Webhook] Error sincronizando facturas SAT:`, satErr.message);
      }
    }

    return NextResponse.json({ success: true, processed: true });
  } catch (error: any) {
    console.error('[Syncfy Webhook] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
