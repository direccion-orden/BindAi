export type VariableOrigin = 
  | 'REAL_ERP' 
  | 'CALCULATED_ERP' 
  | 'USER_ASSUMPTION' 
  | 'ILLUSTRATIVE_ASSUMPTION' 
  | 'MISSING_DATA';

export interface TrackedValue<T> {
  value: T;
  originalValue?: T;
  origin: VariableOrigin;
  sourcePeriod?: string;
  formula?: string;
  notes?: string;
  isOverridden: boolean;
  lastUpdated?: string;
}

export type BudgetInterpretation = 'OPTION_A' | 'OPTION_B';

export interface BudgetConfig {
  interpretation: TrackedValue<BudgetInterpretation>;
  totalBudget: TrackedValue<number>;          // $1,000,000
  securityReserve: TrackedValue<number>;      // $300,000
  existingBankCashUsed: TrackedValue<number>; // Dinero disponible en bancos del ERP
  newExternalEquity: TrackedValue<number>;    // Capital nuevo aportado
  debtFinancing: TrackedValue<number>;        // Crédito o financiamiento bancario
  deficitPolicy: TrackedValue<'HALT_INVESTMENTS' | 'FINANCE_DEFICIT'>;
}

export interface BaselineConfig {
  projectionMethod: TrackedValue<'HISTORICAL_AVERAGE' | 'RECENT_RUN_RATE' | 'GROWTH_TREND' | 'SEASONAL'>;
  historicalMonthsConsidered: TrackedValue<number>; // ej. 3, 6, 12 meses
  annualGrowthTrendPct: TrackedValue<number>;       // ej. 5%
  extraordinarySalesAdjustments: TrackedValue<number>; // Ventas excepcionales a descontar
  extraordinaryExpenseAdjustments: TrackedValue<number>; // Gastos no recurrentes a descontar
  unattendedDemandMonthly: TrackedValue<number>;    // Demanda no atendida por falta de stock
  referenceMonthlySales: TrackedValue<number>;      // $400,000 reportado
  referenceMonthlyOpex: TrackedValue<number>;       // $250,000 reportado
}

export interface MachineInvestment {
  id: string;
  name: string;
  purchaseMonth: number;
  installationMonths: number;
  capexAmount: number;
  downPaymentPct: number;
  monthlyFinancingPayment: number;
  financingMonths: number;
  capacityIncreaseUnitsMonthly: number;
  usefulLifeYears: number;
  monthlyMaintenanceCost: number;
}

export interface ManufacturingLeverConfig {
  currentMonthlyCapacityUnits: TrackedValue<number>;
  bottleneckProcessName: TrackedValue<string>;
  rawMaterialCostPerUnit: TrackedValue<number>;
  directLaborCostPerUnit: TrackedValue<number>;
  spoilageAndScrapPct: TrackedValue<number>; // Merma
  factoryOverheadMonthly: TrackedValue<number>;
  stockoutPolicy: TrackedValue<'LOST_SALES' | 'BACKORDER'>;
  machines: MachineInvestment[];
}

export interface StoreConfig {
  id: string;
  name: string;
  isExisting: boolean;
  openMonth: number; // 1 for existing store
  setupCapex: number;
  leaseDeposit: number;
  monthlyRent: number;
  monthlyStaffCost: number;
  monthlyOtherOpex: number;
  targetMonthlySales: number;
  rampUpMonths: number;
  cannibalizationPct: number;
  supervisionCostMonthly: number;
}

export interface StoresLeverConfig {
  stores: StoreConfig[];
}

export interface EcommerceLeverConfig {
  isEnabled: TrackedValue<boolean>;
  startMonth: TrackedValue<number>;
  projectionMethod: TrackedValue<'DIRECT_SALES' | 'TRAFFIC_CONVERSION' | 'AD_DRIVEN'>;
  directMonthlySalesTarget: TrackedValue<number>;
  monthlyAdSpend: TrackedValue<number>;
  cacTarget: TrackedValue<number>;
  monthlyVisitors: TrackedValue<number>;
  conversionRatePct: TrackedValue<number>;
  averageOrderValue: TrackedValue<number>;
  paymentGatewayCommissionPct: TrackedValue<number>; // ej. 3.5%
  packagingAndLogisticsCostPct: TrackedValue<number>; // ej. 10%
  returnRatePct: TrackedValue<number>; // ej. 3%
}

export interface ChinaImportSku {
  id: string;
  sku: string;
  name: string;
  category: string;
  fobPriceUSD: number;
  moq: number;
  unitsPerCarton: number;
  cartonCbm: number;
  cartonWeightKg: number;
  brandedPackagingCostUSD: number;
  defectRatePct: number;
  retailPriceStore: number;
  retailPriceEcommerce: number;
  wholesalePriceRetail: number;
  safetyStockWeeks: number;
  initialOrderMonth: number;
  reorderIntervalMonths: number;
}

export interface ChinaImportLeverConfig {
  isEnabled: TrackedValue<boolean>;
  exchangeRateUSDMXN: TrackedValue<number>; // ej. 18.50
  seaFreightPerContainerUSD: TrackedValue<number>; // ej. 4,500 USD
  customsDutyAvgPct: TrackedValue<number>; // ej. 15% (arancel)
  portInspectionAndClearanceUSD: TrackedValue<number>; // Gastos aduanales fijos
  localInlandFreightMXN: TrackedValue<number>;
  downPaymentPct: TrackedValue<number>; // 30%
  balancePaymentPct: TrackedValue<number>; // 70%
  maritimeTransitDays: TrackedValue<number>; // 60 días
  catalog: ChinaImportSku[];
}

export interface RetailChainConfig {
  id: string;
  name: string;
  startMonth: number;
  saleModel: 'FIRM_SALE' | 'CONSIGNMENT';
  storeCount: number;
  targetUnitsPerStoreMonthly: number;
  wholesaleDiscountPct: TrackedValue<number>; // Descuento sobre precio de lista
  promotionalAllowancePct: TrackedValue<number>; // Cargos por publicidad/promoción
  listingFeeCapex: TrackedValue<number>; // Gasto inicial de catalogación
  paymentTermsDays: TrackedValue<number>; // 30, 60 o 90 días
  returnsReservePct: TrackedValue<number>; // Provisión para devoluciones
}

export interface RetailLeverConfig {
  isEnabled: TrackedValue<boolean>;
  chains: RetailChainConfig[];
}

export interface HiredExecutive {
  id: string;
  title: string;
  hireMonth: number;
  monthlySalary: number;
  replacesFounderRole: 'HUMBERTO' | 'NANCY' | 'BOTH';
  founderHoursReductionPct: number; // Porcentaje de horas que ahorra a los fundadores
}

export interface AutonomyLeverConfig {
  founderInitialWeeklyHoursHumberto: TrackedValue<number>; // ej. 45 hrs
  founderInitialWeeklyHoursNancy: TrackedValue<number>;     // ej. 45 hrs
  shadowHourlyRateHumberto: TrackedValue<number>;          // Valor de mercado por hora
  shadowHourlyRateNancy: TrackedValue<number>;
  executives: HiredExecutive[];
  valuationEbitdaMultipleMin: TrackedValue<number>; // ej. 4.0x
  valuationEbitdaMultipleMax: TrackedValue<number>; // ej. 6.5x
}

export interface MacroFinancialAssumptions {
  inflationAnnualPct: TrackedValue<number>;
  corporateTaxRatePct: TrackedValue<number>; // 30% ISR
  discountRateWaccPct: TrackedValue<number>; // 15%
}

export interface StrategicScenario {
  id: string;
  companyId: string;
  name: string;
  description: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
  cutoffDate: string; // Fecha de corte YYYY-MM-DD
  historyWindowMonths: number;
  engineVersion: string; // ej. "1.0.0"
  isBaselineOnly: boolean;
  budget: BudgetConfig;
  baseline: BaselineConfig;
  manufacturing: ManufacturingLeverConfig;
  stores: StoresLeverConfig;
  ecommerce: EcommerceLeverConfig;
  chinaImport: ChinaImportLeverConfig;
  retail: RetailLeverConfig;
  autonomy: AutonomyLeverConfig;
  macro: MacroFinancialAssumptions;
  // Snapshot de datos reales tomados del ERP al momento de guardar
  realDataSnapshot?: {
    avgMonthlyRevenue: number;
    avgMonthlyCostOfSales: number;
    avgMonthlyOpex: number;
    grossMarginPct: number;
    cashInBanks: number;
    locationsDetected: { id: string; name: string }[];
    snapshotDate: string;
  };
}

export interface MonthlySimulationStep {
  monthIndex: number; // 1 to 60
  monthLabel: string; // "Mes 1 (May 2026)"
  calendarYear: number;
  calendarMonth: number;

  // Ingresos por Canal
  revenue: {
    currentStore: number;
    newStores: number;
    ecommerce: number;
    retailChains: number;
    otherBaseline: number;
    totalGrossRevenue: number;
    returnsAndAllowances: number;
    totalNetRevenue: number;
  };

  // Costo de Ventas (COGS)
  cogs: {
    ownManufacturedCogs: number;
    importedChinaCogs: number;
    ecommerceLogisticsAndPackaging: number;
    totalCogs: number;
  };

  // Resultados
  grossProfit: number;
  grossMarginPct: number;

  // Gastos Operativos (OPEX)
  opex: {
    currentStoreOpex: number;
    newStoresOpex: number;
    ecommerceMarketing: number;
    ecommercePlatformFees: number;
    factoryOverhead: number;
    corporateAndAdmin: number;
    hiredExecutivesPayroll: number;
    retailListingFees: number;
    totalOpex: number;
  };

  ebitda: number;
  ebitdaMarginPct: number;
  depreciation: number;
  interestExpense: number;
  incomeTaxes: number;
  netProfit: number;

  // Autonomía y M&A
  founderHoursRemainingHumberto: number;
  founderHoursRemainingNancy: number;
  founderReplacementShadowCost: number;
  adjustedEbitda: number; // EBITDA - costo de sustitución aún no contratado
  adjustedEbitdaMarginPct: number;

  // Flujo de Efectivo
  cashFlow: {
    cashCollections: number;
    cashPaidCogsAndSuppliers: number;
    cashPaidOpex: number;
    cashPaidTaxesAndInterest: number;
    operatingCashFlow: number;
    chinaAdvancePayments: number;
    capexSpending: number;
    newEquityInflow: number;
    debtDrawdown: number;
    debtPrincipalRepayment: number;
    netCashFlow: number;
    startingCash: number;
    endingCash: number;
    isReserveBreached: boolean;
    cashDeficitAmount: number;
  };

  // Balance General Simplificado
  balance: {
    cash: number;
    accountsReceivableRetail: number;
    inventoryOwnMaterials: number;
    inventoryFinishedGoods: number;
    inventoryMaritimeTransit: number;
    netFixedAssets: number;
    accountsPayable: number;
    debtBalance: number;
    netWorkingCapital: number;
  };

  // Métricas Operativas
  operational: {
    productionCapacityAvailableUnits: number;
    productionUnitsDemanded: number;
    productionUnitsManufactured: number;
    productionCapacityUtilizationPct: number;
    isBottleneckExceeded: boolean;
    lostSalesUnits: number;
    autonomyScorePct: number;
  };
}

export interface SimulationResult {
  scenarioId: string;
  scenarioName: string;
  calculatedAt: string;
  engineVersion: string;
  months: MonthlySimulationStep[];

  // Resumen Consolidado a 5 años (60 meses)
  summary5Years: {
    totalRevenue: number;
    totalGrossProfit: number;
    avgGrossMarginPct: number;
    totalEbitda: number;
    avgEbitdaMarginPct: number;
    totalAdjustedEbitda: number;
    totalNetProfit: number;
    totalCapexInvested: number;
    peakCashDeficit: number;
    lowestCashBalance: number;
    monthOfLowestCash: number;
    monthsWithDeficitCount: number;
    didBreachSecurityReserve: boolean;
    roiOnExpansionBudgetPct: number;
    paybackMonths: number;
    finalAutonomyScorePct: number;
    finalSaleReadinessScorePct: number;
    enterpriseValueMin: number;
    enterpriseValueMax: number;
    equityValueMin: number;
    equityValueMax: number;
  };

  // Comparación contra Línea Base
  vsBaselineIncrement?: {
    incrementalRevenue: number;
    incrementalEbitda: number;
    incrementalAdjustedEbitda: number;
    incrementalNetCashFlow: number;
  };

  // Análisis de Sensibilidad Determinista
  sensitivities: {
    baseScenarioEbitda5Y: number;
    salesMinus10PctEbitda5Y: number;
    salesMinus20PctEbitda5Y: number;
    cogsPlus5PctEbitda5Y: number;
    usdFxPlus15PctEbitda5Y: number;
    retailCollectionPlus30DaysLowestCash: number;
  };
}
