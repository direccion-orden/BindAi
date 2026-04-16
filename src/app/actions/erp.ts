
export interface ErpClient {
  id: string;
  legalName: string;
}

export interface ErpDocument {
  id: string;
  type: "Invoice" | "Remission" | "Order";
  number: string;
  total: number;
  balance: number;
}

const API_BASE = "https://api.bind.com.mx/api";

function getHeaders() {
  const apiKey = process.env.BIND_ERP_API_KEY;
  if (!apiKey) {
    console.warn("BIND_ERP_API_KEY no está configurado en .env.local");
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}` // o 'Bearer' dependiendo de cómo acepte Bind el token oficial
  };
}

export async function searchErpClients(query: string): Promise<ErpClient[]> {
  if (!process.env.BIND_ERP_API_KEY) {
    // Fallback Mock si no hay API Key de ERP
    return [
      { id: "C-001", legalName: `Mock Cliente (${query})` },
      { id: "C-002", legalName: "Empresa de Ejemplo S.A. de C.V." },
    ];
  }

  try {
    // Ejemplo de endpoint OData de BIND
    const res = await fetch(`${API_BASE}/Clients?$filter=substringof('${query}', LegalName)`, {
      headers: getHeaders()
    });
    
    if (!res.ok) throw new Error("Error fetching clients");
    const data = await res.json();
    
    return data.value.map((c: any) => ({
      id: c.ID,
      legalName: c.LegalName || c.CommercialName
    }));
  } catch (error) {
    console.error("Error Bind API Clients:", error);
    return [];
  }
}

export async function getBankAccounts() {
  if (!process.env.BIND_ERP_API_KEY) {
    return [
      { id: "CUENTA_MOCK", name: "Cuenta Mock 1", currency: "MXN" },
      { id: "CUENTA_MOCK_2", name: "Cuenta Mock 2", currency: "USD" }
    ];
  }

  try {
    const res = await fetch(`${API_BASE}/BankAccounts`, {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error("Error fetching bank accounts");
    const data = await res.json();
    return data.value.map((b: any) => ({
      id: b.ID,
      name: b.Name,
      currencyId: b.CurrencyID,
      balance: b.Balance
    }));
  } catch (error) {
    console.error("Error Bank Accounts:", error);
    return [];
  }
}

export async function getClientDocuments(clientId: string): Promise<ErpDocument[]> {
  if (!process.env.BIND_ERP_API_KEY) {
    return [
      { id: "FAC-1", type: "Invoice", number: "FAC-1002", total: 15000, balance: 15000 },
      { id: "ORD-1", type: "Order", number: "ORD-991", total: 4750, balance: 4750 },
    ];
  }

  try {
    // Obtener Facturas y Remisiones (Bind las agrupa aquí)
    const resInvoices = await fetch(`${API_BASE}/Invoices?$filter=ClientID eq guid'${clientId}' and (Status eq 1 or Status eq 0)`, {
      headers: getHeaders()
    });
    
    let documents: ErpDocument[] = [];

    if (resInvoices.ok) {
      const data = await resInvoices.json();
      
      data.value.forEach((doc: any) => {
        const balance = doc.Total - (doc.Payments || 0) - (doc.CreditNotes || 0);
        if (balance > 0.01) {
          documents.push({
            id: doc.ID,
            type: doc.IsFiscalInvoice ? "Invoice" : "Remission",
            number: (doc.IsFiscalInvoice ? "FACT-" : "REM-") + (doc.Number || doc.ID.substring(0,6)),
            total: doc.Total,
            balance: balance
          });
        }
      });
    }

    // Obtener Órdenes (Pedidos) - Permitimos Status 0 y 1 para abarcar órdenes con anticipo previo
    const resOrders = await fetch(`${API_BASE}/Orders?$filter=ClientID eq guid'${clientId}' and (Status eq 1 or Status eq 0)`, {
      headers: getHeaders()
    });

    if (resOrders.ok) {
      const data = await resOrders.json();
      documents = [...documents, ...data.value.map((doc: any) => ({
        id: doc.ID,
        type: "Order",
        number: "ORD-" + (doc.Number || doc.ID.substring(0,6)),
        total: doc.Total,
        balance: doc.Total 
      }))];
    }

    return documents;
  } catch (error) {
    console.error("Error Bind API Documents:", error);
    return [];
  }
}

// ---- ESTADO DE CUENTA ----

export interface AccountStatementLine {
  date: string;
  type: 'Order' | 'Remission' | 'Invoice' | 'Payment' | 'Anticipo';
  number: string;
  description: string;
  cargo: number;
  abono: number;
  runningBalance: number;
}

export interface AccountStatement {
  client: { id: string; legalName: string };
  generatedAt: string;
  lines: AccountStatementLine[];
  summary: {
    totalCargos: number;
    totalAbonos: number;
    saldoTotal: number;
  };
}

/**
 * Obtiene el estado de cuenta consolidado de un cliente.
 * Combina datos de Bind ERP (facturas, remisiones, pedidos) con anticipos de Firestore.
 * @param clientId - ID del cliente en Bind ERP
 * @param clientName - Nombre legal del cliente
 * @param anticipos - Array de anticipos del cliente desde Firestore (pasados por la API route)
 */
export async function getClientAccountStatement(
  clientId: string,
  clientName: string,
  anticipos: any[]
): Promise<AccountStatement> {

  const lines: AccountStatementLine[] = [];

  // Helper: extraer fecha YYYY-MM-DD de varios formatos
  const extractDate = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') {
      // ISO timestamp "2026-03-01T00:00:00Z" or plain date "2026-03-01"
      return val.substring(0, 10);
    }
    // Firestore timestamp object {seconds: ..., nanoseconds: ...}
    if (val.seconds || val._seconds) {
      const secs = val.seconds || val._seconds;
      return new Date(secs * 1000).toISOString().split('T')[0];
    }
    return '';
  };

  if (!process.env.BIND_ERP_API_KEY) {
    // Mock data para desarrollo
    lines.push(
      { date: '2026-03-01', type: 'Order', number: 'ORD-0001', description: 'Pedido de prueba', cargo: 25000, abono: 0, runningBalance: 0 },
      { date: '2026-03-05', type: 'Invoice', number: 'FACT-0012', description: 'Factura de venta', cargo: 18500, abono: 0, runningBalance: 0 },
      { date: '2026-03-10', type: 'Remission', number: 'REM-0003', description: 'Remisión de mercancía', cargo: 7200, abono: 0, runningBalance: 0 },
      { date: '2026-03-12', type: 'Payment', number: 'PAG-0012', description: 'Pago a FACT-0012', cargo: 0, abono: 10000, runningBalance: 0 },
    );
  } else {
    try {
      // 1. Facturas y Remisiones — todos los estatus excepto canceladas (Status ne 2)
      const resInvoices = await fetch(
        `${API_BASE}/Invoices?$filter=ClientID eq guid'${clientId}' and Status ne 2`,
        { headers: getHeaders() }
      );
      if (resInvoices.ok) {
        const data = await resInvoices.json();
        for (const doc of data.value) {
          const type: 'Invoice' | 'Remission' = doc.IsFiscalInvoice ? 'Invoice' : 'Remission';
          const number = (doc.IsFiscalInvoice ? 'FACT-' : 'REM-') + (doc.Number || doc.ID.substring(0, 6));
          const total = doc.Total || 0;
          const paymentsApplied = (doc.Payments || 0) + (doc.CreditNotes || 0);
          const balance = total - paymentsApplied;

          // Línea de cargo (documento)
          lines.push({
            date: extractDate(doc.Date || doc.CreatedDate),
            type,
            number,
            description: type === 'Invoice' ? 'Factura' : 'Remisión',
            cargo: total,
            abono: 0,
            runningBalance: 0
          });

          // Línea de abono (pagos ya aplicados en Bind)
          if (paymentsApplied > 0.01) {
            lines.push({
              date: extractDate(doc.Date || doc.CreatedDate),
              type: 'Payment',
              number: `PAG-${number}`,
              description: `Pagos aplicados a ${number}`,
              cargo: 0,
              abono: paymentsApplied,
              runningBalance: 0
            });
          }
        }
      }

      // 2. Pedidos (Orders) — solo activos o pendientes (Status eq 1 or Status eq 0)
      const resOrders = await fetch(
        `${API_BASE}/Orders?$filter=ClientID eq guid'${clientId}' and (Status eq 1 or Status eq 0)`,
        { headers: getHeaders() }
      );
      if (resOrders.ok) {
        const data = await resOrders.json();
        for (const doc of data.value) {
          lines.push({
            date: extractDate(doc.OrderDate || doc.Date || doc.CreatedDate),
            type: 'Order',
            number: 'ORD-' + (doc.Number || doc.ID.substring(0, 6)),
            description: 'Pedido',
            cargo: doc.Total || 0,
            abono: 0,
            runningBalance: 0
          });
        }
      }
    } catch (error) {
      console.error('Error fetching Bind ERP data for account statement:', error);
    }
  }

  // 3. Anticipos de Firestore — incluir todos (pending, partially_applied, applied)
  for (const ant of anticipos) {
    const folio = ant.folio ? `ANT-${String(ant.folio).padStart(4, '0')}` : `ANT-${ant.id?.substring(0, 5).toUpperCase()}`;
    const date = extractDate(ant.receivedAt) || extractDate(ant.createdAt);

    // El anticipo como abono (dinero a favor del cliente)
    lines.push({
      date,
      type: 'Anticipo',
      number: folio,
      description: `Anticipo - ${ant.paymentTermName || 'Pago'}${ant.reference ? ' | Ref: ' + ant.reference : ''}`,
      cargo: 0,
      abono: ant.amount || 0,
      runningBalance: 0
    });
  }

  // 4. Ordenar por fecha ASC
  lines.sort((a, b) => {
    const da = a.date || '0000-00-00';
    const db2 = b.date || '0000-00-00';
    return da.localeCompare(db2);
  });

  // 5. Calcular saldo acumulado y totales
  let totalCargos = 0;
  let totalAbonos = 0;
  let runningBalance = 0;

  for (const line of lines) {
    totalCargos += line.cargo;
    totalAbonos += line.abono;
    runningBalance += line.cargo - line.abono;
    line.runningBalance = runningBalance;
  }

  return {
    client: { id: clientId, legalName: clientName },
    generatedAt: new Date().toISOString(),
    lines,
    summary: {
      totalCargos,
      totalAbonos,
      saldoTotal: totalCargos - totalAbonos
    }
  };
}

export async function applyPaymentToErp(
  documentId: string,
  docType: string,
  amount: number,
  bankAccountId: string,
  paymentTerm: number,
  reference: string
) {
  if (!process.env.BIND_ERP_API_KEY) {
    return { success: true, paymentId: "MOCK-PAY-" + Math.floor(Math.random() * 1000) };
  }

  // --- FLUJO CIEGO / HÍBRIDO ---
  // Las Órdenes (Pedidos) no se pueden cobrar directo por API, entran a flujo ciego.
  if (docType === "Order") {
    console.log(`[Flujo Ciego] Pago de $${amount} asignado al documento ${documentId} (${docType}). NO inyectado en Bind ERP.`);
    return { success: true, paymentId: "PENDING-ERP-" + documentId };
  }

  try {
    // Obtener la cuenta base automáticamente si envían la de Mock
    let finalAccountId = bankAccountId;
    if (finalAccountId === "CUENTA_MOCK") {
      finalAccountId = "28b5ba5e-d7e9-442a-a206-1e08e5aa2534";
    }

    const payload = {
      InvoiceID: documentId,
      AccountID: finalAccountId,
      Amount: amount,
      Reference: reference || "Anticipo de App",
      PaymentTerm: paymentTerm || 3,
      Date: new Date().toISOString()
    };

    // El endpoint real validado para pagos a facturas es /Invoices/Payment
    const res = await fetch(`${API_BASE}/Invoices/Payment`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Bind API Rechazó:", errorText);
      return { success: false, error: "No se pudo aplicar el pago en Bind: " + errorText };
    }
    
    return { success: true, paymentId: documentId };
  } catch (error: any) {
    console.error("Error Apply Payment API:", error);
    return { success: false, error: error?.message || "Error interno de servidor" };
  }
}
