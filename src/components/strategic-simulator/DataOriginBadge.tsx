"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { TrackedValue, VariableOrigin } from "@/types/strategicSimulation";
import { Database, Calculator, UserCheck, Sparkles, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataOriginBadgeProps {
  tracked: TrackedValue<any>;
  onRestore?: () => void;
  showRestoreButton?: boolean;
}

export function DataOriginBadge({ tracked, onRestore, showRestoreButton = true }: DataOriginBadgeProps) {
  const getBadgeConfig = (origin: VariableOrigin) => {
    switch (origin) {
      case "REAL_ERP":
        return {
          label: "Real del ERP",
          className: "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200",
          icon: Database
        };
      case "CALCULATED_ERP":
        return {
          label: "Calculado ERP",
          className: "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200",
          icon: Calculator
        };
      case "USER_ASSUMPTION":
        return {
          label: "Supuesto de Usuario",
          className: "bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200",
          icon: UserCheck
        };
      case "ILLUSTRATIVE_ASSUMPTION":
        return {
          label: "Supuesto Ilustrativo",
          className: "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
          icon: Sparkles
        };
      case "MISSING_DATA":
        return {
          label: "Dato Faltante",
          className: "bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200",
          icon: AlertTriangle
        };
      default:
        return {
          label: "Estimado",
          className: "bg-slate-100 text-slate-800 border-slate-300",
          icon: UserCheck
        };
    }
  };

  const config = getBadgeConfig(tracked.origin);
  const Icon = config.icon;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <Badge 
        variant="outline" 
        className={`px-2 py-0.5 font-medium border flex items-center gap-1 ${config.className}`}
        title={tracked.notes || (tracked.formula ? `Fórmula: ${tracked.formula}` : undefined)}
      >
        <Icon className="w-3 h-3" />
        <span>{config.label}</span>
      </Badge>

      {tracked.isOverridden && (
        <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-300 text-[10px]">
          Modificado
        </Badge>
      )}

      {showRestoreButton && tracked.isOverridden && onRestore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRestore}
          className="h-5 px-1.5 text-[11px] text-slate-500 hover:text-slate-900"
          title={`Restaurar valor original del ERP: ${tracked.originalValue}`}
        >
          <RotateCcw className="w-2.5 h-2.5 mr-1" />
          Restaurar
        </Button>
      )}
    </div>
  );
}
