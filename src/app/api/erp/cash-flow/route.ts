import { NextResponse, NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

function normalizeDate(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0];
  if (typeof val === 'string') {
    return val.substring(0, 10);
  }
  if (val && (val.seconds || val._seconds)) {
    const secs = val.seconds || val._seconds;
    return new Date(secs * 1000).toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

// Add days to date string (YYYY-MM-DD)
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: "El parámetro companyId es requerido" }, { status: 400 });
    }

    if (!adminDb) {
      console.error("[CashFlow API] Firestore Admin SDK not initialized");
      return NextResponse.json({ error: "Firestore no está disponible en el servidor" }, { status: 500 });
    }

    console.log(`[CashFlow API] Fetching purely from Firestore for company: ${companyId}`);

    // Query all collections from Firestore in parallel
    const [
      bankAccountsSnap,
      facturasSnap,
      pedidosSnap,
      paymentsSnap,
      purchasesSnap,
      inboxSnap,
      expensesSnap
    ] = await Promise.all([
      adminDb.collection("companies").doc(companyId).collection("bankAccounts").get(),
      adminDb.collection("companies").doc(companyId).collection("facturas").get(),
      adminDb.collection("companies").doc(companyId).collection("pedidos").get(),
      adminDb.collection("companies").doc(companyId).collection("payments").get(),
      adminDb.collection("companies").doc(companyId).collection("purchases").get(),
      adminDb.collection("companies").doc(companyId).collection("expenses_inbox").get(),
      adminDb.collection("companies").doc(companyId).collection("expenses").get()
    ]);

    // Parse Bank Accounts
    const bankAccounts = bankAccountsSnap.docs.map((doc: any) => {
      const data = doc.data();
      // Handle balance fallback
      const activeBalance = data.balance !== undefined && data.balance !== 0 
        ? data.balance 
        : (data.Balance || 0);

      return {
        id: doc.id,
        name: data.Name || data.name || "Cuenta sin Nombre",
        balance: activeBalance,
        currencyCode: data.CurrencyCode || data.currencyCode || "MXN"
      };
    });
    const initialCash = bankAccounts.reduce((sum, b) => sum + b.balance, 0);

    // Group client payments by documentId/documentNumber
    const clientInvoicePayments: Record<string, number> = {};
    const clientOrderPayments: Record<string, number> = {};

    paymentsSnap.docs.forEach((doc: any) => {
      const p = doc.data();
      const docId = p.documentId;
      const docNum = p.documentNumber;
      const amount = p.amount || 0;

      if (p.documentType === 'factura') {
        if (docId) clientInvoicePayments[docId] = (clientInvoicePayments[docId] || 0) + amount;
        if (docNum) clientInvoicePayments[docNum] = (clientInvoicePayments[docNum] || 0) + amount;
      } else if (p.documentType === 'pedido') {
        if (docId) clientOrderPayments[docId] = (clientOrderPayments[docId] || 0) + amount;
        if (docNum) clientOrderPayments[docNum] = (clientOrderPayments[docNum] || 0) + amount;
      }
    });

    // Parse Inflow: Facturas (Client Invoices)
    const inflows: any[] = [];
    facturasSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      // Status 'timbrada' is active and unpaid/partially paid
      if (data.status === 'timbrada') {
        const total = data.totalAmount || 0;
        const paidAmt = clientInvoicePayments[doc.id] || clientInvoicePayments[data.invoiceNumber] || 0;
        const balance = total - paidAmt;

        if (balance > 0.01) {
          const dateStr = normalizeDate(data.createdAt);
          // Default payment terms of 30 days from creation
          const dueDateStr = data.dueDate ? normalizeDate(data.dueDate) : addDays(dateStr, 30);
          
          inflows.push({
            id: doc.id,
            type: 'invoice',
            number: data.invoiceNumber ? `FACT-${data.invoiceNumber}` : `FACT-${doc.id.substring(0, 6)}`,
            clientName: data.clientName || "Cliente General",
            amount: balance,
            date: dateStr,
            dueDate: dueDateStr
          });
        }
      }
    });

    // Parse Inflow: Pedidos (Client Orders)
    pedidosSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      // Status 'por_surtir' is active
      if (data.status === 'por_surtir') {
        const total = data.totalAmount || 0;
        const paidAmt = clientOrderPayments[doc.id] || clientOrderPayments[data.orderNumber] || 0;
        const balance = total - paidAmt;

        if (balance > 0.01) {
          const dateStr = normalizeDate(data.createdAt);
          // Orders are expected to receive cash on order date or soon, map to order date
          const dueDateStr = data.dueDate ? normalizeDate(data.dueDate) : dateStr;

          inflows.push({
            id: doc.id,
            type: 'order',
            number: data.orderNumber || `PED-${doc.id.substring(0, 6)}`,
            clientName: data.clientName || "Cliente General",
            amount: balance,
            date: dateStr,
            dueDate: dueDateStr
          });
        }
      }
    });

    // Parse Outflow: Purchases (Receptions)
    const outflows: any[] = [];
    purchasesSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      const balance = data.totalCost - (data.paidAmount || 0);
      if (balance > 0.01) {
        const dateStr = normalizeDate(data.date || data.createdAt);
        // Default terms 30 days from invoice date
        const dueDateStr = data.dueDate ? normalizeDate(data.dueDate) : addDays(dateStr, 30);
        
        outflows.push({
          id: doc.id,
          type: 'purchase',
          number: data.invoiceNumber ? `FAC-${data.invoiceNumber}` : (data.purchaseOrderId ? `OC-${data.purchaseOrderId}` : `REC-${doc.id.substring(0, 6)}`),
          providerName: data.vendorName || "Proveedor General",
          amount: balance,
          date: dateStr,
          dueDate: dueDateStr
        });
      }
    });

    // Parse Outflow: expenses_inbox (SAT Provider Invoices)
    inboxSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      const balance = data.total - (data.paidAmount || 0);
      if (balance > 0.01 && data.status !== 'paid') {
        const dateStr = normalizeDate(data.date || data.createdAt);
        const dueDateStr = data.dueDate ? normalizeDate(data.dueDate) : addDays(dateStr, 30);
        
        outflows.push({
          id: doc.id,
          type: 'expense_inbox',
          number: data.uuid ? `XML-${data.uuid.substring(0, 8).toUpperCase()}` : `EXP-${doc.id.substring(0, 6)}`,
          providerName: data.emisorName || "Proveedor SAT",
          amount: balance,
          date: dateStr,
          dueDate: dueDateStr
        });
      }
    });

    // Parse Outflow: expenses (Manual Expenses)
    expensesSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      const balance = data.amount - (data.paidAmount || 0);
      if (balance > 0.01 && data.status !== 'paid') {
        const dateStr = normalizeDate(data.date || data.createdAt);
        const dueDateStr = data.dueDate ? normalizeDate(data.dueDate) : addDays(dateStr, 30);

        outflows.push({
          id: doc.id,
          type: 'expense',
          number: data.documentNumber || `GAS-${data.number || doc.id.substring(0, 6)}`,
          providerName: data.vendorName || "Proveedor Gasto",
          amount: balance,
          date: dateStr,
          dueDate: dueDateStr
        });
      }
    });

    console.log(`[CashFlow API] Completed. Inflow: ${inflows.length}, Outflow: ${outflows.length}, Banks: ${bankAccounts.length}`);

    return NextResponse.json({
      success: true,
      initialCash,
      bankAccounts,
      inflows,
      outflows
    });

  } catch (error: any) {
    console.error("Cash Flow Projection API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
