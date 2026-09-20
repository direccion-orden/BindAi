import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { SyncfyService } from '@/lib/services/syncfyService';

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

    // 3. Descargar transacciones de Syncfy
    const transactions = await SyncfyService.getTransactions(token, {
      id_account: targetSyncAccountId,
      id_credential: targetCredentialId,
      dt_transaction_from: fromStr,
      dt_transaction_to: toStr,
      limit: 1000,
    });

    // 4. Ingestar transacciones evitando duplicados
    const txsColRef = accountDocRef.collection('transactions');
    const existingTxsSnap = await txsColRef.get();
    const existingIds = new Set(existingTxsSnap.docs.map((d) => d.id));

    let importedCount = 0;
    const batchSize = 450;
    let batch = adminDb.batch();
    let batchOps = 0;

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

    for (const tx of transactions) {
      const txId = tx.id_transaction;
      if (!txId || existingIds.has(txId)) {
        continue;
      }

      const amountNum = Number(tx.amount);
      const isExpense = amountNum < 0;
      const txDocData: any = {
        id: txId,
        date: parseTransactionDate(tx.dt_transaction, todayStr),
        concept: tx.description || 'Movimiento Bancario Syncfy',
        reference: tx.reference || '',
        amount: amountNum,
        type: isExpense ? 'EXPENSE' : 'INCOME',
        syncProvider: 'syncfy',
        syncfyAccountId: targetSyncAccountId,
        createdAt: Date.now(),
        reconciled: false,
      };

      const docRef = txsColRef.doc(txId);
      batch.set(docRef, txDocData);
      existingIds.add(txId);
      importedCount++;
      batchOps++;

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
      const allTxsSnap = await txsColRef.get();
      const totalTxsAmount = allTxsSnap.docs.reduce((sum, d) => sum + (Number(d.data().amount) || 0), 0);
      const initBal = Number(accountData.initialBalance || 0);
      updatePayload.balance = initBal + totalTxsAmount;
      updatePayload.Balance = initBal + totalTxsAmount;
    }

    await accountDocRef.update(updatePayload);

    return NextResponse.json({
      success: true,
      imported: importedCount,
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
