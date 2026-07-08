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

interface CreateKPIModalProps {
  isOpen: boolean;
  onClose: () => void;
  tacticId: string;
  tacticName: string;
}

export const CreateKPIModal: React.FC<CreateKPIModalProps> = ({
  isOpen,
  onClose,
  tacticId,
  tacticName
}) => {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    formula: "",
    currentValue: 0,
    targetValue: 0,
    unit: "",
    frequency: "Mensual" as any,
    dataSource: "",
    ownerId: "",
    statusColor: "amarillo" as any
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !tacticId || !formData.name) return;

    setLoading(true);
    try {
      await addDoc(collection(db, "companies", companyId, "strategic_kpis"), {
        ...formData,
        tacticId,
        currentValue: Number(formData.currentValue),
        targetValue: Number(formData.targetValue),
        lastUpdatedAt: new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });
      onClose();
      setFormData({
        name: "",
        description: "",
        formula: "",
        currentValue: 0,
        targetValue: 0,
        unit: "",
        frequency: "Mensual",
        dataSource: "",
        ownerId: "",
        statusColor: "amarillo"
      });
    } catch (error) {
      console.error("Error creating KPI:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
            Nuevo KPI
          </DialogTitle>
          <DialogDescription>
            Táctica: <span className="font-semibold text-slate-700">{tacticName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del KPI</Label>
            <Input 
              id="name" 
              placeholder="Ej. Tasa de conversión de Leads" 
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="formula">Fórmula de Cálculo</Label>
            <Input 
              id="formula" 
              placeholder="Ej. (Ventas / Cotizaciones) * 100" 
              value={formData.formula}
              onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentValue">Valor Actual</Label>
              <Input 
                id="currentValue" 
                type="number" 
                step="0.01"
                value={formData.currentValue}
                onChange={(e) => setFormData({ ...formData, currentValue: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetValue">Valor Objetivo</Label>
              <Input 
                id="targetValue" 
                type="number" 
                step="0.01"
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
                placeholder="Ej. %, leads, MXN" 
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">Frecuencia</Label>
              <Select 
                value={formData.frequency} 
                onValueChange={(val) => setFormData({ ...formData, frequency: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Diaria">Diaria</SelectItem>
                  <SelectItem value="Semanal">Semanal</SelectItem>
                  <SelectItem value="Mensual">Mensual</SelectItem>
                  <SelectItem value="Trimestral">Trimestral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataSource">Fuente de Datos</Label>
            <Input 
              id="dataSource" 
              placeholder="Ej. CRM, Google Analytics, Excel de Ventas" 
              value={formData.dataSource}
              onChange={(e) => setFormData({ ...formData, dataSource: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ownerId">Responsable</Label>
              <Input 
                id="ownerId" 
                placeholder="Nombre" 
                value={formData.ownerId}
                onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statusColor">Estado del Semáforo</Label>
              <Select 
                value={formData.statusColor} 
                onValueChange={(val) => setFormData({ ...formData, statusColor: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verde">Verde (Óptimo)</SelectItem>
                  <SelectItem value="amarillo">Amarillo (Preventivo)</SelectItem>
                  <SelectItem value="rojo">Rojo (Crítico)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-slate-800 hover:bg-slate-900 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar KPI"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
