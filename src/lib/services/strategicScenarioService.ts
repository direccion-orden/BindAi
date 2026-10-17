import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { StrategicScenario, SimulationResult } from "@/types/strategicSimulation";
import { fetchStrategicERPData, buildDefaultScenario, StrategicBaselineData } from "@/lib/financial/strategicDataAdapter";

export interface ScenarioDiff {
  variablePath: string;
  variableName: string;
  previousValue: any;
  newValue: any;
  origin: string;
}

const LOCAL_STORAGE_PREFIX = "eodc_strategic_scenarios_";

function getLocalScenarios(companyId: string): StrategicScenario[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${companyId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalScenario(companyId: string, scenario: StrategicScenario): void {
  if (typeof window === "undefined") return;
  try {
    const list = getLocalScenarios(companyId).filter(s => s.id !== scenario.id);
    list.unshift(scenario);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${companyId}`, JSON.stringify(list));
  } catch (e) {
    console.warn("Error guardando en localStorage:", e);
  }
}

function removeLocalScenario(companyId: string, scenarioId: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getLocalScenarios(companyId).filter(s => s.id !== scenarioId);
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${companyId}`, JSON.stringify(list));
  } catch (e) {
    console.warn("Error eliminando de localStorage:", e);
  }
}

export async function listScenarios(companyId: string): Promise<StrategicScenario[]> {
  if (!companyId) return [];

  // 1. Intentar Firestore Client
  try {
    const q = query(
      collection(db, "companies", companyId, "strategic_scenarios"),
      orderBy("updatedAt", "desc")
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as StrategicScenario));
    }
  } catch (err: any) {
    console.warn("Firestore client listScenarios no disponible (permisos o reglas en despliegue):", err?.message || err);
  }

  // 2. Intentar API Server con Firebase Admin
  try {
    const res = await fetch(`/api/strategic-simulator?companyId=${encodeURIComponent(companyId)}&action=list`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.scenarios) && data.scenarios.length > 0) {
        return data.scenarios as StrategicScenario[];
      }
    }
  } catch (err: any) {
    console.warn("API Server listScenarios error:", err?.message || err);
  }

  // 3. Fallback LocalStorage
  return getLocalScenarios(companyId);
}

export async function getScenarioById(companyId: string, scenarioId: string): Promise<StrategicScenario | null> {
  if (!companyId || !scenarioId) return null;

  // 1. Intentar Firestore Client
  try {
    const ref = doc(db, "companies", companyId, "strategic_scenarios", scenarioId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as StrategicScenario;
    }
  } catch (err: any) {
    console.warn("Firestore client getScenarioById no disponible:", err?.message || err);
  }

  // 2. Intentar API Server
  try {
    const res = await fetch(`/api/strategic-simulator?companyId=${encodeURIComponent(companyId)}&scenarioId=${encodeURIComponent(scenarioId)}&action=get`);
    if (res.ok) {
      const data = await res.json();
      if (data.scenario) return data.scenario as StrategicScenario;
    }
  } catch (err) {
    // fallback
  }

  // 3. Fallback LocalStorage
  const localList = getLocalScenarios(companyId);
  return localList.find(s => s.id === scenarioId) || null;
}

export async function saveScenario(companyId: string, scenario: StrategicScenario): Promise<void> {
  if (!companyId || !scenario.id) {
    throw new Error("companyId y scenario.id son requeridos");
  }

  const dataToSave = {
    ...scenario,
    companyId,
    updatedAt: new Date().toISOString()
  };

  // Siempre asegurar persistencia local inmediata
  saveLocalScenario(companyId, dataToSave);

  // 1. Intentar guardar en Firestore Client
  let savedClient = false;
  try {
    const ref = doc(db, "companies", companyId, "strategic_scenarios", scenario.id);
    await setDoc(ref, dataToSave, { merge: true });
    savedClient = true;
  } catch (err: any) {
    console.warn("Firestore client saveScenario no disponible (permisos/reglas):", err?.message || err);
  }

  // 2. Si falló el cliente, guardar mediante API Server con Admin SDK
  if (!savedClient) {
    try {
      await fetch("/api/strategic-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, scenario: dataToSave })
      });
    } catch (apiErr) {
      console.warn("API Server saveScenario error:", apiErr);
    }
  }
}

export async function deleteScenario(companyId: string, scenarioId: string): Promise<void> {
  if (!companyId || !scenarioId) return;

  removeLocalScenario(companyId, scenarioId);

  try {
    const ref = doc(db, "companies", companyId, "strategic_scenarios", scenarioId);
    await deleteDoc(ref);
  } catch (err) {
    try {
      await fetch(`/api/strategic-simulator?companyId=${encodeURIComponent(companyId)}&scenarioId=${encodeURIComponent(scenarioId)}`, {
        method: "DELETE"
      });
    } catch (apiErr) {
      console.warn("API Server deleteScenario error:", apiErr);
    }
  }
}

export async function duplicateScenario(
  companyId: string, 
  originalScenario: StrategicScenario, 
  newName?: string
): Promise<StrategicScenario> {
  const newId = `escenario-${Date.now()}`;
  const now = new Date().toISOString();

  const duplicated: StrategicScenario = {
    ...JSON.parse(JSON.stringify(originalScenario)),
    id: newId,
    name: newName || `${originalScenario.name} (Copia)`,
    createdAt: now,
    updatedAt: now
  };

  await saveScenario(companyId, duplicated);
  return duplicated;
}

/**
 * Actualiza un escenario existente con los datos reales más recientes del ERP,
 * generando una nueva versión explícita sin sobrescribir silenciosamente.
 */
export async function updateScenarioWithCurrentERPData(
  companyId: string,
  existingScenario: StrategicScenario
): Promise<{ updatedScenario: StrategicScenario; diffs: ScenarioDiff[] }> {
  const latestBaseline = await fetchStrategicERPData(companyId);
  const diffs: ScenarioDiff[] = [];

  const newVersionScenario: StrategicScenario = JSON.parse(JSON.stringify(existingScenario));
  newVersionScenario.id = `escenario-${Date.now()}`;
  newVersionScenario.name = `${existingScenario.name} (Actualizado al ${latestBaseline.cutoffDate})`;
  newVersionScenario.updatedAt = new Date().toISOString();
  newVersionScenario.cutoffDate = latestBaseline.cutoffDate;

  // 1. Comparar Ventas de Referencia
  const prevSales = existingScenario.baseline.referenceMonthlySales.value;
  const newSales = latestBaseline.realSalesAvgMonthly > 0 ? latestBaseline.realSalesAvgMonthly : prevSales;
  if (prevSales !== newSales) {
    diffs.push({
      variablePath: "baseline.referenceMonthlySales",
      variableName: "Ventas Mensuales de Referencia",
      previousValue: prevSales,
      newValue: newSales,
      origin: "REAL_ERP"
    });
    newVersionScenario.baseline.referenceMonthlySales.value = newSales;
    newVersionScenario.baseline.referenceMonthlySales.originalValue = newSales;
    newVersionScenario.baseline.referenceMonthlySales.origin = "REAL_ERP";
    newVersionScenario.baseline.referenceMonthlySales.notes = "Actualizado con el promedio histórico del ERP";
  }

  // 2. Comparar OPEX de Referencia
  const prevOpex = existingScenario.baseline.referenceMonthlyOpex.value;
  const newOpex = latestBaseline.realOpexAvgMonthly > 0 ? latestBaseline.realOpexAvgMonthly : prevOpex;
  if (prevOpex !== newOpex) {
    diffs.push({
      variablePath: "baseline.referenceMonthlyOpex",
      variableName: "Gastos Operativos (OPEX) de Referencia",
      previousValue: prevOpex,
      newValue: newOpex,
      origin: "REAL_ERP"
    });
    newVersionScenario.baseline.referenceMonthlyOpex.value = newOpex;
    newVersionScenario.baseline.referenceMonthlyOpex.originalValue = newOpex;
    newVersionScenario.baseline.referenceMonthlyOpex.origin = "REAL_ERP";
    newVersionScenario.baseline.referenceMonthlyOpex.notes = "Actualizado con el promedio de gastos del ERP";
  }

  // 3. Comparar Saldo en Bancos
  const prevCash = existingScenario.budget.existingBankCashUsed.value;
  const newCash = latestBaseline.realCashInBanks;
  if (prevCash !== newCash) {
    diffs.push({
      variablePath: "budget.existingBankCashUsed",
      variableName: "Efectivo Disponible en Bancos",
      previousValue: prevCash,
      newValue: newCash,
      origin: "REAL_ERP"
    });
    newVersionScenario.budget.existingBankCashUsed.value = newCash;
    newVersionScenario.budget.existingBankCashUsed.originalValue = newCash;
    newVersionScenario.budget.existingBankCashUsed.origin = "REAL_ERP";
  }

  // Guardar snapshot actualizado
  newVersionScenario.realDataSnapshot = {
    avgMonthlyRevenue: latestBaseline.realSalesAvgMonthly,
    avgMonthlyCostOfSales: latestBaseline.realCostOfSalesAvgMonthly,
    avgMonthlyOpex: latestBaseline.realOpexAvgMonthly,
    grossMarginPct: latestBaseline.realGrossMarginPct,
    cashInBanks: latestBaseline.realCashInBanks,
    locationsDetected: latestBaseline.detectedLocations,
    snapshotDate: latestBaseline.cutoffDate
  };

  await saveScenario(companyId, newVersionScenario);
  return { updatedScenario: newVersionScenario, diffs };
}

export function exportScenarioToJson(scenario: StrategicScenario, result?: SimulationResult): void {
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    scenario,
    simulationSummary: result?.summary5Years || null,
    monthlyProjections: result?.months || null
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${scenario.name.replace(/\s+/g, "_")}_Simulacion.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSimulationToCsv(result: SimulationResult): void {
  const headers = [
    "Mes",
    "Año",
    "Mes Calendario",
    "Ventas Tienda Actual",
    "Ventas Nuevas Tiendas",
    "Ventas Ecommerce",
    "Ventas Retail",
    "Ventas Netas Totales",
    "Costo de Ventas (COGS)",
    "Utilidad Bruta",
    "Margen Bruto %",
    "OPEX Total",
    "EBITDA",
    "Margen EBITDA %",
    "Costo Sustitucion Fundadores",
    "EBITDA Ajustado (M&A)",
    "Flujo Operativo",
    "CAPEX",
    "Flujo Neto",
    "Caja Final",
    "Alerta Reserva Vulnerada",
    "Déficit de Caja"
  ];

  const rows = result.months.map(m => [
    m.monthIndex,
    m.calendarYear,
    m.monthLabel,
    m.revenue.currentStore,
    m.revenue.newStores,
    m.revenue.ecommerce,
    m.revenue.retailChains,
    m.revenue.totalNetRevenue,
    m.cogs.totalCogs,
    m.grossProfit,
    `${m.grossMarginPct}%`,
    m.opex.totalOpex,
    m.ebitda,
    `${m.ebitdaMarginPct}%`,
    m.founderReplacementShadowCost,
    m.adjustedEbitda,
    m.cashFlow.operatingCashFlow,
    m.cashFlow.capexSpending,
    m.cashFlow.netCashFlow,
    m.cashFlow.endingCash,
    m.cashFlow.isReserveBreached ? "SI" : "NO",
    m.cashFlow.cashDeficitAmount
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${result.scenarioName.replace(/\s+/g, "_")}_60_Meses.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
