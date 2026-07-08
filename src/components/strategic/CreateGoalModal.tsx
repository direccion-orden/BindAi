"use client";

import React, { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface CreateGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  strategyId: string;
  strategyName: string;
}

export const CreateGoalModal: React.FC<CreateGoalModalProps> = ({
  isOpen,
  onClose,
  strategyId,
  strategyName
}) => {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    metricName: "",
    currentValue: 0,
    targetValue: 0,
    unit: "pesos",
    dueDate: "",
    notes: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !strategyId || !formData.name) return;

    setLoading(true);
    try {
      const progress = formData.targetValue > 0 ? Math.round((formData.currentValue / formData.targetValue) * 100) : 0;
      await addDoc(collection(db, "companies", companyId, "strategic_goals"), {
        ...formData,
        strategyId,
        currentValue: Number(formData.currentValue),
        targetValue: Number(formData.targetValue),
        progress,
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });
      onClose();
      setFormData({
        name: "",
        metricName: "",
        currentValue: 0,
        targetValue: 0,
        unit: "pesos",
        dueDate: "",
        notes: ""
      });
    } catch (error) {
      console.error("Error creating goal:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-indigo-600">Nueva Meta Comercial</DialogTitle>
          <DialogDescription>
            Estrategia: <span className="font-semibold text-slate-700">{strategyName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la Meta</Label>
            <Input 
              id="name" 
              placeholder="Ej. Incrementar ventas de paneles solares" 
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="metricName">Nombre de la Métrica</Label>
            <Input 
              id="metricName" 
              placeholder="Ej. Ingreso por ventas premium" 
              value={formData.metricName}
              onChange={(e) => setFormData({ ...formData, metricName: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentValue">Valor Actual</Label>
              <Input 
                id="currentValue" 
                type="number" 
                value={formData.currentValue}
                onChange={(e) => setFormData({ ...formData, currentValue: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetValue">Valor Objetivo</Label>
              <Input 
                id="targetValue" 
                type="number" 
                value={formData.targetValue}
                onChange={(e) => setFormData({ ...formData, targetValue: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="unit">Unidad</Label>
              <Input 
                id="unit" 
                placeholder="Ej. pesos, %, leads" 
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Fecha Límite</Label>
              <Input 
                id="dueDate" 
                type="date" 
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea 
              id="notes" 
              placeholder="Comentarios adicionales..." 
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="min-h-[80px]"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Meta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
