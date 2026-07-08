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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { StrategyStatus, StrategicPriority } from "@/types/strategic";

interface CreateTacticModalProps {
  isOpen: boolean;
  onClose: () => void;
  strategyId: string;
  strategyName: string;
}

export const CreateTacticModal: React.FC<CreateTacticModalProps> = ({
  isOpen,
  onClose,
  strategyId,
  strategyName
}) => {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    ownerId: "",
    status: "Planeada" as StrategyStatus,
    priority: "Media" as StrategicPriority,
    startDate: new Date().toISOString().split('T')[0],
    dueDate: "",
    estimatedCost: 0,
    expectedImpact: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !strategyId || !formData.name) return;

    setLoading(true);
    try {
      await addDoc(collection(db, "companies", companyId, "strategic_tactics"), {
        ...formData,
        strategyId,
        estimatedCost: Number(formData.estimatedCost),
        progress: 0,
        createdAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });
      onClose();
      setFormData({
        name: "",
        description: "",
        ownerId: "",
        status: "Planeada",
        priority: "Media",
        startDate: new Date().toISOString().split('T')[0],
        dueDate: "",
        estimatedCost: 0,
        expectedImpact: ""
      });
    } catch (error) {
      console.error("Error creating tactic:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-purple-600">Nueva Táctica Operativa</DialogTitle>
          <DialogDescription>
            Estrategia: <span className="font-semibold text-slate-700">{strategyName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la Táctica</Label>
            <Input 
              id="name" 
              placeholder="Ej. Campaña de Facebook Ads para Monterrey" 
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descripción / Cómo se ejecutará</Label>
            <Textarea 
              id="description" 
              placeholder="Pasos clave para la ejecución..." 
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ownerId">Responsable</Label>
              <Input 
                id="ownerId" 
                placeholder="Nombre del encargado" 
                value={formData.ownerId}
                onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Prioridad</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(val) => setFormData({ ...formData, priority: val as StrategicPriority })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Media">Media</SelectItem>
                  <SelectItem value="Baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Fecha de Inicio</Label>
              <Input 
                id="startDate" 
                type="date" 
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Fecha de Entrega</Label>
              <Input 
                id="dueDate" 
                type="date" 
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimatedCost">Costo Estimado</Label>
              <Input 
                id="estimatedCost" 
                type="number" 
                value={formData.estimatedCost}
                onChange={(e) => setFormData({ ...formData, estimatedCost: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedImpact">Impacto Esperado</Label>
              <Input 
                id="expectedImpact" 
                placeholder="Ej. +50 leads mensuales" 
                value={formData.expectedImpact}
                onChange={(e) => setFormData({ ...formData, expectedImpact: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Táctica"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
