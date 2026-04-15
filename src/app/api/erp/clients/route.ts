import { NextResponse } from "next/server";
import { searchErpClients } from "@/app/actions/erp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  
  if (!q) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const clients = await searchErpClients(q);
  return NextResponse.json(clients);
}
