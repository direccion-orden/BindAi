import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { SyncfyService } from '@/lib/services/syncfyService';
import { normalizeDate, findMatchingTransaction } from '@/lib/services/bankTransactionMatcher';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      companyId,
      bankAccountId,
      syncfyAccountId,
      syncfyCredentialId,
      dateFrom,
      dateTo,
    } = body;

    if (!companyId || !bankAccountId) {
      return NextResponse.json(
        { error: 'Faltan parámetros obligatorios (companyId, bankAccountId)' },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Servicio de base de datos (Firebase Admin) no está disponible en el servidor.' },
        { status: 503 }
      );
    }

    try {
      SyncfyService.getApiKey();
    } catch (e: any) {
      return NextResponse.json(
        { error: 'SYNCFY_API_KEY no está configurada en las variables de entorno del servidor.', missingApiKey: true },
        { status: 500 }
      );
    }

    const companyDocRef = adminDb.collection('companies').doc(companyId);
    const companySnap = await companyDocRef.get();
    const companyData = companySnap.data() || {};
    const syncfyUserId = companyData.syncfyUserId;

    if (!syncfyUserId) {
      return NextResponse.json(
        { error: 'No se ha configurado usuario de Syncfy para esta empresa.' },
        { status: 400 }
      );
    }

    const accountDocRef = companyDocRef.collection('bankAccounts').doc(bankAccountId);
    const accountSnap = await accountDocRef.get();
    if (!accountSnap.exists) {
      return NextResponse.json(
        { error: `Cuenta bancaria ${bankAccountId} no encontrada en el ERP.` },
        { status: 404 }
      );
    }

    const accountData = accountSnap.data() || {};
    const targetSyncAccountId = syncfyAccountId || accountData.syncfyAccountId || accountData.syncAccountId;
    const targetCredentialId = syncfyCredentialId || accountData.syncfyCredentialId || accountData.syncCredentialId;

    if (!targetSyncAccountId) {
      return NextResponse.json(
        { error: 'La cuenta no tiene un ID de cuenta de Syncfy asociado.' },
        { status: 400 }
      );
    }

    // 1. Obtener token de sesión
    const token = await SyncfyService.createSessionToken(syncfyUserId);

    // 2. Calcular rango de fechas (por defecto últimos 30 días si no se especifica)
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultPastDate = new Date();
    defaultPastDate.setDate(defaultPastDate.getDate() - 45);
    const fromStr = dateFrom || defaultPastDate.toISOString().split('T')[0];
    const toStr = dateTo || todayStr;

    const formattedFromStr = fromStr.includes(' ') ? fromStr : `${fromStr} 00:00:00`;
    const formattedToStr = toStr.includes(' ') ? toStr : `${toStr} 23:59:59`;

    // 3. Descargar transacciones de Syncfy
    const transactions = await SyncfyService.getTransactions(token, {
      id_account: targetSyncAccountId,
      id_credential: targetCredentialId,
      dt_transaction_from: formattedFromStr,
      dt_transaction_to: formattedToStr,
      limit: 1000,
    });

    // 4. Ingestar transacciones evitando duplicados
    const txsColRef = accountDocRef.collection('transactions');
    const existingTxsSnap = await txsColRef.get();
    const existingList = existingTxsSnap.docs.map((d) => ({ id: d.id, docId: d.id, ...d.data() } as any));
    const existingIds = new Set(existingList.map((d) => d.id));
    const usedExistingIds = new Set<string>();

    const existingSyncfyTxIds = new Set<string>();
    existingList.forEach((d) => {
      if (d.syncfyTransactionId) existingSyncfyTxIds.add(d.syncfyTransactionId);
      if (d.id && d.id.length === 24) existingSyncfyTxIds.add(d.id);
    });

    const isCredit = Boolean(accountData.isCredit || accountData.type === 'credit');

    let importedCount = 0;
    let linkedCount = 0;
    const batchSize = 450;
    let batch = adminDb.batch();
    let batchOps = 0;

    for (const tx of transactions) {
      const txId = tx.id_transaction;
      if (!txId) continue;

      // Si ya existe un documento con este ID exacto o syncfyTransactionId, ya está registrado
      if (existingIds.has(txId) || existingSyncfyTxIds.has(txId)) {
        continue;
      }

      const amountNum = Number(tx.amount);
      const isExpense = amountNum < 0;
      const txDateStr = normalizeDate(tx.dt_transaction, todayStr);

      const incomingCandidate = {
        id: txId,
        date: txDateStr,
        amount: amountNum,
        concept: tx.description || 'Movimiento Bancario Syncfy',
        reference: tx.reference || '',
      };

      // Buscar si ya existe un movimiento previo (de CSV o manual) que corresponda a esta transacción
      const match = findMatchingTransaction(incomingCandidate, existingList, usedExistingIds, isCredit);

      if (match) {
        // Vincular el movimiento existente con Syncfy sin duplicar el documento
        usedExistingIds.add(match.id);
        existingSyncfyTxIds.add(txId);

        const updateFields: any = {
          syncfyTransactionId: txId,
          syncProvider: 'syncfy',
          syncfyAccountId: targetSyncAccountId,
        };
        if (tx.reference && !match.reference) {
          updateFields.reference = tx.reference;
        }

        const matchDocRef = txsColRef.doc(match.id);
        batch.update(matchDocRef, updateFields);
        linkedCount++;
        batchOps++;
      } else {
        // Movimiento nuevo genuino: registrar en Firestore
        const txDocData: any = {
          id: txId,
          date: txDateStr,
          concept: tx.description || 'Movimiento Bancario Syncfy',
          reference: tx.reference || '',
          amount: amountNum,
          type: isExpense ? 'EXPENSE' : 'INCOME',
          syncProvider: 'syncfy',
          syncfyAccountId: targetSyncAccountId,
          syncfyTransactionId: txId,
          createdAt: Date.now(),
          reconciled: false,
        };

        const docRef = txsColRef.doc(txId);
        batch.set(docRef, txDocData);
        existingIds.add(txId);
        existingSyncfyTxIds.add(txId);
        importedCount++;
        batchOps++;
      }

      if (batchOps >= batchSize) {
        await batch.commit();
        batch = adminDb.batch();
        batchOps = 0;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    // 5. Actualizar metadata de sincronización en la cuenta
    const updatePayload: any = {
      syncProvider: 'syncfy',
      syncfyAccountId: targetSyncAccountId,
      syncType: 'automatic',
      lastSync: new Date().toISOString(),
    };
    if (targetCredentialId) {
      updatePayload.syncfyCredentialId = targetCredentialId;
    }

    // Actualizar saldo acumulado si se importaron transacciones
    if (importedCount > 0) {
      const allTxsSnap = await txsColRef.select('amount').get();
      const totalTxsAmount = allTxsSnap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
      const initBal = Number(accountData.initialBalance || 0);
      updatePayload.balance = initBal + totalTxsAmount;
      updatePayload.Balance = initBal + totalTxsAmount;
    }

    await accountDocRef.update(updatePayload);

    return NextResponse.json({
      success: true,
      imported: importedCount,
      linked: linkedCount,
      totalFetched: transactions.length,
      dateRange: { from: fromStr, to: toStr },
    });
  } catch (error: any) {
    console.error('Error en /api/syncfy/sync:', error);
    const isPaymentRequired = error.message?.includes('Payment Required') || error.message?.includes('402');
    return NextResponse.json(
      {
        error: isPaymentRequired
          ? 'Payment Required: Tu cuenta de Syncfy requiere activar un plan de facturación o créditos para descargar movimientos bancarios en producción.'
          : error.message || 'Error al sincronizar movimientos de Syncfy',
        paymentRequired: isPaymentRequired,
      },
      { status: isPaymentRequired ? 402 : 500 }
    );
  }
}
