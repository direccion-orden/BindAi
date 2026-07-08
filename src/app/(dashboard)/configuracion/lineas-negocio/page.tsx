"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, Edit2, Layers, AlertCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface BusinessLine {
  id: string;
  name: string;
  description: string;
  createdAt?: string;
}

export default function LineasNegocioPage() {
  const { companyId } = useAuth();
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "business_lines"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BusinessLine));
      setBusinessLines(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [companyId]);

  const handleOpenForm = (bl?: BusinessLine) => {
    if (bl) {
      setCurrentId(bl.id);
      setName(bl.name);
      setDescription(bl.description || "");
    } else {
      setCurrentId("");
      setName("");
      setDescription("");
    }
    setIsEditing(true);
  };

  const handleCloseForm = () => {
    setIsEditing(false);
    setCurrentId("");
    setName("");
    setDescription("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !name.trim()) return;
    setSaving(true);
    try {
      const docId = currentId || crypto.randomUUID();
      const ref = doc(db, "companies", companyId, "business_lines", docId);
      await setDoc(ref, {
        name: name.trim(),
        description: description.trim(),
        createdAt: new Date().toISOString()
      }, { merge: true });
      handleCloseForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar la línea de negocio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Seguro que deseas eliminar esta línea de negocio? Asegúrate de que no haya sucursales asociadas a ella.")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "business_lines", id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="w-8 h-8 text-indigo-600" />
            Líneas de Negocio
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Define y administra las distintas divisiones o líneas de negocio de tu organización.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => handleOpenForm()} className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all gap-2 rounded-xl h-10 px-4">
            <Plus className="w-4 h-4" /> Nueva Línea de Negocio
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl max-w-2xl mx-auto animate-in fade-in zoom-in duration-300">
          <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">
            {currentId ? <Edit2 className="w-5 h-5 text-indigo-500" /> : <Plus className="w-5 h-5 text-indigo-500" />}
            {currentId ? "Editar Línea de Negocio" : "Nueva Línea de Negocio"}
          </h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Nombre de la Línea de Negocio</label>
                <Input 
                  required 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Ej. Comercial, Residencial, Proyectos Especiales..." 
                  className="rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 h-10 bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Descripción</label>
                <Textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  placeholder="Describe el enfoque principal de esta línea de negocio..." 
                  className="rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 min-h-[100px] bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={handleCloseForm} className="rounded-xl text-slate-500 hover:bg-slate-50 h-10 px-4">
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md h-10 px-6 font-bold transition-all">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {businessLines.length === 0 ? (
            <div className="p-16 text-center text-slate-500 max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto border border-dashed border-slate-200">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-800">Aún no hay líneas de negocio registradas.</p>
              <p className="text-sm text-slate-400">Crea tu primera línea de negocio para agrupar y organizar tus sucursales de manera estratégica.</p>
              <Button onClick={() => handleOpenForm()} variant="outline" className="mt-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-xl h-9 px-4">
                Crear Línea de Negocio
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-extrabold text-slate-700">Nombre</TableHead>
                  <TableHead className="font-extrabold text-slate-700">Descripción</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businessLines.map(bl => (
                  <TableRow key={bl.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-bold text-slate-800">{bl.name}</TableCell>
                    <TableCell className="text-slate-500">{bl.description || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2 pr-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleOpenForm(bl)}
                          className="h-8 w-8 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(bl.id)}
                          className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
