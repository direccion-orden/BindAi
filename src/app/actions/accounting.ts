
import { adminDb } from "@/lib/firebase/admin";

export interface BankTransaction {
  id: string;
  date: string;
  amount: number;
  concept: string;
  type: 'deposit' | 'withdrawal';
  reconciled?: boolean;
  reference?: string;
}

export interface ExpenseInvoice {
  id: string;
  date: string;
  total: number;
  emitterName: string;
  emitterRfc: string;
  status: string;
  description?: string;
  _type: 'gasto' | 'gasto_manual';
}

export interface BankAccount {
  id: string;
  name: string;
  currency: string;
  type: string;
}

/**
 * Busca movimientos bancarios no conciliados.
 */
export async function getUnreconciledTransactions(companyId: string, accountId: string): Promise<BankTransaction[]> {
  if (!adminDb) return [];
  
  try {
    const txsRef = adminDb.collection("companies").doc(companyId)
      .collection("bankAccounts").doc(accountId)
      .collection("transactions");
      
    // Buscamos movimientos que NO tengan el flag reconciled o sea false
    const snapshot = await txsRef.where("reconciled", "==", false).limit(50).get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as BankTransaction));
  } catch (error) {
    console.error("Error fetching unreconciled transactions:", error);
    return [];
  }
}

/**
 * Busca facturas de gastos pendientes de pago.
 */
export async function getPendingExpenses(companyId: string): Promise<ExpenseInvoice[]> {
  if (!adminDb) return [];
  
  try {
    const expenses: ExpenseInvoice[] = [];
    
    // 1. Inbox (SAT)
    const inboxRef = adminDb.collection("companies").doc(companyId).collection("expenses_inbox");
    const inboxSnap = await inboxRef.where("status", "!=", "paid").limit(50).get();
    
    inboxSnap.forEach(doc => {
      const data = doc.data();
      expenses.push({
        id: doc.id,
        date: data.date,
        total: data.total || 0,
        emitterName: data.emitterName || data.issuerName || "Desconocido",
        emitterRfc: data.emitterRfc || data.issuerRfc || "",
        status: data.status,
        _type: 'gasto'
      });
    });
    
    // 2. Manuales
    const manualRef = adminDb.collection("companies").doc(companyId).collection("expenses");
    const manualSnap = await manualRef.where("status", "!=", "paid").limit(50).get();
    
    manualSnap.forEach(doc => {
      const data = doc.data();
      expenses.push({
        id: doc.id,
        date: data.date,
        total: data.amount || 0,
        emitterName: data.providerName || "Proveedor Manual",
        emitterRfc: data.providerRfc || "",
        status: data.status,
        _type: 'gasto_manual'
      });
    });
    
    return expenses;
  } catch (error) {
    console.error("Error fetching pending expenses:", error);
    return [];
  }
}

/**
 * Obtiene la lista de cuentas bancarias de la empresa.
 */
export async function listBankAccounts(companyId: string): Promise<BankAccount[]> {
  if (!adminDb) return [];
  
  try {
    const accountsRef = adminDb.collection("companies").doc(companyId).collection("bankAccounts");
    const snapshot = await accountsRef.get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || data.Name || "Sin nombre",
        currency: data.currency || data.CurrencyCode || "MXN",
        type: data.type || "bank"
      };
    });
  } catch (error) {
    console.error("Error fetching bank accounts:", error);
    return [];
  }
}
