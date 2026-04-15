import { NextResponse } from "next/server";
import { getClientAccountStatement } from "@/app/actions/erp";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, clientName, anticipos } = body;

    if (!clientId) {
      return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
    }

    const statement = await getClientAccountStatement(
      clientId,
      clientName || "Cliente",
      anticipos || []
    );

    return NextResponse.json(statement);
  } catch (error: any) {
    console.error("Error generating account statement:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno al generar estado de cuenta" },
      { status: 500 }
    );
  }
}
