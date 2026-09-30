import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getNextSequenceDetails } from "@/lib/firebase/counters";

export interface ResolvedVendor {
  id: string;
  name: string;
  rfc?: string;
  number?: string;
  isNew?: boolean;
}

/**
 * Searches the official vendor catalog (`companies/{companyId}/vendors`) by RFC or Name.
 * If found, returns the existing vendor.
 * If not found and `createIfMissing` is true, registers a new official vendor with an automatic sequence number (PROV-XXXXX).
 */
export async function findOrCreateOfficialVendor(
  companyId: string,
  params: {
    rfc?: string;
    name: string;
    createIfMissing?: boolean;
    street?: string;
    zipCode?: string;
    city?: string;
    state?: string;
  }
): Promise<ResolvedVendor | null> {
  if (!companyId) return null;

  const rawName = (params.name || "").trim();
  const rawRfc = (params.rfc || "").trim().toUpperCase();

  const vendorsRef = collection(db, "companies", companyId, "vendors");

  // 1. Try search by RFC if provided and valid
  if (rawRfc && rawRfc !== "XAXX010101000" && rawRfc !== "XEXX010101000" && rawRfc !== "DESCONOCIDO") {
    const qRfc = query(vendorsRef, where("rfc", "==", rawRfc));
    const snapRfc = await getDocs(qRfc);
    if (!snapRfc.empty) {
      const vDoc = snapRfc.docs[0];
      const data = vDoc.data();
      return {
        id: vDoc.id,
        name: data.name || data.LegalName || data.CommercialName || rawName,
        rfc: data.rfc || rawRfc,
        number: data.number || undefined,
        isNew: false
      };
    }
  }

  // 2. Try search by exact Name / LegalName if RFC didn't match or wasn't provided
  if (rawName) {
    const qName = query(vendorsRef, where("name", "==", rawName));
    const snapName = await getDocs(qName);
    if (!snapName.empty) {
      const vDoc = snapName.docs[0];
      const data = vDoc.data();
      return {
        id: vDoc.id,
        name: data.name || rawName,
        rfc: data.rfc || rawRfc || undefined,
        number: data.number || undefined,
        isNew: false
      };
    }
  }

  // If not creating, return null
  if (!params.createIfMissing) {
    return null;
  }

  // 3. Create new vendor with official sequence
  const vendorId = crypto.randomUUID();
  let number = "";
  let vendorNumber = 0;

  try {
    const seq = await getNextSequenceDetails(companyId, "vendors");
    number = seq.formatted;
    vendorNumber = seq.number;
  } catch (seqErr) {
    console.warn("Could not generate sequence number for vendor:", seqErr);
  }

  const now = new Date().toISOString();
  const newVendorData: any = {
    name: rawName || (rawRfc ? `Proveedor ${rawRfc}` : "Proveedor General"),
    rfc: rawRfc || "",
    number: number || undefined,
    vendorNumber: vendorNumber || undefined,
    createdAt: now,
    updatedAt: now
  };

  if (params.zipCode) newVendorData.zipCode = params.zipCode;
  if (params.street) newVendorData.street = params.street;
  if (params.city) newVendorData.city = params.city;
  if (params.state) newVendorData.state = params.state;

  await setDoc(doc(db, "companies", companyId, "vendors", vendorId), newVendorData);

  return {
    id: vendorId,
    name: newVendorData.name,
    rfc: newVendorData.rfc,
    number: newVendorData.number,
    isNew: true
  };
}
