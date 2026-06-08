import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_BASE = "https://api.bind.com.mx/api";

// Helper: fetch with retry on 429 rate limits
async function bindFetchWithRetry(url: string, headers: Record<string, string>, maxRetries = 4): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.status === 429 && attempt < maxRetries) {
      const waitMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s, 16s
      console.log(`Bind API rate limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
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
    const endpoint = searchParams.get("endpoint");
    const skip = searchParams.get("skip") || "0";
    const top = searchParams.get("top") || "100";
    const filter = searchParams.get("filter"); 

    if (!endpoint) {
        return NextResponse.json({ error: "Endpoint param required" }, { status: 400 });
    }

    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key no configurada" }, { status: 500 });
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    };

    let url = API_BASE + "/" + endpoint + "?$top=" + top + "&$skip=" + skip;
    if (filter) {
        url += "&$filter=" + encodeURIComponent(filter);
    }

    const res = await bindFetchWithRetry(url, headers);
    
    if (!res.ok) {
       throw new Error("Bind API Error [" + res.status + "]: " + res.statusText);
    }

    const json = await res.json();
    
    const data = Array.isArray(json) ? json : (json.value || []);
    const count = json.count; 

    return NextResponse.json({ data, count });

  } catch (error: any) {
    console.error("Bind ERP Sync Error [" + request.url + "]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}