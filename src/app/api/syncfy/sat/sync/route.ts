import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { SyncfyService } from '@/lib/services/syncfyService';
import { parseCfdiItems, parseCfdiSummary } from '@/lib/cfdi/parseInvoiceItems';

export const dynamic = 'force-dynamic';

export interface SatSyncOptions {
  dateFrom?: string;
  dateTo?: string;
  type?: 'received' | 'issued';
  idCredential?: string;
}

function parseTxDate(rawDate: any, fallbackStr: string): string {
  if (!rawDate) return fallbackStr;
  if (typeof rawDate === 'number') {
    const ms = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
    return new Date(ms).toISOString().split('T')[0];
  }
  if (typeof rawDate === 'string') {
    if (rawDate.includes('T')) return rawDate.split('T')[0];
    if (rawDate.includes(' ')) return rawDate.split(' ')[0];
    return rawDate;
  }
  if (rawDate instanceof Date) {
    return rawDate.toISOString().split('T')[0];
  }
  return String(rawDate).split(' ')[0] || fallbackStr;
}

/**
 * Función central de sincronización SAT con Syncfy.
 * Extrae las facturas registradas en la cuenta SAT de Syncfy junto con sus archivos XML.
 */
export async function performSatSync(companyId: string, options: SatSyncOptions = {}) {
  const { dateFrom, dateTo, type = 'received', idCredential } = options;

  if (!companyId) {
    throw new Error('Falta companyId para realizar sincronización SAT.');
  }

  const companyRef = adminDb.collection('companies').doc(companyId);
  const companySnap = await companyRef.get();

  if (!companySnap.exists) {
    throw new Error(`Empresa ${companyId} no encontrada.`);
  }

  const companyData = companySnap.data() || {};
  let satCredentialId = idCredential || companyData.syncfySatCredentialId;

  // 1. Obtener o crear usuario de Syncfy para la empresa
  const syncfyUser = await SyncfyService.getOrCreateUser(
    companyId,
    companyData.name || companyData.LegalName
  );

  if (!companyData.syncfyUserId || companyData.syncfyUserId !== syncfyUser.id_user) {
    await companyRef.update({ syncfyUserId: syncfyUser.id_user });
  }

  // 2. Generar Token de Sesión
  const token = await SyncfyService.createSessionToken(syncfyUser.id_user);

  // 3. Si no teníamos id_credential guardado, buscar si existe una credencial SAT en Syncfy
  if (!satCredentialId) {
    try {
      const creds = await SyncfyService.getCredentials(token);
      const satCred = creds.find(
        (c: any) =>
          c.id_site === '56cf5728784806f72b8b456f' ||
          (c.site?.name || '').toLowerCase().includes('ciec') ||
          (c.site?.name || '').toLowerCase().includes('sat')
      );
      if (satCred?.id_credential) {
        satCredentialId = satCred.id_credential;
        await companyRef.update({
          syncfySatCredentialId: satCredentialId,
          syncfySatRfc: satCred.username || null,
          syncfySatStatus: 'active',
          satSyncProvider: 'syncfy',
        });
      }
    } catch (e: any) {
      console.warn('[Syncfy SAT Sync] No se pudieron auto-descubrir credenciales:', e.message);
    }
  }

  // 4. Intentar refrescar la credencial si está disponible
  if (satCredentialId) {
    try {
      await SyncfyService.syncCredential(token, satCredentialId).catch(() => {});
    } catch (err: any) {
      // Aviso no crítico
    }
  }

  // 5. Consultar transacciones de facturas SAT en Syncfy
  const txQuery: any = {
    limit: 500,
  };
  if (satCredentialId) txQuery.id_credential = satCredentialId;
  if (dateFrom) txQuery.dt_transaction_from = dateFrom;
  if (dateTo) txQuery.dt_transaction_to = dateTo;

  console.log('[Syncfy SAT Sync] Consultando transacciones SAT con opciones:', txQuery);
  let rawTransactions = await SyncfyService.getTransactions(token, txQuery);
  console.log(`[Syncfy SAT Sync] Transacciones SAT obtenidas: ${rawTransactions.length}`);

  // Filtrar según tipo: recibidas (gastos) o emitidas (ingresos)
  let filteredTxs = rawTransactions.filter((tx: any) => {
    const keywords = (tx.keywords || []).map((k: string) => String(k).toLowerCase());
    if (type === 'received') {
      if (keywords.includes('recibidas')) return true;
      if (keywords.includes('emitidas')) return false;
      return Number(tx.amount || 0) <= 0;
    } else {
      if (keywords.includes('emitidas')) return true;
      if (keywords.includes('recibidas')) return false;
      return Number(tx.amount || 0) > 0;
    }
  });

  console.log(`[Syncfy SAT Sync] Transacciones filtradas (${type}): ${filteredTxs.length}`);

  // 6. Cargar UUIDs existentes en expenses_inbox para deduplicación
  const inboxRef = companyRef.collection('expenses_inbox');
  const existingInboxSnap = await inboxRef.get();
  const existingMap = new Map<string, any>();
  existingInboxSnap.docs.forEach((doc) => {
    existingMap.set(doc.id.toUpperCase().trim(), { id: doc.id, ...doc.data() });
  });

  // 7. Descargar adjuntos XML en lotes paralelos de 10
  const todayStr = new Date().toISOString().split('T')[0];
  const processedItems: Array<{
    uuid: string;
    total: number;
    date: string;
    emisorRfc: string;
    emisorName: string;
    receptorRfc: string;
    folio: string;
    xmlBase64: string | null;
    items: any[];
    syncfyTransactionId: string;
  }> = [];

  const downloadConcurrency = 10;
  for (let i = 0; i < filteredTxs.length; i += downloadConcurrency) {
    const chunk = filteredTxs.slice(i, i + downloadConcurrency);
    await Promise.all(
      chunk.map(async (tx: any) => {
        let xmlContent: string | null = null;
        let xmlBase64: string | null = null;

        // Buscar si la transacción tiene adjunto XML
        const xmlAtt = (tx.attachments || []).find((att: any) => {
          const file = (att.file || '').toLowerCase();
          const mime = (att.mime || att.mime_type || '').toLowerCase();
          return file.endsWith('.xml') || mime.includes('xml');
        });

        if (xmlAtt?.id_attachment) {
          try {
            xmlContent = await SyncfyService.getAttachmentContent(token, xmlAtt.id_attachment);
            if (xmlContent) {
              xmlBase64 = Buffer.from(xmlContent, 'utf8').toString('base64');
            }
          } catch (err: any) {
            console.warn(`[Syncfy SAT Sync] Error descargando XML de adjunto ${xmlAtt.id_attachment}:`, err.message);
          }
        }

        const summary = xmlContent ? parseCfdiSummary(xmlContent) : null;
        const parsedItems = xmlContent ? parseCfdiItems(xmlContent) : [];

        let finalUuid = (summary?.uuid || tx.reference || tx.id_transaction || '').toUpperCase().trim();
        if (!finalUuid) return;

        const totalNum = summary?.total ? Number(summary.total) : Math.abs(Number(tx.amount || 0));
        const docDate = summary?.date ? summary.date : parseTxDate(tx.dt_transaction, todayStr);
        const emisorRfc = (summary?.emisorRfc || tx.extra?.tax_id || '').toUpperCase().trim();
        const emisorName = summary?.emisorName || tx.description || tx.extra?.emitter || 'Proveedor';
        const receptorRfc = (summary?.receptorRfc || tx.extra?.receiver || '').toUpperCase().trim();
        const folioStr = summary
          ? `${summary.serie ? summary.serie + '-' : ''}${summary.folio}`
          : (tx.reference || '');

        processedItems.push({
          uuid: finalUuid,
          total: totalNum,
          date: docDate,
          emisorRfc,
          emisorName,
          receptorRfc,
          folio: folioStr,
          xmlBase64,
          items: parsedItems,
          syncfyTransactionId: tx.id_transaction,
        });
      })
    );
  }

  // 8. Persistir en Firestore (en lotes de 400)
  let imported = 0;
  let updated = 0;
  const batchSize = 400;

  for (let i = 0; i < processedItems.length; i += batchSize) {
    const chunk = processedItems.slice(i, i + batchSize);
    const batch = adminDb.batch();

    for (const item of chunk) {
      const existing = existingMap.get(item.uuid);

      if (existing) {
        // Ya existe: actualizar solo si faltaba el XML o enriquecer datos
        const updates: any = {
          updatedAt: new Date().toISOString(),
          syncfyTransactionId: item.syncfyTransactionId,
        };
        if (!existing.xmlBase64 && item.xmlBase64) {
          updates.xmlBase64 = item.xmlBase64;
        }
        if ((!existing.items || existing.items.length === 0) && item.items.length > 0) {
          updates.items = item.items;
        }
        batch.update(inboxRef.doc(existing.id), updates);
        updated++;
      } else {
        // Nueva factura en el buzón contable
        batch.set(inboxRef.doc(item.uuid), {
          id: item.uuid,
          uuid: item.uuid,
          date: item.date,
          total: item.total,
          amount: item.total,
          emisorRfc: item.emisorRfc,
          emisorName: item.emisorName,
          receptorRfc: item.receptorRfc,
          folio: item.folio,
          xmlBase64: item.xmlBase64,
          items: item.items,
          status: 'pending_review',
          syncProvider: 'syncfy',
          syncfyTransactionId: item.syncfyTransactionId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        imported++;
      }
    }

    await batch.commit();
  }

  // 9. Actualizar metadatos de sincronización en la empresa
  await companyRef.update({
    lastSatSync: new Date().toISOString(),
    lastSatSyncImported: imported,
    lastSatSyncUpdated: updated,
    lastSatSyncTotal: filteredTxs.length,
    satSyncProvider: 'syncfy',
  });

  return {
    success: true,
    imported,
    updated,
    totalFetched: filteredTxs.length,
    message: `Sincronización SAT completada: ${imported} facturas nuevas importadas, ${updated} actualizadas de ${filteredTxs.length} consultadas.`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, dateFrom, dateTo, type = 'received', idCredential } = body;

    if (!companyId) {
      return NextResponse.json({ error: 'Falta companyId' }, { status: 400 });
    }

    const result = await performSatSync(companyId, { dateFrom, dateTo, type, idCredential });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error en /api/syncfy/sat/sync:', error);
    return NextResponse.json(
      { error: error.message || 'Error al sincronizar facturas SAT con Syncfy.' },
      { status: 500 }
    );
  }
}
