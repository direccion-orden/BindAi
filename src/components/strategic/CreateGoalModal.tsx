"use client";

import React, { useState, useEffect } from "react";
import { collection, doc, addDoc, getDoc, updateDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
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
import { OKR } from "@/types/strategic";

interface CreateGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  strategyId: string;
  strategyName: string;
  okr?: OKR;
}

export const CreateGoalModal: React.FC<CreateGoalModalProps> = ({
  isOpen,
  onClose,
  strategyId,
  strategyName,
  okr
}) => {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);

  // Lists for dynamic assignments
  const [businessLines, setBusinessLines] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    metricName: "",
    currentValue: 0,
    targetValue: 0,
    unit: "",
    dueDate: "",
    assignedToType: "empresa" as "empresa" | "linea_negocio" | "sucursal",
    assignedToId: "empresa"
  });

  // Load catalogs on mount/open
  useEffect(() => {
    if (!companyId || !isOpen) return;

    // Load locations (branches)
    const unsubLoc = onSnapshot(collection(db, "companies", companyId, "locations"), (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      }));
      list.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setLocations(list);
    });

    // Load business lines
    const unsubBL = onSnapshot(collection(db, "companies", companyId, "business_lines"), (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || "Línea sin nombre"
      }));
      list.sort((a, b) => a.name.localeCompare(b.name, "es"));
      setBusinessLines(list);
    });

    return () => {
      unsubLoc();
      unsubBL();
    };
  }, [companyId, isOpen]);

  // Load OKR if editing
  useEffect(() => {
    if (okr) {
      setFormData({
        name: okr.name,
        description: okr.description || okr.notes || "",
        metricName: okr.metricName || "",
        currentValue: okr.currentValue,
        targetValue: okr.targetValue,
        unit: okr.unit,
        dueDate: okr.dueDate,
        assignedToType: okr.assignedToType || "empresa",
        assignedToId: okr.assignedToId || "empresa"
      });
    } else {
      setFormData({
        name: "",
        description: "",
        metricName: "",
        currentValue: 0,
        targetValue: 0,
        unit: "",
        dueDate: "",
        assignedToType: "empresa",
        assignedToId: "empresa"
      });
    }
  }, [okr, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !strategyId || !formData.name) return;

    setLoading(true);
    try {
      const progress = formData.targetValue > 0 ? Math.round((formData.currentValue / formData.targetValue) * 100) : 0;
      
      const payload = {
        ...formData,
        strategyId,
        currentValue: Number(formData.currentValue),
        targetValue: Number(formData.targetValue),
        progress,
        notes: formData.description, // for backwards compatibility
        updatedAt: new Date().toISOString()
      };

      if (okr) {
        await updateDoc(doc(db, "companies", companyId, "strategic_goals", okr.id), payload);
      } else {
        await addDoc(collection(db, "companies", companyId, "strategic_goals"), {
          ...payload,
          createdAt: new Date().toISOString(),
          serverTimestamp: serverTimestamp()
        });
      }

      onClose();
      setFormData({
        name: "",
        description: "",
        metricName: "",
        currentValue: 0,
        targetValue: 0,
        unit: "",
        dueDate: "",
        assignedToType: "empresa",
        assignedToId: "empresa"
      });
    } catch (error) {
      console.error("Error saving OKR:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-indigo-600">
            {okr ? "Editar Objetivo Clave (OKR)" : "Nuevo Objetivo Clave (OKR)"}
          </DialogTitle>
          <DialogDescription>
            Estrategia asociada: <span className="font-semibold text-slate-700">{strategyName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* 1. Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Objetivo Clave (OKR)</Label>
            <Input 
              id="name" 
              placeholder="Ej. Aumentar retención de clientes en un 15%" 
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* 2. Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea 
              id="description" 
              placeholder="Describe de qué forma se medirá y logrará este objetivo..." 
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[80px]"
              required
            />
          </div>

          {/* 3. Assignment selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Asignar a</Label>
              <Select 
                value={formData.assignedToType} 
                onValueChange={(val: any) => {
                  let defaultId = "empresa";
                  if (val === "linea_negocio") {
                    defaultId = businessLines[0]?.id || "";
                  } else if (val === "sucursal") {
                    defaultId = locations[0]?.id || "";
                  }
                  setFormData({ ...formData, assignedToType: val, assignedToId: defaultId });
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Empresa (Global)</SelectItem>
                  <SelectItem value="linea_negocio">Línea de Negocio</SelectItem>
                  <SelectItem value="sucursal">Sucursal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.assignedToType !== "empresa" && (
              <div className="space-y-2">
                <Label>Seleccionar asignado</Label>
                <Select 
                  value={formData.assignedToId} 
                  onValueChange={(val) => setFormData({ ...formData, assignedToId: val })}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formData.assignedToType === "linea_negocio" ? (
                      businessLines.map(bl => (
                        <SelectItem key={bl.id} value={bl.id}>{bl.name}</SelectItem>
                      ))
                    ) : (
                      locations.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* 4. Metric and Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="metricName">Nombre de la Métrica</Label>
              <Input 
                id="metricName" 
                placeholder="Ej. Tasa de retención" 
                value={formData.metricName}
                onChange={(e) => setFormData({ ...formData, metricName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Fecha Límite</Label>
              <Input 
                id="dueDate" 
                type="date" 
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                required
              />
            </div>
          </div>

          {/* 5. Quantitative Goals */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2 col-span-1">
              <Label htmlFor="currentValue">Valor Actual</Label>
              <Input 
                id="currentValue" 
                type="number" 
                step="any"
                value={formData.currentValue}
                onChange={(e) => setFormData({ ...formData, currentValue: Number(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-2 col-span-1">
              <Label htmlFor="targetValue">Valor Meta</Label>
              <Input 
                id="targetValue" 
                type="number" 
                step="any"
                value={formData.targetValue}
                onChange={(e) => setFormData({ ...formData, targetValue: Number(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-2 col-span-1">
              <Label htmlFor="unit">Unidad</Label>
              <Input 
                id="unit" 
                placeholder="Ej. %, MXN, leads" 
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (okr ? "Actualizar OKR" : "Guardar OKR")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
