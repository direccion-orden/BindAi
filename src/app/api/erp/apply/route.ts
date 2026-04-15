import { NextResponse } from "next/server";
import { applyPaymentToErp } from "@/app/actions/erp";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { documentId, docType, amount, bankAccountId, paymentTerm, reference } = body;

    const result = await applyPaymentToErp(
      documentId,
      docType,
      amount,
      bankAccountId,
      paymentTerm,
      reference
    );

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
