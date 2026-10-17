import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { 
  StrategicScenario, 
  TrackedValue, 
  ChinaImportSku, 
  StoreConfig, 
  MachineInvestment, 
  HiredExecutive, 
  RetailChainConfig 
} from "@/types/strategicSimulation";

export interface StrategicBaselineData {
  cutoffDate: string;
  historyWindowMonths: number;
  sampleMonthsCount: number;
  realSalesAvgMonthly: number;
  realCostOfSalesAvgMonthly: number;
  realOpexAvgMonthly: number;
  realGrossMarginPct: number;
  realCashInBanks: number;
  detectedLocations: { id: string; name: string }[];
  detectedFormulasCount: number;
  dataQualityScore: number; // 0 - 100
  dataQualityNotes: string[];
  monthlyHistory: {
    year: number;
    month: number;
    monthKey: string;
    sales: number;
    costOfSales: number;
    opex: number;
    grossProfit: number;
    ebitda: number;
  }[];
}

function createTracked<T>(
  value: T, 
  origin: TrackedValue<T>['origin'], 
  notes?: string, 
  formula?: string, 
  sourcePeriod?: string
): TrackedValue<T> {
  return {
    value,
    originalValue: value,
    origin,
    isOverridden: false,
    notes,
    formula,
    sourcePeriod,
    lastUpdated: new Date().toISOString()
  };
}

export async function fetchStrategicERPData(
  companyId: string, 
  cutoffDateStr: string = new Date().toISOString().slice(0, 10),
  historyMonths: number = 6
): Promise<StrategicBaselineData> {
  if (!companyId) {
    throw new Error("companyId es requerido para consultar datos del ERP");
  }

  // 1. Consultar colecciones operativas del ERP de forma strictly read-only y tolerante a permisos
  const notes: string[] = [];
  let score = 100;

  const safeGetDocs = async (subcol: string) => {
    try {
      return await getDocs(collection(db, "companies", companyId, subcol));
    } catch (err: any) {
      console.warn(`Colección '${subcol}' no accesible o sin permisos:`, err?.message || err);
      notes.push(`Colección '${subcol}' protegida por permisos del perfil; se continúa con las fuentes restantes.`);
      score -= 5;
      return null;
    }
  };

  const [
    remSnap,
    factSnap,
    expSnap,
    expInboxSnap,
    ccSnap,
    bankSnap,
    locSnap,
    formSnap
  ] = await Promise.all([
    safeGetDocs("remisiones"),
    safeGetDocs("facturas"),
    safeGetDocs("expenses"),
    safeGetDocs("expenses_inbox"),
    safeGetDocs("cost_centers"),
    safeGetDocs("bankAccounts"),
    safeGetDocs("locations"),
    safeGetDocs("production_formulas")
  ]);

  // Mapa de centros de costos
  const costCenterMap: Record<string, any> = {};
  if (ccSnap) {
    ccSnap.forEach(d => {
      costCenterMap[d.id] = { id: d.id, ...d.data() };
    });
  }

  // Ventana histórica de meses anteriores a la fecha de corte
  const cutoffDate = new Date(cutoffDateStr);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth();

  const targetMonths: { year: number; month: number; key: string }[] = [];
  for (let i = historyMonths; i >= 1; i--) {
    const d = new Date(cutoffYear, cutoffMonth - i, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth();
    targetMonths.push({
      year: yr,
      month: mo,
      key: `${yr}-${String(mo + 1).padStart(2, "0")}`
    });
  }

  const monthlyAccumulator = new Map<string, {
    year: number;
    month: number;
    sales: number;
    costOfSales: number;
    opex: number;
  }>();

  targetMonths.forEach(tm => {
    monthlyAccumulator.set(tm.key, {
      year: tm.year,
      month: tm.month,
      sales: 0,
      costOfSales: 0,
      opex: 0
    });
  });

  const getRecord = (dateStr?: string) => {
    if (!dateStr) return null;
    const cleanStr = String(dateStr).slice(0, 10);
    const parts = cleanStr.split("-");
    if (parts.length < 2) return null;
    const key = `${parts[0]}-${parts[1]}`;
    return monthlyAccumulator.get(key) || null;
  };

  // Acumular ventas de remisiones no canceladas
  if (remSnap) {
    remSnap.forEach(doc => {
      const data = doc.data();
      if (data.status === "cancelada") return;
      const rec = getRecord(data.date || data.createdAt);
      if (!rec) return;
      const val = Number(data.subtotal || data.totalAmount || data.total || 0);
      if (val > 0) rec.sales += val;
    });
  }

  // Acumular facturas directas no vinculadas a remisiones
  if (factSnap) {
    factSnap.forEach(doc => {
      const data = doc.data();
      if (data.status === "cancelada" || data.posSaleId || data.remisionId || data.remissionId) return;
      const rec = getRecord(data.date || data.createdAt);
      if (!rec) return;
      const val = Number(data.subtotal || data.totalAmount || data.total || 0);
      if (val > 0) rec.sales += val;
    });
  }

  // Deduplicación y acumulación de gastos
  const satIds = new Set<string>();
  if (expSnap) {
    expSnap.forEach(doc => {
      const data = doc.data();
      if (data.satInvoiceId) satIds.add(String(data.satInvoiceId).toLowerCase());
    });
  }

  const processExpense = (data: any, isInbox = false) => {
    if (data.status === "cancelado") return;
    if (isInbox && data.uuid && satIds.has(String(data.uuid).toLowerCase())) return;

    const rec = getRecord(data.date || data.createdAt);
    if (!rec) return;

    const val = Number(data.subtotal || data.amount || data.totalAmount || data.total || 0);
    if (val <= 0) return;

    const cc = (data.costCenterId && costCenterMap[data.costCenterId]) || {};
    const classification = (cc.classification || data.classification || "").toLowerCase();
    const concept = (data.concept || "").toLowerCase();

    // Descartar movimientos de balance (traspasos, pagos a tarjeta de crédito, amortización de deuda)
    if (
      classification === "balance" ||
      concept.includes("traspaso") ||
      concept.includes("pago de tarjeta") ||
      concept.includes("tarjeta de credito") ||
      concept.includes("pago de deuda") ||
      concept.includes("amortizacion")
    ) {
      return;
    }

    if (classification === "costo" || concept.includes("materia prima") || concept.includes("insumos") || concept.includes("produccion")) {
      rec.costOfSales += val;
    } else {
      rec.opex += val;
    }
  };

  if (expSnap) expSnap.forEach(d => processExpense(d.data(), false));
  if (expInboxSnap) expInboxSnap.forEach(d => processExpense(d.data(), true));

  // Transformar acumuladores a lista de meses históricos
  const historyList = targetMonths.map(tm => {
    const r = monthlyAccumulator.get(tm.key)!;
    const gp = r.sales - r.costOfSales;
    const ebitda = gp - r.opex;
    return {
      year: r.year,
      month: r.month,
      monthKey: tm.key,
      sales: Math.round(r.sales),
      costOfSales: Math.round(r.costOfSales),
      opex: Math.round(r.opex),
      grossProfit: Math.round(gp),
      ebitda: Math.round(ebitda)
    };
  });

  // Filtrar meses con actividad para promedios
  const activeMonths = historyList.filter(m => m.sales > 0 || m.opex > 0);
  const sampleCount = activeMonths.length > 0 ? activeMonths.length : 1;

  const totalSales = activeMonths.reduce((acc, m) => acc + m.sales, 0);
  const totalCostOfSales = activeMonths.reduce((acc, m) => acc + m.costOfSales, 0);
  const totalOpex = activeMonths.reduce((acc, m) => acc + m.opex, 0);

  const avgSales = Math.round(totalSales / sampleCount);
  const avgCostOfSales = Math.round(totalCostOfSales / sampleCount);
  const avgOpex = Math.round(totalOpex / sampleCount);
  const avgGrossMarginPct = avgSales > 0 ? Number((((avgSales - avgCostOfSales) / avgSales) * 100).toFixed(1)) : 45.0;

  // Saldo real en cuentas bancarias
  let totalCashInBanks = 0;
  if (bankSnap) {
    bankSnap.forEach(doc => {
      const b = doc.data();
      if (b.status !== "inactive" && b.status !== "inactiva") {
        const bal = Number(b.balance || b.currentBalance || 0);
        if (!isNaN(bal)) totalCashInBanks += bal;
      }
    });
  }

  // Sucursales detectadas
  const detectedLocations: { id: string; name: string }[] = [];
  if (locSnap) {
    locSnap.forEach(doc => {
      const d = doc.data();
      detectedLocations.push({
        id: doc.id,
        name: d.name || d.Name || "Sucursal sin nombre"
      });
    });
  }

  // Diagnóstico adicional de calidad de datos
  if (activeMonths.length < 3) {
    notes.push("Muestra histórica reducida: Menos de 3 meses con registros continuos encontrados en el ERP.");
    score -= 25;
  }
  if (totalSales === 0) {
    notes.push("No se detectaron ventas operativas en el periodo histórico evaluado; se usarán referencias del plan.");
    score -= 20;
  }
  if (totalOpex === 0) {
    notes.push("No se detectaron gastos operativos estructurados en el periodo; se adoptarán referencias de gestión.");
    score -= 15;
  }
  if (detectedLocations.length === 0) {
    notes.push("No se encontraron sucursales registradas en configuración; se asume una tienda inicial por omisión.");
    score -= 10;
  }
  if (!formSnap || formSnap.size === 0) {
    notes.push("Sin fórmulas de producción BOM dadas de alta en el ERP; los costos de fabricación se toman como supuestos editables.");
    score -= 10;
  }

  return {
    cutoffDate: cutoffDateStr,
    historyWindowMonths: historyMonths,
    sampleMonthsCount: activeMonths.length,
    realSalesAvgMonthly: avgSales,
    realCostOfSalesAvgMonthly: avgCostOfSales,
    realOpexAvgMonthly: avgOpex,
    realGrossMarginPct: avgGrossMarginPct,
    realCashInBanks: Math.round(totalCashInBanks),
    detectedLocations,
    detectedFormulasCount: formSnap ? formSnap.size : 0,
    dataQualityScore: Math.max(20, score),
    dataQualityNotes: notes,
    monthlyHistory: historyList
  };
}

export function buildDefaultScenario(
  companyId: string, 
  authorName: string = "Dirección General", 
  authorEmail: string = "direccion@ordendelascosas.com",
  baselineData?: StrategicBaselineData
): StrategicScenario {
  const now = new Date();
  const cutoffStr = baselineData?.cutoffDate || now.toISOString().slice(0, 10);

  const hasRealSales = baselineData && baselineData.realSalesAvgMonthly > 0;
  const hasRealOpex = baselineData && baselineData.realOpexAvgMonthly > 0;
  const hasRealCash = baselineData && baselineData.realCashInBanks > 0;

  // Catálogo ilustrativo pero realista de 6 SKUs de importación de China para EODC
  const initialChinaCatalog: ChinaImportSku[] = [
    {
      id: "sku-china-01",
      sku: "ORG-ACR-BOX3",
      name: "Organizador Acrílico Premium con Divisores",
      category: "Acrílicos",
      fobPriceUSD: 4.80,
      moq: 500,
      unitsPerCarton: 12,
      cartonCbm: 0.052,
      cartonWeightKg: 7.2,
      brandedPackagingCostUSD: 0.40,
      defectRatePct: 2.5,
      retailPriceStore: 349,
      retailPriceEcommerce: 369,
      wholesalePriceRetail: 185,
      safetyStockWeeks: 6,
      initialOrderMonth: 3,
      reorderIntervalMonths: 3
    },
    {
      id: "sku-china-02",
      sku: "DIV-MET-DRAWER",
      name: "Divisor Metálico Expandible para Cajones",
      category: "Metálicos",
      fobPriceUSD: 3.20,
      moq: 800,
      unitsPerCarton: 20,
      cartonCbm: 0.040,
      cartonWeightKg: 9.5,
      brandedPackagingCostUSD: 0.35,
      defectRatePct: 2.0,
      retailPriceStore: 289,
      retailPriceEcommerce: 299,
      wholesalePriceRetail: 145,
      safetyStockWeeks: 6,
      initialOrderMonth: 3,
      reorderIntervalMonths: 4
    },
    {
      id: "sku-china-03",
      sku: "BASK-FOLD-LINEN",
      name: "Canasta Plegable de Lino Estructurada",
      category: "Textiles",
      fobPriceUSD: 2.90,
      moq: 600,
      unitsPerCarton: 30,
      cartonCbm: 0.065,
      cartonWeightKg: 8.0,
      brandedPackagingCostUSD: 0.30,
      defectRatePct: 1.5,
      retailPriceStore: 249,
      retailPriceEcommerce: 259,
      wholesalePriceRetail: 125,
      safetyStockWeeks: 8,
      initialOrderMonth: 4,
      reorderIntervalMonths: 3
    },
    {
      id: "sku-china-04",
      sku: "BOX-MOD-BAMBOO",
      name: "Caja Modular de Bambú Apilable",
      category: "Madera/Bambú",
      fobPriceUSD: 5.50,
      moq: 400,
      unitsPerCarton: 10,
      cartonCbm: 0.048,
      cartonWeightKg: 6.8,
      brandedPackagingCostUSD: 0.45,
      defectRatePct: 3.0,
      retailPriceStore: 429,
      retailPriceEcommerce: 449,
      wholesalePriceRetail: 220,
      safetyStockWeeks: 6,
      initialOrderMonth: 4,
      reorderIntervalMonths: 3
    },
    {
      id: "sku-china-05",
      sku: "HOOK-HERRAJE-HEAVY",
      name: "Kit de Herrajes y Ganchos de Acero Inox",
      category: "Herrajes",
      fobPriceUSD: 1.80,
      moq: 1200,
      unitsPerCarton: 50,
      cartonCbm: 0.025,
      cartonWeightKg: 11.0,
      brandedPackagingCostUSD: 0.20,
      defectRatePct: 1.0,
      retailPriceStore: 169,
      retailPriceEcommerce: 179,
      wholesalePriceRetail: 85,
      safetyStockWeeks: 8,
      initialOrderMonth: 3,
      reorderIntervalMonths: 4
    },
    {
      id: "sku-china-06",
      sku: "LABEL-HOLDER-ACR",
      name: "Porta-etiquetas Acrílico Clip-on (Pack 6)",
      category: "Acrílicos",
      fobPriceUSD: 1.40,
      moq: 1000,
      unitsPerCarton: 40,
      cartonCbm: 0.030,
      cartonWeightKg: 4.5,
      brandedPackagingCostUSD: 0.25,
      defectRatePct: 1.0,
      retailPriceStore: 149,
      retailPriceEcommerce: 159,
      wholesalePriceRetail: 75,
      safetyStockWeeks: 6,
      initialOrderMonth: 3,
      reorderIntervalMonths: 3
    }
  ];

  // Inversión en maquinaria para expansión de fabricación propia
  const initialMachines: MachineInvestment[] = [
    {
      id: "machine-router-cnc",
      name: "Router CNC Industrial de Alta Precisión",
      purchaseMonth: 2,
      installationMonths: 1,
      capexAmount: 280000,
      downPaymentPct: 40,
      monthlyFinancingPayment: 15000,
      financingMonths: 12,
      capacityIncreaseUnitsMonthly: 850,
      usefulLifeYears: 8,
      monthlyMaintenanceCost: 3500
    },
    {
      id: "machine-enchapadora",
      name: "Enchapadora Automática de Cantos",
      purchaseMonth: 6,
      installationMonths: 1,
      capexAmount: 160000,
      downPaymentPct: 50,
      monthlyFinancingPayment: 9000,
      financingMonths: 10,
      capacityIncreaseUnitsMonthly: 500,
      usefulLifeYears: 7,
      monthlyMaintenanceCost: 2000
    }
  ];

  // Tienda actual + Tienda Nueva 2 configurada
  const initialStores: StoreConfig[] = [
    {
      id: "store-01-actual",
      name: "Tienda Actual (Matriz EODC)",
      isExisting: true,
      openMonth: 1,
      setupCapex: 0,
      leaseDeposit: 0,
      monthlyRent: 45000,
      monthlyStaffCost: 85000,
      monthlyOtherOpex: 120000,
      targetMonthlySales: hasRealSales ? baselineData!.realSalesAvgMonthly : 400000,
      rampUpMonths: 1,
      cannibalizationPct: 0,
      supervisionCostMonthly: 0
    },
    {
      id: "store-02-expansion",
      name: "Sucursal 2 (Centro Comercial)",
      isExisting: false,
      openMonth: 7, // Abre en mes 7
      setupCapex: 350000, // Adecuaciones y mobiliario
      leaseDeposit: 80000, // 2 meses de depósito
      monthlyRent: 40000,
      monthlyStaffCost: 55000,
      monthlyOtherOpex: 35000, // Total opex ~130,000 según referencia
      targetMonthlySales: 400000, // Venta objetivo reportada
      rampUpMonths: 6, // 6 meses para alcanzar maduración (40% -> 65% -> 80% -> 90% -> 100%)
      cannibalizationPct: 8, // 8% sobre tienda actual por proximidad
      supervisionCostMonthly: 12000
    }
  ];

  // Ejecutivos para reducción de dependencia de fundadores
  const initialExecutives: HiredExecutive[] = [
    {
      id: "exec-operations-mgr",
      title: "Gerente de Operaciones y Planta",
      hireMonth: 4,
      monthlySalary: 38000,
      replacesFounderRole: 'HUMBERTO',
      founderHoursReductionPct: 35
    },
    {
      id: "exec-commercial-mgr",
      title: "Gerente Comercial y Canales Retail/Ecommerce",
      hireMonth: 8,
      monthlySalary: 42000,
      replacesFounderRole: 'NANCY',
      founderHoursReductionPct: 40
    },
    {
      id: "exec-financial-admin",
      title: "Coordinador Administrativo y Tesorería",
      hireMonth: 12,
      monthlySalary: 28000,
      replacesFounderRole: 'BOTH',
      founderHoursReductionPct: 20
    }
  ];

  // Cadena de retail inicial modelo
  const initialChains: RetailChainConfig[] = [
    {
      id: "chain-liverpool",
      name: "Cadena Departamental Premium",
      startMonth: 10,
      saleModel: 'FIRM_SALE',
      storeCount: 15,
      targetUnitsPerStoreMonthly: 25,
      wholesaleDiscountPct: createTracked(42, 'ILLUSTRATIVE_ASSUMPTION', "Descuento de lista pactado con compradores de cadena"),
      promotionalAllowancePct: createTracked(5, 'ILLUSTRATIVE_ASSUMPTION', "Cargo corporativo por mercadeo y folletería"),
      listingFeeCapex: createTracked(45000, 'USER_ASSUMPTION', "Alta de proveedor y costo de integración EDI"),
      paymentTermsDays: createTracked(60, 'USER_ASSUMPTION', "Plazo contractual de pago a 60 días fecha factura"),
      returnsReservePct: createTracked(3, 'ILLUSTRATIVE_ASSUMPTION', "Reserva por mercancía maltratada en piso de venta")
    }
  ];

  return {
    id: `escenario-${Date.now()}`,
    companyId,
    name: "Crecimiento Estratégico Multicanal (Caso Base)",
    description: "Evaluación integral combinada: Expansión de taller, Sucursal 2, Ecommerce, Catálogo de importación China y entrada a Retail departamental.",
    authorName,
    authorEmail,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    cutoffDate: cutoffStr,
    historyWindowMonths: baselineData?.historyWindowMonths || 6,
    engineVersion: "1.0.0",
    isBaselineOnly: false,

    budget: {
      interpretation: createTracked(
        'OPTION_A', 
        'USER_ASSUMPTION', 
        "Opción A: Presupuesto total $1,000,000 con $300,000 de reserva de seguridad ($700,000 para expansión disponible)"
      ),
      totalBudget: createTracked(1000000, 'USER_ASSUMPTION', "Presupuesto total fijado para el programa de crecimiento"),
      securityReserve: createTracked(300000, 'USER_ASSUMPTION', "Caja mínima intocable para emergencias operativas"),
      existingBankCashUsed: createTracked(
        hasRealCash ? Math.min(baselineData!.realCashInBanks, 300000) : 0, 
        hasRealCash ? 'REAL_ERP' : 'USER_ASSUMPTION',
        "Efectivo proveniente de saldos bancarios actuales del ERP"
      ),
      newExternalEquity: createTracked(700000, 'USER_ASSUMPTION', "Capital nuevo inyectado por socios o inversionistas"),
      debtFinancing: createTracked(0, 'USER_ASSUMPTION', "Líneas de crédito adicionales a contratar"),
      deficitPolicy: createTracked('FINANCE_DEFICIT', 'USER_ASSUMPTION', "Política ante déficit: modelar necesidad de financiamiento puente sin frenar expansión")
    },

    baseline: {
      projectionMethod: createTracked(
        hasRealSales ? 'HISTORICAL_AVERAGE' : 'RECENT_RUN_RATE',
        hasRealSales ? 'CALCULATED_ERP' : 'ILLUSTRATIVE_ASSUMPTION',
        "Método de proyección de la línea base de continuidad sin expansión"
      ),
      historicalMonthsConsidered: createTracked(baselineData?.historyWindowMonths || 6, 'USER_ASSUMPTION'),
      annualGrowthTrendPct: createTracked(4.5, 'USER_ASSUMPTION', "Crecimiento orgánico inercial anual por inflación y maduración natural"),
      extraordinarySalesAdjustments: createTracked(0, 'USER_ASSUMPTION', "Ventas atípicas excepcionales del periodo histórico a excluir"),
      extraordinaryExpenseAdjustments: createTracked(0, 'USER_ASSUMPTION', "Gastos atípicos no recurrentes a excluir de la base"),
      unattendedDemandMonthly: createTracked(35000, 'USER_ASSUMPTION', "Demanda no atendida estimada por quiebres de inventario pasados"),
      referenceMonthlySales: createTracked(
        hasRealSales ? baselineData!.realSalesAvgMonthly : 400000,
        hasRealSales ? 'REAL_ERP' : 'ILLUSTRATIVE_ASSUMPTION',
        hasRealSales ? "Promedio real observado en remisiones/facturas del ERP" : "Venta promedio mensual reportada de referencia ($400,000)"
      ),
      referenceMonthlyOpex: createTracked(
        hasRealOpex ? baselineData!.realOpexAvgMonthly : 250000,
        hasRealOpex ? 'REAL_ERP' : 'ILLUSTRATIVE_ASSUMPTION',
        hasRealOpex ? "Promedio real de gastos operativos registrado en el ERP" : "Gastos operativos mensuales reportados de referencia ($250,000)"
      )
    },

    manufacturing: {
      currentMonthlyCapacityUnits: createTracked(1200, 'USER_ASSUMPTION', "Capacidad instalada actual en unidades equivalentes mensuales de taller propio"),
      bottleneckProcessName: createTracked("Laminado y Acabado Manual", 'USER_ASSUMPTION', "Proceso que determina el cuello de botella actual"),
      rawMaterialCostPerUnit: createTracked(
        hasRealSales && baselineData!.realCostOfSalesAvgMonthly > 0 
          ? Math.round((baselineData!.realCostOfSalesAvgMonthly / 1200) * 0.7) 
          : 95,
        hasRealSales ? 'CALCULATED_ERP' : 'USER_ASSUMPTION',
        "Costo unitario directo de materia prima e insumos consumidos por pieza"
      ),
      directLaborCostPerUnit: createTracked(65, 'USER_ASSUMPTION', "Mano de obra directa asignable por pieza fabricada"),
      spoilageAndScrapPct: createTracked(4.0, 'USER_ASSUMPTION', "Porcentaje promedio de merma y retrabajos en taller"),
      factoryOverheadMonthly: createTracked(35000, 'USER_ASSUMPTION', "Luz trifásica, consumibles de taller y mantenimiento"),
      stockoutPolicy: createTracked('LOST_SALES', 'USER_ASSUMPTION', "Venta no surtida se pierde por falta de disponibilidad"),
      machines: initialMachines
    },

    stores: {
      stores: initialStores
    },

    ecommerce: {
      isEnabled: createTracked(true, 'USER_ASSUMPTION'),
      startMonth: createTracked(1, 'USER_ASSUMPTION'),
      projectionMethod: createTracked('TRAFFIC_CONVERSION', 'USER_ASSUMPTION', "Tráfico Web x Conversión x Ticket Promedio"),
      directMonthlySalesTarget: createTracked(120000, 'USER_ASSUMPTION'),
      monthlyAdSpend: createTracked(25000, 'USER_ASSUMPTION', "Inversión en pauta publicitaria en Meta Ads / Google Ads"),
      cacTarget: createTracked(220, 'USER_ASSUMPTION', "Costo de Adquisición de Cliente estimado"),
      monthlyVisitors: createTracked(18000, 'USER_ASSUMPTION', "Sesiones mensuales únicas estimadas"),
      conversionRatePct: createTracked(1.4, 'USER_ASSUMPTION', "Tasa de conversión de visita a compra (1.4%)"),
      averageOrderValue: createTracked(850, 'USER_ASSUMPTION', "Ticket promedio de pedido en tienda online ($850 MXN)"),
      paymentGatewayCommissionPct: createTracked(3.6, 'USER_ASSUMPTION', "Comisión promedio Mercado Pago / Shopify Payments / Stripe"),
      packagingAndLogisticsCostPct: createTracked(9.5, 'USER_ASSUMPTION', "Cajas de envío con branding, material amortiguante y subsidio de flete"),
      returnRatePct: createTracked(2.5, 'USER_ASSUMPTION', "Devoluciones o cancelaciones de ecommerce")
    },

    chinaImport: {
      isEnabled: createTracked(true, 'USER_ASSUMPTION'),
      exchangeRateUSDMXN: createTracked(18.50, 'USER_ASSUMPTION', "Tipo de cambio presupuestado USD/MXN"),
      seaFreightPerContainerUSD: createTracked(4200, 'USER_ASSUMPTION', "Flete marítimo contenedor 40HQ Ningbo/Shanghai a Manzanillo"),
      customsDutyAvgPct: createTracked(15.0, 'USER_ASSUMPTION', "Arancel promedio de importación mexicana (IGE/IGI)"),
      portInspectionAndClearanceUSD: createTracked(1200, 'USER_ASSUMPTION', "Honorarios agente aduanal, maniobras portuarias y DTA"),
      localInlandFreightMXN: createTracked(28000, 'USER_ASSUMPTION', "Flete terrestre Manzanillo a bodega central EODC"),
      downPaymentPct: createTracked(30, 'USER_ASSUMPTION', "Anticipo a fábrica en China al emitir orden de compra"),
      balancePaymentPct: createTracked(70, 'USER_ASSUMPTION', "Saldo contra entrega de Bill of Lading (BL)"),
      maritimeTransitDays: createTracked(55, 'USER_ASSUMPTION', "Lead time total desde salida de fábrica hasta liberación en bodega"),
      catalog: initialChinaCatalog
    },

    retail: {
      isEnabled: createTracked(true, 'USER_ASSUMPTION'),
      chains: initialChains
    },

    autonomy: {
      founderInitialWeeklyHoursHumberto: createTracked(48, 'USER_ASSUMPTION', "Horas semanales dedicadas a taller, compras y supervisión"),
      founderInitialWeeklyHoursNancy: createTracked(46, 'USER_ASSUMPTION', "Horas semanales dedicadas a diseño, ventas y administración"),
      shadowHourlyRateHumberto: createTracked(350, 'USER_ASSUMPTION', "Costo de mercado por hora para sustituir funciones de dirección técnica"),
      shadowHourlyRateNancy: createTracked(350, 'USER_ASSUMPTION', "Costo de mercado por hora para sustituir funciones comerciales y creativas"),
      executives: initialExecutives,
      valuationEbitdaMultipleMin: createTracked(4.0, 'USER_ASSUMPTION', "Múltiplo conservador de EBITDA para valuación de la empresa"),
      valuationEbitdaMultipleMax: createTracked(6.5, 'USER_ASSUMPTION', "Múltiplo optimista para venta estratégica con bajo riesgo de fundadores")
    },

    macro: {
      inflationAnnualPct: createTracked(4.5, 'USER_ASSUMPTION'),
      corporateTaxRatePct: createTracked(30.0, 'USER_ASSUMPTION', "Tasa legal de Impuesto Sobre la Renta (ISR corporativo)"),
      discountRateWaccPct: createTracked(14.0, 'USER_ASSUMPTION', "Tasa de descuento de flujos para cálculo de valor presente neto")
    },

    realDataSnapshot: baselineData ? {
      avgMonthlyRevenue: baselineData.realSalesAvgMonthly,
      avgMonthlyCostOfSales: baselineData.realCostOfSalesAvgMonthly,
      avgMonthlyOpex: baselineData.realOpexAvgMonthly,
      grossMarginPct: baselineData.realGrossMarginPct,
      cashInBanks: baselineData.realCashInBanks,
      locationsDetected: baselineData.detectedLocations,
      snapshotDate: baselineData.cutoffDate
    } : undefined
  };
}
