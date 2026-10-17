import { 
  StrategicScenario, 
  SimulationResult, 
  MonthlySimulationStep 
} from "@/types/strategicSimulation";

export function simulateScenario(scenario: StrategicScenario): SimulationResult {
  const months: MonthlySimulationStep[] = [];
  const cutoff = new Date(scenario.cutoffDate);

  // 1. Configuración de Presupuesto y Liquidez Inicial
  const isOptionA = scenario.budget.interpretation.value === 'OPTION_A';
  const totalBudget = scenario.budget.totalBudget.value;
  const securityReserve = scenario.budget.securityReserve.value;
  
  // En Opción A: $1M total incluye $300k de reserva => Disponible para expansión = $700k
  // En Opción B: $1M expansión disponible + $300k de reserva por separado
  const initialCashInflow = isOptionA 
    ? totalBudget // Entran los $1,000,000 completos a la caja
    : totalBudget + securityReserve; // Entran $1,300,000 a la caja

  let currentCash = initialCashInflow;
  let debtBalance = scenario.budget.debtFinancing.value;
  let netFixedAssets = 0;
  let accountsReceivableRetail = 0;
  let inventoryTransit = 0;
  let inventoryMaterials = 150000; // Stock inicial de taller
  let inventoryFinished = 200000;  // Stock inicial de producto terminado

  // Ventas de retail pendientes de cobro para modelar el desfase (días de cartera)
  // Cola de cobros futuros: mapa de mes -> monto a cobrar
  const futureCollectionsQueue = new Map<number, number>();
  
  // Cola de pagos a China por saldos (70% al llegar embarque)
  // mapa de mes -> monto a pagar
  const futureChinaPaymentsQueue = new Map<number, number>();

  // Acumuladores de 5 años
  let total5YGrossRevenue = 0;
  let total5YNetRevenue = 0;
  let total5YGrossProfit = 0;
  let total5YEbitda = 0;
  let total5YAdjustedEbitda = 0;
  let total5YNetProfit = 0;
  let total5YCapex = 0;
  let lowestCashBalance = currentCash;
  let monthOfLowestCash = 1;
  let monthsWithDeficitCount = 0;
  let didBreachSecurityReserve = false;
  let peakCashDeficit = 0;

  // Parámetros macroeconómicos
  const annualInflation = scenario.macro.inflationAnnualPct.value / 100;
  const monthlyInflation = Math.pow(1 + annualInflation, 1 / 12) - 1;
  const corporateTaxRate = scenario.macro.corporateTaxRatePct.value / 100;
  const fxRate = scenario.chinaImport.exchangeRateUSDMXN.value;

  // Factor de estacionalidad mensual para retail y hogar en México
  // (Picos en Mayo: Día de las madres, Noviembre: Buen Fin, Diciembre: Navidad)
  const seasonalityIndex = [
    0.85, // Ene
    0.90, // Feb
    0.95, // Mar
    1.00, // Abr
    1.25, // May (Día de las madres)
    0.95, // Jun
    0.95, // Jul
    1.05, // Ago (Regreso a clases / organización)
    0.95, // Sep
    1.05, // Oct
    1.35, // Nov (Buen Fin)
    1.50  // Dic (Navidad)
  ];

  // Cálculo de Landed Cost por SKU importado de China
  const containerCbmCapacity = 68; // Contenedor estándar 40HQ
  const seaFreightUSD = scenario.chinaImport.seaFreightPerContainerUSD.value;
  const seaFreightPerCbmUSD = seaFreightUSD / containerCbmCapacity;
  const dutyRate = scenario.chinaImport.customsDutyAvgPct.value / 100;
  const portClearanceMXN = scenario.chinaImport.portInspectionAndClearanceUSD.value * fxRate;
  const inlandFreightMXN = scenario.chinaImport.localInlandFreightMXN.value;

  const skuLandedCostMap = new Map<string, { unitLandedCostMXN: number; sku: typeof scenario.chinaImport.catalog[0] }>();
  if (scenario.chinaImport.isEnabled.value) {
    scenario.chinaImport.catalog.forEach(sku => {
      const cbmPerUnit = sku.cartonCbm / (sku.unitsPerCarton || 1);
      const fobMXN = sku.fobPriceUSD * fxRate;
      const packagingMXN = (sku.brandedPackagingCostUSD || 0) * fxRate;
      const freightMXN = cbmPerUnit * seaFreightPerCbmUSD * fxRate;
      const dutyMXN = (fobMXN + freightMXN) * dutyRate;
      const allocatedPortAndInlandMXN = 4.50; // Prorrateo por unidad
      const unitLandedCostMXN = fobMXN + packagingMXN + freightMXN + dutyMXN + allocatedPortAndInlandMXN;
      skuLandedCostMap.set(sku.id, { unitLandedCostMXN, sku });
    });
  }

  // Capacidad de fabricación acumulativa
  let activeMonthlyCapacityUnits = scenario.manufacturing.currentMonthlyCapacityUnits.value;

  // Bucle mes a mes (1 a 60)
  for (let m = 1; m <= 60; m++) {
    const simDate = new Date(cutoff.getFullYear(), cutoff.getMonth() + m, 1);
    const calYear = simDate.getFullYear();
    const calMonth = simDate.getMonth(); // 0 a 11
    const monthSeasonality = seasonalityIndex[calMonth] || 1.0;
    const inflationMultiplier = Math.pow(1 + monthlyInflation, m - 1);

    // --- A. CAPACIDAD DE FABRICACIÓN PROPIA Y MÁQUINAS NUEVAS ---
    // Verificar si alguna máquina se compra o entra en operación en este mes
    let machineMonthlyCapex = 0;
    let machineMonthlyDebtPay = 0;
    let machineDepreciation = 0;
    let machineMaintenance = 0;

    scenario.manufacturing.machines.forEach(mach => {
      if (m === mach.purchaseMonth) {
        const downPayment = mach.capexAmount * (mach.downPaymentPct / 100);
        machineMonthlyCapex += downPayment;
        netFixedAssets += mach.capexAmount;
        total5YCapex += downPayment;
      }
      if (m > mach.purchaseMonth && m <= mach.purchaseMonth + (mach.financingMonths || 12)) {
        machineMonthlyDebtPay += mach.monthlyFinancingPayment;
      }
      if (m >= mach.purchaseMonth + (mach.installationMonths || 1)) {
        activeMonthlyCapacityUnits += mach.capacityIncreaseUnitsMonthly / 60; // Incremento suave escalonado
        machineMaintenance += mach.monthlyMaintenanceCost;
      }
      if (m >= mach.purchaseMonth) {
        machineDepreciation += mach.capexAmount / ((mach.usefulLifeYears || 8) * 12);
      }
    });

    // --- B. INGRESOS POR CANAL ---
    
    // 1. Tienda Actual (Base)
    const baseStoreTarget = scenario.baseline.referenceMonthlySales.value * inflationMultiplier;
    // Si hay tiendas nuevas, considerar canibalización
    let totalCannibalizationPct = 0;
    scenario.stores.stores.forEach(st => {
      if (!st.isExisting && m >= st.openMonth) {
        totalCannibalizationPct += (st.cannibalizationPct || 0);
      }
    });
    totalCannibalizationPct = Math.min(totalCannibalizationPct, 25); // Tope del 25% de canibalización
    const currentStoreSales = baseStoreTarget * (1 - totalCannibalizationPct / 100) * monthSeasonality;

    // 2. Tiendas Nuevas (Expansión)
    let newStoresSales = 0;
    let newStoresOpex = 0;
    let storesCapexMonth = 0;

    scenario.stores.stores.forEach(st => {
      if (st.isExisting) return;

      // Inversión en adecuaciones y depósitos en el mes previo o de apertura
      if (m === st.openMonth) {
        storesCapexMonth += (st.setupCapex + st.leaseDeposit);
        netFixedAssets += st.setupCapex;
        total5YCapex += st.setupCapex;
      }

      if (m >= st.openMonth) {
        // Curva de maduración (Ramp-up)
        const monthsOpen = m - st.openMonth + 1;
        const rampProgress = Math.min(1.0, 0.40 + (0.60 * (monthsOpen / Math.max(1, st.rampUpMonths))));
        const storeMonthSales = (st.targetMonthlySales * rampProgress) * inflationMultiplier * monthSeasonality;
        newStoresSales += storeMonthSales;

        // OPEX de la tienda
        const storeOpex = (st.monthlyRent + st.monthlyStaffCost + st.monthlyOtherOpex + st.supervisionCostMonthly) * inflationMultiplier;
        newStoresOpex += storeOpex;
      }
    });

    // 3. Ecommerce
    let ecommerceGrossSales = 0;
    let ecommerceMarketingOpex = 0;
    let ecommercePlatformFees = 0;
    let ecommerceLogisticsCost = 0;
    let ecommerceReturns = 0;

    if (scenario.ecommerce.isEnabled.value && m >= scenario.ecommerce.startMonth.value) {
      const eMethod = scenario.ecommerce.projectionMethod.value;
      if (eMethod === 'TRAFFIC_CONVERSION') {
        const visitors = scenario.ecommerce.monthlyVisitors.value * Math.pow(1.01, m); // 1% crecimiento mensual
        const orders = visitors * (scenario.ecommerce.conversionRatePct.value / 100);
        ecommerceGrossSales = orders * scenario.ecommerce.averageOrderValue.value;
        ecommerceMarketingOpex = scenario.ecommerce.monthlyAdSpend.value * inflationMultiplier;
      } else if (eMethod === 'AD_DRIVEN') {
        const adSpend = scenario.ecommerce.monthlyAdSpend.value * inflationMultiplier;
        const cac = scenario.ecommerce.cacTarget.value;
        const orders = cac > 0 ? (adSpend / cac) : 0;
        ecommerceGrossSales = orders * scenario.ecommerce.averageOrderValue.value;
        ecommerceMarketingOpex = adSpend;
      } else {
        ecommerceGrossSales = scenario.ecommerce.directMonthlySalesTarget.value * inflationMultiplier * monthSeasonality;
        ecommerceMarketingOpex = scenario.ecommerce.monthlyAdSpend.value * inflationMultiplier;
      }

      ecommercePlatformFees = ecommerceGrossSales * (scenario.ecommerce.paymentGatewayCommissionPct.value / 100);
      ecommerceLogisticsCost = ecommerceGrossSales * (scenario.ecommerce.packagingAndLogisticsCostPct.value / 100);
      ecommerceReturns = ecommerceGrossSales * (scenario.ecommerce.returnRatePct.value / 100);
    }

    // 4. Retail a Cadenas
    let retailGrossSales = 0;
    let retailNetSales = 0;
    let retailListingCapexMonth = 0;

    if (scenario.retail.isEnabled.value) {
      scenario.retail.chains.forEach(chain => {
        if (m === chain.startMonth) {
          retailListingCapexMonth += chain.listingFeeCapex.value;
          total5YCapex += chain.listingFeeCapex.value;
        }

        if (m >= chain.startMonth) {
          const chainUnits = chain.storeCount * chain.targetUnitsPerStoreMonthly;
          const avgWholesaleUnitPrice = 180 * inflationMultiplier; // Precio mayoreo promedio
          const grossVal = chainUnits * avgWholesaleUnitPrice * monthSeasonality;
          const wholesaleDiscount = grossVal * (chain.wholesaleDiscountPct.value / 100);
          const promoFee = grossVal * (chain.promotionalAllowancePct.value / 100);
          const returnReserve = grossVal * (chain.returnsReservePct.value / 100);
          const netChainVal = grossVal - wholesaleDiscount - promoFee - returnReserve;

          retailGrossSales += grossVal;
          retailNetSales += netChainVal;

          // Programar cobranza en la cola según plazo de pago (30, 60 o 90 días)
          const termsDays = chain.paymentTermsDays.value;
          const lagMonths = Math.max(1, Math.round(termsDays / 30));
          const collectionMonth = m + lagMonths;
          const currentQueued = futureCollectionsQueue.get(collectionMonth) || 0;
          futureCollectionsQueue.set(collectionMonth, currentQueued + netChainVal);
          accountsReceivableRetail += netChainVal;
        }
      });
    }

    // Cobranza efectiva que entra este mes de cadenas de retail
    const retailCollectedThisMonth = futureCollectionsQueue.get(m) || 0;
    accountsReceivableRetail = Math.max(0, accountsReceivableRetail - retailCollectedThisMonth);

    // 5. Ventas de Productos Importados de China (Integradas en Canales)
    let chinaImportCogsMonth = 0;
    let chinaAdvancePaidThisMonth = 0;

    if (scenario.chinaImport.isEnabled.value) {
      scenario.chinaImport.catalog.forEach(sku => {
        const landedInfo = skuLandedCostMap.get(sku.id);
        if (!landedInfo) return;

        // Disparo de orden inicial o de reposición
        const isInitialOrder = m === sku.initialOrderMonth;
        const isReorder = m > sku.initialOrderMonth && ((m - sku.initialOrderMonth) % (sku.reorderIntervalMonths || 3) === 0);

        if (isInitialOrder || isReorder) {
          const orderQuantity = sku.moq;
          const totalFobUSD = orderQuantity * sku.fobPriceUSD;
          const totalOrderCostMXN = orderQuantity * landedInfo.unitLandedCostMXN;

          // 30% anticipo al ordenar
          const advanceAmount = totalOrderCostMXN * (scenario.chinaImport.downPaymentPct.value / 100);
          chinaAdvancePaidThisMonth += advanceAmount;
          inventoryTransit += advanceAmount;

          // 70% saldo al llegar a México (2 meses después ~ 60 días de tránsito marítimo)
          const balanceAmount = totalOrderCostMXN * (scenario.chinaImport.balancePaymentPct.value / 100);
          const arrivalMonth = m + 2;
          const currBalQueue = futureChinaPaymentsQueue.get(arrivalMonth) || 0;
          futureChinaPaymentsQueue.set(arrivalMonth, currBalQueue + balanceAmount);
        }

        // Si ya está activo el catálogo, se venden unidades en tiendas y ecommerce
        if (m >= sku.initialOrderMonth + 2) {
          const estimatedUnitsSold = Math.round((sku.moq / ((sku.reorderIntervalMonths || 3) * 1.5)) * monthSeasonality);
          chinaImportCogsMonth += estimatedUnitsSold * landedInfo.unitLandedCostMXN;
        }
      });
    }

    // Saldo pagado este mes a proveedores de China
    const chinaBalancePaidThisMonth = futureChinaPaymentsQueue.get(m) || 0;
    inventoryTransit = Math.max(0, inventoryTransit - chinaAdvancePaidThisMonth + chinaBalancePaidThisMonth);

    // Consolidado de Ingresos
    const otherBaselineRevenue = (scenario.baseline.unattendedDemandMonthly.value * 0.4) * inflationMultiplier;
    const totalGrossRevenue = currentStoreSales + newStoresSales + ecommerceGrossSales + retailGrossSales + otherBaselineRevenue;
    const totalReturnsAndAllowances = ecommerceReturns + (retailGrossSales - retailNetSales);
    const totalNetRevenue = totalGrossRevenue - totalReturnsAndAllowances;

    // --- C. RESTRICCIÓN DE CAPACIDAD DE FABRICACIÓN PROPIA ---
    // Estimar unidades equivalentes que la demanda exige de taller propio
    const avgOwnUnitPrice = 320 * inflationMultiplier;
    const ownManufacturedDemandSales = currentStoreSales * 0.70 + newStoresSales * 0.65 + (ecommerceGrossSales - ecommerceReturns) * 0.50;
    const demandUnits = Math.round(ownManufacturedDemandSales / avgOwnUnitPrice);
    
    let producedUnits = demandUnits;
    let lostSalesUnits = 0;
    let isBottleneckExceeded = false;

    if (demandUnits > activeMonthlyCapacityUnits) {
      isBottleneckExceeded = true;
      if (scenario.manufacturing.stockoutPolicy.value === 'LOST_SALES') {
        producedUnits = Math.round(activeMonthlyCapacityUnits);
        lostSalesUnits = demandUnits - producedUnits;
      } else {
        // Backorder (máximo 15% sobrecapacidad en horas extras)
        producedUnits = Math.min(demandUnits, Math.round(activeMonthlyCapacityUnits * 1.15));
        lostSalesUnits = Math.max(0, demandUnits - producedUnits);
      }
    }

    const capacityUtilizationPct = activeMonthlyCapacityUnits > 0 
      ? Math.min(100, Math.round((producedUnits / activeMonthlyCapacityUnits) * 100))
      : 0;

    // Costo de fabricación propia
    const spoilageFactor = 1 + (scenario.manufacturing.spoilageAndScrapPct.value / 100);
    const unitMaterialCost = scenario.manufacturing.rawMaterialCostPerUnit.value * inflationMultiplier * spoilageFactor;
    const unitLaborCost = scenario.manufacturing.directLaborCostPerUnit.value * inflationMultiplier;
    const ownManufacturedCogs = producedUnits * (unitMaterialCost + unitLaborCost);

    // Costo total de ventas (COGS)
    const totalCogs = ownManufacturedCogs + chinaImportCogsMonth + ecommerceLogisticsCost;
    const grossProfit = totalNetRevenue - totalCogs;
    const grossMarginPct = totalNetRevenue > 0 ? Number(((grossProfit / totalNetRevenue) * 100).toFixed(1)) : 0;

    // --- D. GASTOS OPERATIVOS (OPEX) ---
    const currentStoreOpex = scenario.baseline.referenceMonthlyOpex.value * inflationMultiplier;
    const factoryOverhead = (scenario.manufacturing.factoryOverheadMonthly.value + machineMaintenance) * inflationMultiplier;
    const corporateAndAdmin = 65000 * inflationMultiplier;

    // Nómina de ejecutivos contratados para sustituir fundadores
    let hiredExecutivesPayroll = 0;
    let humbertoHoursReductionPct = 0;
    let nancyHoursReductionPct = 0;

    scenario.autonomy.executives.forEach(exec => {
      if (m >= exec.hireMonth) {
        hiredExecutivesPayroll += exec.monthlySalary * inflationMultiplier;
        if (exec.replacesFounderRole === 'HUMBERTO' || exec.replacesFounderRole === 'BOTH') {
          humbertoHoursReductionPct += exec.founderHoursReductionPct;
        }
        if (exec.replacesFounderRole === 'NANCY' || exec.replacesFounderRole === 'BOTH') {
          nancyHoursReductionPct += exec.founderHoursReductionPct;
        }
      }
    });

    const totalOpex = currentStoreOpex + newStoresOpex + ecommerceMarketingOpex + ecommercePlatformFees + factoryOverhead + corporateAndAdmin + hiredExecutivesPayroll;
    const ebitda = grossProfit - totalOpex;
    const ebitdaMarginPct = totalNetRevenue > 0 ? Number(((ebitda / totalNetRevenue) * 100).toFixed(1)) : 0;

    // Autonomía y costo sombra de fundadores
    const maxReduction = 85; // Máxima desconexión posible (los fundadores mantienen al menos 15% como socios de consejo)
    const effHumbertoReduction = Math.min(maxReduction, humbertoHoursReductionPct);
    const effNancyReduction = Math.min(maxReduction, nancyHoursReductionPct);

    const initialHumbertoHrs = scenario.autonomy.founderInitialWeeklyHoursHumberto.value;
    const initialNancyHrs = scenario.autonomy.founderInitialWeeklyHoursNancy.value;

    const remainingHrsHumberto = Math.round(initialHumbertoHrs * (1 - effHumbertoReduction / 100));
    const remainingHrsNancy = Math.round(initialNancyHrs * (1 - effNancyReduction / 100));

    const shadowCostHourlyHumberto = scenario.autonomy.shadowHourlyRateHumberto.value * inflationMultiplier;
    const shadowCostHourlyNancy = scenario.autonomy.shadowHourlyRateNancy.value * inflationMultiplier;
    const weeksPerMonth = 4.33;

    // Costo mensual de sustituir las horas que Humberto y Nancy todavía dedican
    const founderReplacementShadowCost = Math.round(
      (remainingHrsHumberto * shadowCostHourlyHumberto + remainingHrsNancy * shadowCostHourlyNancy) * weeksPerMonth
    );

    // EBITDA Ajustado (normalizado para valuación de venta)
    const adjustedEbitda = ebitda - founderReplacementShadowCost;
    const adjustedEbitdaMarginPct = totalNetRevenue > 0 ? Number(((adjustedEbitda / totalNetRevenue) * 100).toFixed(1)) : 0;

    // Puntuación de autonomía (0 a 100%)
    const avgHoursReduction = (effHumbertoReduction + effNancyReduction) / 2;
    const autonomyScorePct = Math.min(100, Math.round((avgHoursReduction / maxReduction) * 100));

    // Depreciación, Intereses e Impuestos
    const storeDepreciation = (storesCapexMonth > 0 ? storesCapexMonth / (10 * 12) : 0);
    const totalDepreciation = Math.round(machineDepreciation + storeDepreciation + 4500); // Base amortización
    netFixedAssets = Math.max(0, netFixedAssets - totalDepreciation);

    const interestExpense = Math.round(debtBalance * 0.012); // ~14.4% anual de tasa sobre saldo de deuda
    const taxableIncome = Math.max(0, ebitda - totalDepreciation - interestExpense);
    const incomeTaxes = Math.round(taxableIncome * corporateTaxRate);
    const netProfit = ebitda - totalDepreciation - interestExpense - incomeTaxes;

    // --- E. FLUJO DE EFECTIVO (CASH FLOW) ---
    // Cobranzas en efectivo recibidas este mes:
    // Tiendas y Ecommerce cobran al contado. Retail cobra con desfase de cartera.
    const directCashCollections = currentStoreSales + newStoresSales + (ecommerceGrossSales - ecommerceReturns) + otherBaselineRevenue;
    const totalCashCollections = directCashCollections + retailCollectedThisMonth;

    // Pagos operativos en efectivo:
    const cashPaidCogsAndSuppliers = ownManufacturedCogs + ecommerceLogisticsCost;
    const cashPaidOpex = totalOpex;
    const cashPaidTaxesAndInterest = incomeTaxes + interestExpense;

    const operatingCashFlow = totalCashCollections - cashPaidCogsAndSuppliers - cashPaidOpex - cashPaidTaxesAndInterest;

    // Inversiones CAPEX y compras de inventario internacional
    const totalCapexThisMonth = machineMonthlyCapex + storesCapexMonth + retailListingCapexMonth;
    const chinaCashOutflows = chinaAdvancePaidThisMonth + chinaBalancePaidThisMonth;

    // Financiamiento
    const debtPrincipalRepayment = machineMonthlyDebtPay;
    debtBalance = Math.max(0, debtBalance - debtPrincipalRepayment);

    const netCashFlow = operatingCashFlow - totalCapexThisMonth - chinaCashOutflows - debtPrincipalRepayment;
    const startingCash = currentCash;
    currentCash += netCashFlow;

    // Verificación de déficit y reserva de seguridad
    const isReserveBreached = currentCash < securityReserve;
    const cashDeficitAmount = currentCash < 0 ? Math.abs(currentCash) : 0;

    if (currentCash < 0) {
      monthsWithDeficitCount++;
      if (cashDeficitAmount > peakCashDeficit) {
        peakCashDeficit = cashDeficitAmount;
      }
    }
    if (isReserveBreached) {
      didBreachSecurityReserve = true;
    }
    if (currentCash < lowestCashBalance) {
      lowestCashBalance = currentCash;
      monthOfLowestCash = m;
    }

    // --- F. ACUMULAR TOTALES Y REGISTRAR PASO ---
    total5YGrossRevenue += totalGrossRevenue;
    total5YNetRevenue += totalNetRevenue;
    total5YGrossProfit += grossProfit;
    total5YEbitda += ebitda;
    total5YAdjustedEbitda += adjustedEbitda;
    total5YNetProfit += netProfit;

    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const monthLabel = `M${m} (${monthNames[calMonth]} ${calYear})`;

    months.push({
      monthIndex: m,
      monthLabel,
      calendarYear: calYear,
      calendarMonth: calMonth,
      revenue: {
        currentStore: Math.round(currentStoreSales),
        newStores: Math.round(newStoresSales),
        ecommerce: Math.round(ecommerceGrossSales),
        retailChains: Math.round(retailNetSales),
        otherBaseline: Math.round(otherBaselineRevenue),
        totalGrossRevenue: Math.round(totalGrossRevenue),
        returnsAndAllowances: Math.round(totalReturnsAndAllowances),
        totalNetRevenue: Math.round(totalNetRevenue)
      },
      cogs: {
        ownManufacturedCogs: Math.round(ownManufacturedCogs),
        importedChinaCogs: Math.round(chinaImportCogsMonth),
        ecommerceLogisticsAndPackaging: Math.round(ecommerceLogisticsCost),
        totalCogs: Math.round(totalCogs)
      },
      grossProfit: Math.round(grossProfit),
      grossMarginPct,
      opex: {
        currentStoreOpex: Math.round(currentStoreOpex),
        newStoresOpex: Math.round(newStoresOpex),
        ecommerceMarketing: Math.round(ecommerceMarketingOpex),
        ecommercePlatformFees: Math.round(ecommercePlatformFees),
        factoryOverhead: Math.round(factoryOverhead),
        corporateAndAdmin: Math.round(corporateAndAdmin),
        hiredExecutivesPayroll: Math.round(hiredExecutivesPayroll),
        retailListingFees: Math.round(retailListingCapexMonth),
        totalOpex: Math.round(totalOpex)
      },
      ebitda: Math.round(ebitda),
      ebitdaMarginPct,
      depreciation: totalDepreciation,
      interestExpense,
      incomeTaxes,
      netProfit: Math.round(netProfit),

      founderHoursRemainingHumberto: remainingHrsHumberto,
      founderHoursRemainingNancy: remainingHrsNancy,
      founderReplacementShadowCost,
      adjustedEbitda: Math.round(adjustedEbitda),
      adjustedEbitdaMarginPct,

      cashFlow: {
        cashCollections: Math.round(totalCashCollections),
        cashPaidCogsAndSuppliers: Math.round(cashPaidCogsAndSuppliers),
        cashPaidOpex: Math.round(cashPaidOpex),
        cashPaidTaxesAndInterest: Math.round(cashPaidTaxesAndInterest),
        operatingCashFlow: Math.round(operatingCashFlow),
        chinaAdvancePayments: Math.round(chinaCashOutflows),
        capexSpending: Math.round(totalCapexThisMonth),
        newEquityInflow: 0,
        debtDrawdown: 0,
        debtPrincipalRepayment: Math.round(debtPrincipalRepayment),
        netCashFlow: Math.round(netCashFlow),
        startingCash: Math.round(startingCash),
        endingCash: Math.round(currentCash),
        isReserveBreached,
        cashDeficitAmount: Math.round(cashDeficitAmount)
      },

      balance: {
        cash: Math.round(currentCash),
        accountsReceivableRetail: Math.round(accountsReceivableRetail),
        inventoryOwnMaterials: Math.round(inventoryMaterials),
        inventoryFinishedGoods: Math.round(inventoryFinished),
        inventoryMaritimeTransit: Math.round(inventoryTransit),
        netFixedAssets: Math.round(netFixedAssets),
        accountsPayable: Math.round(chinaBalancePaidThisMonth),
        debtBalance: Math.round(debtBalance),
        netWorkingCapital: Math.round((currentCash + accountsReceivableRetail + inventoryFinished + inventoryTransit) - chinaBalancePaidThisMonth)
      },

      operational: {
        productionCapacityAvailableUnits: Math.round(activeMonthlyCapacityUnits),
        productionUnitsDemanded: demandUnits,
        productionUnitsManufactured: producedUnits,
        productionCapacityUtilizationPct: capacityUtilizationPct,
        isBottleneckExceeded,
        lostSalesUnits,
        autonomyScorePct
      }
    });
  }

  // Resumen global a 5 años
  const avgGrossMarginPct = total5YNetRevenue > 0 ? Number(((total5YGrossProfit / total5YNetRevenue) * 100).toFixed(1)) : 0;
  const avgEbitdaMarginPct = total5YNetRevenue > 0 ? Number(((total5YEbitda / total5YNetRevenue) * 100).toFixed(1)) : 0;
  const expansionBudgetUsed = isOptionA ? 700000 : 1000000;
  const roiOnExpansionBudgetPct = expansionBudgetUsed > 0 
    ? Number(((total5YEbitda / expansionBudgetUsed) * 100).toFixed(1)) 
    : 0;

  // Payback period (mes en que el flujo acumulado neto supera el presupuesto de expansión)
  let cumulativeCash = 0;
  let paybackMonths = 60;
  for (let idx = 0; idx < months.length; idx++) {
    cumulativeCash += months[idx].cashFlow.operatingCashFlow;
    if (cumulativeCash >= expansionBudgetUsed) {
      paybackMonths = idx + 1;
      break;
    }
  }

  const finalAutonomyScore = months[59].operational.autonomyScorePct;
  // Sale Readiness Score: 40% Autonomía + 25% Margen EBITDA + 20% Diversificación Multicanal + 15% Calidad de Datos
  const channelCount = (scenario.stores.stores.length > 1 ? 1 : 0.5) +
    (scenario.ecommerce.isEnabled.value ? 1 : 0) +
    (scenario.retail.isEnabled.value ? 1 : 0) +
    (scenario.chinaImport.isEnabled.value ? 1 : 0);
  const diversificationScore = Math.min(100, (channelCount / 4) * 100);
  const marginScore = Math.min(100, (avgEbitdaMarginPct / 18) * 100);
  const finalSaleReadinessScore = Math.round(
    finalAutonomyScore * 0.40 + marginScore * 0.25 + diversificationScore * 0.20 + 85 * 0.15
  );

  // Valuación de Salida (M&A): basada en el EBITDA Normalizado (Ajustado) del Año 5
  const year5AdjustedEbitda = months.slice(48, 60).reduce((acc, step) => acc + step.adjustedEbitda, 0);
  const multMin = scenario.autonomy.valuationEbitdaMultipleMin.value;
  const multMax = scenario.autonomy.valuationEbitdaMultipleMax.value;

  const enterpriseValueMin = Math.round(Math.max(0, year5AdjustedEbitda) * multMin);
  const enterpriseValueMax = Math.round(Math.max(0, year5AdjustedEbitda) * multMax);
  const finalCash = months[59].balance.cash;
  const finalDebt = months[59].balance.debtBalance;

  const equityValueMin = Math.max(0, enterpriseValueMin + finalCash - finalDebt);
  const equityValueMax = Math.max(0, enterpriseValueMax + finalCash - finalDebt);

  // Sensibilidades deterministas para toma de decisiones
  const baseScenarioEbitda5Y = Math.round(total5YEbitda);
  const salesMinus10PctEbitda5Y = Math.round(total5YEbitda - (total5YNetRevenue * 0.10 * (avgGrossMarginPct / 100)));
  const salesMinus20PctEbitda5Y = Math.round(total5YEbitda - (total5YNetRevenue * 0.20 * (avgGrossMarginPct / 100)));
  const cogsPlus5PctEbitda5Y = Math.round(total5YEbitda - ((total5YNetRevenue - total5YGrossProfit) * 0.05));
  const usdFxPlus15PctEbitda5Y = Math.round(total5YEbitda - (total5YNetRevenue * 0.04));
  const retailCollectionPlus30DaysLowestCash = Math.round(lowestCashBalance - 180000);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    calculatedAt: new Date().toISOString(),
    engineVersion: scenario.engineVersion,
    months,
    summary5Years: {
      totalRevenue: Math.round(total5YNetRevenue),
      totalGrossProfit: Math.round(total5YGrossProfit),
      avgGrossMarginPct,
      totalEbitda: Math.round(total5YEbitda),
      avgEbitdaMarginPct,
      totalAdjustedEbitda: Math.round(total5YAdjustedEbitda),
      totalNetProfit: Math.round(total5YNetProfit),
      totalCapexInvested: Math.round(total5YCapex),
      peakCashDeficit: Math.round(peakCashDeficit),
      lowestCashBalance: Math.round(lowestCashBalance),
      monthOfLowestCash,
      monthsWithDeficitCount,
      didBreachSecurityReserve,
      roiOnExpansionBudgetPct,
      paybackMonths,
      finalAutonomyScorePct: finalAutonomyScore,
      finalSaleReadinessScorePct: finalSaleReadinessScore,
      enterpriseValueMin,
      enterpriseValueMax,
      equityValueMin,
      equityValueMax
    },
    sensitivities: {
      baseScenarioEbitda5Y,
      salesMinus10PctEbitda5Y,
      salesMinus20PctEbitda5Y,
      cogsPlus5PctEbitda5Y,
      usdFxPlus15PctEbitda5Y,
      retailCollectionPlus30DaysLowestCash
    }
  };
}

export function compareScenarios(
  baseScenario: SimulationResult, 
  alternativeScenario: SimulationResult
): {
  incrementalRevenue: number;
  incrementalEbitda: number;
  incrementalAdjustedEbitda: number;
  incrementalEndingCash: number;
  cashDeficitDiff: number;
  autonomyDiffPct: number;
} {
  const incRev = alternativeScenario.summary5Years.totalRevenue - baseScenario.summary5Years.totalRevenue;
  const incEbitda = alternativeScenario.summary5Years.totalEbitda - baseScenario.summary5Years.totalEbitda;
  const incAdjEbitda = alternativeScenario.summary5Years.totalAdjustedEbitda - baseScenario.summary5Years.totalAdjustedEbitda;
  const finalCashBase = baseScenario.months[59]?.balance.cash || 0;
  const finalCashAlt = alternativeScenario.months[59]?.balance.cash || 0;
  const incEndingCash = finalCashAlt - finalCashBase;
  const cashDeficitDiff = alternativeScenario.summary5Years.peakCashDeficit - baseScenario.summary5Years.peakCashDeficit;
  const autonomyDiffPct = alternativeScenario.summary5Years.finalAutonomyScorePct - baseScenario.summary5Years.finalAutonomyScorePct;

  return {
    incrementalRevenue: incRev,
    incrementalEbitda: incEbitda,
    incrementalAdjustedEbitda: incAdjEbitda,
    incrementalEndingCash: incEndingCash,
    cashDeficitDiff,
    autonomyDiffPct
  };
}
