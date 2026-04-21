import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = "https://api.bind.com.mx/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD local format
    
    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    let totalCashSales = 0;
    
    // Obtener la fecha en la zona horaria local (America/Mexico_City)
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
    const localDateStr = formatter.format(new Date()); 
    const targetDateStr = dateParam ? dateParam : localDateStr;

    const [yearStr, monthStr, dayStr] = targetDateStr.split('-');
    const yearNum = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    const dayNum = parseInt(dayStr);

    let skip = 0;
    let keepFetching = true;

    while (keepFetching) {
        // Enorme mejora de velocidad (reducido de ~50 segundos a 0.5s): Filtramos vía OData nativo
        const url = `${API_BASE}/AccountingJournals?$filter=year(ApplicationDate) eq ${yearNum} and month(ApplicationDate) eq ${monthNum} and day(ApplicationDate) eq ${dayNum}&$top=100&$skip=${skip}`;
        const res = await fetch(url, { headers, cache: 'no-store' });
        
        if (!res.ok) {
           break;
        }

        const data = await res.json();
        if (!data.value || data.value.length === 0) {
           break;
        }

        for (const journal of data.value) {
            // Ya no es necesario comprobar el match estricto del substring porque Bind lo hizo con el OData
            if (journal.Type === 'Pago de Venta') {
                if (journal.Items) {
                   journal.Items.forEach((item: any) => {
                      if (item.Charge > 0 && (item.AccountName.toLowerCase().includes('efectivo') || item.AccountName.toLowerCase().includes('caja'))) {
                         totalCashSales += item.Charge;
                      }
                   });
                }
            }
        }
        
        skip += 100;
        
        // Si el API regresó menos de 100 ítems, estamos seguros de que no hay una página adicional que descargar
        if (data.value.length < 100) {
            keepFetching = false;
        }
    }

    return NextResponse.json({ 
        totalCashSales,
        date: targetDateStr,
        source: 'Bind ERP AccountingJournals (Pago de Venta)'
    });

  } catch (error: any) {
    console.error("Cash Sales API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
