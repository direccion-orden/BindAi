import { adminDb } from "@/lib/firebase/admin";

export interface MonthlyFinancialRecord {
  year: number;
  month: number; // 0-11
  monthName: string;
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  grossMarginPct: number;
  opex: number;
  nomina: number;
  renta: number;
  marketing: number;
  servicios: number;
  otrosOpex: number;
  ebitda: number;
  ebitdaMarginPct: number;
  gastosFinancieros: number;
  impuestos: number;
  netProfit: number;
}

export interface FinancialSummary {
  periodDescription: string;
  monthsCount: number;
  currency: string;
  // Totals & Averages
  totalRevenue: number;
  avgMonthlyRevenue: number;
  totalCostOfSales: number;
  totalGrossProfit: number;
  avgMonthlyGrossProfit: number;
  grossMarginPct: number;
  totalOpex: number;
  avgMonthlyOpex: number;
  avgMonthlyNomina: number;
  nominaPctOfOpex: number;
  avgMonthlyRenta: number;
  totalEbitda: number;
  avgMonthlyEbitda: number;
  ebitdaMarginPct: number;
  avgMonthlyNetProfit: number;
  // Safety & Break-even
  monthlyBreakEvenRevenue: number;
  safetyMarginAmount: number;
  safetyMarginPct: number;
  recentMonths: MonthlyFinancialRecord[];
}

export interface CostSimulationResult {
  nominalMonthlyCost: number;
  employerBurdenPct: number;
  realMonthlyCost: number;
  annualRealCost: number;
  grossMarginPctUsed: number;
  incrementalMonthlyBreakEvenSales: number;
  currentMonthlyEbitda: number;
  projectedMonthlyEbitda: number;
  ebitdaImpactAmount: number;
  ebitdaVariationPct: number;
  currentEbitdaMarginPct: number;
  projectedEbitdaMarginPct: number;
  status: "SOLID_VIABILITY" | "VIABLE_WITH_CONDITIONS" | "HIGH_RISK";
  statusTitle: string;
  statusColor: "green" | "yellow" | "red";
  strategicSummary: string;
  breakEvenMessage: string;
  ebitdaImpactMessage: string;
  keyRecommendations: string[];
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function parseDateParts(dateStr: string | undefined): { year: number; month: number } | null {
  if (!dateStr) return null;
  if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parts = dateStr.slice(0, 10).split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    if (!isNaN(year) && !isNaN(month)) {
      return { year, month };
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() };
}

function normalize(val: any): string {
  if (val === null || val === undefined) return "";
  let s = "";
  if (typeof val === "string") {
    s = val;
  } else if (typeof val === "number" || typeof val === "boolean") {
    s = String(val);
  } else if (typeof val === "object") {
    s = val.name || val.label || val.value || val.concept || "";
  }
  if (!s || typeof s !== "string") return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isCostoOperativo(name: string, typeOrClass?: string): boolean {
  if (typeOrClass) {
    const lower = typeOrClass.toLowerCase();
    if (lower === "costo") return true;
    if (lower === "gasto") return false;
    if (["financiero", "impuestos", "dividendos", "balance"].includes(lower)) return false;
  }

  const lower = normalize(name);
  if (lower.includes("sin centro")) return false;

  const costoKeywords = [
    "materia prima",
    "maquila",
    "compra de inventario",
    "inventario",
    "insumos de proyectos",
    "insumos",
    "fletes",
    "empaque ecommerce",
    "empaque producto",
    "empaque tienda",
    "empaque",
    "costo directo",
    "costo de venta",
    "costo operativo",
    "produccion",
    "fabricacion"
  ];
  return costoKeywords.some((kw) => lower.includes(kw));
}

function isBalanceSheetPassThrough(doc: any, ccName?: string, item?: any, costCenterMap: Record<string, any> = {}): boolean {
  const ccId = (item && item.costCenterId) || doc.costCenterId;
  const ccObj = ccId && costCenterMap[ccId];
  if (ccObj) {
    const classif = (ccObj.classification || ccObj.type || "").toLowerCase();
    if (classif === "balance") return true;
  }

  const concept = normalize(doc.concept || (item && item.concept) || "");
  const vendor = normalize(doc.vendorName || doc.providerName || "");
  const cc = normalize(ccName || (ccObj && ccObj.name) || doc.costCenterName || "");
  const acc = normalize(doc.accountName || "");
  const combined = `${concept} ${vendor} ${cc} ${acc}`;

  if (
    combined.includes("pago de servicio de tarjeta") ||
    combined.includes("pago de tarjeta de credito") ||
    combined.includes("pago tarjeta de credito") ||
    combined.includes("pago de tarjeta") ||
    combined.includes("pago tc") ||
    combined.includes("pago tarjeta b") ||
    (concept.includes("tarjeta de credito") && concept.includes("pago"))
  ) {
    return true;
  }

  if (
    cc.includes("pago deuda") ||
    combined.includes("pago deuda") ||
    combined.includes("pago de deuda") ||
    combined.includes("amortizacion") ||
    combined.includes("pago de prestamo") ||
    combined.includes("cobro automatico de recibo/prestamo") ||
    combined.includes("recibo/prestamo") ||
    (concept.includes("prestamo") && concept.includes("pago"))
  ) {
    return true;
  }

  if (
    cc.includes("pago iva trasladado") ||
    combined.includes("pago iva trasladado") ||
    combined.includes("pago de iva trasladado") ||
    combined.includes("iva trasladado")
  ) {
    return true;
  }

  if (combined.includes("traspaso") || combined.includes("transferencia entre cuentas")) {
    return true;
  }

  return false;
}

function classifyPostEbitda(
  doc: any,
  ccName?: string,
  item?: any,
  costCenterMap: Record<string, any> = {}
): "gastos_financieros" | "impuestos" | "dividendos" | null {
  const ccId = (item && item.costCenterId) || doc.costCenterId;
  const ccObj = ccId && costCenterMap[ccId];
  if (ccObj) {
    const classif = (ccObj.classification || ccObj.type || "").toLowerCase();
    if (classif === "financiero" || classif === "gastos_financieros") return "gastos_financieros";
    if (classif === "impuestos") return "impuestos";
    if (classif === "dividendos") return "dividendos";
    if (["costo", "gasto", "balance"].includes(classif)) return null;
  }

  const concept = normalize(doc.concept || (item && item.concept) || "");
  const vendor = normalize(doc.vendorName || doc.providerName || "");
  const cc = normalize(ccName || (ccObj && ccObj.name) || doc.costCenterName || "");
  const acc = normalize(doc.accountName || "");

  if (
    cc.includes("intereses") ||
    cc.includes("otras comisiones banco") ||
    acc.includes("gastos financieros") ||
    acc.includes("intereses") ||
    concept.includes("intereses") ||
    concept.includes("interes ") ||
    concept.includes("comision por apertura") ||
    concept.includes("interes moratorio")
  ) {
    return "gastos_financieros";
  }

  if (
    cc.includes("pago de impuestos") ||
    acc.includes("impuestos y derechos") ||
    acc.includes("impuesto sobre la renta") ||
    concept.includes("pago de impuestos") ||
    concept.includes("pago impuestos sat") ||
    concept.includes("impuestos sat") ||
    concept.includes("sat - guia") ||
    concept.includes("impuesto sobre la renta") ||
    concept.includes("isr ") ||
    (vendor.includes("sat") && (concept.includes("impuesto") || concept.includes("declaracion")))
  ) {
    return "impuestos";
  }

  if (
    cc.includes("gastos personales") ||
    concept.includes("gastos personales") ||
    concept.includes("dividendo") ||
    concept.includes("retiro de socio") ||
    concept.includes("retiro socio") ||
    concept.includes("utilidad distribuida")
  ) {
    return "dividendos";
  }

  return null;
}

function resolveCostCenterName(doc: any, costCenterMap: Record<string, any>, costCentersByName: Record<string, any>): string {
  if (doc.costCenterId && costCenterMap[doc.costCenterId]) {
    return costCenterMap[doc.costCenterId].name;
  }
  if (doc.costCenterName) {
    const norm = normalize(doc.costCenterName);
    if (costCentersByName[norm]) return costCentersByName[norm].name;
  }
  const accName = normalize(doc.accountName || "");
  if (accName) {
    for (const [normCC, cc] of Object.entries(costCentersByName)) {
      if (accName.includes(normCC) || normCC.includes(accName)) return cc.name;
    }
    if (accName.includes("sueldo") || accName.includes("salario") || accName.includes("asimilad")) return "Nómina";
    if (accName.includes("combustible") || accName.includes("gasolina")) return "Gasolina";
    if (accName.includes("arrendamiento") || accName.includes("renta")) return "Renta";
    if (accName.includes("publicidad") || accName.includes("marketing")) return "Publicidad";
  }
  return "Sin Centro Asignado";
}

/**
 * Consulta y consolida el Estado de Resultados de la empresa desde Firestore
 * con cálculo determinista y consistente con el módulo de reportes.
 */
export async function getCompanyFinancialSummary(
  companyId: string,
  options?: { monthsBack?: number; year?: number }
): Promise<FinancialSummary> {
  if (!adminDb) {
    throw new Error("Base de datos admin no disponible");
  }

  const monthsBack = options?.monthsBack ?? 6;
  const now = new Date();
  const currentYear = options?.year ?? now.getFullYear();
  const currentMonth = now.getMonth();

  // Calcular la ventana de meses a considerar (ej. últimos N meses)
  const targetMonths: { year: number; month: number; key: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const targetDate = new Date(currentYear, currentMonth - i, 1);
    const yr = targetDate.getFullYear();
    const mo = targetDate.getMonth();
    targetMonths.push({
      year: yr,
      month: mo,
      key: `${yr}-${String(mo + 1).padStart(2, "0")}`
    });
  }

  const [remSnap, factSnap, expSnap, expInboxSnap, ccSnap] = await Promise.all([
    adminDb.collection("companies").doc(companyId).collection("remisiones").get(),
    adminDb.collection("companies").doc(companyId).collection("facturas").get(),
    adminDb.collection("companies").doc(companyId).collection("expenses").get(),
    adminDb.collection("companies").doc(companyId).collection("expenses_inbox").get(),
    adminDb.collection("companies").doc(companyId).collection("cost_centers").get()
  ]);

  const costCenterMap: Record<string, any> = {};
  const costCentersByName: Record<string, any> = {};
  ccSnap.forEach((doc) => {
    const d = doc.data();
    costCenterMap[doc.id] = { id: doc.id, ...d };
    if (d.name) costCentersByName[normalize(d.name)] = { id: doc.id, ...d };
  });

  // Estructura mensual acumuladora
  const monthDataMap = new Map<string, {
    year: number;
    month: number;
    revenue: number;
    costOfSales: number;
    opex: number;
    nomina: number;
    renta: number;
    marketing: number;
    servicios: number;
    otrosOpex: number;
    gastosFinancieros: number;
    impuestos: number;
  }>();

  targetMonths.forEach((tm) => {
    monthDataMap.set(tm.key, {
      year: tm.year,
      month: tm.month,
      revenue: 0,
      costOfSales: 0,
      opex: 0,
      nomina: 0,
      renta: 0,
      marketing: 0,
      servicios: 0,
      otrosOpex: 0,
      gastosFinancieros: 0,
      impuestos: 0
    });
  });

  const getRecord = (dateStr?: string) => {
    const p = parseDateParts(dateStr);
    if (!p) return null;
    const key = `${p.year}-${String(p.month + 1).padStart(2, "0")}`;
    return monthDataMap.get(key) || null;
  };

  // 1. Ingresos: Remisiones (no canceladas)
  remSnap.forEach((doc) => {
    const data = doc.data();
    if (data.status === "cancelada") return;
    const rec = getRecord(data.date || data.createdAt);
    if (!rec) return;
    const val = Number(
      data.subtotal !== undefined && data.subtotal !== null && data.subtotal > 0
        ? data.subtotal
        : data.totalAmount || data.total || 0
    );
    if (val > 0) rec.revenue += val;
  });

  // 2. Ingresos: Facturas directas (no vinculadas a remisiones ni POS para no duplicar)
  factSnap.forEach((doc) => {
    const data = doc.data();
    if (data.status === "cancelada" || data.posSaleId || data.remisionId || data.remissionId) return;
    const rec = getRecord(data.date || data.createdAt);
    if (!rec) return;
    const val = Number(
      data.subtotal !== undefined && data.subtotal !== null && data.subtotal > 0
        ? data.subtotal
        : data.totalAmount || data.total || 0
    );
    if (val > 0) rec.revenue += val;
  });

  // 3. Egresos: Deduplicación entre expenses y expenses_inbox
  const expSatIds = new Set<string>();
  const expDatesAndAmounts = new Set<string>();

  const processExpense = (data: any, isInbox = false) => {
    if (data.status === "cancelado") return;
    const rec = getRecord(data.date || data.createdAt);
    if (!rec) return;

    const val = Number(
      data.subtotal !== undefined && data.subtotal !== null && data.subtotal > 0
        ? data.subtotal
        : data.amount || data.totalAmount || data.total || 0
    );
    if (val <= 0) return;

    if (!isInbox) {
      if (data.satInvoiceId) expSatIds.add(String(data.satInvoiceId).toLowerCase());
      const date = (data.date || data.createdAt || "").slice(0, 10);
      const amt = Math.round(val * 100);
      if (amt > 0) expDatesAndAmounts.add(`${date}_${amt}`);
    } else {
      if (data.uuid && expSatIds.has(String(data.uuid).toLowerCase())) return;
      const date = (data.date || data.createdAt || "").slice(0, 10);
      const amt = Math.round(val * 100);
      if (amt > 0 && expDatesAndAmounts.has(`${date}_${amt}`)) return;
    }

    const ccName = resolveCostCenterName(data, costCenterMap, costCentersByName);

    // Descartar movimientos de balance (pago tarjeta crédito, traspasos, deuda)
    if (isBalanceSheetPassThrough(data, ccName, undefined, costCenterMap)) return;

    // Clasificar partidas post-EBITDA
    const postClass = classifyPostEbitda(data, ccName, undefined, costCenterMap);
    if (postClass === "gastos_financieros") {
      rec.gastosFinancieros += val;
      return;
    }
    if (postClass === "impuestos") {
      rec.impuestos += val;
      return;
    }
    if (postClass === "dividendos") {
      // Retiros de socios van post-utilidad neta
      return;
    }

    // Costo Operativo (Costo de Ventas) vs Gastos Operativos (OPEX)
    const isCosto = isCostoOperativo(ccName, data.classification || data.type);
    if (isCosto) {
      rec.costOfSales += val;
    } else {
      rec.opex += val;
      const normCC = normalize(ccName);
      const normConcept = normalize(data.concept || "");
      const combined = `${normCC} ${normConcept}`;

      if (
        combined.includes("nomina") ||
        combined.includes("sueldo") ||
        combined.includes("salario") ||
        combined.includes("asimilad") ||
        combined.includes("honorarios") ||
        combined.includes("imss") ||
        combined.includes("aguinaldo")
      ) {
        rec.nomina += val;
      } else if (combined.includes("renta") || combined.includes("arrendamiento")) {
        rec.renta += val;
      } else if (combined.includes("marketing") || combined.includes("publicidad") || combined.includes("meta") || combined.includes("google")) {
        rec.marketing += val;
      } else if (combined.includes("luz") || combined.includes("cfe") || combined.includes("agua") || combined.includes("internet") || combined.includes("telefono")) {
        rec.servicios += val;
      } else {
        rec.otrosOpex += val;
      }
    }
  };

  expSnap.forEach((doc) => processExpense(doc.data(), false));
  expInboxSnap.forEach((doc) => processExpense(doc.data(), true));

  // Consolidar registros mensuales
  const recentMonths: MonthlyFinancialRecord[] = [];
  let totalRevenue = 0;
  let totalCostOfSales = 0;
  let totalOpex = 0;
  let totalNomina = 0;
  let totalRenta = 0;
  let totalFinancieros = 0;
  let totalImpuestos = 0;
  let monthsWithActivity = 0;

  targetMonths.forEach((tm) => {
    const raw = monthDataMap.get(tm.key)!;
    const grossProfit = raw.revenue - raw.costOfSales;
    const grossMarginPct = raw.revenue > 0 ? (grossProfit / raw.revenue) * 100 : 0;
    const ebitda = grossProfit - raw.opex;
    const ebitdaMarginPct = raw.revenue > 0 ? (ebitda / raw.revenue) * 100 : 0;
    const netProfit = ebitda - raw.gastosFinancieros - raw.impuestos;

    recentMonths.push({
      year: raw.year,
      month: raw.month,
      monthName: `${MONTH_NAMES[raw.month]} ${raw.year}`,
      revenue: Math.round(raw.revenue),
      costOfSales: Math.round(raw.costOfSales),
      grossProfit: Math.round(grossProfit),
      grossMarginPct: Number(grossMarginPct.toFixed(1)),
      opex: Math.round(raw.opex),
      nomina: Math.round(raw.nomina),
      renta: Math.round(raw.renta),
      marketing: Math.round(raw.marketing),
      servicios: Math.round(raw.servicios),
      otrosOpex: Math.round(raw.otrosOpex),
      ebitda: Math.round(ebitda),
      ebitdaMarginPct: Number(ebitdaMarginPct.toFixed(1)),
      gastosFinancieros: Math.round(raw.gastosFinancieros),
      impuestos: Math.round(raw.impuestos),
      netProfit: Math.round(netProfit)
    });

    if (raw.revenue > 0 || raw.opex > 0) {
      monthsWithActivity++;
      totalRevenue += raw.revenue;
      totalCostOfSales += raw.costOfSales;
      totalOpex += raw.opex;
      totalNomina += raw.nomina;
      totalRenta += raw.renta;
      totalFinancieros += raw.gastosFinancieros;
      totalImpuestos += raw.impuestos;
    }
  });

  const divider = Math.max(monthsWithActivity, 1);
  const avgMonthlyRevenue = totalRevenue / divider;
  const avgMonthlyGrossProfit = (totalRevenue - totalCostOfSales) / divider;
  const grossMarginPct = totalRevenue > 0 ? ((totalRevenue - totalCostOfSales) / totalRevenue) * 100 : 0;
  const avgMonthlyOpex = totalOpex / divider;
  const avgMonthlyNomina = totalNomina / divider;
  const avgMonthlyRenta = totalRenta / divider;
  const totalEbitda = (totalRevenue - totalCostOfSales) - totalOpex;
  const avgMonthlyEbitda = totalEbitda / divider;
  const ebitdaMarginPct = totalRevenue > 0 ? (totalEbitda / totalRevenue) * 100 : 0;
  const totalNetProfit = totalEbitda - totalFinancieros - totalImpuestos;
  const avgMonthlyNetProfit = totalNetProfit / divider;

  // Punto de equilibrio mensual estimado = Gastos Fijos (OPEX) / Margen Bruto %
  const monthlyBreakEvenRevenue = grossMarginPct > 0 ? avgMonthlyOpex / (grossMarginPct / 100) : 0;
  const safetyMarginAmount = avgMonthlyRevenue - monthlyBreakEvenRevenue;
  const safetyMarginPct = avgMonthlyRevenue > 0 ? (safetyMarginAmount / avgMonthlyRevenue) * 100 : 0;

  return {
    periodDescription: `Últimos ${monthsBack} meses (${recentMonths[0]?.monthName || ""} a ${recentMonths[recentMonths.length - 1]?.monthName || ""})`,
    monthsCount: divider,
    currency: "MXN",
    totalRevenue: Math.round(totalRevenue),
    avgMonthlyRevenue: Math.round(avgMonthlyRevenue),
    totalCostOfSales: Math.round(totalCostOfSales),
    totalGrossProfit: Math.round(totalRevenue - totalCostOfSales),
    avgMonthlyGrossProfit: Math.round(avgMonthlyGrossProfit),
    grossMarginPct: Number(grossMarginPct.toFixed(1)),
    totalOpex: Math.round(totalOpex),
    avgMonthlyOpex: Math.round(avgMonthlyOpex),
    avgMonthlyNomina: Math.round(avgMonthlyNomina),
    nominaPctOfOpex: avgMonthlyOpex > 0 ? Number(((avgMonthlyNomina / avgMonthlyOpex) * 100).toFixed(1)) : 0,
    avgMonthlyRenta: Math.round(avgMonthlyRenta),
    totalEbitda: Math.round(totalEbitda),
    avgMonthlyEbitda: Math.round(avgMonthlyEbitda),
    ebitdaMarginPct: Number(ebitdaMarginPct.toFixed(1)),
    avgMonthlyNetProfit: Math.round(avgMonthlyNetProfit),
    monthlyBreakEvenRevenue: Math.round(monthlyBreakEvenRevenue),
    safetyMarginAmount: Math.round(safetyMarginAmount),
    safetyMarginPct: Number(safetyMarginPct.toFixed(1)),
    recentMonths
  };
}

/**
 * Simula el impacto financiero de una contratación o nuevo gasto fijo/variable
 * sobre el Estado de Resultados y el EBITDA de la empresa.
 */
export function simulateHiringImpact(
  summary: FinancialSummary,
  params: {
    monthlySalary: number;
    employerBurdenPct?: number; // Cargas sociales (IMSS, Infonavit, ISN) - defecto 25%
    isSalesRole?: boolean;
    expectedNewMonthlySales?: number;
  }
): CostSimulationResult {
  const nominalMonthlyCost = params.monthlySalary;
  const employerBurdenPct = params.employerBurdenPct ?? 25; // 25% estándar en México para cargas patronales
  const realMonthlyCost = Math.round(nominalMonthlyCost * (1 + employerBurdenPct / 100));
  const annualRealCost = realMonthlyCost * 12;

  const marginFactor = Math.max(summary.grossMarginPct / 100, 0.05); // Evitar división por cero
  // Break-even incremental: ¿cuántas ventas adicionales se requieren al mes solo para pagar este costo?
  const incrementalMonthlyBreakEvenSales = Math.round(realMonthlyCost / marginFactor);

  const currentMonthlyEbitda = summary.avgMonthlyEbitda;
  const incrementalRevenue = params.expectedNewMonthlySales || 0;
  const incrementalGrossProfit = incrementalRevenue * marginFactor;

  const projectedMonthlyEbitda = Math.round(currentMonthlyEbitda - realMonthlyCost + incrementalGrossProfit);
  const ebitdaImpactAmount = projectedMonthlyEbitda - currentMonthlyEbitda;
  const ebitdaVariationPct = currentMonthlyEbitda !== 0
    ? Number(((ebitdaImpactAmount / Math.abs(currentMonthlyEbitda)) * 100).toFixed(1))
    : -100;

  const newRevenue = summary.avgMonthlyRevenue + incrementalRevenue;
  const currentEbitdaMarginPct = summary.ebitdaMarginPct;
  const projectedEbitdaMarginPct = newRevenue > 0
    ? Number(((projectedMonthlyEbitda / newRevenue) * 100).toFixed(1))
    : 0;

  // Clasificación de viabilidad estratégica
  let status: "SOLID_VIABILITY" | "VIABLE_WITH_CONDITIONS" | "HIGH_RISK" = "VIABLE_WITH_CONDITIONS";
  let statusTitle = "Viable con Condiciones y Metas Claras";
  let statusColor: "green" | "yellow" | "red" = "yellow";

  if (projectedMonthlyEbitda <= 0 || summary.safetyMarginPct < 5) {
    status = "HIGH_RISK";
    statusTitle = "Alto Riesgo Financiero (No Recomendado en este momento)";
    statusColor = "red";
  } else if (
    currentMonthlyEbitda > realMonthlyCost * 3 &&
    summary.safetyMarginPct > 20 &&
    projectedEbitdaMarginPct >= 10
  ) {
    status = "SOLID_VIABILITY";
    statusTitle = "Financieramente Viable y Sólido";
    statusColor = "green";
  }

  const strategicSummary = `Costo nominal de $${nominalMonthlyCost.toLocaleString("es-MX")}/mes representa un costo real para la empresa de aproximadamente $${realMonthlyCost.toLocaleString("es-MX")}/mes considerando 25% de prestaciones y cargas sociales.`;

  const breakEvenMessage = `Con tu margen bruto actual del ${summary.grossMarginPct}%, necesitas generar al menos $${incrementalMonthlyBreakEvenSales.toLocaleString("es-MX")} MXN en ventas adicionales mensuales solo para amortizar el costo de este colaborador sin sacrificar utilidad operativa.`;

  const ebitdaImpactMessage = `Tu EBITDA promedio mensual pasaría de $${currentMonthlyEbitda.toLocaleString("es-MX")} a $${projectedMonthlyEbitda.toLocaleString("es-MX")} (${ebitdaVariationPct > 0 ? "+" : ""}${ebitdaVariationPct}%). Margen EBITDA proyectado: ${projectedEbitdaMarginPct}%.`;

  const keyRecommendations: string[] = [];

  if (status === "HIGH_RISK") {
    keyRecommendations.push("El EBITDA actual no tiene suficiente colchón para absorber este gasto fijo recurrente.");
    keyRecommendations.push("Alternativa: Considerar esquema por honorarios variables o comisiones ligadas 100% a resultados.");
    keyRecommendations.push(`Para que sea viable, las ventas mensuales deben superar de forma sostenida los $${(summary.monthlyBreakEvenRevenue + incrementalMonthlyBreakEvenSales).toLocaleString("es-MX")} MXN.`);
  } else if (status === "VIABLE_WITH_CONDITIONS") {
    keyRecommendations.push(`Definir una meta mensual de ventas o ahorro operativo de al menos $${incrementalMonthlyBreakEvenSales.toLocaleString("es-MX")} MXN.`);
    keyRecommendations.push("Establecer un periodo de prueba de 90 días con KPIs estrictos de rendimiento.");
    keyRecommendations.push("Asegurar que la nómina total no sobrepase el 30%-35% del total de gastos operativos (actualmente representa el " + summary.nominaPctOfOpex + "%).");
  } else {
    keyRecommendations.push("La empresa cuenta con flujo y margen operativo saludable para incorporar esta posición.");
    keyRecommendations.push("Enfocar la contratación en acelerar la capacidad productiva o la prospección comercial.");
    keyRecommendations.push("Monitorear el punto de equilibrio mensual que se ubicará en $" + Math.round(summary.monthlyBreakEvenRevenue + incrementalMonthlyBreakEvenSales).toLocaleString("es-MX") + " MXN.");
  }

  return {
    nominalMonthlyCost,
    employerBurdenPct,
    realMonthlyCost,
    annualRealCost,
    grossMarginPctUsed: summary.grossMarginPct,
    incrementalMonthlyBreakEvenSales,
    currentMonthlyEbitda,
    projectedMonthlyEbitda,
    ebitdaImpactAmount,
    ebitdaVariationPct,
    currentEbitdaMarginPct,
    projectedEbitdaMarginPct,
    status,
    statusTitle,
    statusColor,
    strategicSummary,
    breakEvenMessage,
    ebitdaImpactMessage,
    keyRecommendations
  };
}
