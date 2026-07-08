"use client";

import React, { useState } from "react";
import { 
  Building2, 
  TrendingUp, 
  Target, 
  ListTodo, 
  Activity, 
  ChevronRight, 
  ChevronDown,
  User,
  Calendar,
  AlertCircle
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  StrategicVision,
  Strategy, 
  CommercialGoal, 
  Tactic, 
  KPI, 
  StrategyStatus 
} from "@/types/strategic";
import { cn } from "@/lib/utils";
import { CreateGoalModal } from "./CreateGoalModal";
import { CreateTacticModal } from "./CreateTacticModal";
import { CreateKPIModal } from "./CreateKPIModal";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface StrategicTreeViewProps {
  branches: any[];
  visions: StrategicVision[];
  strategies: Strategy[];
  goals: CommercialGoal[];
  tactics: Tactic[];
  kpis: KPI[];
}

export const StrategicTreeView: React.FC<StrategicTreeViewProps> = ({
  branches,
  visions,
  strategies,
  goals,
  tactics,
  kpis
}) => {
  // Global modal state to avoid multiple instances
  const [goalModal, setGoalModal] = useState<{ open: boolean; strategyId: string; strategyName: string }>({ open: false, strategyId: "", strategyName: "" });
  const [tacticModal, setTacticModal] = useState<{ open: boolean; strategyId: string; strategyName: string }>({ open: false, strategyId: "", strategyName: "" });
  const [kpiModal, setKpiModal] = useState<{ open: boolean; tacticId: string; tacticName: string }>({ open: false, tacticId: "", tacticName: "" });

  return (
    <div className="space-y-4 pb-20">
      {branches.map((branch: any) => {
        const branchVisions = visions.filter((v: StrategicVision) => v.branchId === branch.id);
        const branchStrategies = strategies.filter((s: Strategy) => s.branchId === branch.id);
        
        if (branchVisions.length === 0 && branchStrategies.length === 0) return null;

        return (
          <BranchNode 
            key={branch.id} 
            branch={branch} 
            visions={branchVisions}
            strategies={branchStrategies}
            goals={goals}
            tactics={tactics}
            kpis={kpis}
            onAddGoal={(id: string, name: string) => setGoalModal({ open: true, strategyId: id, strategyName: name })}
            onAddTactic={(id: string, name: string) => setTacticModal({ open: true, strategyId: id, strategyName: name })}
            onAddKPI={(id: string, name: string) => setKpiModal({ open: true, tacticId: id, tacticName: name })}
          />
        );
      })}

      {/* Shared Modals */}
      <CreateGoalModal 
        isOpen={goalModal.open}
        onClose={() => setGoalModal({ ...goalModal, open: false })}
        strategyId={goalModal.strategyId}
        strategyName={goalModal.strategyName}
      />
      <CreateTacticModal 
        isOpen={tacticModal.open}
        onClose={() => setTacticModal({ ...tacticModal, open: false })}
        strategyId={tacticModal.strategyId}
        strategyName={tacticModal.strategyName}
      />
      <CreateKPIModal 
        isOpen={kpiModal.open}
        onClose={() => setKpiModal({ ...kpiModal, open: false })}
        tacticId={kpiModal.tacticId}
        tacticName={kpiModal.tacticName}
      />
    </div>
  );
};

const BranchNode = ({ branch, visions, strategies, goals, tactics, kpis, onAddGoal, onAddTactic, onAddKPI }: any) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Calculate Branch Progress (average of visions or strategies)
  const branchProgress = visions.length > 0 
    ? Math.round(visions.reduce((acc: number, v: any) => acc + (v.progress || 0), 0) / visions.length)
    : strategies.length > 0
      ? Math.round(strategies.reduce((acc: number, s: any) => acc + (s.progress || 0), 0) / strategies.length)
      : 0;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <div 
        className="bg-slate-50 p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Building2 className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-slate-800">{branch.name || branch.Name || branch.id}</h3>
          <Badge variant="secondary" className="bg-white border-slate-200 text-slate-600">
            {visions.length} Visiones
          </Badge>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Avance Sucursal</span>
            <div className="flex items-center gap-3">
              <Progress value={branchProgress} className="w-32 h-2" />
              <span className="text-sm font-black text-slate-700">{branchProgress}%</span>
            </div>
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4 space-y-4 bg-white">
          {/* Visions */}
          {visions.map((vision: StrategicVision) => (
            <VisionNode 
              key={vision.id} 
              vision={vision}
              strategies={strategies.filter((s: Strategy) => s.visionId === vision.id)}
              goals={goals}
              tactics={tactics}
              kpis={kpis}
              onAddGoal={onAddGoal}
              onAddTactic={onAddTactic}
              onAddKPI={onAddKPI}
            />
          ))}

          {/* Legacy/Orphaned Strategies (No Vision) */}
          {strategies.filter((s: Strategy) => !s.visionId).length > 0 && (
            <div className="space-y-4 pt-4 border-t border-dashed border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Estrategias sin Visión asignada</h4>
              {strategies.filter((s: Strategy) => !s.visionId).map((strategy: Strategy) => (
                <StrategyNode 
                  key={strategy.id} 
                  strategy={strategy} 
                  goals={goals.filter((g: CommercialGoal) => g.strategyId === strategy.id)}
                  tactics={tactics.filter((t: Tactic) => t.strategyId === strategy.id)}
                  kpis={kpis}
                  onAddGoal={onAddGoal}
                  onAddTactic={onAddTactic}
                  onAddKPI={onAddKPI}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const VisionNode = ({ vision, strategies, goals, tactics, kpis, onAddGoal, onAddTactic, onAddKPI }: any) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="ml-4 border-l-2 border-slate-100 pl-6 relative">
      <div className="absolute -left-[2px] top-4 w-4 h-2 border-b-2 border-slate-100" />
      
      <div className="bg-slate-50/50 border border-slate-200 rounded-xl overflow-hidden">
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-100/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-4">
            <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                Visión: {vision.name}
                <Badge variant="outline" className="text-[10px] py-0 font-normal">
                  {vision.status}
                </Badge>
              </h4>
              <p className="text-xs text-slate-500 line-clamp-1 italic">"{vision.strategicIntent}"</p>
            </div>
          </div>
          <div className="flex items-center gap-8">
             <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Avance Visión</span>
              <div className="flex items-center gap-2">
                <Progress value={vision.progress || 0} className="w-24 h-1.5" />
                <span className="text-xs font-bold">{Math.round(vision.progress || 0)}%</span>
              </div>
            </div>
            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
          </div>
        </div>

        {isExpanded && (
          <div className="p-4 space-y-4 bg-white/50">
            {strategies.map((strategy: Strategy) => (
              <StrategyNode 
                key={strategy.id} 
                strategy={strategy} 
                goals={goals.filter((g: CommercialGoal) => g.strategyId === strategy.id)}
                tactics={tactics.filter((t: Tactic) => t.strategyId === strategy.id)}
                kpis={kpis}
                onAddGoal={onAddGoal}
                onAddTactic={onAddTactic}
                onAddKPI={onAddKPI}
              />
            ))}
            {strategies.length === 0 && (
              <div className="flex items-center gap-2 p-3 text-xs text-amber-600 bg-amber-50 rounded-lg border border-amber-100">
                <AlertCircle className="w-4 h-4" />
                Esta visión aún no tiene estrategias asociadas.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const StrategyNode = ({ strategy, goals, tactics, kpis, onAddGoal, onAddTactic, onAddKPI }: any) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusColor = (status: StrategyStatus) => {
    switch (status) {
      case 'Activa': return 'text-green-600 bg-green-50 border-green-200';
      case 'En riesgo': return 'text-red-600 bg-red-50 border-red-200';
      case 'Planeada': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="ml-4 border-l-2 border-indigo-100 pl-6 relative">
      <div className="absolute -left-[2px] top-4 w-4 h-2 border-b-2 border-indigo-100" />
      
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-4">
            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-800">{strategy.name}</h4>
                <Badge className={cn("text-[10px] py-0", getStatusColor(strategy.status))}>
                  {strategy.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 line-clamp-1">{strategy.objective}</p>
            </div>
          </div>
          <div className="flex items-center gap-8">
             <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Progreso</span>
              <div className="flex items-center gap-2">
                <Progress value={strategy.progress} className="w-24 h-1.5" />
                <span className="text-xs font-bold">{strategy.progress}%</span>
              </div>
            </div>
            {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
          </div>
        </div>

        {isExpanded && (
          <div className="border-t border-slate-100 p-4 space-y-6 bg-slate-50/30">
            {/* Metas Comerciales Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-indigo-600">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  <h5 className="text-xs font-bold uppercase tracking-wider">Metas Comerciales</h5>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] hover:bg-indigo-100 hover:text-indigo-700"
                  onClick={(e) => { e.stopPropagation(); onAddGoal(strategy.id, strategy.name); }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Agregar Meta
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {goals.map((goal: CommercialGoal) => (
                  <div key={goal.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-slate-700">{goal.name}</span>
                      <span className="text-xs font-black text-indigo-600">{goal.progress}%</span>
                    </div>
                    <Progress value={goal.progress} className="h-1.5 mb-2" />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>{goal.currentValue.toLocaleString()} / {goal.targetValue.toLocaleString()} {goal.unit}</span>
                      <span>Vence: {new Date(goal.dueDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {goals.length === 0 && (
                  <div className="col-span-full py-4 text-center text-xs text-slate-400 bg-white/50 rounded-xl border border-dashed border-slate-200">
                    No hay metas comerciales definidas.
                  </div>
                )}
              </div>
            </div>

            {/* Tácticas Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 text-purple-600">
                <div className="flex items-center gap-2">
                  <ListTodo className="w-4 h-4" />
                  <h5 className="text-xs font-bold uppercase tracking-wider">Tácticas Operativas</h5>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] hover:bg-purple-100 hover:text-purple-700"
                  onClick={(e) => { e.stopPropagation(); onAddTactic(strategy.id, strategy.name); }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Agregar Táctica
                </Button>
              </div>
              <div className="space-y-4">
                {tactics.map((tactic: Tactic) => (
                  <TacticNode 
                    key={tactic.id} 
                    tactic={tactic} 
                    kpis={kpis.filter((k: KPI) => k.tacticId === tactic.id)} 
                    onAddKPI={onAddKPI}
                  />
                ))}
                 {tactics.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400 bg-white/50 rounded-xl border border-dashed border-slate-200">
                    No hay tácticas operativas definidas.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TacticNode = ({ tactic, kpis, onAddKPI }: any) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
            <ListTodo className="w-4 h-4" />
          </div>
          <div>
            <h6 className="text-sm font-bold text-slate-800">{tactic.name}</h6>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <User className="w-3 h-3" />
                {tactic.ownerId}
              </div>
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Calendar className="w-3 h-3" />
                Vence: {new Date(tactic.dueDate).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-[10px] text-slate-500 hover:bg-slate-100"
            onClick={(e) => { e.stopPropagation(); onAddKPI(tactic.id, tactic.name); }}
          >
            <Plus className="w-3 h-3 mr-1" />
            KPI
          </Button>
          <Badge variant="outline" className="text-[10px] h-5">{tactic.status}</Badge>
          <div className="w-24">
            <Progress value={tactic.progress} className="h-1.5" />
          </div>
        </div>
      </div>
      
      {/* KPIs Grid */}
      <div className="p-3 bg-slate-50/50 grid grid-cols-1 md:grid-cols-3 gap-3">
        {kpis.map((kpi: KPI) => (
          <div key={kpi.id} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Activity className="w-3 h-3 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">{kpi.name}</span>
              </div>
              <div className="text-xs font-black text-slate-800">
                {kpi.currentValue} / {kpi.targetValue} <span className="text-[10px] font-normal text-slate-400 uppercase">{kpi.unit}</span>
              </div>
            </div>
            <div className={cn(
              "w-2.5 h-2.5 rounded-full shadow-sm animate-pulse",
              kpi.statusColor === 'verde' ? 'bg-green-500 shadow-green-200' : 
              kpi.statusColor === 'amarillo' ? 'bg-yellow-500 shadow-yellow-200' : 'bg-red-500 shadow-red-200'
            )} />
          </div>
        ))}
        {kpis.length === 0 && (
          <div className="col-span-full py-2 text-center text-[10px] text-slate-400 italic">
            No hay KPIs definidos para esta táctica.
          </div>
        )}
      </div>
    </div>
  );
};
