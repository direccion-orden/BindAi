"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, Trash2, GripVertical, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ProductionStage {
  id: string;
  name: string;
  order: number;
  color: string;
  wipLimit: number; // 0 = no limit
}

export default function EtapasProduccionPage() {
  const { companyId } = useAuth();
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "production_stages"),
      orderBy("order", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setStages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionStage)));
      setLoading(false);
    });

    return () => unsub();
  }, [companyId]);

  const handleAddStage = () => {
    setStages([...stages, {
      id: crypto.randomUUID(),
      name: "Nueva Etapa",
      order: stages.length,
      color: "#6366f1", // default indigo
      wipLimit: 0
    }]);
  };

  const handleUpdateStage = (id: string, field: keyof ProductionStage, value: any) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleRemoveStage = (id: string) => {
    setStages(prev => prev.filter(s => s.id !== id));
  };

  const handleSaveAll = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      // Very simple save loop for catalog
      for (let i = 0; i < stages.length; i++) {
        const stage = { ...stages[i], order: i };
        await setDoc(doc(db, "companies", companyId, "production_stages", stage.id), stage);
      }
      // Note: Removed stages should be deleted, ideally we track deletes.
      // For a simple catalog, we'll assume manual delete clicks below.
      alert("Etapas guardadas correctamente.");
    } catch (e) {
      console.error(e);
      alert("Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDb = async (id: string) => {
    if (!companyId || !confirm("¿Seguro que deseas eliminar esta etapa? Las órdenes en esta etapa podrían perder su referencia.")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "production_stages", id));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Etapas de Producción (Flujo Kanban)</h1>
          <p className="text-muted-foreground">Define las columnas para tu tablero visual de producción (WIP).</p>
        </div>
        <Button onClick={handleSaveAll} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar Flujo
        </Button>
      </div>

      <div className="bg-card border rounded-xl shadow-sm p-6 space-y-4">
        {stages.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No tienes etapas definidas. Haz clic en "Agregar Etapa".
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-4 px-4 text-xs font-bold text-muted-foreground uppercase">
              <div className="col-span-1"></div>
              <div className="col-span-4">Nombre de la Etapa</div>
              <div className="col-span-3 text-center">Color Visual</div>
              <div className="col-span-3 text-center" title="Work In Progress Limit">Límite WIP (0=Sin límite)</div>
              <div className="col-span-1"></div>
            </div>
            {stages.map((stage, index) => (
              <div key={stage.id} className="flex items-center grid grid-cols-12 gap-4 p-3 bg-background border rounded-lg shadow-sm">
                <div className="col-span-1 flex justify-center text-muted-foreground cursor-move">
                  <GripVertical className="w-5 h-5" />
                </div>
                <div className="col-span-4">
                  <Input 
                    value={stage.name}
                    onChange={e => handleUpdateStage(stage.id, 'name', e.target.value)}
                    className="font-medium"
                  />
                </div>
                <div className="col-span-3 flex justify-center items-center">
                  <input 
                    type="color" 
                    value={stage.color}
                    onChange={e => handleUpdateStage(stage.id, 'color', e.target.value)}
                    className="w-10 h-10 p-1 border rounded cursor-pointer"
                  />
                </div>
                <div className="col-span-3 flex justify-center">
                  <Input 
                    type="number"
                    min={0}
                    value={stage.wipLimit}
                    onChange={e => handleUpdateStage(stage.id, 'wipLimit', parseInt(e.target.value) || 0)}
                    className="w-20 text-center"
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                    handleRemoveStage(stage.id);
                    handleDeleteDb(stage.id);
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" className="w-full border-dashed" onClick={handleAddStage}>
          <Plus className="w-4 h-4 mr-2" /> Agregar Etapa
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg text-sm">
        <strong>💡 Mejores Prácticas de Kanban (Lean Manufacturing):</strong>
        <ul className="list-disc ml-5 mt-2 space-y-1">
          <li><strong>Map your Value Stream:</strong> Define etapas reales donde el trabajo se detiene o procesa (ej. <em>Pendiente, Corte, Ensamblaje, Calidad, Listo</em>).</li>
          <li><strong>Límites WIP:</strong> Limita la cantidad de órdenes que pueden existir simultáneamente en una etapa para evitar cuellos de botella e inventario en proceso congelado.</li>
        </ul>
      </div>
    </div>
  );
}
