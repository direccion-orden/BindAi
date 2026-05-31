"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Edit2, MapPin, Package } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Warehouse {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  address: string;
  warehouses: Warehouse[];
  Name?: string;
  Address?: string;
}

export default function SucursalesPage() {
  const { companyId } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  
  const [catalogWarehouses, setCatalogWarehouses] = useState<Warehouse[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "locations"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
      setLocations(data);
      setLoading(false);
    });
    
    const qW = query(collection(db, "companies", companyId, "warehouses"));
    const unsubW = onSnapshot(qW, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setCatalogWarehouses(data);
    });
    
    return () => {
      unsubscribe();
      unsubW();
    };
  }, [companyId]);

  const handleOpenForm = (location?: Location) => {
    if (location) {
      setCurrentId(location.id);
      setName(location.name);
      setAddress(location.address || "");
      setWarehouses(location.warehouses || []);
    } else {
      setCurrentId("");
      setName("");
      setAddress("");
      setWarehouses([]);
    }
    setIsEditing(true);
  };

  const handleCloseForm = () => {
    setIsEditing(false);
    setCurrentId("");
    setName("");
    setAddress("");
    setWarehouses([]);
  };

  const toggleWarehouse = (w: Warehouse) => {
    const exists = warehouses.find(x => x.id === w.id);
    if (exists) {
      setWarehouses(warehouses.filter(x => x.id !== w.id));
    } else {
      setWarehouses([...warehouses, w]);
    }
  };

  const handleQuickAddWarehouse = async () => {
    const newName = prompt("Nombre del nuevo almacén:");
    if (!newName || !companyId) return;
    try {
      const docId = crypto.randomUUID();
      const ref = doc(db, "companies", companyId, "warehouses", docId);
      await setDoc(ref, { name: newName.trim(), description: "" });
      setWarehouses(prev => [...prev, { id: docId, name: newName.trim() }]);
    } catch (e) {
      alert("Error al crear almacén");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !name.trim()) return;
    setSaving(true);
    try {
      const docId = currentId || crypto.randomUUID();
      const ref = doc(db, "companies", companyId, "locations", docId);
      await setDoc(ref, {
        name: name.trim(),
        address: address.trim(),
        warehouses: warehouses.filter(w => w.name.trim() !== "")
      });
      handleCloseForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar la sucursal");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Seguro que deseas eliminar esta sucursal?")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "locations", id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar");
    }
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Sucursales y Almacenes</h1>
          <p className="text-muted-foreground">
            Administra tus puntos de venta y los inventarios asignados a cada uno.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva Sucursal
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-card border rounded-lg p-6 max-w-2xl animate-in fade-in zoom-in duration-300">
          <h2 className="text-xl font-bold mb-4">{currentId ? "Editar Sucursal" : "Nueva Sucursal"}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre de la sucursal</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="Ej. Matriz Monterrey" 
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Dirección (Opcional)</label>
                <Input 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                  placeholder="Calle, número, colonia..." 
                />
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Package className="w-4 h-4" /> Almacenes Asignados
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={handleQuickAddWarehouse}>
                    + Rápido
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  {catalogWarehouses.length === 0 ? (
                    <p className="text-xs text-muted-foreground col-span-2">No hay almacenes en el catálogo.</p>
                  ) : (
                    catalogWarehouses.map(w => {
                      const isChecked = !!warehouses.find(x => x.id === w.id);
                      return (
                        <label key={w.id} className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors ${isChecked ? 'bg-accent/10 border-accent/30' : 'hover:bg-muted/50'}`}>
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={() => toggleWarehouse(w)}
                            className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent"
                          />
                          <span className="text-sm font-medium">{w.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
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
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          {locations.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              Aún no tienes sucursales registradas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Almacenes</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map(loc => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-medium">{(loc.Name || loc.name)}</TableCell>
                    <TableCell className="text-muted-foreground">{(loc.Address || loc.address) || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {loc.warehouses?.map(w => (
                          <span key={w.id} className="text-xs bg-muted px-2 py-1 rounded-md">
                            {w.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenForm(loc)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(loc.id)}>
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

