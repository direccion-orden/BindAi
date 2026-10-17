import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { StrategicScenario } from "@/types/strategicSimulation";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const scenarioId = searchParams.get("scenarioId");
    const action = searchParams.get("action") || "list";

    if (!companyId) {
      return NextResponse.json({ error: "companyId es requerido" }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "adminDb no disponible en servidor" }, { status: 500 });
    }

    if (action === "get" && scenarioId) {
      const docSnap = await adminDb
        .collection("companies")
        .doc(companyId)
        .collection("strategic_scenarios")
        .doc(scenarioId)
        .get();

      if (!docSnap.exists) {
        return NextResponse.json({ error: "Escenario no encontrado" }, { status: 404 });
      }

      return NextResponse.json({ scenario: { id: docSnap.id, ...docSnap.data() } });
    }

    // Listar escenarios
    const snap = await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("strategic_scenarios")
      .orderBy("updatedAt", "desc")
      .get();

    const scenarios = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ scenarios });
  } catch (error: any) {
    console.error("Error en GET /api/strategic-simulator:", error);
    return NextResponse.json({ error: error.message || "Error interno" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyId, scenario } = body;

    if (!companyId || !scenario || !scenario.id) {
      return NextResponse.json({ error: "companyId y scenario.id son requeridos" }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "adminDb no disponible en servidor" }, { status: 500 });
    }

    const docRef = adminDb
      .collection("companies")
      .doc(companyId)
      .collection("strategic_scenarios")
      .doc(scenario.id);

    const payload = {
      ...scenario,
      companyId,
      updatedAt: new Date().toISOString()
    };

    await docRef.set(payload, { merge: true });

    return NextResponse.json({ success: true, scenario: payload });
  } catch (error: any) {
    console.error("Error en POST /api/strategic-simulator:", error);
    return NextResponse.json({ error: error.message || "Error interno al guardar escenario" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");
    const scenarioId = searchParams.get("scenarioId");

    if (!companyId || !scenarioId) {
      return NextResponse.json({ error: "companyId y scenarioId son requeridos" }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "adminDb no disponible en servidor" }, { status: 500 });
    }

    await adminDb
      .collection("companies")
      .doc(companyId)
      .collection("strategic_scenarios")
      .doc(scenarioId)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en DELETE /api/strategic-simulator:", error);
    return NextResponse.json({ error: error.message || "Error interno al eliminar escenario" }, { status: 500 });
  }
}
