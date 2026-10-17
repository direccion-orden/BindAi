// Test Suite for Simulador de Crecimiento Estratégico (EODC)
import assert from "node:assert";

// Mock baseline data and scenario builder logic
function createTracked(value, origin, notes, formula) {
  return {
    value,
    originalValue: value,
    origin,
    isOverridden: false,
    notes,
    formula,
    lastUpdated: new Date().toISOString()
  };
}

function buildTestScenario(budgetOption = 'OPTION_A') {
  return {
    id: "test-scenario-01",
    companyId: "test-company",
    name: "Escenario de Prueba EODC",
    description: "Test de integración del motor",
    authorName: "Tester Senior",
    authorEmail: "test@ordendelascosas.com",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cutoffDate: "2026-10-01",
    historyWindowMonths: 6,
    engineVersion: "1.0.0",
    isBaselineOnly: false,

    budget: {
      interpretation: createTracked(budgetOption, 'USER_ASSUMPTION'),
      totalBudget: createTracked(1000000, 'USER_ASSUMPTION'),
      securityReserve: createTracked(300000, 'USER_ASSUMPTION'),
      existingBankCashUsed: createTracked(250000, 'REAL_ERP'),
      newExternalEquity: createTracked(750000, 'USER_ASSUMPTION'),
      debtFinancing: createTracked(0, 'USER_ASSUMPTION'),
      deficitPolicy: createTracked('FINANCE_DEFICIT', 'USER_ASSUMPTION')
    },

    baseline: {
      projectionMethod: createTracked('HISTORICAL_AVERAGE', 'CALCULATED_ERP'),
      historicalMonthsConsidered: createTracked(6, 'USER_ASSUMPTION'),
      annualGrowthTrendPct: createTracked(4.0, 'USER_ASSUMPTION'),
      extraordinarySalesAdjustments: createTracked(0, 'USER_ASSUMPTION'),
      extraordinaryExpenseAdjustments: createTracked(0, 'USER_ASSUMPTION'),
      unattendedDemandMonthly: createTracked(30000, 'USER_ASSUMPTION'),
      referenceMonthlySales: createTracked(400000, 'REAL_ERP'),
      referenceMonthlyOpex: createTracked(250000, 'REAL_ERP')
    },

    manufacturing: {
      currentMonthlyCapacityUnits: createTracked(1200, 'USER_ASSUMPTION'),
      bottleneckProcessName: createTracked("Corte y Laminado", 'USER_ASSUMPTION'),
      rawMaterialCostPerUnit: createTracked(95, 'CALCULATED_ERP'),
      directLaborCostPerUnit: createTracked(65, 'USER_ASSUMPTION'),
      spoilageAndScrapPct: createTracked(4.0, 'USER_ASSUMPTION'),
      factoryOverheadMonthly: createTracked(35000, 'USER_ASSUMPTION'),
      stockoutPolicy: createTracked('LOST_SALES', 'USER_ASSUMPTION'),
      machines: [
        {
          id: "mach-1",
          name: "Router CNC Industrial",
          purchaseMonth: 2,
          installationMonths: 1,
          capexAmount: 280000,
          downPaymentPct: 40,
          monthlyFinancingPayment: 15000,
          financingMonths: 12,
          capacityIncreaseUnitsMonthly: 850,
          usefulLifeYears: 8,
          monthlyMaintenanceCost: 3500
        }
      ]
    },

    stores: {
      stores: [
        {
          id: "store-1",
          name: "Tienda Matriz Actual",
          isExisting: true,
          openMonth: 1,
          setupCapex: 0,
          leaseDeposit: 0,
          monthlyRent: 45000,
          monthlyStaffCost: 85000,
          monthlyOtherOpex: 120000,
          targetMonthlySales: 400000,
          rampUpMonths: 1,
          cannibalizationPct: 0,
          supervisionCostMonthly: 0
        },
        {
          id: "store-2",
          name: "Sucursal 2 (Expansión)",
          isExisting: false,
          openMonth: 7,
          setupCapex: 350000,
          leaseDeposit: 80000,
          monthlyRent: 40000,
          monthlyStaffCost: 55000,
          monthlyOtherOpex: 35000,
          targetMonthlySales: 400000,
          rampUpMonths: 6,
          cannibalizationPct: 8,
          supervisionCostMonthly: 12000
        }
      ]
    },

    ecommerce: {
      isEnabled: createTracked(true, 'USER_ASSUMPTION'),
      startMonth: createTracked(1, 'USER_ASSUMPTION'),
      projectionMethod: createTracked('TRAFFIC_CONVERSION', 'USER_ASSUMPTION'),
      directMonthlySalesTarget: createTracked(120000, 'USER_ASSUMPTION'),
      monthlyAdSpend: createTracked(25000, 'USER_ASSUMPTION'),
      cacTarget: createTracked(220, 'USER_ASSUMPTION'),
      monthlyVisitors: createTracked(18000, 'USER_ASSUMPTION'),
      conversionRatePct: createTracked(1.4, 'USER_ASSUMPTION'),
      averageOrderValue: createTracked(850, 'USER_ASSUMPTION'),
      paymentGatewayCommissionPct: createTracked(3.6, 'USER_ASSUMPTION'),
      packagingAndLogisticsCostPct: createTracked(9.5, 'USER_ASSUMPTION'),
      returnRatePct: createTracked(2.5, 'USER_ASSUMPTION')
    },

    chinaImport: {
      isEnabled: createTracked(true, 'USER_ASSUMPTION'),
      exchangeRateUSDMXN: createTracked(18.50, 'USER_ASSUMPTION'),
      seaFreightPerContainerUSD: createTracked(4200, 'USER_ASSUMPTION'),
      customsDutyAvgPct: createTracked(15.0, 'USER_ASSUMPTION'),
      portInspectionAndClearanceUSD: createTracked(1200, 'USER_ASSUMPTION'),
      localInlandFreightMXN: createTracked(28000, 'USER_ASSUMPTION'),
      downPaymentPct: createTracked(30, 'USER_ASSUMPTION'),
      balancePaymentPct: createTracked(70, 'USER_ASSUMPTION'),
      maritimeTransitDays: createTracked(55, 'USER_ASSUMPTION'),
      catalog: [
        {
          id: "sku-1",
          sku: "ORG-ACR-BOX3",
          name: "Organizador Acrílico Premium",
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
        }
      ]
    },

    retail: {
      isEnabled: createTracked(true, 'USER_ASSUMPTION'),
      chains: [
        {
          id: "chain-1",
          name: "Cadena Departamental Premium",
          startMonth: 10,
          saleModel: 'FIRM_SALE',
          storeCount: 15,
          targetUnitsPerStoreMonthly: 25,
          wholesaleDiscountPct: createTracked(42, 'USER_ASSUMPTION'),
          promotionalAllowancePct: createTracked(5, 'USER_ASSUMPTION'),
          listingFeeCapex: createTracked(45000, 'USER_ASSUMPTION'),
          paymentTermsDays: createTracked(60, 'USER_ASSUMPTION'),
          returnsReservePct: createTracked(3, 'USER_ASSUMPTION')
        }
      ]
    },

    autonomy: {
      founderInitialWeeklyHoursHumberto: createTracked(48, 'USER_ASSUMPTION'),
      founderInitialWeeklyHoursNancy: createTracked(46, 'USER_ASSUMPTION'),
      shadowHourlyRateHumberto: createTracked(350, 'USER_ASSUMPTION'),
      shadowHourlyRateNancy: createTracked(350, 'USER_ASSUMPTION'),
      executives: [
        {
          id: "exec-1",
          title: "Gerente de Operaciones",
          hireMonth: 4,
          monthlySalary: 38000,
          replacesFounderRole: 'HUMBERTO',
          founderHoursReductionPct: 35
        }
      ],
      valuationEbitdaMultipleMin: createTracked(4.0, 'USER_ASSUMPTION'),
      valuationEbitdaMultipleMax: createTracked(6.5, 'USER_ASSUMPTION')
    },

    macro: {
      inflationAnnualPct: createTracked(4.5, 'USER_ASSUMPTION'),
      corporateTaxRatePct: createTracked(30.0, 'USER_ASSUMPTION'),
      discountRateWaccPct: createTracked(14.0, 'USER_ASSUMPTION')
    }
  };
}

async function runTests() {
  console.log("=== INICIANDO PRUEBAS DEL SIMULADOR DE CRECIMIENTO ESTRATÉGICO ===");

  // Importar el motor compilado o transpilar
  const { simulateScenario, compareScenarios } = await import("../src/lib/financial/strategicSimulationEngine.ts");

  // Test 1: Simulación determinista a 60 meses
  console.log("\n[TEST 1] Verificando generación de 60 meses proyectados...");
  const scenario = buildTestScenario('OPTION_A');
  const result = simulateScenario(scenario);
  assert.strictEqual(result.months.length, 60, "El horizonte proyectado debe tener exactamente 60 meses");
  console.log("  ✓ 60 meses generados correctamente.");

  // Test 2: Comportamiento de Presupuesto Opción A vs Opción B
  console.log("\n[TEST 2] Verificando interpretación de Presupuesto A vs B...");
  const scenarioA = buildTestScenario('OPTION_A');
  const resultA = simulateScenario(scenarioA);
  assert.strictEqual(resultA.months[0].cashFlow.startingCash, 1000000, "Opción A debe iniciar con $1,000,000 en caja");

  const scenarioB = buildTestScenario('OPTION_B');
  const resultB = simulateScenario(scenarioB);
  assert.strictEqual(resultB.months[0].cashFlow.startingCash, 1300000, "Opción B debe iniciar con $1,300,000 en caja ($1M + $300k reserva)");
  console.log("  ✓ Presupuesto Opción A ($1M total) y Opción B ($1.3M con reserva) comprobados.");

  // Test 3: Cero incremento de la línea base contra sí misma
  console.log("\n[TEST 3] Verificando incremento cero al comparar línea base contra sí misma...");
  const baselineOnly = buildTestScenario();
  baselineOnly.isBaselineOnly = true;
  baselineOnly.stores.stores = baselineOnly.stores.stores.filter(s => s.isExisting);
  baselineOnly.ecommerce.isEnabled.value = false;
  baselineOnly.chinaImport.isEnabled.value = false;
  baselineOnly.retail.isEnabled.value = false;
  baselineOnly.manufacturing.machines = [];
  baselineOnly.autonomy.executives = [];

  const baseResult1 = simulateScenario(baselineOnly);
  const baseResult2 = simulateScenario(baselineOnly);
  const diff = compareScenarios(baseResult1, baseResult2);

  assert.strictEqual(diff.incrementalRevenue, 0, "El incremento en ventas de la base contra sí misma debe ser 0");
  assert.strictEqual(diff.incrementalEbitda, 0, "El incremento en EBITDA de la base contra sí misma debe ser 0");
  assert.strictEqual(diff.incrementalEndingCash, 0, "El incremento en caja final de la base contra sí misma debe ser 0");
  console.log("  ✓ Incremento cero de la línea base validado.");

  // Test 4: Desfase de cobranza en retail (60 días de cartera)
  console.log("\n[TEST 4] Verificando desfase de cobranza de retail a 60 días...");
  const retailChain = scenario.retail.chains[0];
  const chainStartMonth = retailChain.startMonth; // Mes 10
  const lagMonths = Math.round(retailChain.paymentTermsDays.value / 30); // 2 meses de desfase
  const expectedCollectionMonth = chainStartMonth + lagMonths; // Mes 12

  const month10 = result.months[chainStartMonth - 1]; // Mes 10
  assert.ok(month10.revenue.retailChains > 0, "En Mes 10 debe haber venta de retail reconocida");
  assert.strictEqual(month10.cashFlow.cashCollections < month10.revenue.totalGrossRevenue, true, "En Mes 10 la cobranza de retail aún no debe haber entrado a caja");

  const month12 = result.months[expectedCollectionMonth - 1]; // Mes 12
  assert.ok(month12.cashFlow.cashCollections > 0, "En Mes 12 debe entrar la cobranza devengada del Mes 10");
  console.log("  ✓ Desfase de cobranza comercial (30/60 días) verificado.");

  // Test 5: Restricción de cuello de botella de taller propio
  console.log("\n[TEST 5] Verificando restricción de capacidad por cuello de botella...");
  // Verificamos que la producción no exceda la capacidad máxima configurada cuando la política es LOST_SALES
  result.months.forEach((m, idx) => {
    if (scenario.manufacturing.stockoutPolicy.value === 'LOST_SALES') {
      assert.ok(
        m.operational.productionUnitsManufactured <= m.operational.productionCapacityAvailableUnits,
        `En Mes ${idx + 1} la producción (${m.operational.productionUnitsManufactured}) superó la capacidad máxima (${m.operational.productionCapacityAvailableUnits})`
      );
    }
  });
  console.log("  ✓ Restricción de cuello de botella de taller respetada en todos los meses.");

  // Test 6: Reducción de horas de fundadores y costo sombra
  console.log("\n[TEST 6] Verificando reducción de horas de fundadores y costo sombra...");
  const month1 = result.months[0];
  const month60 = result.months[59];
  assert.strictEqual(month1.founderHoursRemainingHumberto, 48, "Humberto debe iniciar con 48 hrs/semana");
  assert.ok(month60.founderHoursRemainingHumberto < 48, "Humberto debe reducir sus horas tras la contratación de ejecutivos");
  assert.ok(month60.operational.autonomyScorePct > month1.operational.autonomyScorePct, "El score de autonomía debe aumentar");
  console.log(`  ✓ Autonomía inicial: ${month1.operational.autonomyScorePct}% → Final: ${month60.operational.autonomyScorePct}%.`);

  // Test 7: Sensibilidades y Stress-Testing
  console.log("\n[TEST 7] Verificando cálculo de sensibilidades deterministas...");
  assert.ok(result.sensitivities.salesMinus10PctEbitda5Y < result.sensitivities.baseScenarioEbitda5Y, "EBITDA con -10% ventas debe ser menor al caso base");
  assert.ok(result.sensitivities.salesMinus20PctEbitda5Y < result.sensitivities.salesMinus10PctEbitda5Y, "EBITDA con -20% ventas debe ser menor a -10%");
  console.log("  ✓ Matriz de sensibilidades calculada consistentemente.");

  console.log("\n========================================================");
  console.log("TODAS LAS PRUEBAS MATEMÁTICAS Y DE INTEGRACIÓN PASARON EXITOSAMENTE.");
  console.log("========================================================");
}

runTests().catch(err => {
  console.error("Error en las pruebas:", err);
  process.exit(1);
});
