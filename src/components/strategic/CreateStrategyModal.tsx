"use client";

import React, { useState, useEffect } from "react";
import { collection, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
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
import { StrategyType, StrategyStatus, StrategicPriority, StrategicVision, Strategy } from "@/types/strategic";

interface CreateStrategyModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: any[];
  visions: StrategicVision[];
  strategy?: Strategy;
}

export const CreateStrategyModal: React.FC<CreateStrategyModalProps> = ({
  isOpen,
  onClose,
  branches,
  visions,
  strategy
}) => {
  const { companyId, user } = useAuth();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    objective: "",
    branchId: "empresa",
    visionId: "",
    strategyType: "Crecimiento de ventas" as StrategyType,
    status: "Planeada" as StrategyStatus,
    priority: "Media" as StrategicPriority,
    startDate: new Date().toISOString().split('T')[0],
    targetDate: "",
    estimatedBudget: 0,
    ownerId: ""
  });

  useEffect(() => {
    if (strategy) {
      setFormData({
        name: strategy.name,
        description: strategy.description,
        objective: strategy.objective,
        branchId: strategy.branchId || "empresa",
        visionId: strategy.visionId || "",
        strategyType: strategy.strategyType,
        status: strategy.status,
        priority: strategy.priority,
        startDate: strategy.startDate,
        targetDate: strategy.targetDate,
        estimatedBudget: strategy.estimatedBudget,
        ownerId: strategy.ownerId
      });
    } else {
      setFormData({
        name: "",
        description: "",
        objective: "",
        branchId: "empresa",
        visionId: "",
        strategyType: "Crecimiento de ventas",
        status: "Planeada",
        priority: "Media",
        startDate: new Date().toISOString().split('T')[0],
        targetDate: "",
        estimatedBudget: 0,
        ownerId: user?.uid || ""
      });
    }
  }, [strategy, isOpen, branches, user]);

  const filteredVisions = visions.filter(v => (v.branchId || "empresa") === (formData.branchId || "empresa"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !formData.name) return;

    setLoading(true);
    try {
      if (strategy) {
        await updateDoc(doc(db, "companies", companyId, "strategic_strategies", strategy.id), {
          ...formData,
          updatedAt: new Date().toISOString(),
        });
      } else {
        await addDoc(collection(db, "companies", companyId, "strategic_strategies"), {
          ...formData,
          estimatedBudget: Number(formData.estimatedBudget),
          progress: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          serverTimestamp: serverTimestamp()
        });
      }
      onClose();
    } catch (error) {
      console.error("Error creating strategy:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-indigo-600">Nueva Estrategia de Crecimiento</DialogTitle>
          <DialogDescription>
            Define los parámetros de alto nivel para la nueva estrategia estratégica.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Visión Estratégica Asociada</Label>
              <Select 
                value={formData.visionId} 
                onValueChange={v => setFormData({...formData, visionId: v})}
                disabled={filteredVisions.length === 0}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder={filteredVisions.length === 0 ? "Sin visiones disponibles" : "Seleccionar visión"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredVisions.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Nombre de la Estrategia</Label>
              <Input 
                id="name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ej. Aumentar ventas residenciales premium..."
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="objective">Objetivo Principal</Label>
              <Input 
                id="objective" 
                placeholder="¿Qué queremos lograr?" 
                value={formData.objective}
                onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Descripción Detallada</Label>
              <Textarea 
                id="description" 
                placeholder="Describe el contexto y visión de esta estrategia..." 
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="strategyType">Tipo de Estrategia</Label>
              <Select 
                value={formData.strategyType} 
                onValueChange={(val: StrategyType) => setFormData({ ...formData, strategyType: val })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Crecimiento de ventas">Crecimiento de ventas</SelectItem>
                  <SelectItem value="Rentabilidad">Rentabilidad</SelectItem>
                  <SelectItem value="Eficiencia operativa">Eficiencia operativa</SelectItem>
                  <SelectItem value="Expansión">Expansión</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Servicio al cliente">Servicio al cliente</SelectItem>
                  <SelectItem value="Productividad">Productividad</SelectItem>
                  <SelectItem value="Nuevos canales">Nuevos canales</SelectItem>
                  <SelectItem value="Nuevos productos">Nuevos productos</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Prioridad</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(val) => setFormData({ ...formData, priority: val as StrategicPriority })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Media">Media</SelectItem>
                  <SelectItem value="Baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerId">Responsable</Label>
              <Input 
                id="ownerId" 
                placeholder="Nombre del responsable" 
                value={formData.ownerId}
                onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedBudget">Presupuesto Estimado</Label>
              <Input 
                id="estimatedBudget" 
                type="number" 
                value={formData.estimatedBudget}
                onChange={(e) => setFormData({ ...formData, estimatedBudget: Number(e.target.value) })}
              />
            </div>

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
              <Label htmlFor="targetDate">Fecha Objetivo</Label>
              <Input 
                id="targetDate" 
                type="date" 
                value={formData.targetDate}
                onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Estado Inicial</Label>
              <Select 
                value={formData.status} 
                onValueChange={(val) => setFormData({ ...formData, status: val as StrategyStatus })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Planeada">Planeada</SelectItem>
                  <SelectItem value="Activa">Activa</SelectItem>
                  <SelectItem value="Pausada">Pausada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 min-w-[120px]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (strategy ? "Actualizar" : "Crear Estrategia")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
