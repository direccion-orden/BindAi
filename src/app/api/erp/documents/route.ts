import { NextResponse } from "next/server";
import { getClientDocuments } from "@/app/actions/erp";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  
  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  const docs = await getClientDocuments(clientId);
  return NextResponse.json(docs);
}
