"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DataOriginBadge } from "./DataOriginBadge";
import { TrackedValue } from "@/types/strategicSimulation";

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  prefix?: string;
  suffix?: string;
  onChange: (val: number) => void;
  tracked?: TrackedValue<any>;
  onRestore?: () => void;
  formatValue?: (val: number) => string;
}

export function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  prefix = "",
  suffix = "",
  onChange,
  tracked,
  onRestore,
  formatValue
}: SliderControlProps) {
  const displayVal = formatValue 
    ? formatValue(value) 
    : `${prefix}${value.toLocaleString("es-MX")}${suffix}`;

  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className="space-y-1.5 py-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-slate-700 truncate" title={label}>
          {label}
        </Label>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {tracked && (
            <DataOriginBadge tracked={tracked} onRestore={onRestore} showRestoreButton={false} />
          )}
          <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 min-w-[54px] text-right">
            {displayVal}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 flex items-center">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
            style={{
              background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`
            }}
          />
        </div>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className="w-20 h-7 text-xs font-mono text-right p-1 bg-white border-slate-200"
        />
      </div>
    </div>
  );
}
