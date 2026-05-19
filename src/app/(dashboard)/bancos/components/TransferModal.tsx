"use client";

import React, { useState, useMemo } from "react";
import { doc, collection, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRightLeft, X } from "lucide-react";
import { BankTransaction } from "@/types/bank";

interface BankAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
}

interface TransferModalProps {
  accounts: BankAccount[];
  currentAccountId: string;
  onClose: () => void;
}

export function TransferModal({ accounts, currentAccountId, onClose }: TransferModalProps) {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);

  const [targetAccountId, setTargetAccountId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [concept, setConcept] = useState("");
  const [amountStr, setAmountStr] = useState("");

  const currentAccount = useMemo(() => accounts.find(a => a.id === currentAccountId), [accounts, currentAccountId]);
  const targetAccount = useMemo(() => accounts.find(a => a.id === targetAccountId), [accounts, targetAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !currentAccountId || !targetAccountId) return;
    
    if (currentAccountId === targetAccountId) {
      alert("La cuenta destino no puede ser la misma que la de origen.");
      return;
    }

    if (currentAccount?.currency !== targetAccount?.currency) {
      alert("Las cuentas deben tener la misma moneda. Las transferencias multidivisa no están soportadas aún.");
      return;
    }

    const amountNum = parseFloat(amountStr);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Ingrese un monto válido mayor a cero.");
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      // Salida de la cuenta actual
      const sourceTxRef = doc(collection(db, "companies", companyId, "bankAccounts", currentAccountId, "transactions"));
      const sourceTx: BankTransaction = {
        id: sourceTxRef.id,
        date,
        concept: concept.trim() || `Transferencia a ${targetAccount?.name}`,
        reference: `TR-${Date.now().toString().slice(-6)}`,
        amount: -amountNum,
        type: "TRANSFER",
        createdAt: Date.now()
      };
      batch.set(sourceTxRef, sourceTx);

      // Entrada a la cuenta destino
      const targetTxRef = doc(collection(db, "companies", companyId, "bankAccounts", targetAccountId, "transactions"));
      const targetTx: BankTransaction = {
        id: targetTxRef.id,
        date,
        concept: concept.trim() || `Transferencia desde ${currentAccount?.name}`,
        reference: sourceTx.reference, // misma referencia
        amount: amountNum,
        type: "TRANSFER",
        createdAt: Date.now()
      };
      batch.set(targetTxRef, targetTx);

      await batch.commit();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error al procesar la transferencia.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b bg-muted/20">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            Transferencia de Fondos
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-muted/30 p-3 rounded-lg border text-sm flex items-center justify-between mb-2">
            <span className="text-muted-foreground">Origen:</span>
            <span className="font-bold">{currentAccount?.name} ({currentAccount?.currency})</span>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Cuenta Destino</label>
            <select 
              required
              value={targetAccountId} 
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Selecciona la cuenta destino...</option>
              {accounts.filter(a => a.id !== currentAccountId).map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Fecha</label>
              <Input 
                type="date" 
                required 
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Concepto (Opcional)</label>
            <Input 
              placeholder={`Ej. Transferencia de fondos...`}
              value={concept}
              onChange={e => setConcept(e.target.value)}
            />
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={loading || !targetAccountId}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Transferir
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
