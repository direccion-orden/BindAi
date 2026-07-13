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

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T12:00:00');
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Generate all occurrence dates from start date to end date based on frequency
function generateOccurrenceDates(startDateStr: string, endDateStr: string, frequency: string): string[] {
  const occurrences: string[] = [];
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  
  if (start > end) return occurrences;
  
  let current = new Date(start);
  while (current <= end) {
    occurrences.push(formatDate(current));
    
    if (frequency === "daily") {
      current.setDate(current.getDate() + 1);
    } else if (frequency === "weekly") {
      current.setDate(current.getDate() + 7);
    } else if (frequency === "biweekly") {
      current.setDate(current.getDate() + 14);
    } else if (frequency === "monthly") {
      current.setMonth(current.getMonth() + 1);
    } else if (frequency === "yearly") {
      current.setFullYear(current.getFullYear() + 1);
    } else {
      break;
    }
  }
  
  return occurrences;
}

// Check if a generated occurrence has already been realized by a child expense
function isOccurrenceRealized(occurrenceDateStr: string, childExpenses: any[], frequency: string): boolean {
  const occDate = parseDate(occurrenceDateStr);
  
  return childExpenses.some(child => {
    const childDateStr = child.date || child.createdAt?.substring(0, 10);
    if (!childDateStr) return false;
    
    const childDate = parseDate(childDateStr);
    
    if (frequency === "daily") {
      return childDateStr === occurrenceDateStr;
    } else if (frequency === "weekly" || frequency === "biweekly") {
      const diffTime = Math.abs(childDate.getTime() - occDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 3;
    } else if (frequency === "monthly") {
      return childDate.getFullYear() === occDate.getFullYear() && 
             childDate.getMonth() === occDate.getMonth();
    } else if (frequency === "yearly") {
      return childDate.getFullYear() === occDate.getFullYear();
    }
    
    return childDateStr === occurrenceDateStr;
  });
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

    // Separate recurring templates from normal/realized expenses
    const manualExpensesList = expensesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const recurringTemplates = manualExpensesList.filter((e: any) => e.isRecurring === true);
    const normalExpenses = manualExpensesList.filter((e: any) => e.isRecurring !== true);

    // Parse Outflow: expenses (Normal/Realized Manual Expenses)
    normalExpenses.forEach((data: any) => {
      const balance = data.amount - (data.paidAmount || 0);
      if (balance > 0.01 && data.status !== 'paid') {
        const dateStr = normalizeDate(data.date || data.createdAt);
        const dueDateStr = data.dueDate ? normalizeDate(data.dueDate) : addDays(dateStr, 30);

        outflows.push({
          id: data.id,
          type: 'expense',
          number: data.documentNumber || `GAS-${data.number || data.id.substring(0, 6)}`,
          providerName: data.vendorName || "Proveedor Gasto",
          amount: balance,
          date: dateStr,
          dueDate: dueDateStr
        });
      }
    });

    // Process recurring templates' month 0 (initial occurrence) as a normal manual expense if not realized yet
    recurringTemplates.forEach((template: any) => {
      const dateStr = normalizeDate(template.date || template.createdAt);
      const parentYearMonth = dateStr.substring(0, 7);
      
      // Find if there is a child expense in the same month
      const childExpenses = manualExpensesList.filter((e: any) => e.parentExpenseId === template.id);
      const isParentRealizedInOwnMonth = childExpenses.some(child => {
        const childDateStr = child.date || child.createdAt?.substring(0, 10);
        return childDateStr && childDateStr.substring(0, 7) === parentYearMonth;
      });

      // If not realized (paid) yet in month 0, and status !== 'paid'
      if (!isParentRealizedInOwnMonth && template.status !== 'paid') {
        const balance = template.amount - (template.paidAmount || 0);
        if (balance > 0.01) {
          const dueDateStr = template.dueDate ? normalizeDate(template.dueDate) : addDays(dateStr, 30);
          outflows.push({
            id: template.id,
            type: 'expense',
            number: template.documentNumber || `GAS-${template.number || template.id.substring(0, 6)}`,
            providerName: `${template.vendorName || "Proveedor Gasto"} (Recurrente)`,
            amount: balance,
            date: dateStr,
            dueDate: dueDateStr
          });
        }
      }
    });

    // Parse Outflow: Recurring Expenses Projections
    const todayStr = normalizeDate(null);
    recurringTemplates.forEach((template: any) => {
      const startDateStr = normalizeDate(template.date || template.createdAt);
      const endDateStr = template.recurrenceEndDate ? normalizeDate(template.recurrenceEndDate) : addDays(startDateStr, 365);
      const frequency = template.recurrenceFrequency || "monthly";
      const amount = template.estimatedAmount !== undefined && template.estimatedAmount !== null 
        ? template.estimatedAmount 
        : template.amount;

      // Find realized child expenses for this template
      const childExpenses = manualExpensesList.filter((e: any) => e.parentExpenseId === template.id);

      // Generate all occurrences
      const occurrences = generateOccurrenceDates(startDateStr, endDateStr, frequency);

      occurrences.forEach(occDate => {
        // Project ONLY future occurrences (from today onwards)
        // AND skip the initial occurrence (month 0 / startDateStr) because that is represented by the parent document itself!
        if (occDate >= todayStr && occDate !== startDateStr) {
          // Check if this occurrence has already been paid or registered manually
          if (!isOccurrenceRealized(occDate, childExpenses, frequency)) {
            outflows.push({
              id: `${template.id}_occ_${occDate}`,
              type: 'expense',
              number: `${template.documentNumber || 'GAS'}-REC`,
              providerName: `${template.vendorName || "Proveedor"} (Recurrente)`,
              amount: amount,
              date: occDate,
              dueDate: occDate
            });
          }
        }
      });
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
