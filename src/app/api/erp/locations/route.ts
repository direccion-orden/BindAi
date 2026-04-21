import { NextResponse } from 'next/server';

const API_BASE = "https://api.bind.com.mx/api";

export async function GET() {
  try {
    const apiKey = process.env.BIND_ERP_API_KEY;
    if (!apiKey) {
      return NextResponse.json([{ id: "mock-loc-1", name: "Sucursal MOCK" }]);
    }

    const res = await fetch(`${API_BASE}/Locations`, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      }
    });

    if (!res.ok) {
      throw new Error(`Bind ERP Locations fail: ${res.status}`);
    }

    const data = await res.json();
    const locations = (data.value || []).map((l: any) => ({
      id: l.ID,
      name: l.Name
    }));

    return NextResponse.json(locations);
  } catch (error: any) {
    console.error("Error fetching locations:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
