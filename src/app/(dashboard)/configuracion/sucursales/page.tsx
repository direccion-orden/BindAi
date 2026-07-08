"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Edit2, MapPin, Package, Layers } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Warehouse {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  address: string;
  warehouses: Warehouse[];
  businessLineId?: string;
  Name?: string;
  Address?: string;
}

interface BusinessLine {
  id: string;
  name: string;
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
  const [businessLineId, setBusinessLineId] = useState("");
  
  const [catalogWarehouses, setCatalogWarehouses] = useState<Warehouse[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    
    // Fetch Locations (Branches)
    const q = query(collection(db, "companies", companyId, "locations"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Location));
      setLocations(data);
      setLoading(false);
    });
    
    // Fetch Warehouses
    const qW = query(collection(db, "companies", companyId, "warehouses"));
    const unsubW = onSnapshot(qW, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name } as Warehouse));
      setCatalogWarehouses(data);
    });

    // Fetch Business Lines
    const qBL = query(collection(db, "companies", companyId, "business_lines"));
    const unsubBL = onSnapshot(qBL, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name } as BusinessLine));
      setBusinessLines(data);
    });
    
    return () => {
      unsubscribe();
      unsubW();
      unsubBL();
    };
  }, [companyId]);

  const handleOpenForm = (location?: Location) => {
    if (location) {
      setCurrentId(location.id);
      setName(location.name || location.Name || "");
      setAddress(location.address || location.Address || "");
      setWarehouses(location.warehouses || []);
      setBusinessLineId(location.businessLineId || "");
    } else {
      setCurrentId("");
      setName("");
      setAddress("");
      setWarehouses([]);
      setBusinessLineId("");
    }
    setIsEditing(true);
  };

  const handleCloseForm = () => {
    setIsEditing(false);
    setCurrentId("");
    setName("");
    setAddress("");
    setWarehouses([]);
    setBusinessLineId("");
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
        warehouses: warehouses.filter(w => w.name.trim() !== ""),
        businessLineId: businessLineId === "none" ? "" : businessLineId
      }, { merge: true });
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
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <MapPin className="w-8 h-8 text-indigo-600" />
            Sucursales
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Administra tus puntos de venta y asócialos a sus respectivas líneas de negocio e inventarios.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => handleOpenForm()} className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all gap-2 rounded-xl h-10 px-4">
            <Plus className="w-4 h-4" /> Nueva Sucursal
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xl max-w-2xl mx-auto animate-in fade-in zoom-in duration-300">
          <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">
            {currentId ? <Edit2 className="w-5 h-5 text-indigo-500" /> : <Plus className="w-5 h-5 text-indigo-500" />}
            {currentId ? "Editar Sucursal" : "Nueva Sucursal"}
          </h2>
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Nombre de la sucursal</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="Ej. Matriz Monterrey" 
                    className="pl-9 rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 h-10 bg-white"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Línea de Negocio (Opcional)</label>
                <Select value={businessLineId || "none"} onValueChange={setBusinessLineId}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-10 bg-white">
                    <SelectValue placeholder="Selecciona una línea de negocio" />
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    <SelectItem value="none">Ninguna</SelectItem>
                    {businessLines.map(bl => (
                      <SelectItem key={bl.id} value={bl.id}>{bl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Dirección (Opcional)</label>
                <Input 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                  placeholder="Calle, número, colonia..." 
                  className="rounded-xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 h-10 bg-white"
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Package className="w-4 h-4 text-slate-500" /> Almacenes Asignados
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={handleQuickAddWarehouse} className="rounded-lg text-xs h-8">
                    + Rápido
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  {catalogWarehouses.length === 0 ? (
                    <p className="text-xs text-slate-400 col-span-2 italic">No hay almacenes en el catálogo.</p>
                  ) : (
                    catalogWarehouses.map(w => {
                      const isChecked = !!warehouses.find(x => x.id === w.id);
                      return (
                        <label key={w.id} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${isChecked ? 'bg-indigo-50/50 border-indigo-200 text-indigo-700' : 'hover:bg-slate-50 border-slate-200'}`}>
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            onChange={() => toggleWarehouse(w)}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-bold">{w.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
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
          {locations.length === 0 ? (
            <div className="p-16 text-center text-slate-500 max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto border border-dashed border-slate-200">
                <MapPin className="w-6 h-6" />
              </div>
              <p className="font-bold text-slate-800">Aún no hay sucursales registradas.</p>
              <Button onClick={() => handleOpenForm()} variant="outline" className="mt-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-xl h-9 px-4">
                Crear Sucursal
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-extrabold text-slate-700">Nombre</TableHead>
                  <TableHead className="font-extrabold text-slate-700">Línea de Negocio</TableHead>
                  <TableHead className="font-extrabold text-slate-700">Dirección</TableHead>
                  <TableHead className="font-extrabold text-slate-700">Almacenes</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.map(loc => {
                  const businessLine = businessLines.find(bl => bl.id === loc.businessLineId);
                  return (
                    <TableRow key={loc.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-bold text-slate-800">{(loc.Name || loc.name)}</TableCell>
                      <TableCell>
                        {businessLine ? (
                          <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-bold border border-indigo-100">
                            <Layers className="w-3 h-3" />
                            {businessLine.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">{(loc.Address || loc.address) || "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {loc.warehouses?.map(w => (
                            <span key={w.id} className="text-xs bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg font-medium">
                              {w.name}
                            </span>
                          ))}
                          {(!loc.warehouses || loc.warehouses.length === 0) && (
                            <span className="text-slate-400 italic text-xs">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2 pr-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleOpenForm(loc)}
                            className="h-8 w-8 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDelete(loc.id)}
                            className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
