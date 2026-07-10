"use client";

import React, { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
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
import { Loader2, Target } from "lucide-react";
import { collection, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { StrategicVision, StrategicPriority, StrategyStatus } from "@/types/strategic";

interface CreateVisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: any[];
  vision?: StrategicVision;
}

export function CreateVisionModal({ isOpen, onClose, branches, vision }: CreateVisionModalProps) {
  const { companyId, user } = useAuth();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    strategicIntent: "",
    branchId: "empresa",
    priority: "Media" as StrategicPriority,
    status: "Activa" as StrategyStatus,
    startDate: new Date().toISOString().split('T')[0],
    targetDate: "",
    ownerId: ""
  });

  useEffect(() => {
    if (vision) {
      setFormData({
        name: vision.name,
        description: vision.description,
        strategicIntent: vision.strategicIntent || "",
        branchId: vision.branchId || "empresa",
        priority: vision.priority,
        status: vision.status,
        startDate: vision.startDate,
        targetDate: vision.targetDate,
        ownerId: vision.ownerId
      });
    } else {
      setFormData({
        name: "",
        description: "",
        strategicIntent: "",
        branchId: "empresa",
        priority: "Media",
        status: "Activa",
        startDate: new Date().toISOString().split('T')[0],
        targetDate: "",
        ownerId: user?.uid || ""
      });
    }
  }, [vision, isOpen, branches, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setLoading(true);
    try {
      const visionData = {
        ...formData,
        progress: vision?.progress || 0,
        updatedAt: new Date().toISOString()
      };

      if (vision) {
        await updateDoc(doc(db, "companies", companyId, "strategic_visions", vision.id), visionData);
      } else {
        const newVisionId = crypto.randomUUID();
        await setDoc(doc(db, "companies", companyId, "strategic_visions", newVisionId), {
          ...visionData,
          id: newVisionId,
          createdAt: new Date().toISOString()
        });
      }
      onClose();
    } catch (error) {
      console.error("Error saving vision:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            {vision ? "Editar Visión Estratégica" : "Nueva Visión Estratégica"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Nombre de la Visión</Label>
              <Input 
                id="name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ej. Convertir CDMX en una sucursal premium..."
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Descripción Detallada</Label>
              <Textarea 
                id="description"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Describe el marco estratégico general..."
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="strategicIntent">Intención Estratégica</Label>
              <Input 
                id="strategicIntent"
                value={formData.strategicIntent}
                onChange={e => setFormData({...formData, strategicIntent: e.target.value})}
                placeholder="¿Qué queremos lograr fundamentalmente?"
              />
            </div>


            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(v: StrategicPriority) => setFormData({...formData, priority: v})}
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
              <Label htmlFor="startDate">Fecha de Inicio</Label>
              <Input 
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={e => setFormData({...formData, startDate: e.target.value})}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetDate">Fecha Objetivo</Label>
              <Input 
                id="targetDate"
                type="date"
                value={formData.targetDate}
                onChange={e => setFormData({...formData, targetDate: e.target.value})}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {vision ? "Actualizar Visión" : "Crear Visión"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
