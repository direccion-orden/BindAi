"use client";

import React, { useState } from "react";
import { doc, collection, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Settings2, X } from "lucide-react";
import { BankTransaction } from "@/types/bank";

interface AdjustmentModalProps {
  accountId: string;
  onClose: () => void;
}

export function AdjustmentModal({ accountId, onClose }: AdjustmentModalProps) {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [concept, setConcept] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE">("INCOME");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !accountId) return;
    
    const amountNum = parseFloat(amountStr);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Ingrese un monto válido mayor a cero.");
      return;
    }

    setLoading(true);
    try {
      const finalAmount = type === "INCOME" ? amountNum : -amountNum;
      
      const newTxRef = doc(collection(db, "companies", companyId, "bankAccounts", accountId, "transactions"));
      
      const tx: BankTransaction = {
        id: newTxRef.id,
        date,
        concept: concept.trim() || "Ajuste manual",
        reference: "AJUSTE",
        amount: finalAmount,
        type: "ADJUSTMENT",
        createdAt: Date.now()
      };

      await setDoc(newTxRef, tx);
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error al registrar el ajuste.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b bg-muted/20">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            Ajuste Manual
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Ajuste</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value as any)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="INCOME">Abono (+)</option>
                <option value="EXPENSE">Cargo (-)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Monto</label>
              <Input 
                type="number" 
                step="0.01"
                min="0.01"
                required 
                placeholder="0.00"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Fecha del Movimiento</label>
            <Input 
              type="date" 
              required 
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Concepto</label>
            <Input 
              required 
              placeholder="Ej. Ajuste de saldo por conciliación"
              value={concept}
              onChange={e => setConcept(e.target.value)}
            />
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Ajuste
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
