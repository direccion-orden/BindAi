"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

export interface DenominationCounts {
  "1000"?: number;
  "500"?: number;
  "200"?: number;
  "100"?: number;
  "50"?: number;
  "20"?: number;
  "10"?: number;
  "5"?: number;
  "2"?: number;
  "1"?: number;
  "0.5"?: number;
}

interface DenominationCaptureProps {
  onChange: (total: number, counts: DenominationCounts) => void;
  title?: string;
  autoFocus?: boolean;
}

export function DenominationCapture({ onChange, title = "Desglose de Efectivo", autoFocus }: DenominationCaptureProps) {
  const [counts, setCounts] = useState<DenominationCounts>({});

  const denominations = [
    { value: 1000, label: "$1000", isCoin: false },
    { value: 500, label: "$500", isCoin: false },
    { value: 200, label: "$200", isCoin: false },
    { value: 100, label: "$100", isCoin: false },
    { value: 50, label: "$50", isCoin: false },
    { value: 20, label: "$20", isCoin: false },
    { value: 10, label: "$10", isCoin: true },
    { value: 5, label: "$5", isCoin: true },
    { value: 2, label: "$2", isCoin: true },
    { value: 1, label: "$1", isCoin: true },
    { value: 0.5, label: "50¢", isCoin: true },
  ];

  useEffect(() => {
    let total = 0;
    for (const [key, qty] of Object.entries(counts)) {
      total += parseFloat(key) * (qty || 0);
    }
    onChange(total, counts);
  }, [counts]);

  const handleChange = (valStr: string, denomination: number) => {
    const qty = parseInt(valStr, 10);
    setCounts(prev => ({
      ...prev,
      [denomination.toString()]: isNaN(qty) ? 0 : qty
    }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const totalSum = Object.entries(counts).reduce((acc, [k, v]) => acc + parseFloat(k) * (v || 0), 0);

  return (
    <div className="bg-background rounded-lg border p-4 space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold text-sm text-muted-foreground">{title}</h4>
        <span className="text-lg font-bold text-primary">
          ${totalSum.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {denominations.map((d, idx) => (
          <div key={d.value} className="flex flex-col space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {d.label}
            </label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              className="h-8 text-sm"
              value={counts[d.value.toString() as keyof DenominationCounts] || ""}
              onChange={(e) => handleChange(e.target.value, d.value)}
              onFocus={handleFocus}
              autoFocus={autoFocus && idx === 0}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
