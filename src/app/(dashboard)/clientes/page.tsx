"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Edit2, Users, Search, Building, Mail, Phone } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  // Fiscal Data
  rfc?: string;
  zipCode?: string;
  taxRegime?: string;
  street?: string;
  exteriorNumber?: string;
  interiorNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export default function ClientesPage() {
  const { companyId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [formData, setFormData] = useState<Partial<Client>>({});
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "clients"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [companyId]);

  const handleOpenForm = (client?: Client) => {
    if (client) {
      setCurrentId(client.id);
      setFormData(client);
    } else {
      setCurrentId("");
      setFormData({ name: "", email: "", phone: "", rfc: "", zipCode: "", taxRegime: "", street: "", exteriorNumber: "", interiorNumber: "", neighborhood: "", city: "", state: "" });
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
      const ref = doc(db, "companies", companyId, "clients", docId);
      await setDoc(ref, {
        name: formData.name.trim(),
        email: formData.email?.trim() || "",
        phone: formData.phone?.trim() || "",
        rfc: formData.rfc?.trim() || "",
        zipCode: formData.zipCode?.trim() || "",
        taxRegime: formData.taxRegime?.trim() || "",
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
      alert("Error al guardar el cliente");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Seguro que deseas eliminar este cliente?")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "clients", id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar");
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.rfc && c.rfc.toLowerCase().includes(searchTerm.toLowerCase()))
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
          <h1 className="text-3xl font-bold tracking-tight">Directorio de Clientes</h1>
          <p className="text-muted-foreground">
            Administra los datos de tus clientes para ventas y facturación.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="w-4 h-4" /> Nuevo Cliente
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-card border rounded-lg p-6 max-w-3xl animate-in fade-in zoom-in duration-300">
          <h2 className="text-xl font-bold mb-4">{currentId ? "Editar Cliente" : "Nuevo Cliente"}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* DATOS GENERALES */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Datos Generales</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Nombre Completo o Razón Social</label>
                  <Input 
                    required 
                    value={formData.name || ""} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    placeholder="Ej. Juan Pérez / Empresa S.A. de C.V." 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground"/> Correo Electrónico
                  </label>
                  <Input 
                    type="email"
                    value={formData.email || ""} 
                    onChange={e => setFormData({...formData, email: e.target.value})} 
                    placeholder="correo@ejemplo.com" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground"/> Teléfono
                  </label>
                  <Input 
                    type="tel"
                    value={formData.phone || ""} 
                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                    placeholder="10 dígitos" 
                  />
                </div>
              </div>
            </div>

            {/* DATOS FISCALES (OPCIONALES) */}
            <div className="pt-4 border-t">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
                <Building className="w-4 h-4" /> Datos de Facturación (Opcional)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">RFC</label>
                  <Input 
                    value={formData.rfc || ""} 
                    onChange={e => setFormData({...formData, rfc: e.target.value.toUpperCase()})} 
                    placeholder="XAXX010101000" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Código Postal</label>
                  <Input 
                    value={formData.zipCode || ""} 
                    onChange={e => setFormData({...formData, zipCode: e.target.value})} 
                    placeholder="00000" 
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Régimen Fiscal</label>
                  <select
                    value={formData.taxRegime || ""}
                    onChange={e => setFormData({...formData, taxRegime: e.target.value})}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="">Seleccionar régimen...</option>
                    <option value="601">601 - General de Ley Personas Morales</option>
                    <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                    <option value="605">605 - Sueldos y Salarios e Ingresos Asimilados a Salarios</option>
                    <option value="606">606 - Arrendamiento</option>
                    <option value="608">608 - Demás ingresos</option>
                    <option value="612">612 - Personas Físicas con Actividades Empresariales y Profesionales</option>
                    <option value="616">616 - Sin obligaciones fiscales</option>
                    <option value="621">621 - Incorporación Fiscal</option>
                    <option value="626">626 - Régimen Simplificado de Confianza</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Calle</label>
                  <Input 
                    value={formData.street || ""} 
                    onChange={e => setFormData({...formData, street: e.target.value})} 
                    placeholder="Ej. Av. Insurgentes Sur" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Número Exterior</label>
                  <Input 
                    value={formData.exteriorNumber || ""} 
                    onChange={e => setFormData({...formData, exteriorNumber: e.target.value})} 
                    placeholder="Ej. 1234" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Número Interior (Opcional)</label>
                  <Input 
                    value={formData.interiorNumber || ""} 
                    onChange={e => setFormData({...formData, interiorNumber: e.target.value})} 
                    placeholder="Ej. Piso 5 / Local A" 
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Colonia</label>
                  <Input 
                    value={formData.neighborhood || ""} 
                    onChange={e => setFormData({...formData, neighborhood: e.target.value})} 
                    placeholder="Ej. Del Valle" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ciudad / Municipio</label>
                  <Input 
                    value={formData.city || ""} 
                    onChange={e => setFormData({...formData, city: e.target.value})} 
                    placeholder="Ej. Benito Juárez" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Estado</label>
                  <Input 
                    value={formData.state || ""} 
                    onChange={e => setFormData({...formData, state: e.target.value})} 
                    placeholder="Ej. Ciudad de México" 
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={handleCloseForm}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Cliente
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
                  placeholder="Buscar por nombre, correo o RFC..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
             </div>
          </div>
          {filteredClients.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              {searchTerm ? "No se encontraron clientes con esa búsqueda." : "Aún no tienes clientes registrados."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium font-semibold">{c.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm text-muted-foreground">
                         {c.email && <span>{c.email}</span>}
                         {c.phone && <span>{c.phone}</span>}
                         {!c.email && !c.phone && <span>-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.rfc || <span className="text-xs italic text-muted-foreground/60">No registrado</span>}
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
