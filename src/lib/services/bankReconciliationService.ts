import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { BankTransaction } from "@/types/bank";

/**
 * Reverts a bank transaction's reconciliation, updating all associated
 * documents (expenses, sales invoices, TPV remisiones, transfer counterparts)
 * back to their pending states.
 */
export async function unreconcileBankTransaction(
  companyId: string,
  bankAccountId: string,
  transaction: BankTransaction
): Promise<void> {
  if (!companyId || !bankAccountId || !transaction) {
    throw new Error("Faltan parámetros requeridos para desconciliar la transacción.");
  }

  const absAmount = Math.abs(transaction.amount);
  const isCharge = transaction.amount < 0;
  const docId = (transaction as any).reconciledDocId || transaction.matchedDocumentId;
  const type = (transaction as any).reconciledType || transaction.reconcileType || "match";
  const matchedIds: string[] = (transaction as any).matchedDocumentIds && (transaction as any).matchedDocumentIds.length > 0
    ? (transaction as any).matchedDocumentIds
    : (docId ? [docId] : []);

  // 1. Inflows (Abonos / Cobros / Lotes TPV / Facturas / Remisiones)
  if (!isCharge) {
    // 1.1 TPV batch or multi-document remisiones
    for (const mId of matchedIds) {
      try {
        const remRef = doc(db, "companies", companyId, "remisiones", mId);
        const remSnap = await getDoc(remRef);
        if (remSnap.exists()) {
          const remData = remSnap.data();
          if (remData.bankReconciled || remData.isTpvSale) {
            await updateDoc(remRef, {
              bankReconciled: false,
              reconciledBankTxId: null,
              reconciledBankAccountId: null,
              reconciledAt: null,
            });
          } else {
            // Unpaid credit sale remission
            const currentPaid = remData.paidAmount || 0;
            const newPaid = Math.max(0, currentPaid - absAmount);
            await updateDoc(remRef, {
              paidAmount: newPaid,
              status: "activa",
            });

            if (remData.orderId) {
              try {
                const orderRef = doc(db, "companies", companyId, "pedidos", remData.orderId);
                const orderSnap = await getDoc(orderRef);
                if (orderSnap.exists()) {
                  const orderPaid = orderSnap.data().paidAmount || 0;
                  await updateDoc(orderRef, {
                    paidAmount: Math.max(0, orderPaid - absAmount),
                    status: "por_surtir",
                  });
                }
              } catch (err) {
                console.warn("Could not revert parent order paidAmount:", err);
              }
            }
          }
        }
      } catch (e) {
        console.warn("Could not revert remission for id:", mId, e);
      }
    }

    // 1.2 Facturas de venta (invoices)
    if (docId && type !== "tpv_batch") {
      try {
        const fRef = doc(db, "companies", companyId, "facturas", docId);
        const fSnap = await getDoc(fRef);
        if (fSnap.exists()) {
          const currentPaid = fSnap.data().paidAmount || 0;
          const newPaid = Math.max(0, currentPaid - absAmount);
          await updateDoc(fRef, {
            paidAmount: newPaid,
            status: "por_cobrar",
          });
        }
      } catch (e) {
        console.warn("Could not revert factura paidAmount:", e);
      }
    }
  }

  // 2. Outflows (Cargos / Gastos / Compras)
  if (isCharge && docId) {
    // 2.1 Check expenses (gastos manuales / creados desde XML)
    try {
      const expRef = doc(db, "companies", companyId, "expenses", docId);
      const expSnap = await getDoc(expRef);
      if (expSnap.exists()) {
        const currentPaid = expSnap.data().paidAmount || 0;
        const newPaid = Math.max(0, currentPaid - absAmount);
        await updateDoc(expRef, {
          paidAmount: newPaid,
          status: "pending",
        });
      }
    } catch (e) {
      console.warn("Could not revert expense paidAmount:", e);
    }

    // 2.2 Check expenses_inbox (CFDI XMLs recibidos)
    try {
      const inbRef = doc(db, "companies", companyId, "expenses_inbox", docId);
      const inbSnap = await getDoc(inbRef);
      if (inbSnap.exists()) {
        const currentPaid = inbSnap.data().paidAmount || 0;
        const newPaid = Math.max(0, currentPaid - absAmount);
        await updateDoc(inbRef, {
          paidAmount: newPaid,
          status: "pending",
        });
      }
    } catch (e) {
      console.warn("Could not revert expenses_inbox paidAmount:", e);
    }
  }

  // 3. Transfers between own accounts (Traspasos propios)
  if (type === "transfer" && docId && (transaction as any).matchedAccountId) {
    try {
      const counterpartRef = doc(
        db,
        "companies",
        companyId,
        "bankAccounts",
        (transaction as any).matchedAccountId,
        "transactions",
        docId
      );
      await updateDoc(counterpartRef, {
        reconciled: false,
        matchedAt: null,
        reconciledAt: null,
        reconcileType: null,
        reconciledType: null,
        matchedDocumentId: null,
        reconciledDocId: null,
        matchedAccountId: null,
      });
    } catch (e) {
      console.warn("Could not revert counterpart transfer transaction:", e);
    }
  }

  // 4. Reset bank transaction document
  const txRef = doc(
    db,
    "companies",
    companyId,
    "bankAccounts",
    bankAccountId,
    "transactions",
    transaction.id
  );

  await updateDoc(txRef, {
    reconciled: false,
    matchedAt: null,
    reconciledAt: null,
    reconcileType: null,
    reconciledType: null,
    matchedDocumentId: null,
    matchedDocumentIds: null,
    matchedDocumentNumbers: null,
    matchedDocumentType: null,
    reconcileNotes: null,
    reconciledDocId: null,
    matchedAccountId: null,
    accountingAccountId: null,
    reconciledBy: null,
    aiMatchReason: null,
    confidenceScore: null,
  });
}
