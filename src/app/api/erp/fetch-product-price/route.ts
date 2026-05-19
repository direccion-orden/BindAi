import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = "https://api.bind.com.mx/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bindId = searchParams.get('bindId');
    
    if (!bindId) {
        return NextResponse.json({ error: "bindId is required" }, { status: 400 });
    }

    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    const res = await fetch(`${API_BASE}/Products/${bindId}`, { headers, cache: 'no-store' });
    
    if (!res.ok) {
        throw new Error(`Bind API Error: ${res.statusText}`);
    }

    const data = await res.json();
    
    let price = 0;
    if (data.Prices && data.Prices.Items && data.Prices.Items.length > 0) {
        // Tomar el precio mayor a 0, por defecto el primero
        const validPrice = data.Prices.Items.find((p: any) => p.Price > 0);
        price = validPrice ? validPrice.Price : data.Prices.Items[0].Price;
    }

    return NextResponse.json({ price });

  } catch (error: any) {
    console.error(`Bind ERP Fetch Price Error:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
