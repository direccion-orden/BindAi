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
        let skipPOs = 0;
        let hasMorePOs = true;
        while (hasMorePOs) {
            const poUrl = `${API_BASE}/Purchases/GetPurchaseOrders?$filter=CreationDate ge datetime'${startDate.split('T')[0]}T00:00:00' and CreationDate le datetime'${endDate.split('T')[0]}T23:59:59'&$top=100&$skip=${skipPOs}`;
            const response = await fetch(poUrl, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }});
            if (!response.ok) break;
            const data = await response.json();
            const pos = data.value || [];
            
            pos.forEach((po: any) => {
                const date = new Date(po.CreationDate);
                allExpenses.push({
                    id: po.ID,
                    costCenterId: po.ProviderID || 'unknown',
                    providerName: po.Provider || po.ProviderName || 'Proveedor General',
                    day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear(),
                    amount: po.TotalImport || 0,
                    concept: `O.C. ${po.Number}${po.Warehouse ? ' (' + po.Warehouse + ')' : ''}`,
                    isProgrammed: false,
                    statusText: po.StatusText || 'Desconocido',
                    status: po.Status,
                    _isPO: true
                });
            });
            if (pos.length === 100) skipPOs += 100;
            else hasMorePOs = false;
        }

        // FUENTE 2: ACCOUNTING JOURNALS (Gastos Operativos o directos sin OC)
        let skipAJ = 0;
        let hasMoreAJ = true;
        while (hasMoreAJ) {
           const ajUrl = `${API_BASE}/AccountingJournals?$filter=Type eq 1 and ApplicationDate ge datetime'${startDate.split('T')[0]}T00:00:00' and ApplicationDate le datetime'${endDate.split('T')[0]}T23:59:59'&$top=100&$skip=${skipAJ}`;
           const response = await fetch(ajUrl, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }});
           if (!response.ok) break;
           const data = await response.json();
           const items = data.value || [];
           
           items.forEach((exp: any) => {
               if (exp.Type === 'Gasto') {
                   const date = new Date(exp.CreationDate || exp.ApplicationDate);
                   // El monto total con IVA se refleja sumando el Debe de los items del asiento
                   const totalAmount = (exp.Items || []).reduce((acc: number, item: any) => acc + (item.Debit || 0), 0);
                   
                   // Si el asiento ya está procesado como Orden de Compra por el O.C. ID etc, evitaríamos duplicarlo
                   // Usualmente 'Comments' o 'Description' dicen "Pago proveedor O.C. 1611". 
                   const isDuplicateOfPO = allExpenses.some(pOExp => pOExp._isPO && ((exp.Number||"").toString() == pOExp.concept || exp.Items.some((i: any) => (i.Description || "").includes(`O.C. ${pOExp.id}`))));
                   
                   if (!isDuplicateOfPO && totalAmount > 0) {
                      // Tratar de extraer el proveedor de la descripción "Gasto #14314 - PROVEEDOR"
                      let pName = 'Gastos Generales';
                      let desc = exp.Number?.toString() || 'Gasto';
                      
                      const mainItem = exp.Items.find((i:any) => i.Description && i.Description.includes(' - '));
                      if (mainItem) {
                          const parts = mainItem.Description.split(' - ');
                          if (parts.length > 1) {
                              pName = parts.slice(1).join(' - ').trim();
                          }
                          desc = parts[0];
                      }
                      
                      // Hash simple temporal para el ProviderID en base al nombre
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
                          _isPO: false
                      });
                   }
               }
           });
           
           if (items.length === 100) skipAJ += 100;
           else hasMoreAJ = false;
        }

        return NextResponse.json({
            value: allExpenses,
            debug_count: allExpenses.length
        });

    } catch (error: any) {
        console.error('Error al obtener egresos:', error);
        return NextResponse.json({ error: 'Error al obtener egresos de ERP: ' + error.message }, { status: 500 });
    }
}
