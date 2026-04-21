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

    // BankAccounts usually don't exceed 100
    const url = `${API_BASE}/BankAccounts?$top=100`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    
    if (!res.ok) {
       const text = await res.text();
       throw new Error(`Bind ERP Error: ${text}`);
    }

    const data = await res.json();
    return NextResponse.json({ value: data.value || [] });

  } catch (error: any) {
    console.error("Bank Accounts API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
