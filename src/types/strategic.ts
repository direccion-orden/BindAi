export type StrategyStatus = 'Planeada' | 'Activa' | 'En riesgo' | 'Completada' | 'Pausada' | 'Cancelada';
export type StrategicPriority = 'Alta' | 'Media' | 'Baja';
export type StrategyType = 
  | 'Crecimiento de ventas' 
  | 'Rentabilidad' 
  | 'Eficiencia operativa' 
  | 'Expansión' 
  | 'Marketing' 
  | 'Servicio al cliente' 
  | 'Productividad' 
  | 'Nuevos canales' 
  | 'Nuevos productos' 
  | 'Otro';

export interface StrategicVision {
  id: string;
  branchId?: string;
  name: string;
  description: string;
  strategicIntent: string;
  status: StrategyStatus;
  priority: StrategicPriority;
  ownerId: string;
  startDate: string;
  targetDate: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface Strategy {
  id: string;
  visionId: string;
  branchId?: string;
  name: string;
  description: string;
  objective: string;
  strategyType: StrategyType;
  status: StrategyStatus;
  priority: StrategicPriority;
  ownerId: string;
  startDate: string;
  targetDate: string;
  estimatedBudget: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface OKR {
  id: string;
  strategyId: string;
  name: string;
  description: string;
  metricName?: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  dueDate: string;
  progress: number;
  notes?: string;
  assignedToType: 'empresa' | 'linea_negocio' | 'sucursal';
  assignedToId?: string;
}

export type CommercialGoal = OKR;

export interface Tactic {
  id: string;
  strategyId: string;
  name: string;
  description: string;
  ownerId: string;
  status: StrategyStatus;
  priority: StrategicPriority;
  startDate: string;
  dueDate: string;
  estimatedCost: number;
  expectedImpact: string;
  progress: number;
}

export interface KPI {
  id: string;
  okrId: string; // Linked directly to OKR
  tacticId?: string; // Deprecated/fallback
  name: string;
  description: string;
  formula: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  frequency: 'Diaria' | 'Semanal' | 'Mensual' | 'Trimestral';
  dataSource: string;
  ownerId: string;
  statusColor: 'verde' | 'amarillo' | 'rojo';
  lastUpdatedAt: string;
}

export interface KPITrackingRecord {
  id: string;
  kpiId: string;
  measuredValue: number;
  measurementDate: string;
  notes: string;
  createdBy: string;
}

export interface StrategicComment {
  id: string;
  entityId: string; // Puede ser Strategy, Goal, Tactic o KPI
  entityType: 'strategy' | 'goal' | 'tactic' | 'kpi';
  text: string;
  ownerId: string;
  createdAt: string;
}
