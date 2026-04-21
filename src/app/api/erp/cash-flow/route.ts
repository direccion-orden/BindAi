import { NextResponse } from 'next/server';

const API_BASE = "https://api.bind.com.mx/api";

async function fetchFromBind(url: string, apiKey: string) {
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bind Fetch Error on ${url}: ${res.statusText} - ${text}`);
  }
  return res.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const month = parseInt(searchParams.get('month') || "1");
  const year = parseInt(searchParams.get('year') || "2024");
  
  try {
    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    // Mes actual para consulta
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDateObj = new Date(year, month, 0);
    endDateObj.setHours(23, 59, 59, 999);
    const endDate = endDateObj.toISOString();

    // Mes anterior para pronostico
    const prevStartDate = new Date(year, month - 2, 1).toISOString();
    const prevEndDateObj = new Date(year, month - 1, 0);
    prevEndDateObj.setHours(23, 59, 59, 999);
    const prevEndDate = prevEndDateObj.toISOString();

    // Formatos OData
    const oDataStart = startDate.substring(0, 19);
    const oDataEnd = endDate.substring(0, 19);
    const oDataPrevStart = prevStartDate.substring(0, 19);
    const oDataPrevEnd = prevEndDate.substring(0, 19);

    // Hacer 4 llamadas paralelas: Ingresos Reales, Gastos Reales, Ingresos Pasados, Gastos Pasados
    const [invoicesReal, expensesReal, invoicesPrev, expensesPrev] = await Promise.all([
      fetchFromBind(`${API_BASE}/Invoices?$filter=Date ge datetime'${oDataStart}' and Date le datetime'${oDataEnd}'`, apiKey),
      fetchFromBind(`${API_BASE}/AccountingJournals?$filter=CreationDate ge datetime'${oDataStart}' and CreationDate le datetime'${oDataEnd}'`, apiKey),
      fetchFromBind(`${API_BASE}/Invoices?$filter=Date ge datetime'${oDataPrevStart}' and Date le datetime'${oDataPrevEnd}'`, apiKey),
      fetchFromBind(`${API_BASE}/AccountingJournals?$filter=CreationDate ge datetime'${oDataPrevStart}' and CreationDate le datetime'${oDataPrevEnd}'`, apiKey)
    ]);

    // Procesar ingresos del mes actual
    const realIncomes = (invoicesReal.value || []).map((inv: any) => {
      const date = new Date(inv.Date);
      return {
        id: inv.ID,
        day: date.getDate(),
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        type: 'INCOME',
        category: 'Ingreso Operativo',
        concept: `Folio: ${inv.Number || 'S/N'} - Cliente: ${inv.ClientName || 'Varios'}`,
        amount: inv.Payments || 0, // Solo lo pagado (flujo real)
        isReal: true
      };
    }).filter((i: any) => i.amount > 0);

    // Procesar gastos del mes actual
    const realExpenses = (expensesReal.value || [])
      .filter((exp: any) => exp.Type === 'Gasto')
      .map((exp: any) => {
      const date = new Date(exp.CreationDate || exp.ApplicationDate);
      const amount = (exp.Items || []).reduce((sum: number, item: any) => sum + (item.Debit || 0), 0);
      const concept = exp.Items?.[0]?.Description || `Gasto ERP #${exp.Number}`;
      return {
        id: exp.ID,
        day: date.getDate(),
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        type: 'EXPENSE',
        category: 'Gasto Operativo',
        concept: concept,
        amount: amount,
        isReal: true,
        providerId: null, // Si es necesario, parsear del texto
        accountId: null
      };
    }).filter((e: any) => e.amount > 0);

    // Computar promedios/totales del mes M-1 (Forecast)
    let totalIncomesPrev = 0;
    (invoicesPrev.value || []).forEach((inv: any) => {
      if (inv.Payments > 0) totalIncomesPrev += inv.Payments;
    });

    let totalExpensesPrev = 0;
    (expensesPrev.value || [])
      .filter((exp: any) => exp.Type === 'Gasto')
      .forEach((exp: any) => {
        const amount = (exp.Items || []).reduce((sum: number, item: any) => sum + (item.Debit || 0), 0);
        if (amount > 0) totalExpensesPrev += amount;
    });

    const forecast = {
      income: totalIncomesPrev,
      expense: totalExpensesPrev
    };

    return NextResponse.json({
      success: true,
      records: [...realIncomes, ...realExpenses],
      forecast
    });

  } catch (error: any) {
    console.error("Cash Flow API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
