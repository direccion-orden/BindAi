import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = "https://api.bind.com.mx/api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force');
    
    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    let allProviders = [];
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
        const pageRes = await fetch(`${API_BASE}/Providers?$top=100&$skip=${skip}`, { headers, cache: 'no-store' });
        if (!pageRes.ok) break;
        const pageData = await pageRes.json();
        
        if (pageData.value && pageData.value.length > 0) {
            allProviders.push(...pageData.value);
            skip += 100;
            // Si regresa menos de 100, ya llegamos al final del catálogo
            if (pageData.value.length < 100) {
                hasMore = false;
            }
        } else {
            hasMore = false;
        }
    }

    const providers = allProviders
      .filter((p: any) => p.LegalName || p.ProviderName)
      .map((p: any) => ({
        ID: p.ID,
        LegalName: p.LegalName || p.ProviderName,
        RFC: p.RFC
      }));

    return NextResponse.json({ providers });

  } catch (error: any) {
    console.error("Providers API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
