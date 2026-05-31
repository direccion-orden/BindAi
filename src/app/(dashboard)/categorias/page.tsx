"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Edit2, Search, Tags } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Category {
  id: string;
  name: string;
  Description?: string;
  Name?: string;
}

export default function CategoriasPage() {
  const { companyId } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [formData, setFormData] = useState<Partial<Category>>({});
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "categories"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
      setCategories(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [companyId]);

  const handleOpenForm = (category?: Category) => {
    if (category) {
      setCurrentId(category.id);
      setFormData(category);
    } else {
      setCurrentId("");
      setFormData({ name: "" });
    }
    setIsEditing(true);
  };

  const handleCloseForm = () => {
    setIsEditing(false);
    setCurrentId("");
    setFormData({});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !formData.name?.trim()) return;
    setSaving(true);
    try {
      const docId = currentId || crypto.randomUUID();
      const ref = doc(db, "companies", companyId, "categories", docId);
      await setDoc(ref, {
        name: formData.name.trim(),
        createdAt: new Date().toISOString()
      }, { merge: true });
      handleCloseForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar la categoría");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Seguro que deseas eliminar esta categoría? (Los productos asociados no se eliminarán, pero perderán esta referencia)")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "categories", id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar");
    }
  };

  const filteredCategories = categories.filter(c => 
    (c.Description || c.Name || c.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categorías de Productos</h1>
          <p className="text-muted-foreground">
            Organiza tu inventario agrupando tus productos en categorías.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva Categoría
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-card border rounded-lg p-6 max-w-lg animate-in fade-in zoom-in duration-300">
          <h2 className="text-xl font-bold mb-4">{currentId ? "Editar Categoría" : "Nueva Categoría"}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de la Categoría</label>
              <Input 
                required 
                autoFocus
                value={formData.name || ""} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder="Ej. Bebidas, Botanas, Electrónica..." 
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={handleCloseForm}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden max-w-3xl">
          <div className="p-4 border-b">
             <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar categoría..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
             </div>
          </div>
          {filteredCategories.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              {searchTerm ? "No se encontraron categorías con esa búsqueda." : "Aún no tienes categorías registradas."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="w-[100px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategories.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <Tags className="w-4 h-4 text-muted-foreground/50" />
                      {(c.Description || c.Name || c.name)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenForm(c)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
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
