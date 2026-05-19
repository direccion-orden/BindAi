import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = "https://api.bind.com.mx/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');
    
    if (!endpoint || (endpoint !== 'Products' && endpoint !== 'Clients' && endpoint !== 'Categories')) {
        return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }

    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    let allData: any[] = [];
    let skip = 0;
    const top = 100;
    let keepFetching = true;

    while (keepFetching) {
        const url = `${API_BASE}/${endpoint}?$top=${top}&$skip=${skip}`;
        const res = await fetch(url, { headers, cache: 'no-store' });
        
        if (!res.ok) {
           throw new Error(`Bind API Error: ${res.statusText}`);
        }

        const json = await res.json();
        
        // Some Bind endpoints return { value: [...] }, others return [...]
        const items = Array.isArray(json) ? json : (json.value || []);

        if (items.length === 0) break;

        allData = allData.concat(items);
        skip += top;

        if (items.length < top) {
            keepFetching = false;
        }
    }

    return NextResponse.json({ data: allData });

  } catch (error: any) {
    console.error("Bind ERP Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
