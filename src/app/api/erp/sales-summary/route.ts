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

    // Convert JS ISO string to OData Edm.DateTime format if necessary, or just use substring.
    // Bind API date filter expects: Year-Month-DayT00:00:00
    // Example: 2024-04-16T15:30:00
    const odataDateStr = startIso.substring(0, 19); 

    // Obtener Invoices pagados/completados desde openedAt
    // Status 1 = Timbrada / Activa. Asumimos que Punto de Venta general Invoice con Status 1
    let filterQuery = `Date ge datetime'${odataDateStr}'`;
    if (locationId) {
       filterQuery += ` and LocationID eq guid'${locationId}'`;
    }
    const url = `${API_BASE}/Invoices?$filter=${filterQuery}`;
    
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error("Failed to fetch from Bind");
    }

    const data = await res.json();

    let totalSales = 0;
    
    // Sumar el campo Payments de todas las facturas/remisiones generadas desde la apertura
    // Solo tomamos en cuenta aquellas que han sido pagadas (Payments > 0)
    data.value.forEach((invoice: any) => {
      // In Punto de venta, usually the entire invoice is paid instantly
      if (invoice.Payments && invoice.Payments > 0) {
        totalSales += invoice.Payments;
      }
    });

    return NextResponse.json({
      success: true,
      totalSales,
      invoiceCount: data.value.length
    });

  } catch (error: any) {
    console.error("Sales Summary API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
