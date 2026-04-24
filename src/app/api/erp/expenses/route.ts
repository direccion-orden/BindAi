import { NextResponse, NextRequest } from 'next/server';

const API_BASE = "https://api.bind.com.mx/api";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    const body = await request.json();
    const expensePayload = {
      ProviderID: body.ProviderID,
      AccountID: body.AccountID,
      LocationID: body.LocationID,
      DepartmentID: null,
      CategoryID: null,
      Comments: body.Concept,
      CurrencyID: "e07b8a36-391d-40d9-b2c0-128a1eaadbb9",
      ExchangeRate: 1,
      Date: body.Date, // YYYY-MM-DD
      Status: 1, 
      Items: [
        { Concept: body.Concept, Total: body.Amount, VATRate: 0 }
      ]
    };

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    const url = `${API_BASE}/Expenses`;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(expensePayload) });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Bind ERP Error: ${errorText}`);
    }
    return NextResponse.json(await res.json());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
    try {
        const apiKey = process.env.BIND_ERP_API_KEY;
        if (!apiKey) return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });

        const { searchParams } = new URL(request.url);
        const monthStr = searchParams.get('month');
        const yearStr = searchParams.get('year');
        
        let allExpenses: any[] = [];
        const monthNum = monthStr ? parseInt(monthStr) : new Date().getMonth() + 1;
        const yearNum = yearStr ? parseInt(yearStr) : new Date().getFullYear();

        const startDate = new Date(yearNum, monthNum - 1, 1).toISOString();
        const endDateOb = new Date(yearNum, monthNum, 0, 23, 59, 59);
        const endDate = endDateOb.toISOString();

        // FUENTE 1: ÓRDENES DE COMPRA (Borradores y Formales)
        // Eliminado a petición del usuario ya que no utilizan el módulo de Órdenes de Compra.

        // FUENTE 2: ACCOUNTING JOURNALS (Gastos Operativos, Pagos de Gastos, Recepciones y Pagos de O.C.)
        // NOTA: La API de Bind tiene un bug donde omitir el filtro "Type" o usar "OR" ignora las pólizas autogeneradas.
        // Se deben consultar explícitamente los tipos 1 (Gasto), 2 (Pago de Gasto), 3 (Recepción de Mercancía) y 4 (Pago de Recepción de Mercancía).
        const typesToFetch = [1, 2, 3, 4];
        
        await Promise.all(typesToFetch.map(async (journalType) => {
            let skipAJ = 0;
            let hasMoreAJ = true;
            while (hasMoreAJ) {
               const ajUrl = `${API_BASE}/AccountingJournals?$filter=Type eq ${journalType} and ApplicationDate ge datetime'${startDate.split('T')[0]}T00:00:00' and ApplicationDate le datetime'${endDate.split('T')[0]}T23:59:59'&$top=100&$skip=${skipAJ}`;
               const response = await fetch(ajUrl, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }});
               if (!response.ok) break;
               const data = await response.json();
               const items = data.value || [];
               
               items.forEach((exp: any) => {
                   const date = new Date(exp.ApplicationDate || exp.CreationDate);
                   // El monto total se refleja sumando el Debe de los items del asiento
                   const totalAmount = (exp.Items || []).reduce((acc: number, item: any) => acc + (item.Debit || 0), 0);
                   
                   if (totalAmount > 0) {
                      // Tratar de extraer el proveedor de la descripción "Pago - PROVEEDOR"
                      let pName = 'Gastos Generales';
                      let desc = (exp.JournalType || exp.Type || 'Gasto') + (exp.Number ? ` #${exp.Number}` : '');
                      
                      const mainItem = exp.Items.find((i:any) => i.Description && i.Description.includes(' - '));
                      if (mainItem) {
                          const parts = mainItem.Description.split(' - ');
                          if (parts.length > 1) {
                              pName = parts.slice(1).join(' - ').trim();
                          }
                          // Evitar sobreescribir con descripciones raras, usar la principal si no es muy larga
                          if (parts[0].length < 50) {
                              desc = parts[0];
                          }
                      }
                      
                      const pIdFallback = pName; 

                      allExpenses.push({
                          id: exp.ID,
                          costCenterId: pIdFallback, // Map to provider ID
                          providerName: pName,
                          day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear(),
                          amount: totalAmount,
                          concept: desc,
                          isProgrammed: false,
                          statusText: 'Afectado',
                          status: 2, // Color code for "Aprobada/Pagada" in UI
                          _isPO: false,
                          _journalType: journalType,
                          _number: exp.Number,
                          _desc: (exp.Items || []).map((i:any) => i.Description || '').join(' ')
                      });
                   }
               });
               
               if (items.length === 100) skipAJ += 100;
               else hasMoreAJ = false;
            }
        }));

        // Deduplicación post-procesamiento:
        // Si hay un Tipo 1 o 3 (Provisiones) en el mes, y también se encuentra un Pago (Tipo 2 o 4) en el mes
        // que hace referencia al número del original, ocultamos la provisión para evitar doble conteo.
        const type2Desc = allExpenses.filter(e => e._journalType === 2).map(e => e._desc || '');
        const type4Desc = allExpenses.filter(e => e._journalType === 4).map(e => e._desc || '');
        
        const deduplicatedExpenses = allExpenses.filter(e => {
            if (e._journalType === 1 && e._number) {
                const fuePagado = type2Desc.some(desc => desc.includes(`#${e._number}`));
                if (fuePagado) return false; // Ocultar el Gasto porque ya está representado por su Pago
            }
            if (e._journalType === 3 && e._number) {
                const fuePagado = type4Desc.some(desc => desc.includes(`#${e._number}`));
                if (fuePagado) return false; // Ocultar Recepción si hay un Pago que la mencione
            }
            return true;
        });

        return NextResponse.json({
            value: deduplicatedExpenses,
            debug_count: deduplicatedExpenses.length
        });

    } catch (error: any) {
        console.error('Error al obtener egresos:', error);
        return NextResponse.json({ error: 'Error al obtener egresos de ERP: ' + error.message }, { status: 500 });
    }
}
