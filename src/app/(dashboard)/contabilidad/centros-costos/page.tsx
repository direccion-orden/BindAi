"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy, doc, setDoc, deleteDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Search, Layers, Plus, Pencil, Trash2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface CostCenter {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function CentrosCostosPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Delete Confirmation State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Seeding State
  const [initializing, setInitializing] = useState(false);

  // Listen to Firestore
  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "cost_centers"),
      orderBy("code", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as CostCenter[];
      setCostCenters(list);
      setLoading(false);
    });

    return () => unsub();
  }, [companyId]);

  // Bulk Seed default cost centers from CENTROS DE COSTOS.xlsx
  const handleInitialize = async () => {
    if (!companyId) return;
    setInitializing(true);
    try {
      const batch = writeBatch(db);
      const defaultCenters = [
        "ARRENDAMIENTO VEHÍCULO",
        "COMISIONES TPV",
        "COMPRA DE INVENTARIO",
        "EMPAQUE ECOMMERCE",
        "EMPAQUE PRODUCTO",
        "EMPAQUE TIENDA",
        "FLETES",
        "GASOLINA",
        "GASTOS ADMINISTRATIVOS",
        "GASTOS GENERALES",
        "GASTOS PERSONALES",
        "IMSS",
        "INFONAVIT",
        "INSUMOS DE PROYECTOS",
        "INTERESES",
        "INVERSIÓN EN EQUIPAMIENTO",
        "ISN NL",
        "MANTENIMIENTO FÁBRICA",
        "MANTENIMIENTO VEHICULOS",
        "MAQUILA",
        "MATERIA PRIMA",
        "NÓMINA",
        "OTRAS COMISIONES BANCO",
        "PAGO CONSIGNACIÓN VENDIDA",
        "PAGO DE IMPUESTOS",
        "PAGO DEUDA",
        "PAGO IVA TRASLADADO",
        "PAPELERIA Y MATERIALES",
        "PUBLICIDAD",
        "REMODELACIÓN TIENDA",
        "RENTA BODEGA",
        "RENTA TIENDA",
        "SEGURO GASTOS MÉDICOS",
        "SISTEMAS INFORMACIÓN",
        "UNIFORMES",
        "VIÁTICOS Y GASTOS DE VIAJE",
      ];

      defaultCenters.forEach((name, index) => {
        const id = crypto.randomUUID();
        const generatedCode = `CC-${String(index + 1).padStart(3, "0")}`;
        const docRef = doc(db, "companies", companyId, "cost_centers", id);
        batch.set(docRef, {
          id,
          code: generatedCode,
          name,
          isActive: true,
          createdAt: new Date().toISOString(),
        });
      });

      await batch.commit();
      alert("Catálogo inicializado con éxito.");
    } catch (err) {
      console.error("Error initializing cost centers:", err);
      alert("Error al inicializar el catálogo.");
    } finally {
      setInitializing(false);
    }
  };

  // Open Modal for Create or Edit
  const openModal = (item?: CostCenter) => {
    if (item) {
      setEditingId(item.id);
      setCode(item.code);
      setName(item.name);
      setIsActive(item.isActive);
    } else {
      setEditingId(null);
      // Auto-suggest next sequential code
      const nextNum = costCenters.length + 1;
      setCode(`CC-${String(nextNum).padStart(3, "0")}`);
      setName("");
      setIsActive(true);
    }
    setIsModalOpen(true);
  };

  // Save Add/Edit
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !name.trim() || !code.trim()) return;

    setSaving(true);
    try {
      const id = editingId || crypto.randomUUID();
      const docRef = doc(db, "companies", companyId, "cost_centers", id);

      await setDoc(
        docRef,
        {
          id,
          code: code.trim(),
          name: name.trim(),
          isActive,
          createdAt: editingId ? undefined : new Date().toISOString(),
        },
        { merge: true }
      );

      setIsModalOpen(false);
      // reset form
      setCode("");
      setName("");
      setIsActive(true);
    } catch (err) {
      console.error("Error saving cost center:", err);
      alert("Error al guardar el centro de costos.");
    } finally {
      setSaving(false);
    }
  };

  // Open delete confirm
  const confirmDelete = (item: CostCenter) => {
    setDeletingId(item.id);
    setDeletingName(item.name);
    setIsDeleteOpen(true);
  };

  // Execute Delete
  const handleDelete = async () => {
    if (!companyId || !deletingId) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, "companies", companyId, "cost_centers", deletingId));
      setIsDeleteOpen(false);
      setDeletingId(null);
      setDeletingName("");
    } catch (err) {
      console.error("Error deleting cost center:", err);
      alert("Error al eliminar el centro de costos.");
    } finally {
      setDeleting(false);
    }
  };

  // Filter cost centers based on search
  const filteredCostCenters = costCenters.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="w-8 h-8 text-indigo-600" />
            Centros de Costos
          </h1>
          <p className="text-muted-foreground mt-1">
            Administra las áreas, departamentos o proyectos que registran gastos en tu contabilidad.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {costCenters.length === 0 && (
            <Button
              onClick={handleInitialize}
              disabled={initializing}
              variant="outline"
              className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
            >
              {initializing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
              Inicializar Catálogo (Excel)
            </Button>
          )}
          <Button onClick={() => openModal()} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
            <Plus className="w-4 h-4" />
            Nuevo Centro
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-220px)]">
        {/* Search & Actions Header */}
        <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código o nombre..."
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm font-medium text-slate-500 bg-white px-3 py-1.5 rounded-full border">
            {filteredCostCenters.length} centros de costos
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4">
          {costCenters.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-xl bg-white max-w-lg mx-auto my-12">
              <Layers className="w-16 h-16 text-indigo-200 mb-4" />
              <h3 className="text-lg font-bold text-slate-800">Catálogo Vacío</h3>
              <p className="text-sm text-slate-500 mt-1 mb-6">
                Aún no has registrado ningún centro de costos. Puedes inicializar la lista con las 36 categorías predefinidas de tu archivo excel o agregarlas manualmente.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                <Button
                  onClick={handleInitialize}
                  disabled={initializing}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {initializing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Layers className="w-4 h-4" />
                  )}
                  Precargar desde Excel
                </Button>
                <Button onClick={() => openModal()} variant="outline">
                  Crear Manualmente
                </Button>
              </div>
            </div>
          ) : filteredCostCenters.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Search className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-base font-semibold">No se encontraron centros de costos</p>
              <p className="text-xs">Intenta buscando con un término diferente.</p>
            </div>
          ) : (
            <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 border-b">
                  <tr>
                    <th className="text-left font-semibold px-6 py-3 w-1/4">Código</th>
                    <th className="text-left font-semibold px-6 py-3 w-1/2">Nombre del Centro</th>
                    <th className="text-center font-semibold px-6 py-3 w-1/8">Estado</th>
                    <th className="text-center font-semibold px-6 py-3 w-1/8">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCostCenters.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 font-mono font-bold text-slate-700">{item.code}</td>
                      <td className="px-6 py-3 font-medium text-slate-900">{item.name}</td>
                      <td className="px-6 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                            item.isActive
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                          }`}
                        >
                          {item.isActive ? (
                            <>
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                              Activo
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-slate-400" />
                              Inactivo
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                            onClick={() => openModal(item)}
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                            onClick={() => confirmDelete(item)}
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={(open) => !open && setIsModalOpen(false)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">
              {editingId ? "Editar Centro de Costos" : "Nuevo Centro de Costos"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Ingresa los detalles para identificar y organizar tus partidas de gasto.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 mt-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600">Código</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ej. CC-001"
                required
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600">Nombre del Centro</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. ADMINISTRATIVO"
                required
                className="h-9"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">Estado Activo</span>
                <span className="text-[10px] text-slate-500">Permite registrar gastos en este centro.</span>
              </div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving || !name.trim() || !code.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Guardar Centro
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={(open) => !open && setIsDeleteOpen(false)}>
        <DialogContent className="max-w-md bg-white p-6 rounded-xl border">
          <DialogHeader className="flex flex-row items-start gap-3">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-full shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">¿Eliminar Centro de Costos?</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                ¿Estás seguro de que deseas eliminar permanentemente el centro de costos{" "}
                <strong>"{deletingName}"</strong>? Esta acción no se puede deshacer y podría afectar el histórico de clasificación.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-4 border-t mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDeleteOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Sí, Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
