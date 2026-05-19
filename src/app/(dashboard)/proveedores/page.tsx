"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Edit2, Search, Truck, Mail, Phone } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Vendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  rfc?: string;
  street?: string;
  exteriorNumber?: string;
  interiorNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export default function ProveedoresPage() {
  const { companyId } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [formData, setFormData] = useState<Partial<Vendor>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "vendors"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
      setVendors(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [companyId]);

  const handleOpenForm = (vendor?: Vendor) => {
    if (vendor) {
      setCurrentId(vendor.id);
      setFormData(vendor);
    } else {
      setCurrentId("");
      setFormData({ name: "", email: "", phone: "", rfc: "", street: "", exteriorNumber: "", interiorNumber: "", neighborhood: "", city: "", state: "" });
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
      const ref = doc(db, "companies", companyId, "vendors", docId);
      await setDoc(ref, {
        name: formData.name.trim(),
        email: formData.email?.trim() || "",
        phone: formData.phone?.trim() || "",
        rfc: formData.rfc?.trim() || "",
        street: formData.street?.trim() || "",
        exteriorNumber: formData.exteriorNumber?.trim() || "",
        interiorNumber: formData.interiorNumber?.trim() || "",
        neighborhood: formData.neighborhood?.trim() || "",
        city: formData.city?.trim() || "",
        state: formData.state?.trim() || "",
        createdAt: new Date().toISOString()
      }, { merge: true });
      handleCloseForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar proveedor");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Seguro que deseas eliminar este proveedor?")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "vendors", id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar");
    }
  };

  const filteredVendors = vendors.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.email && v.email.toLowerCase().includes(searchTerm.toLowerCase()))
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
          <h1 className="text-3xl font-bold tracking-tight">Proveedores</h1>
          <p className="text-muted-foreground">Administra tus contactos y proveedores.</p>
        </div>
        {!isEditing && (
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="w-4 h-4" /> Nuevo Proveedor
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-card border rounded-lg p-6 max-w-4xl animate-in fade-in zoom-in duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">{currentId ? "Editar Proveedor" : "Nuevo Proveedor"}</h2>
            <Button variant="ghost" size="sm" onClick={handleCloseForm}>Cerrar</Button>
          </div>
          
          <form onSubmit={handleSave} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-6">
                <h3 className="font-semibold text-lg border-b pb-2">Datos Generales</h3>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nombre / Razón Social <span className="text-destructive">*</span></label>
                  <Input 
                    required 
                    autoFocus
                    value={formData.name || ""} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    placeholder="Ej. Nike de México S.A. de C.V." 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">RFC</label>
                  <Input 
                    value={formData.rfc || ""} 
                    onChange={e => setFormData({...formData, rfc: e.target.value})} 
                    placeholder="Ej. NME920101XYZ" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Correo Electrónico</label>
                    <Input 
                      type="email"
                      value={formData.email || ""} 
                      onChange={e => setFormData({...formData, email: e.target.value})} 
                      placeholder="contacto@empresa.com" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Teléfono</label>
                    <Input 
                      value={formData.phone || ""} 
                      onChange={e => setFormData({...formData, phone: e.target.value})} 
                      placeholder="(55) 1234-5678" 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="font-semibold text-lg border-b pb-2">Dirección (Opcional)</h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Calle</label>
                    <Input 
                      value={formData.street || ""} 
                      onChange={e => setFormData({...formData, street: e.target.value})} 
                      placeholder="Ej. Av. Reforma" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">No. Exterior</label>
                      <Input 
                        value={formData.exteriorNumber || ""} 
                        onChange={e => setFormData({...formData, exteriorNumber: e.target.value})} 
                        placeholder="123" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">No. Interior</label>
                      <Input 
                        value={formData.interiorNumber || ""} 
                        onChange={e => setFormData({...formData, interiorNumber: e.target.value})} 
                        placeholder="Piso 4" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Colonia</label>
                    <Input 
                      value={formData.neighborhood || ""} 
                      onChange={e => setFormData({...formData, neighborhood: e.target.value})} 
                      placeholder="Centro" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Ciudad / Municipio</label>
                      <Input 
                        value={formData.city || ""} 
                        onChange={e => setFormData({...formData, city: e.target.value})} 
                        placeholder="Cuauhtémoc" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Estado</label>
                      <Input 
                        value={formData.state || ""} 
                        onChange={e => setFormData({...formData, state: e.target.value})} 
                        placeholder="CDMX" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t gap-4">
              <Button type="button" variant="ghost" onClick={handleCloseForm}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Proveedor
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b">
             <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar proveedor..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
             </div>
          </div>
          {filteredVendors.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              {searchTerm ? "No se encontraron proveedores." : "Aún no tienes proveedores registrados."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="w-[100px] text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVendors.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-muted-foreground/50" />
                        {v.name}
                      </div>
                      {v.rfc && <div className="text-xs text-muted-foreground mt-1 ml-6">{v.rfc}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {v.email && (
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Mail className="w-3 h-3" /> {v.email}
                          </div>
                        )}
                        {v.phone && (
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" /> {v.phone}
                          </div>
                        )}
                        {!v.email && !v.phone && <span className="text-sm text-muted-foreground/50">Sin contacto</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenForm(v)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)}>
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
