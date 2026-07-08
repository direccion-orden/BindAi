"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { 
  TrendingUp, 
  Target, 
  ListTodo, 
  Activity, 
  Plus, 
  Search, 
  Filter, 
  LayoutDashboard, 
  GitGraph, 
  Columns3, 
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  Building2,
  User,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  MoreVertical,
  ArrowRight,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  StrategicVision,
  Strategy, 
  CommercialGoal, 
  Tactic, 
  KPI, 
  StrategyStatus, 
  StrategicPriority 
} from "@/types/strategic";
import { StrategicTreeView } from "@/components/strategic/StrategicTreeView";
import { CreateStrategyModal } from "@/components/strategic/CreateStrategyModal";
import { CreateVisionModal } from "@/components/strategic/CreateVisionModal";

export default function PlaneacionEstrategicaPage() {
  const { companyId } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  
  // Modals State
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [isVisionModalOpen, setIsVisionModalOpen] = useState(false);
  
  // Data State
  const [branches, setBranches] = useState<any[]>([]);
  const [visions, setVisions] = useState<StrategicVision[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [goals, setGoals] = useState<CommercialGoal[]>([]);
  const [tactics, setTactics] = useState<Tactic[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  useEffect(() => {
    if (!companyId) return;

    setLoading(true);

    // Fetch Branches
    const unsubBranches = onSnapshot(
      collection(db, "companies", companyId, "locations"),
      (snap) => {
        setBranches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    // Fetch Visions
    const unsubVisions = onSnapshot(
      query(collection(db, "companies", companyId, "strategic_visions"), orderBy("createdAt", "desc")),
      (snap) => {
        setVisions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StrategicVision)));
      }
    );

    // Fetch Strategies
    const unsubStrategies = onSnapshot(
      query(collection(db, "companies", companyId, "strategic_strategies"), orderBy("createdAt", "desc")),
      (snap) => {
        setStrategies(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Strategy)));
      }
    );

    // Fetch Goals
    const unsubGoals = onSnapshot(
      collection(db, "companies", companyId, "strategic_goals"),
      (snap) => {
        setGoals(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CommercialGoal)));
      }
    );

    // Fetch Tactics
    const unsubTactics = onSnapshot(
      collection(db, "companies", companyId, "strategic_tactics"),
      (snap) => {
        setTactics(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tactic)));
      }
    );

    // Fetch KPIs
    const unsubKpis = onSnapshot(
      collection(db, "companies", companyId, "strategic_kpis"),
      (snap) => {
        setKpis(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as KPI)));
        setLoading(false);
      }
    );

    return () => {
      unsubBranches();
      unsubVisions();
      unsubStrategies();
      unsubGoals();
      unsubTactics();
      unsubKpis();
    };
  }, [companyId]);

  // Update vision progress based on strategies
  useEffect(() => {
    if (!companyId || visions.length === 0 || strategies.length === 0) return;

    visions.forEach(async (vision) => {
      const visionStrategies = strategies.filter((s: Strategy) => s.visionId === vision.id);
      if (visionStrategies.length === 0) return;

      const avgProgress = visionStrategies.reduce((acc: number, s: Strategy) => acc + (s.progress || 0), 0) / visionStrategies.length;
      
      // Only update if it changed significantly
      if (Math.abs((vision.progress || 0) - avgProgress) > 0.1) {
        try {
          const { doc, updateDoc } = await import("firebase/firestore");
          await updateDoc(doc(db, "companies", companyId, "strategic_visions", vision.id), {
            progress: avgProgress,
            updatedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error("Error updating vision progress:", error);
        }
      }
    });
  }, [strategies, visions, companyId]);

  const getStatusColor = (status: StrategyStatus) => {
    switch (status) {
      case 'Activa': return 'bg-green-100 text-green-700 border-green-200';
      case 'Planeada': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'En riesgo': return 'bg-red-100 text-red-700 border-red-200';
      case 'Completada': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'Pausada': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Cancelada': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityBadge = (priority: StrategicPriority) => {
    switch (priority) {
      case 'Alta': return <Badge variant="destructive">Alta</Badge>;
      case 'Media': return <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">Media</Badge>;
      case 'Baja': return <Badge variant="secondary">Baja</Badge>;
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-8 h-8 text-indigo-600" />
            Planeación Estratégica
          </h1>
          <p className="text-slate-500 mt-1">
            Define y gestiona el crecimiento estratégico de tus sucursales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            onClick={() => setIsVisionModalOpen(true)}
          >
            <Target className="w-4 h-4 mr-2" />
            Nueva Visión
          </Button>
          <Button 
            className="bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
            onClick={() => setIsStrategyModalOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Estrategia
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="dashboard" className="w-full" onValueChange={setActiveTab}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
          <TabsList className="bg-slate-100 p-1">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-white">
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="hierarchy" className="data-[state=active]:bg-white">
              <GitGraph className="w-4 h-4 mr-2" />
              Jerarquía
            </TabsTrigger>
            <TabsTrigger value="kanban" className="data-[state=active]:bg-white">
              <Columns3 className="w-4 h-4 mr-2" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="table" className="data-[state=active]:bg-white">
              <TableIcon className="w-4 h-4 mr-2" />
              Tabla
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Buscar estrategia..." 
                className="pl-9 bg-white border-slate-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="bg-white">
                  <Filter className="w-4 h-4 text-slate-600" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="p-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sucursal</div>
                <DropdownMenuItem onClick={() => setSelectedBranch("all")}>Todas</DropdownMenuItem>
                {branches.map((b: any) => (
                  <DropdownMenuItem key={b.id} onClick={() => setSelectedBranch(b.id)}>{b.name || b.Name || b.id}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <TabsContent value="dashboard" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Resumen General */}
            <Card className="md:col-span-3 bg-gradient-to-r from-indigo-500 to-purple-600 border-none text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                <TrendingUp className="w-48 h-48" />
              </div>
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-2xl font-bold">Estado de la Estrategia Global</h2>
                    <p className="text-indigo-100 mt-1">Avance consolidado de todas las sucursales activas.</p>
                    <div className="mt-6 flex items-center gap-8">
                      <div>
                        <div className="text-4xl font-black">74%</div>
                        <div className="text-xs text-indigo-100 uppercase mt-1">Avance Promedio</div>
                      </div>
                      <div className="h-12 w-[1px] bg-white/20" />
                      <div>
                        <div className="text-4xl font-black">{strategies.length}</div>
                        <div className="text-xs text-indigo-100 uppercase mt-1">Estrategias</div>
                      </div>
                      <div className="h-12 w-[1px] bg-white/20" />
                      <div>
                        <div className="text-4xl font-black">{kpis.filter((k: KPI) => k.statusColor === 'rojo').length}</div>
                        <div className="text-xs text-indigo-100 uppercase mt-1">KPIs en Riesgo</div>
                      </div>
                    </div>
                  </div>
                  <div className="w-full md:w-72 space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>Progreso Objetivo</span>
                      <span>74%</span>
                    </div>
                    <Progress value={74} className="h-3 bg-white/20" indicatorClassName="bg-white" />
                    <p className="text-[10px] text-indigo-100 text-right">Actualizado hace 2 horas</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Listado de Sucursales y sus Estrategias */}
            {branches.map(branch => {
              const branchVisions = visions.filter((v: StrategicVision) => v.branchId === branch.id);
              const branchStrategies = strategies.filter((s: Strategy) => s.branchId === branch.id);
              
              if (branchVisions.length === 0 && branchStrategies.length === 0 && selectedBranch !== "all" && selectedBranch !== branch.id) return null;
              if (selectedBranch !== "all" && branch.id !== selectedBranch) return null;

              const avgBranchProgress = branchVisions.length > 0
                ? branchVisions.reduce((acc: number, v: StrategicVision) => acc + (v.progress || 0), 0) / branchVisions.length
                : branchStrategies.length > 0
                  ? branchStrategies.reduce((acc: number, s: Strategy) => acc + (s.progress || 0), 0) / branchStrategies.length
                  : 0;

              return (
                <Card key={branch.id} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="bg-indigo-100 p-2 rounded-lg">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                      </div>
                      <CardTitle className="text-lg font-bold">{branch.name || branch.Name || branch.id}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-2">
                      <span>Visiones: {branchVisions.length}</span>
                      <span>Avance: {Math.round(avgBranchProgress)}%</span>
                    </div>
                    
                    <div className="space-y-3">
                      {branchVisions.slice(0, 2).map(vision => (
                        <div key={vision.id} className="p-3 bg-indigo-50/30 rounded-xl border border-indigo-100">
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-2">
                              <Target className="w-3 h-3 text-indigo-600" />
                              <h4 className="text-xs font-bold text-slate-700 truncate pr-2">{vision.name}</h4>
                            </div>
                            <span className="text-[10px] font-black text-indigo-600">{Math.round(vision.progress || 0)}%</span>
                          </div>
                          <Progress value={vision.progress} className="h-1 mb-1" />
                        </div>
                      ))}
                      {branchVisions.length === 0 && branchStrategies.length > 0 && (
                        <p className="text-[10px] text-amber-600 italic">Estrategias sin visión asignada ({branchStrategies.length})</p>
                      )}
                      {branchVisions.length === 0 && branchStrategies.length === 0 && (
                        <div className="text-center py-8 text-slate-400 italic text-xs">
                          Sin actividad estratégica.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="hierarchy" className="mt-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <StrategicTreeView 
              branches={branches}
              visions={visions}
              strategies={strategies}
              goals={goals}
              tactics={tactics}
              kpis={kpis}
            />
          )}
        </TabsContent>

        <TabsContent value="kanban" className="mt-0">
          <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
            {['Planeada', 'Activa', 'En riesgo', 'Pausada', 'Completada'].map(status => (
              <div key={status} className="flex-shrink-0 w-80 space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <div className={"w-2 h-2 rounded-full " + (
                      status === 'Activa' ? 'bg-green-500' : 
                      status === 'En riesgo' ? 'bg-red-500' : 
                      status === 'Completada' ? 'bg-gray-500' :
                      status === 'Planeada' ? 'bg-blue-500' : 'bg-yellow-500'
                    )} />
                    {status}
                  </h3>
                  <Badge variant="secondary" className="bg-slate-200">{strategies.filter(s => s.status === status).length}</Badge>
                </div>
                <div className="space-y-3">
                  {strategies.filter(s => s.status === status).map(strategy => (
                    <Card key={strategy.id} className="cursor-grab hover:border-indigo-300 transition-colors shadow-sm">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          {getPriorityBadge(strategy.priority)}
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {branches.find(b => b.id === strategy.branchId)?.name || branches.find(b => b.id === strategy.branchId)?.Name}
                          </div>
                        </div>
                        <h4 className="font-bold text-sm text-slate-800 leading-tight">{strategy.name}</h4>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>Avance</span>
                            <span>{strategy.progress}%</span>
                          </div>
                          <Progress value={strategy.progress} className="h-1.5" />
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <div className="flex -space-x-2">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center">
                              <User className="w-3 h-3 text-indigo-600" />
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(strategy.targetDate).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="table" className="mt-0">
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Estrategia</th>
                      <th className="px-6 py-4">Sucursal</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Prioridad</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4">Avance</th>
                      <th className="px-6 py-4">Vence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {strategies
                      .filter(s => (selectedBranch === "all" || s.branchId === selectedBranch))
                      .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(strategy => (
                        <tr key={strategy.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">{strategy.name}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{strategy.objective}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline" className="font-normal bg-white">
                              {branches.find(b => b.id === strategy.branchId)?.name || branches.find(b => b.id === strategy.branchId)?.Name}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{strategy.strategyType}</td>
                          <td className="px-6 py-4">{getPriorityBadge(strategy.priority)}</td>
                          <td className="px-6 py-4">
                            <Badge className={getStatusColor(strategy.status) + " text-[10px]"}>
                              {strategy.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Progress value={strategy.progress} className="w-16 h-1.5" />
                              <span className="text-[10px] font-bold">{strategy.progress}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-mono text-[10px]">
                            {new Date(strategy.targetDate).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    {strategies.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-20 text-center text-slate-400 italic">
                          No se encontraron estrategias que coincidan con los filtros.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <CreateVisionModal 
        isOpen={isVisionModalOpen}
        onClose={() => setIsVisionModalOpen(false)}
        branches={branches}
      />
      <CreateStrategyModal 
        isOpen={isStrategyModalOpen}
        onClose={() => setIsStrategyModalOpen(false)}
        branches={branches}
        visions={visions}
      />
    </div>
  );
}
