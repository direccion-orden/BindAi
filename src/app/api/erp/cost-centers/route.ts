import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = "https://api.bind.com.mx/api";

export async function GET() {
  try {
    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    // CostCenters for this account are actually mapped to General Ledger accounts of type Expenses (Type 5 => GLGroup 'Gastos')
    // Bind ERP's OData doesn't expose Type field directly to filters, but GLGroup is directly filterable
    const url = `${API_BASE}/Accounts?$filter=GLGroup eq 'Gastos'&$top=100`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    
    if (!res.ok) {
       if (res.status === 404) {
           return NextResponse.json({ value: [] });
       }
       const text = await res.text();
       throw new Error(`Bind ERP Error: ${text}`);
    }

    const data = await res.json();
    // Return them formatted as CostCenters
    return NextResponse.json({ 
       value: (data.value || []).map((acc: any) => ({
           ID: acc.ID,
           Name: acc.Description // Description holds "Sueldos y salarios", etc.
       })) 
    });

  } catch (error: any) {
    console.error("Cost Centers API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
