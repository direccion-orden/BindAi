import { adminDb } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import TicketPrintView from "./TicketPrintView";

interface PageProps {
  params: Promise<{
    companyId: string;
    id: string;
  }>;
}

export default async function PublicTicketPage({ params }: PageProps) {
  const { companyId, id } = await params;

  if (!adminDb) {
    return notFound();
  }

  try {
    // 1. Fetch remission data
    const remissionSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("remisiones")
      .doc(id)
      .get();

    if (!remissionSnap.exists) {
      return notFound();
    }

    const remissionData = { id: remissionSnap.id, ...remissionSnap.data() };

    // 2. Fetch company profile details
    const companySnap = await adminDb.collection("companies").doc(companyId).get();
    const companyProfile = companySnap.exists
      ? companySnap.data()
      : { name: "El Orden de las Cosas" };

    // 3. Fetch custom ticket config settings
    const configSnap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("ticketConfig")
      .doc("settings")
      .get();
    
    const ticketConfig = configSnap.exists ? configSnap.data() : null;

    return (
      <TicketPrintView
        remission={remissionData}
        companyProfile={companyProfile}
        ticketConfig={ticketConfig}
        companyId={companyId}
      />
    );
  } catch (error) {
    console.error("Error loading public ticket page:", error);
    return notFound();
  }
}
