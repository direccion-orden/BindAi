import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = "https://api.bind.com.mx/api";

// Helper: fetch with retry on 429 rate limits
async function bindFetchWithRetry(url: string, headers: Record<string, string>, maxRetries = 4): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.status === 429 && attempt < maxRetries) {
      const waitMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s, 16s
      console.log(`Bind API rate limited (price). Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
  throw new Error('Bind API rate limit exceeded after all retries');
}

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

    const res = await bindFetchWithRetry(`${API_BASE}/Products/${bindId}`, headers);
    
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
