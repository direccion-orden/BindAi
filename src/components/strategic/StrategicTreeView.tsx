"use client";

import React, { useState } from "react";
import { 
  Building2, 
  TrendingUp, 
  Target, 
  Activity, 
  ChevronRight, 
  ChevronDown,
  User,
  Calendar,
  AlertCircle,
  Plus,
  GitBranch,
  MapPin,
  Trophy,
  Gauge,
  Pencil
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  StrategicVision,
  Strategy, 
  OKR, 
  KPI, 
  StrategyStatus,
  StrategicPriority 
} from "@/types/strategic";
import { cn } from "@/lib/utils";
import { CreateStrategyModal } from "./CreateStrategyModal";
import { CreateGoalModal } from "./CreateGoalModal";
import { CreateKPIModal } from "./CreateKPIModal";
import { Button } from "@/components/ui/button";

interface StrategicTreeViewProps {
  businessLines: any[];
  branches: any[]; // locations
  visions: StrategicVision[];
  strategies: Strategy[];
  goals: OKR[];
  kpis: KPI[];
}

export const StrategicTreeView: React.FC<StrategicTreeViewProps> = ({
  businessLines,
  branches,
  visions,
  strategies,
  goals,
  kpis
}) => {
  // Modals state
  const [strategyModal, setStrategyModal] = useState<{ open: boolean; strategy?: Strategy }>({
    open: false,
    strategy: undefined
  });
  
  const [goalModal, setGoalModal] = useState<{ open: boolean; strategyId: string; strategyName: string; okr?: OKR }>({ 
    open: false, 
    strategyId: "", 
    strategyName: "", 
    okr: undefined 
  });
  
  const [kpiModal, setKpiModal] = useState<{ open: boolean; okrId: string; okrName: string; kpi?: KPI }>({ 
    open: false, 
    okrId: "", 
    okrName: "", 
    kpi: undefined 
  });

  const handleEditStrategy = (strategy: Strategy) => {
    setStrategyModal({ open: true, strategy });
  };

  const handleEditGoal = (okr: OKR) => {
    const parentStrat = strategies.find(s => s.id === okr.strategyId);
    setGoalModal({ 
      open: true, 
      strategyId: okr.strategyId, 
      strategyName: parentStrat?.name || "", 
      okr 
    });
  };

  const handleEditKPI = (kpi: KPI) => {
    const parentOkr = goals.find(g => g.id === kpi.okrId);
    setKpiModal({ 
      open: true, 
      okrId: kpi.okrId, 
      okrName: parentOkr?.name || "", 
      kpi 
    });
  };

  // Filter global visions and strategies (default to empresa)
  const globalVisions = visions.filter(v => !v.branchId || v.branchId === "empresa");
  const globalStrategies = strategies.filter(s => !s.branchId || s.branchId === "empresa");

  return (
    <div className="space-y-6 pb-20">
      {/* ================= SECCIÓN A: EMPRESA (GLOBAL) ================= */}
      <CompanyNode 
        visions={globalVisions}
        strategies={globalStrategies}
        goals={goals}
        kpis={kpis}
        onAddGoal={(id: string, name: string) => setGoalModal({ open: true, strategyId: id, strategyName: name })}
        onAddKPI={(id: string, name: string) => setKpiModal({ open: true, okrId: id, okrName: name })}
        onEditStrategy={handleEditStrategy}
        onEditGoal={handleEditGoal}
        onEditKPI={handleEditKPI}
      />

      {/* ================= SECCIÓN B: LÍNEAS DE NEGOCIO Y SUCURSALES ================= */}
      {businessLines.map((bl: any) => {
        // OKRs assigned directly to this business line
        const blGoals = goals.filter(g => g.assignedToType === "linea_negocio" && g.assignedToId === bl.id);
        
        // Locations (branches) under this business line
        const blBranches = branches.filter(b => b.businessLineId === bl.id);

        return (
          <BusinessLineNode 
            key={bl.id}
            businessLine={bl}
            goals={blGoals}
            branches={blBranches}
            allGoals={goals} // all OKRs for child location filtering
            kpis={kpis}
            strategies={strategies}
            onAddKPI={(id: string, name: string) => setKpiModal({ open: true, okrId: id, okrName: name })}
            onEditGoal={handleEditGoal}
            onEditKPI={handleEditKPI}
          />
        );
      })}

      {/* Modals for creating/editing strategies, objectives, and KPIs */}
      <CreateStrategyModal 
        isOpen={strategyModal.open}
        onClose={() => setStrategyModal({ open: false, strategy: undefined })}
        branches={branches}
        visions={visions}
        strategy={strategyModal.strategy}
      />
      <CreateGoalModal 
        isOpen={goalModal.open}
        onClose={() => setGoalModal({ ...goalModal, open: false, okr: undefined })}
        strategyId={goalModal.strategyId}
        strategyName={goalModal.strategyName}
        okr={goalModal.okr}
      />
      <CreateKPIModal 
        isOpen={kpiModal.open}
        onClose={() => setKpiModal({ ...kpiModal, open: false, kpi: undefined })}
        okrId={kpiModal.okrId}
        okrName={kpiModal.okrName}
        kpi={kpiModal.kpi}
      />
    </div>
  );
};

/* ================= COMPANY NODE (EMPRESA CORPO) ================= */
const CompanyNode = ({ visions, strategies, goals, kpis, onAddGoal, onAddKPI, onEditStrategy, onEditGoal, onEditKPI }: any) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border border-indigo-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div 
        className="bg-indigo-50/50 p-4 flex items-center justify-between cursor-pointer hover:bg-indigo-50 transition-colors border-b border-indigo-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-indigo-500" />}
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800">Corporativo (Nivel Empresa)</h3>
            <p className="text-[10px] text-slate-500">Misión, Visión global y Planificación Corporativa</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-indigo-200">
            {strategies.length} Estrategias
          </Badge>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4 bg-white">
          {visions.map((vision: StrategicVision) => {
            const visionStrategies = strategies.filter((s: Strategy) => s.visionId === vision.id);
            return (
              <div key={vision.id} className="border-l-2 border-indigo-100 pl-4 space-y-3 relative ml-2">
                <div className="absolute -left-[2px] top-4 w-4 h-2 border-b-2 border-indigo-100" />
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wide">Visión: {vision.name}</h4>
                    <Badge variant="outline" className="text-[9px] font-normal">{vision.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 italic">"{vision.description}"</p>
                </div>

                <div className="space-y-3 pl-4">
                  {visionStrategies.map((strategy: Strategy) => {
                    const strategyGoals = goals.filter((g: OKR) => g.strategyId === strategy.id && g.assignedToType === "empresa");
                    return (
                      <StrategyNode 
                        key={strategy.id} 
                        strategy={strategy} 
                        goals={strategyGoals}
                        kpis={kpis}
                        onAddGoal={onAddGoal}
                        onAddKPI={onAddKPI}
                        onEditStrategy={onEditStrategy}
                        onEditGoal={onEditGoal}
                        onEditKPI={onEditKPI}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Orphaned Strategies */}
          {strategies.filter((s: Strategy) => !s.visionId).map((strategy: Strategy) => {
            const strategyGoals = goals.filter((g: OKR) => g.strategyId === strategy.id && g.assignedToType === "empresa");
            return (
              <div key={strategy.id} className="ml-2 border-l-2 border-indigo-100 pl-4 relative">
                <div className="absolute -left-[2px] top-4 w-4 h-2 border-b-2 border-indigo-100" />
                <StrategyNode 
                  strategy={strategy} 
                  goals={strategyGoals}
                  kpis={kpis}
                  onAddGoal={onAddGoal}
                  onAddKPI={onAddKPI}
                  onEditStrategy={onEditStrategy}
                  onEditGoal={onEditGoal}
                  onEditKPI={onEditKPI}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ================= BUSINESS LINE NODE (LÍNEA DE NEGOCIO) ================= */
const BusinessLineNode = ({ businessLine, goals, branches, allGoals, kpis, strategies, onAddKPI, onEditGoal, onEditKPI }: any) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-emerald-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div 
        className="bg-emerald-50/50 p-4 flex items-center justify-between cursor-pointer hover:bg-emerald-50 transition-colors border-b border-emerald-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-emerald-600" /> : <ChevronRight className="w-4 h-4 text-emerald-600" />}
          <div className="bg-emerald-600 p-2 rounded-lg text-white">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800">Línea de Negocio: {businessLine.name}</h3>
            <p className="text-[10px] text-slate-500">Objetivos tácticos de división y sus sucursales</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
            {goals.length} OKRs
          </Badge>
          <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
            {branches.length} Sucursales
          </Badge>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-6 bg-slate-50/20">
          {/* OKRs Assigned directly to this Business Line */}
          {goals.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5 ml-2">
                <Trophy className="w-3.5 h-3.5" />
                Objetivos de la División (OKR)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-2">
                {goals.map((okr: OKR) => (
                  <OKRCard 
                    key={okr.id} 
                    okr={okr} 
                    kpis={kpis.filter((k: KPI) => k.okrId === okr.id)} 
                    strategies={strategies}
                    onAddKPI={onAddKPI}
                    onEditGoal={onEditGoal}
                    onEditKPI={onEditKPI}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Locations / Branches level */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-2">
              <MapPin className="w-3.5 h-3.5" />
              Desglose por Sucursal
            </h4>
            <div className="space-y-4 pl-2">
              {branches.map((branch: any) => {
                const branchGoals = allGoals.filter((g: OKR) => g.assignedToType === "sucursal" && g.assignedToId === branch.id);
                return (
                  <LocationNode 
                    key={branch.id} 
                    branch={branch} 
                    goals={branchGoals} 
                    kpis={kpis} 
                    strategies={strategies}
                    onAddKPI={onAddKPI}
                    onEditGoal={onEditGoal}
                    onEditKPI={onEditKPI}
                  />
                );
              })}
              {branches.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 bg-white border border-dashed rounded-lg">
                  No hay sucursales asociadas a esta línea de negocio.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ================= LOCATION NODE (SUCURSAL) ================= */
const LocationNode = ({ branch, goals, kpis, strategies, onAddKPI, onEditGoal, onEditKPI }: any) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden bg-white shadow-sm ml-2">
      <div 
        className="bg-slate-50/50 p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-100"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
          <MapPin className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-xs font-bold text-slate-800">{branch.name || branch.Name || branch.id}</span>
        </div>
        <Badge variant="outline" className="text-[10px] py-0 font-semibold bg-white">
          {goals.length} OKRs
        </Badge>
      </div>

      {isExpanded && (
        <div className="p-3 bg-white grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((okr: OKR) => (
            <OKRCard 
              key={okr.id} 
              okr={okr} 
              kpis={kpis.filter((k: KPI) => k.okrId === okr.id)} 
              strategies={strategies}
              onAddKPI={onAddKPI}
              onEditGoal={onEditGoal}
              onEditKPI={onEditKPI}
            />
          ))}
          {goals.length === 0 && (
            <div className="col-span-full py-4 text-center text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-dashed">
              Sin objetivos OKR activos en esta sucursal.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ================= STRATEGY NODE (ESTRATEGIA CARD) ================= */
const StrategyNode = ({ strategy, goals, kpis, onAddGoal, onAddKPI, onEditStrategy, onEditGoal, onEditKPI }: any) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-slate-50/20 border border-slate-200 rounded-lg overflow-hidden shadow-sm">
      <div 
        className="p-3 bg-slate-100/50 flex items-center justify-between border-b border-slate-200/50 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-600" />
          <div>
            <h5 className="text-xs font-bold text-slate-800">{strategy.name}</h5>
            <p className="text-[10px] text-slate-400 line-clamp-1">Objetivo: {strategy.objective}</p>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 bg-white border border-slate-200"
            onClick={() => onEditStrategy(strategy)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-[10px] text-indigo-600 hover:bg-indigo-50 border border-indigo-100 bg-white font-semibold"
            onClick={() => onAddGoal(strategy.id, strategy.name)}
          >
            <Plus className="w-3 h-3 mr-1" />
            OKR
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goals.map((okr: OKR) => (
              <OKRCard 
                key={okr.id} 
                okr={okr} 
                kpis={kpis.filter((k: KPI) => k.okrId === okr.id)} 
                strategies={[strategy]}
                onAddKPI={onAddKPI}
                onEditGoal={onEditGoal}
                onEditKPI={onEditKPI}
              />
            ))}
            {goals.length === 0 && (
              <div className="col-span-full py-4 text-center text-xs text-slate-400 italic">
                No hay objetivos clave (OKR) definidos a nivel empresa para esta estrategia.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ================= OKR CARD (OBJETIVO DETALLADO) ================= */
const OKRCard = ({ okr, kpis, strategies, onAddKPI, onEditGoal, onEditKPI }: any) => {
  const parentStrat = strategies.find((s: Strategy) => s.id === okr.strategyId);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
      {/* Card Body */}
      <div className="p-4 space-y-3">
        <div className="flex justify-between items-start gap-2">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className="text-[8px] bg-slate-100 text-slate-600 hover:bg-slate-100 py-0 uppercase border border-slate-200">
                {okr.assignedToType === "empresa" ? "Empresa" : okr.assignedToType === "linea_negocio" ? "Línea de Negocio" : "Sucursal"}
              </Badge>
              {parentStrat && (
                <Badge variant="outline" className="text-[8px] text-indigo-600 border-indigo-100 py-0 line-clamp-1 bg-indigo-50/20">
                  Estr: {parentStrat.name}
                </Badge>
              )}
            </div>
            <h6 className="text-sm font-bold text-slate-800 mt-1">{okr.name}</h6>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 border border-transparent"
              onClick={() => onEditGoal(okr)}
            >
              <Pencil className="w-3 h-3" />
            </Button>
            <span className="text-sm font-black text-indigo-600">{okr.progress || 0}%</span>
          </div>
        </div>

        {/* Quantitative Target progress */}
        <div className="space-y-1">
          <Progress value={okr.progress || 0} className="h-1.5 bg-indigo-50" />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Meta: {okr.currentValue?.toLocaleString()} / {okr.targetValue?.toLocaleString()} {okr.unit}</span>
            <span>Vence: {okr.dueDate ? new Date(okr.dueDate).toLocaleDateString() : "Sin fecha"}</span>
          </div>
        </div>

        {/* Description */}
        {okr.description && (
          <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100/50">
            {okr.description}
          </p>
        )}
      </div>

      {/* KPIs Section */}
      <div className="border-t border-slate-100 bg-slate-50/50 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Gauge className="w-3.5 h-3.5" />
            KPIs Asociados ({kpis.length})
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-[9px] text-indigo-600 hover:bg-indigo-50 px-2 font-semibold"
            onClick={() => onAddKPI(okr.id, okr.name)}
          >
            <Plus className="w-2.5 h-2.5 mr-1" />
            KPI
          </Button>
        </div>

        <div className="space-y-2">
          {kpis.map((kpi: KPI) => (
            <div key={kpi.id} className="bg-white p-2 rounded-lg border border-slate-200/50 shadow-sm flex items-center justify-between gap-3 group relative">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-700 truncate">{kpi.name}</span>
                </div>
                <p className="text-[9px] text-slate-400 truncate">{kpi.formula}</p>
                <div className="text-[10px] font-extrabold text-indigo-950 mt-0.5">
                  {kpi.currentValue} / {kpi.targetValue} <span className="text-[8px] font-normal text-slate-400">{kpi.unit}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity border border-transparent"
                  onClick={() => onEditKPI(kpi)}
                >
                  <Pencil className="w-2.5 h-2.5" />
                </Button>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  kpi.statusColor === 'verde' ? 'bg-green-500' : 
                  kpi.statusColor === 'amarillo' ? 'bg-yellow-500' : 'bg-red-500'
                )} />
              </div>
            </div>
          ))}
          {kpis.length === 0 && (
            <div className="text-center text-[9px] text-slate-400 italic py-1">
              Sin KPIs asociados. Crea uno para medir este objetivo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
