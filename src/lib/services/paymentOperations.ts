import { doc, getDoc, updateDoc, increment, collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function cancelPaymentOperation(companyId: string, paymentId: string, documentId: string, documentType: string) {
  const paymentRef = doc(db, "companies", companyId, "payments", paymentId);
  const paymentSnap = await getDoc(paymentRef);
  if (!paymentSnap.exists()) {
    throw new Error("El pago no existe.");
  }
  const payment = paymentSnap.data();
  if (payment.status === "cancelado") {
    throw new Error("El pago ya está cancelado.");
  }

  // 1. Find the corresponding journal entry
  const journalQuery = query(
    collection(db, "companies", companyId, "journal_entries"),
    where("referenceId", "==", paymentId),
    where("referenceType", "==", "payment")
  );
  const journalSnap = await getDocs(journalQuery);
  const journalDoc = journalSnap.docs[0];

  // 2. Revert account balances
  if (journalDoc && journalDoc.exists()) {
    const journalData = journalDoc.data();
    if (journalData.entries && Array.isArray(journalData.entries) && journalData.status !== "cancelada") {
      for (const entry of journalData.entries) {
        const accountRef = doc(db, "companies", companyId, "accounts", entry.accountId);
        const amountToSubtract = entry.debit > 0 ? entry.debit : entry.credit;
        await updateDoc(accountRef, {
          balance: increment(-amountToSubtract)
        });
      }
    }
    // Cancel the journal entry
    await updateDoc(journalDoc.ref, { status: "cancelada" });
  }

  // 3. Revert payment status
  await updateDoc(paymentRef, { status: "cancelado" });

  // 4. Revert parent document paidAmount and status
  let collectionName = "";
  if (documentType === "pedido") collectionName = "pedidos";
  else if (documentType === "remision") collectionName = "remisiones";
  else if (documentType === "factura") collectionName = "facturas";

  if (collectionName) {
    const docRef = doc(db, "companies", companyId, collectionName, documentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const docData = docSnap.data();
      const updates: any = {
        paidAmount: increment(-payment.amount)
      };

      const newPaidAmount = Math.max(0, (docData.paidAmount || 0) - payment.amount);
      const totalAmount = docData.totalAmount || 0;

      // Revert status from pagada to its previous state
      if (docData.status === "pagada" && newPaidAmount < totalAmount - 0.01) {
        if (documentType === "factura") {
          updates.status = docData.facturamaUuid || docData.facturamaId ? "timbrada" : "por_timbrar";
        } else if (documentType === "remision") {
          updates.status = docData.invoiceNumber || docData.invoiceId ? "facturada" : "activa";
        }
      }
      await updateDoc(docRef, updates);
    }
  }
}

export async function editPaymentOperation(
  companyId: string, 
  paymentId: string, 
  originalPayment: any, 
  updatedFields: {
    amount: number;
    date: string;
    method: string;
    reference: string;
    bankAccountId: string;
    vatRate: number;
    accountId?: string;
    accountCode?: string;
    accountName?: string;
  }
) {
  // 1. Revert original payment
  await cancelPaymentOperation(companyId, paymentId, originalPayment.documentId, originalPayment.documentType);

  // 2. Update payment document with new active details
  const paymentRef = doc(db, "companies", companyId, "payments", paymentId);
  await updateDoc(paymentRef, {
    amount: updatedFields.amount,
    date: updatedFields.date,
    method: updatedFields.method,
    reference: updatedFields.reference,
    bankAccountId: updatedFields.bankAccountId,
    status: "activo", // reactivate
    updatedAt: new Date().toISOString()
  });

  // 3. Create a new journal entry (Póliza de Ingreso)
  if (updatedFields.accountId) {
    let subtotalAmount = updatedFields.amount;
    let vatAmount = 0;
    let vatAccount = null;

    if (updatedFields.vatRate > 0) {
      subtotalAmount = updatedFields.amount / (1 + updatedFields.vatRate);
      vatAmount = updatedFields.amount - subtotalAmount;
      
      const allAccSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
      const vatAccounts = allAccSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(a => a.code.startsWith("208") && a.level >= 2);
      vatAccount = vatAccounts[0];
    }

    const allAccSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
    const bankAccount = allAccSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)).find(a => a.id === updatedFields.bankAccountId);

    const entries = [
      {
        accountId: updatedFields.bankAccountId,
        accountCode: bankAccount?.code || "",
        accountName: bankAccount?.name || "",
        debit: updatedFields.amount,
        credit: 0
      },
      {
        accountId: updatedFields.accountId,
        accountCode: updatedFields.accountCode || "",
        accountName: updatedFields.accountName || "",
        debit: 0,
        credit: subtotalAmount
      }
    ];

    if (vatAmount > 0 && vatAccount) {
      entries.push({
        accountId: vatAccount.id,
        accountCode: vatAccount.code,
        accountName: vatAccount.name,
        debit: 0,
        credit: vatAmount
      });
    }

    await addDoc(collection(db, "companies", companyId, "journal_entries"), {
      type: "ingreso",
      date: updatedFields.date,
      description: `Cobro de ${originalPayment.documentType} ${originalPayment.documentNumber || originalPayment.documentId} (Editado)`,
      referenceId: paymentId,
      referenceType: "payment",
      createdAt: new Date().toISOString(),
      status: "activa",
      entries
    });

    // Update Account Balances
    await updateDoc(doc(db, "companies", companyId, "accounts", updatedFields.bankAccountId), {
      balance: increment(updatedFields.amount)
    });
    await updateDoc(doc(db, "companies", companyId, "accounts", updatedFields.accountId), {
      balance: increment(subtotalAmount)
    });
    if (vatAmount > 0 && vatAccount) {
      await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
        balance: increment(vatAmount)
      });
    }
  }

  // 4. Update parent document paidAmount and status
  let collectionName = "";
  if (originalPayment.documentType === "pedido") collectionName = "pedidos";
  else if (originalPayment.documentType === "remision") collectionName = "remisiones";
  else if (originalPayment.documentType === "factura") collectionName = "facturas";

  if (collectionName) {
    const docRef = doc(db, "companies", companyId, collectionName, originalPayment.documentId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const docData = docSnap.data();
      const updates: any = {
        paidAmount: increment(updatedFields.amount)
      };

      const newPaidAmount = (docData.paidAmount || 0) + updatedFields.amount;
      const totalAmount = docData.totalAmount || 0;

      if (newPaidAmount >= totalAmount - 0.01) {
        if (originalPayment.documentType === "factura" || originalPayment.documentType === "remision") {
          if (docData.status !== "cancelada" && docData.status !== "cancelado") {
            updates.status = "pagada";
          }
        }
      }
      await updateDoc(docRef, updates);
    }
  }
}
