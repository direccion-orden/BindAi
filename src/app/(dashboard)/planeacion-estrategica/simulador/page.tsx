"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { 
  StrategicScenario, 
  SimulationResult 
} from "@/types/strategicSimulation";
import { 
  fetchStrategicERPData, 
  buildDefaultScenario, 
  StrategicBaselineData 
} from "@/lib/financial/strategicDataAdapter";
import { 
  simulateScenario 
} from "@/lib/financial/strategicSimulationEngine";
import { 
  listScenarios, 
  saveScenario, 
  duplicateScenario, 
  deleteScenario, 
  updateScenarioWithCurrentERPData, 
  ScenarioDiff 
} from "@/lib/services/strategicScenarioService";

import { SimulatorHeader } from "@/components/strategic-simulator/SimulatorHeader";
import { DiffModal } from "@/components/strategic-simulator/DiffModal";
import { ExecutiveCockpit } from "@/components/strategic-simulator/ExecutiveCockpit";
import { DashboardTab } from "@/components/strategic-simulator/DashboardTab";
import { RealDataQualityTab } from "@/components/strategic-simulator/RealDataQualityTab";
import { AssumptionsTab } from "@/components/strategic-simulator/AssumptionsTab";
import { ProductionTab } from "@/components/strategic-simulator/ProductionTab";
import { StoresEcommerceTab } from "@/components/strategic-simulator/StoresEcommerceTab";
import { ImportRetailTab } from "@/components/strategic-simulator/ImportRetailTab";
import { FinancialStatementsTab } from "@/components/strategic-simulator/FinancialStatementsTab";
import { ComparisonTab } from "@/components/strategic-simulator/ComparisonTab";
import { AutonomySaleReadinessTab } from "@/components/strategic-simulator/AutonomySaleReadinessTab";
import { ProjectedVsRealTab } from "@/components/strategic-simulator/ProjectedVsRealTab";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Sparkles,
  LayoutDashboard, 
  Database, 
  Sliders, 
  Factory, 
  Store, 
  Ship, 
  FileText, 
  GitCompare, 
  Award, 
  LineChart, 
  Loader2 
} from "lucide-react";

export default function StrategicGrowthSimulatorPage() {
  const { companyId, user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [scenarios, setScenarios] = useState<StrategicScenario[]>([]);
  const [activeScenario, setActiveScenario] = useState<StrategicScenario | null>(null);
  const [baselineData, setBaselineData] = useState<StrategicBaselineData | null>(null);
  const [activeTab, setActiveTab] = useState("cockpit");

  // Estado del modal de actualización con datos del ERP
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [pendingDiffs, setPendingDiffs] = useState<ScenarioDiff[]>([]);
  const [isUpdatingFromErp, setIsUpdatingFromErp] = useState(false);

  // Inicialización de datos
  useEffect(() => {
    if (!companyId) return;

    let isMounted = true;

    async function loadData() {
      try {
        setLoading(true);

        // 1. Obtener datos históricos reales del ERP
        const erpData = await fetchStrategicERPData(companyId!);
        if (isMounted) setBaselineData(erpData);

        // 2. Obtener lista de escenarios guardados
        const savedScenarios = await listScenarios(companyId!);

        if (savedScenarios.length > 0) {
          if (isMounted) {
            setScenarios(savedScenarios);
            setActiveScenario(savedScenarios[0]);
          }
        } else {
          // Si no hay escenarios guardados, construir y guardar el escenario por omisión
          const defaultSc = buildDefaultScenario(
            companyId!, 
            user?.displayName || "Dirección General",
            user?.email || "direccion@ordendelascosas.com",
            erpData
          );
          await saveScenario(companyId!, defaultSc);
          if (isMounted) {
            setScenarios([defaultSc]);
            setActiveScenario(defaultSc);
          }
        }
      } catch (err) {
        console.error("Error al cargar datos del simulador:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [companyId, user]);

  // Cálculo live determinista de la simulación
  const simulationResult: SimulationResult | null = useMemo(() => {
    if (!activeScenario) return null;
    return simulateScenario(activeScenario);
  }, [activeScenario]);

  // Escenario de línea base pura (continuidad sin expansión)
  const baselineResult: SimulationResult | null = useMemo(() => {
    if (!activeScenario) return null;
    const baseCopy: StrategicScenario = JSON.parse(JSON.stringify(activeScenario));
    baseCopy.isBaselineOnly = true;
    baseCopy.stores.stores = baseCopy.stores.stores.filter(s => s.isExisting);
    baseCopy.ecommerce.isEnabled.value = false;
    baseCopy.chinaImport.isEnabled.value = false;
    baseCopy.retail.isEnabled.value = false;
    baseCopy.manufacturing.machines = [];
    baseCopy.autonomy.executives = [];
    return simulateScenario(baseCopy);
  }, [activeScenario]);

  // Guardar escenario actual
  const handleSaveScenario = async () => {
    if (!companyId || !activeScenario) return;
    setIsSaving(true);
    try {
      await saveScenario(companyId, activeScenario);
      const updatedList = await listScenarios(companyId);
      setScenarios(updatedList);
    } catch (err) {
      console.error("Error al guardar escenario:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Duplicar escenario actual
  const handleDuplicateScenario = async () => {
    if (!companyId || !activeScenario) return;
    setIsSaving(true);
    try {
      const duplicated = await duplicateScenario(companyId, activeScenario);
      const updatedList = await listScenarios(companyId);
      setScenarios(updatedList);
      setActiveScenario(duplicated);
    } catch (err) {
      console.error("Error al duplicar escenario:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Crear nuevo escenario en blanco
  const handleNewScenario = async () => {
    if (!companyId) return;
    setIsSaving(true);
    try {
      const newSc = buildDefaultScenario(
        companyId,
        user?.displayName || "Dirección General",
        user?.email || "direccion@ordendelascosas.com",
        baselineData || undefined
      );
      newSc.name = `Nuevo Escenario (${new Date().toLocaleDateString("es-MX")})`;
      await saveScenario(companyId, newSc);
      const updatedList = await listScenarios(companyId);
      setScenarios(updatedList);
      setActiveScenario(newSc);
    } catch (err) {
      console.error("Error al crear nuevo escenario:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Eliminar escenario
  const handleDeleteScenario = async (id: string) => {
    if (!companyId) return;
    if (scenarios.length <= 1) {
      alert("Debe mantenerse al menos un escenario en el simulador.");
      return;
    }
    await deleteScenario(companyId, id);
    const updatedList = await listScenarios(companyId);
    setScenarios(updatedList);
    setActiveScenario(updatedList[0]);
  };

  // Abrir modal de actualización con datos del ERP
  const handleOpenUpdateModal = async () => {
    if (!companyId || !activeScenario) return;
    setIsUpdatingFromErp(true);
    try {
      const latestBaseline = await fetchStrategicERPData(companyId);
      setBaselineData(latestBaseline);

      const diffs: ScenarioDiff[] = [];
      const prevSales = activeScenario.baseline.referenceMonthlySales.value;
      if (latestBaseline.realSalesAvgMonthly > 0 && prevSales !== latestBaseline.realSalesAvgMonthly) {
        diffs.push({
          variablePath: "baseline.referenceMonthlySales",
          variableName: "Ventas Mensuales de Referencia",
          previousValue: prevSales,
          newValue: latestBaseline.realSalesAvgMonthly,
          origin: "REAL_ERP"
        });
      }

      const prevOpex = activeScenario.baseline.referenceMonthlyOpex.value;
      if (latestBaseline.realOpexAvgMonthly > 0 && prevOpex !== latestBaseline.realOpexAvgMonthly) {
        diffs.push({
          variablePath: "baseline.referenceMonthlyOpex",
          variableName: "Gastos Operativos (OPEX) Base",
          previousValue: prevOpex,
          newValue: latestBaseline.realOpexAvgMonthly,
          origin: "REAL_ERP"
        });
      }

      const prevCash = activeScenario.budget.existingBankCashUsed.value;
      if (prevCash !== latestBaseline.realCashInBanks) {
        diffs.push({
          variablePath: "budget.existingBankCashUsed",
          variableName: "Efectivo en Bancos",
          previousValue: prevCash,
          newValue: latestBaseline.realCashInBanks,
          origin: "REAL_ERP"
        });
      }

      setPendingDiffs(diffs);
      setIsDiffModalOpen(true);
    } catch (err) {
      console.error("Error al contrastar con ERP:", err);
    } finally {
      setIsUpdatingFromErp(false);
    }
  };

  // Confirmar creación de nueva versión desde datos del ERP
  const handleConfirmUpdateFromErp = async () => {
    if (!companyId || !activeScenario) return;
    setIsUpdatingFromErp(true);
    try {
      const { updatedScenario } = await updateScenarioWithCurrentERPData(companyId, activeScenario);
      const updatedList = await listScenarios(companyId);
      setScenarios(updatedList);
      setActiveScenario(updatedScenario);
      setIsDiffModalOpen(false);
    } catch (err) {
      console.error("Error al generar versión actualizada:", err);
    } finally {
      setIsUpdatingFromErp(false);
    }
  };

  // Adoptar datos reales del ERP en el escenario actual
  const handleRestoreErpBaseline = () => {
    if (!baselineData) return;
    setActiveScenario(prev => {
      if (!prev) return null;
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      if (baselineData.realSalesAvgMonthly > 0) {
        copy.baseline.referenceMonthlySales.value = baselineData.realSalesAvgMonthly;
        copy.baseline.referenceMonthlySales.origin = 'REAL_ERP';
        copy.baseline.referenceMonthlySales.isOverridden = false;
      }
      if (baselineData.realOpexAvgMonthly > 0) {
        copy.baseline.referenceMonthlyOpex.value = baselineData.realOpexAvgMonthly;
        copy.baseline.referenceMonthlyOpex.origin = 'REAL_ERP';
        copy.baseline.referenceMonthlyOpex.isOverridden = false;
      }
      if (baselineData.realCashInBanks > 0) {
        copy.budget.existingBankCashUsed.value = baselineData.realCashInBanks;
        copy.budget.existingBankCashUsed.origin = 'REAL_ERP';
        copy.budget.existingBankCashUsed.isOverridden = false;
      }
      return copy;
    });
  };

  if (loading || !activeScenario || !simulationResult || !baselineResult) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-slate-600">
          Cargando fuentes del ERP y recalculando motor de simulación...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      {/* Cabecera de Control del Simulador */}
      <SimulatorHeader
        scenarios={scenarios}
        activeScenario={activeScenario}
        onSelectScenario={(id) => {
          const found = scenarios.find(s => s.id === id);
          if (found) setActiveScenario(found);
        }}
        onSaveScenario={handleSaveScenario}
        onDuplicateScenario={handleDuplicateScenario}
        onOpenUpdateModal={handleOpenUpdateModal}
        onNewScenario={handleNewScenario}
        onDeleteScenario={handleDeleteScenario}
        simulationResult={simulationResult}
        isSaving={isSaving}
      />

      {/* Navegación por Pestañas Especializadas */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm overflow-x-auto">
          <TabsList className="bg-transparent h-auto p-0 flex space-x-1 min-w-max">
            <TabsTrigger 
              value="cockpit" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500 data-[state=active]:text-white" />
              Simulador Ejecutivo (Cockpit)
            </TabsTrigger>

            <TabsTrigger 
              value="dashboard" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </TabsTrigger>

            <TabsTrigger 
              value="quality" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5" />
              Datos Reales & Calidad
            </TabsTrigger>

            <TabsTrigger 
              value="assumptions" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              Supuestos & Presupuesto
            </TabsTrigger>

            <TabsTrigger 
              value="production" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <Factory className="w-3.5 h-3.5" />
              Capacidad Fabricación
            </TabsTrigger>

            <TabsTrigger 
              value="stores" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <Store className="w-3.5 h-3.5" />
              Tiendas & Ecommerce
            </TabsTrigger>

            <TabsTrigger 
              value="import_retail" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <Ship className="w-3.5 h-3.5" />
              Importación & Retail
            </TabsTrigger>

            <TabsTrigger 
              value="financials" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              Estados Financieros
            </TabsTrigger>

            <TabsTrigger 
              value="comparison" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Comparador & Sensibilidad
            </TabsTrigger>

            <TabsTrigger 
              value="autonomy" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <Award className="w-3.5 h-3.5" />
              Autonomía & Venta (M&A)
            </TabsTrigger>

            <TabsTrigger 
              value="projected_vs_real" 
              className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm px-3.5 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 transition-all flex items-center gap-1.5"
            >
              <LineChart className="w-3.5 h-3.5" />
              Proyectado vs Real
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 0. Cockpit Ejecutivo (Vista Principal de Corridas Financieras) */}
        <TabsContent value="cockpit" className="m-0">
          {activeScenario && simulationResult ? (
            <ExecutiveCockpit 
              scenario={activeScenario} 
              result={simulationResult} 
              onUpdateScenario={(updater) => setActiveScenario(prev => prev ? updater(prev) : null)} 
            />
          ) : null}
        </TabsContent>

        {/* 1. Dashboard Tab */}
        <TabsContent value="dashboard" className="m-0">
          <DashboardTab scenario={activeScenario} result={simulationResult} />
        </TabsContent>

        {/* 2. Real Data & Quality Tab */}
        <TabsContent value="quality" className="m-0">
          <RealDataQualityTab 
            scenario={activeScenario} 
            baselineData={baselineData} 
            onRestoreErpBaseline={handleRestoreErpBaseline} 
          />
        </TabsContent>

        {/* 3. Assumptions Tab */}
        <TabsContent value="assumptions" className="m-0">
          <AssumptionsTab 
            scenario={activeScenario} 
            onUpdateScenario={(updater) => setActiveScenario(prev => prev ? updater(prev) : null)} 
          />
        </TabsContent>

        {/* 4. Production Tab */}
        <TabsContent value="production" className="m-0">
          <ProductionTab 
            scenario={activeScenario} 
            onUpdateScenario={(updater) => setActiveScenario(prev => prev ? updater(prev) : null)} 
          />
        </TabsContent>

        {/* 5. Stores & Ecommerce Tab */}
        <TabsContent value="stores" className="m-0">
          <StoresEcommerceTab 
            scenario={activeScenario} 
            onUpdateScenario={(updater) => setActiveScenario(prev => prev ? updater(prev) : null)} 
          />
        </TabsContent>

        {/* 6. Import & Retail Tab */}
        <TabsContent value="import_retail" className="m-0">
          <ImportRetailTab 
            scenario={activeScenario} 
            onUpdateScenario={(updater) => setActiveScenario(prev => prev ? updater(prev) : null)} 
          />
        </TabsContent>

        {/* 7. Financial Statements Tab */}
        <TabsContent value="financials" className="m-0">
          <FinancialStatementsTab result={simulationResult} />
        </TabsContent>

        {/* 8. Comparison Tab */}
        <TabsContent value="comparison" className="m-0">
          <ComparisonTab 
            currentScenario={activeScenario} 
            currentResult={simulationResult} 
            allScenarios={scenarios} 
            baselineResult={baselineResult} 
          />
        </TabsContent>

        {/* 9. Autonomy & Sale Readiness Tab */}
        <TabsContent value="autonomy" className="m-0">
          <AutonomySaleReadinessTab 
            scenario={activeScenario} 
            result={simulationResult} 
            onUpdateScenario={(updater) => setActiveScenario(prev => prev ? updater(prev) : null)} 
          />
        </TabsContent>

        {/* 10. Projected vs Real Tab */}
        <TabsContent value="projected_vs_real" className="m-0">
          <ProjectedVsRealTab 
            scenario={activeScenario} 
            result={simulationResult} 
            baselineData={baselineData} 
          />
        </TabsContent>
      </Tabs>

      {/* Modal de confirmación de diffs al actualizar con ERP */}
      <DiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        onConfirm={handleConfirmUpdateFromErp}
        diffs={pendingDiffs}
        isLoading={isUpdatingFromErp}
      />
    </div>
  );
}
