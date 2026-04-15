import { NextResponse } from "next/server";
import { getBankAccounts } from "@/app/actions/erp";

export async function GET() {
  const banks = await getBankAccounts();
  return NextResponse.json(banks);
}
