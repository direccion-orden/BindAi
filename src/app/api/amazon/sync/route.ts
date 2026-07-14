import { NextResponse } from "next/server";
import { syncOrdersFromAmazon } from "@/actions/amazon";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "Missing companyId query parameter" },
        { status: 400 }
      );
    }

    const daysBack = parseInt(searchParams.get("daysBack") || "7");
    const result = await syncOrdersFromAmazon(companyId, daysBack);

    if (result.success) {
      return NextResponse.json({ success: true, count: result.count });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Error in Amazon sync route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
