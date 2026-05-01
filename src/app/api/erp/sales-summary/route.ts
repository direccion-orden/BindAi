import { NextResponse } from 'next/server';

const API_BASE = "https://api.bind.com.mx/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startIso = searchParams.get('startIso'); // e.g. 2024-04-16T10:00:00.000Z
  const locationId = searchParams.get('locationId'); // The Sucursal ID to filter by

  try {
    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ totalSales: 0, mock: true });
    }

    if (!startIso) {
      return NextResponse.json({ error: "startIso es requerido" }, { status: 400 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    const yearNum = parseInt(startIso.substring(0, 4));
    const monthNum = parseInt(startIso.substring(5, 7));
    const dayNum = parseInt(startIso.substring(8, 10));

    let filterQuery = `year(Date) eq ${yearNum} and month(Date) eq ${monthNum} and day(Date) eq ${dayNum}`;
    if (locationId) {
       filterQuery += ` and LocationID eq guid'${locationId}'`;
    }
    let totalSales = 0;
    let invoiceCount = 0;
    let skip = 0;
    let keepFetching = true;

    while (keepFetching) {
      const url = `${API_BASE}/Invoices?$filter=${filterQuery}&$top=100&$skip=${skip}`;
      const res = await fetch(url, { headers, cache: 'no-store' });
      
      if (!res.ok) {
        throw new Error(`Failed to fetch from Bind: ${res.status}`);
      }

      const data = await res.json();
      
      if (!data.value || data.value.length === 0) {
        break;
      }

      data.value.forEach((invoice: any) => {
        if (invoice.Total && invoice.Total > 0 && invoice.Status === 1) { // Only count active/timbrada invoices
          totalSales += invoice.Total;
        }
      });

      invoiceCount += data.value.length;
      skip += 100;

      if (data.value.length < 100) {
        keepFetching = false;
      }
    }

    return NextResponse.json({
      success: true,
      totalSales,
      invoiceCount
    });

  } catch (error: any) {
    console.error("Sales Summary API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
