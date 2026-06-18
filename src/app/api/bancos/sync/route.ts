import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, companyId, accountId, username, password, token, institution, linkId, session } = body;

    if (!companyId || !accountId) {
      return NextResponse.json({ error: 'Missing companyId or accountId' }, { status: 400 });
    }

    const secretId = process.env.BELVO_SECRET_ID;
    const secretPassword = process.env.BELVO_SECRET_PASSWORD;

    if (!secretId || !secretPassword) {
      return NextResponse.json({ error: 'Belvo Sandbox keys are not configured in the server' }, { status: 500 });
    }

    const authHeader = 'Basic ' + Buffer.from(`${secretId}:${secretPassword}`).toString('base64');
    
    // Determine Sandbox vs Production URL
    const isSandbox = secretId.includes("sandbox") || secretId.startsWith("a9e4");
    const BELVO_URL = isSandbox ? "https://sandbox.belvo.co" : "https://api.belvo.co";

    if (action === 'create_link') {
      if (!institution || !username || !password) {
        return NextResponse.json({ error: 'Missing credentials or institution' }, { status: 400 });
      }

      // Call Belvo POST /api/links/
      const res = await fetch(`${BELVO_URL}/api/links/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          institution,
          username,
          password,
          access_mode: 'read_only',
        }),
      });

      const data = await res.json();

      if (res.status === 428) {
        // MFA Required
        return NextResponse.json({
          status: 'mfa_required',
          session: data.session,
          link: data.link,
        });
      }

      if (!res.ok) {
        throw new Error(data[0]?.message || data.message || `Belvo Error (Status ${res.status})`);
      }

      return NextResponse.json({
        status: 'success',
        link: data.id,
      });

    } else if (action === 'submit_mfa') {
      if (!linkId || !session || !token) {
        return NextResponse.json({ error: 'Missing linkId, session, or token' }, { status: 400 });
      }

      // Call Belvo PATCH /api/links/
      const res = await fetch(`${BELVO_URL}/api/links/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          link: linkId,
          session,
          token,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data[0]?.message || data.message || `Belvo MFA Error (Status ${res.status})`);
      }

      return NextResponse.json({
        status: 'success',
        link: data.id,
      });

    } else if (action === 'sync_data') {
      if (!linkId) {
        return NextResponse.json({ error: 'Missing linkId' }, { status: 400 });
      }

      // 1. Fetch/Sync Accounts
      const accountsRes = await fetch(`${BELVO_URL}/api/accounts/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          link: linkId,
          save_data: true,
        }),
      });

      if (!accountsRes.ok) {
        const errData = await accountsRes.json();
        throw new Error(errData[0]?.message || errData.message || 'Error syncing accounts with Belvo');
      }

      const belvoAccounts = await accountsRes.json();
      if (!belvoAccounts || belvoAccounts.length === 0) {
        throw new Error('No accounts found under this link in Belvo');
      }

      // 2. Fetch/Sync Transactions
      const dateTo = new Date().toISOString().split('T')[0];
      const past30Days = new Date();
      past30Days.setDate(past30Days.getDate() - 30);
      const dateFrom = past30Days.toISOString().split('T')[0];

      const txsRes = await fetch(`${BELVO_URL}/api/transactions/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          link: linkId,
          save_data: true,
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });

      if (!txsRes.ok) {
        const errData = await txsRes.json();
        throw new Error(errData[0]?.message || errData.message || 'Error syncing transactions with Belvo');
      }

      const belvoTransactions = await txsRes.json();

      // Read current physical bank account document from Firestore to find syncAccountId
      const accountDocRef = adminDb.collection('companies').doc(companyId).collection('bankAccounts').doc(accountId);
      const accountSnap = await accountDocRef.get();
      if (!accountSnap.exists) {
        throw new Error(`Bank Account ${accountId} not found in Firestore`);
      }

      const accountData = accountSnap.data()!;
      let belvoAccountId = accountData.syncAccountId;

      // If we don't have a syncAccountId saved yet, associate with the first account matching the currency, or just the first account
      if (!belvoAccountId) {
        const accountCurrency = accountData.currency || accountData.CurrencyCode || 'MXN';
        const matchedAccount = belvoAccounts.find((a: any) => a.currency === accountCurrency) || belvoAccounts[0];
        belvoAccountId = matchedAccount.id;
        
        await accountDocRef.update({
          syncAccountId: belvoAccountId,
          syncLinkId: linkId,
          syncProvider: 'belvo',
          syncType: 'automatic',
          lastSync: new Date().toISOString(),
          initialBalance: matchedAccount.balance?.current || 0,
        });
      } else {
        await accountDocRef.update({
          lastSync: new Date().toISOString(),
        });
      }

      // Filter transactions that belong to our belvoAccountId
      const accountTransactions = belvoTransactions.filter((tx: any) => tx.account?.id === belvoAccountId || tx.account === belvoAccountId);

      // Save transactions to Firestore
      const txsColRef = accountDocRef.collection('transactions');
      let importCount = 0;
      let matchCount = 0;

      // Fetch existing transactions to avoid duplicate insertion or count matches
      const existingTxsSnap = await txsColRef.get();
      const existingIds = new Set(existingTxsSnap.docs.map(d => d.id));

      // Fetch unpaid invoices and recent outflows for auto-matching
      const outflowsSnap = await adminDb.collection('companies').doc(companyId).collection('outflows').get();
      const recentOutflows = outflowsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const invoicesSnap = await adminDb.collection('companies').doc(companyId).collection('expenses_inbox').get();
      const recentInvoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const salesInvoicesSnap = await adminDb.collection('companies').doc(companyId).collection('facturas').get();
      const salesInvoices = salesInvoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      for (const tx of accountTransactions) {
        const txId = tx.id;
        const txAmount = tx.type === 'INFLOW' ? Math.abs(tx.amount) : -Math.abs(tx.amount);
        const txDate = tx.value_date || tx.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];

        const transactionDocData: any = {
          id: txId,
          date: txDate,
          concept: tx.description || tx.reference || 'Movimiento Belvo',
          reference: tx.reference || '',
          amount: txAmount,
          type: txAmount < 0 ? 'EXPENSE' : 'INCOME',
          createdAt: tx.created_at ? new Date(tx.created_at).getTime() : Date.now(),
        };

        const alreadyExists = existingIds.has(txId);
        
        if (!alreadyExists) {
          // Check for auto-matching:
          // 1. Check if there is an outflow with exact amount and close date (+/- 3 days)
          const matchedOutflow = recentOutflows.find(o => 
            Math.abs(o.amount - Math.abs(txAmount)) < 0.01 && 
            Math.abs(new Date(o.date).getTime() - new Date(txDate).getTime()) <= 3 * 24 * 60 * 60 * 1000 &&
            o.bankAccountId === accountId
          );

          if (matchedOutflow) {
            transactionDocData.reconciled = true;
            transactionDocData.reconcileType = 'match';
            transactionDocData.matchedDocumentId = matchedOutflow.documentId || matchedOutflow.id;
            transactionDocData.matchedAt = new Date().toISOString();
            matchCount++;
          } else {
            // 2. Check if there is an unpaid expense invoice with exact amount
            const matchedInvoice = recentInvoices.find(inv => 
              (!inv.paidAmount || inv.paidAmount < inv.total - 0.01) &&
              Math.abs(inv.total - Math.abs(txAmount)) < 0.01 &&
              txAmount < 0
            );

            if (matchedInvoice) {
              transactionDocData.reconciled = true;
              transactionDocData.reconcileType = 'match';
              transactionDocData.matchedDocumentId = matchedInvoice.id;
              transactionDocData.matchedAt = new Date().toISOString();

              await adminDb.collection('companies').doc(companyId).collection('expenses_inbox').doc(matchedInvoice.id).update({
                paidAmount: admin.firestore.FieldValue.increment(Math.abs(txAmount)),
                status: 'paid',
              });

              await adminDb.collection('companies').doc(companyId).collection('outflows').add({
                amount: Math.abs(txAmount),
                date: txDate,
                method: 'Transferencia',
                reference: tx.reference || 'AUTO_BELVO',
                documentId: matchedInvoice.id,
                documentType: 'gasto',
                documentNumber: matchedInvoice.invoiceNumber || matchedInvoice.uuid || matchedInvoice.id,
                providerName: matchedInvoice.emisorName || 'Proveedor',
                bankAccountId: accountId,
                expenseAccountId: matchedInvoice.accountId || '',
                createdAt: new Date().toISOString(),
              });

              matchCount++;
            } else {
              // 3. Check if there is an unpaid sales invoice with exact amount
              const matchedSalesInvoice = salesInvoices.find(inv => 
                (inv.status === 'por_cobrar') &&
                Math.abs((inv.totalAmount || inv.total || 0) - Math.abs(txAmount)) < 0.01 &&
                txAmount > 0
              );

              if (matchedSalesInvoice) {
                transactionDocData.reconciled = true;
                transactionDocData.reconcileType = 'match';
                transactionDocData.matchedDocumentId = matchedSalesInvoice.id;
                transactionDocData.matchedAt = new Date().toISOString();

                await adminDb.collection('companies').doc(companyId).collection('facturas').doc(matchedSalesInvoice.id).update({
                  paidAmount: admin.firestore.FieldValue.increment(Math.abs(txAmount)),
                  status: 'cobrada',
                });

                await adminDb.collection('companies').doc(companyId).collection('payments').add({
                  amount: Math.abs(txAmount),
                  date: txDate,
                  method: 'Transferencia',
                  reference: tx.reference || 'AUTO_BELVO',
                  documentId: matchedSalesInvoice.id,
                  documentType: 'factura',
                  documentNumber: matchedSalesInvoice.invoiceNumber || matchedSalesInvoice.id,
                  clientName: matchedSalesInvoice.clientName || 'Cliente',
                  bankAccountId: accountId,
                  createdAt: new Date().toISOString(),
                });

                matchCount++;
              }
            }
          }

          await txsColRef.doc(txId).set(transactionDocData);
          importCount++;
        }
      }

      // Adjust bank account initial balance to align with the aggregator's latest reported balance
      const matchedAccount = belvoAccounts.find((a: any) => a.id === belvoAccountId);
      if (matchedAccount && matchedAccount.balance) {
        const allTxsSnap = await txsColRef.get();
        const totalAmount = allTxsSnap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
        const newInitial = (matchedAccount.balance.current || 0) - totalAmount;
        
        await accountDocRef.update({
          initialBalance: newInitial,
          balance: matchedAccount.balance.current || 0
        });
      }

      return NextResponse.json({
        status: 'success',
        imported: importCount,
        matched: matchCount,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error: any) {
    console.error("Belvo Sync API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
