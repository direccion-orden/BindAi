import { NextResponse } from "next/server";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function GET() {
  try {
    const companyId = "0cb93750-138e-4b7d-832e-3a37b95c5093";
    const targetNumbers = ["35779", "35819", "35818"];
    const results: any = {};

    for (const num of targetNumbers) {
      const q = query(
        collection(db, "companies", companyId, "remisiones"),
        where("remissionNumber", "==", num)
      );
      const snap = await getDocs(q);
      results[num] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
export const dynamic = 'force-dynamic';
