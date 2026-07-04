"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy, writeBatch, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Edit2, Users, Search, Building, Mail, Phone, Eye, Upload, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
  type?: 'general' | 'fiscal';
  firstName?: string;
  paternalLastName?: string;
  maternalLastName?: string;
  commercialName?: string;
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
  razonSocial?: string;
  cfdiUse?: string;
  
  // Legacy / API fields
  LegalName?: string;
  CommercialName?: string;
  Email?: string;
  Phone?: string;
  RFC?: string;
  address?: string;
  createdAt?: string;
  updatedAt?: string;
}

const normalizeString = (str: string) => 
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();


export default function ClientesPage() {
  const { companyId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isEditing, setIsEditing] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [formData, setFormData] = useState<Partial<Client>>({ type: 'general' });
  const [similarClients, setSimilarClients] = useState<Client[]>([]);
  
  const [saving, setSaving] = useState(false);


  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "clients"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [companyId]);

  
  
  const handleCleanup = async () => {
    if (!companyId || !window.confirm("¿Seguro que deseas limpiar duplicados? Esto fusionará las direcciones importadas del CSV a los registros originales.")) return;
    setImporting(true);
    try {
      const snap = await getDocs(query(collection(db, "companies", companyId, "clients")));
      const clients = snap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
      
      const grouped: Record<string, Client[]> = {};
      clients.forEach(c => {
        const key = (c.LegalName || c.CommercialName || c.name || "UNKNOWN").trim().toUpperCase();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(c);
      });

      let updated = 0;
      let deleted = 0;
      const batches = [];
      let currentBatch = writeBatch(db);
      let operations = 0;

      for (const key of Object.keys(grouped)) {
        const group = grouped[key];
        if (group.length > 1) {
          const bindClient = group.find(c => c.id.length > 30);
          const csvClient = group.find(c => c.id.length === 20 && c.address);

          if (bindClient && csvClient) {
            const ref = doc(db, "companies", companyId, "clients", bindClient.id);
            currentBatch.update(ref, {
              address: csvClient.address || "",
              zipCode: csvClient.zipCode || "",
              city: csvClient.city || "",
              state: csvClient.state || "",
              neighborhood: csvClient.neighborhood || ""
            });
            operations++;
            
            // Delete all other duplicates in the group that are not the Bind client
            for (const dup of group) {
              if (dup.id !== bindClient.id) {
                 const delRef = doc(db, "companies", companyId, "clients", dup.id);
                 currentBatch.delete(delRef);
                 operations++;
                 deleted++;
              }
            }
            updated++;
          }
        }
        
        if (operations >= 450) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          operations = 0;
        }
      }
      
      if (operations > 0) batches.push(currentBatch);
      for (const b of batches) {
        await b.commit();
      }
      
      alert(`¡Limpieza exitosa! Se actualizaron ${updated} clientes con direcciones y se eliminaron ${deleted} duplicados.`);
    } catch(e) {
      console.error(e);
      alert("Error limpiando duplicados");
    } finally {
      setImporting(false);
    }
  };
  
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    setImporting(true);
    
    import("papaparse").then((Papa) => {
      Papa.default.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
        complete: async (results: any) => {
          try {
            const records = results.data;
            const batches = [];
            let currentBatch = writeBatch(db);
            let count = 0;
            
            for (const record of records) {
              const ref = doc(collection(db, "companies", companyId, "clients"));
              currentBatch.set(ref, {
                name: record["Razón Social"] || record["Nombre Comercial"] || record["Razn Social"] || "",
                rfc: record.RFC || "",
                email: record.Email || "",
                phone: record["Teléfonos"] || record["Telfonos"] || "",
                address: record.Calle ? `${record.Calle} ${record["No Ext"] || ''} ${record["No Interior"] || ''}`.trim() : "",
                zipCode: record.CP || "",
                city: record.Municipio || record.Ciudad || "",
                state: record.Estado || "",
                neighborhood: record.Colonia || "",
              });
              
              count++;
              if (count === 450) {
                batches.push(currentBatch);
                currentBatch = writeBatch(db);
                count = 0;
              }
            }
            if (count > 0) batches.push(currentBatch);
            
            for (const b of batches) {
              await b.commit();
            }
            
            alert(`¡Importación exitosa! Se importaron ${records.length} clientes con sus direcciones completas.`);
          } catch (error) {
            console.error(error);
            alert("Error importando CSV");
          } finally {
            setImporting(false);
            if (e.target) e.target.value = '';
          }
        }
      });
    });
  };

  const handleOpenForm = (client?: Client, viewMode = false) => {
    if (client) {
      setCurrentId(client.id);
      setFormData({
        ...client,
        name: client.LegalName || client.CommercialName || client.name || "",
        email: client.Email || client.email || "",
        phone: client.Phone || client.phone || "",
        rfc: client.RFC || client.rfc || "",
      });
    } else {
      setCurrentId("");
      setFormData({ 
        type: 'general',
        name: "", 
        firstName: "",
        paternalLastName: "",
        maternalLastName: "",
        razonSocial: "",
        commercialName: "",
        email: "", 
        phone: "", 
        rfc: "", 
        zipCode: "", 
        taxRegime: "", 
        street: "", 
        exteriorNumber: "", 
        interiorNumber: "", 
        neighborhood: "", 
        city: "", 
        state: "" 
      });
    }
    setSimilarClients([]);
    setIsEditing(true);
  };


  const handleCloseForm = () => {
    setIsEditing(false);
      setIsViewing(false);
    setCurrentId("");
    setFormData({});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalName = "";
    if (formData.type === 'general') {
      if (!formData.firstName?.trim() || !formData.paternalLastName?.trim()) {
        alert("Nombre y Apellido Paterno son obligatorios para clientes generales.");
        return;
      }
      finalName = `${formData.firstName.trim()} ${formData.paternalLastName.trim()} ${formData.maternalLastName?.trim() || ""}`.trim();
    } else {
      if (!formData.razonSocial?.trim()) {
        alert("La Razón Social es obligatoria para clientes fiscales.");
        return;
      }
      finalName = formData.razonSocial.trim();
    }

    if (!companyId) return;
    setSaving(true);
    try {
      const docId = currentId || crypto.randomUUID();
      const ref = doc(db, "companies", companyId, "clients", docId);
      await setDoc(ref, {
        ...formData,
        name: finalName,
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
        createdAt: (formData as any).createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      handleCloseForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar el cliente");
    } finally {
      setSaving(false);
    }
  };

  // Logic for similarity check
  useEffect(() => {
    if (!isEditing || currentId) {
      setSimilarClients([]);
      return;
    }

    const searchStr = formData.type === 'general' 
      ? `${formData.firstName || ""} ${formData.paternalLastName || ""}`.trim()
      : (formData.razonSocial || "").trim();

    if (searchStr.length < 3) {
      setSimilarClients([]);
      return;
    }

    const normalizedSearch = normalizeString(searchStr);
    const matches = clients.filter(c => {
      const clientName = normalizeString(c.name || c.LegalName || c.CommercialName || "");
      return clientName.includes(normalizedSearch) || normalizedSearch.includes(clientName);
    }).slice(0, 5);

    setSimilarClients(matches);
  }, [formData.firstName, formData.paternalLastName, formData.razonSocial, formData.type, isEditing, clients, currentId]);


  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Seguro que deseas eliminar este cliente?")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "clients", id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar");
    }
  };

  const filteredClients = clients.filter(c => {
    const nameVal = (c.LegalName || c.CommercialName || c.name || "").toLowerCase();
    const emailVal = (c.Email || c.email || "").toLowerCase();
    const rfcVal = (c.RFC || c.rfc || "").toLowerCase();
    const search = searchTerm.toLowerCase();
    return nameVal.includes(search) || emailVal.includes(search) || rfcVal.includes(search);
  });

  // Sorting state
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 ml-1.5 inline shrink-0" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    );
  };

  const sortedClients = [...filteredClients].sort((a, b) => {
    let aVal = "";
    let bVal = "";

    if (sortField === "name") {
      aVal = (a.LegalName || a.CommercialName || a.name || "");
      bVal = (b.LegalName || b.CommercialName || b.name || "");
    } else if (sortField === "email") {
      aVal = (a.Email || a.email || "");
      bVal = (b.Email || b.email || "");
    } else if (sortField === "rfc") {
      aVal = (a.RFC || a.rfc || "");
      bVal = (b.RFC || b.rfc || "");
    }

    return sortDirection === "asc"
      ? aVal.localeCompare(bVal, "es")
      : bVal.localeCompare(aVal, "es");
  });

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
            <div className="flex gap-2">
              <input type="file" id="csv-upload" className="hidden" accept=".csv" onChange={handleImportCSV} />
              <Button variant="outline" className="gap-2" onClick={() => document.getElementById('csv-upload')?.click()} disabled={importing}>
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? "Importando..." : "Importar CSV"}
              </Button>
              
              <Button variant="outline" className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50" onClick={handleCleanup} disabled={importing}>
                Limpiar Duplicados
              </Button>
              <Button onClick={() => handleOpenForm()} className="gap-2">

                <Plus className="w-4 h-4" /> Nuevo Cliente
              </Button>
            </div>
          )}
      </div>

      {isEditing ? (
        <div className="bg-card border rounded-lg p-6 max-w-3xl animate-in fade-in zoom-in duration-300">
          <h2 className="text-xl font-bold mb-4">{currentId ? (isViewing ? "Ver Cliente" : "Editar Cliente") : "Nuevo Cliente"}</h2>
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* TIPO DE CLIENTE */}
            <div className="bg-muted/30 p-4 rounded-lg border border-primary/10">
              <label className="text-sm font-semibold mb-2 block uppercase tracking-wider text-primary">Tipo de Cliente</label>
              <div className="flex gap-4">
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-md border-2 cursor-pointer transition-all ${formData.type === 'general' ? 'bg-primary/10 border-primary shadow-sm' : 'bg-background border-transparent hover:border-muted-foreground/20'}`}>
                  <input type="radio" className="hidden" name="type" value="general" checked={formData.type === 'general'} onChange={() => setFormData({...formData, type: 'general'})} disabled={isViewing} />
                  <Users className={`w-4 h-4 ${formData.type === 'general' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-bold ${formData.type === 'general' ? 'text-primary' : 'text-muted-foreground'}`}>General (Persona Física)</span>
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-md border-2 cursor-pointer transition-all ${formData.type === 'fiscal' ? 'bg-primary/10 border-primary shadow-sm' : 'bg-background border-transparent hover:border-muted-foreground/20'}`}>
                  <input type="radio" className="hidden" name="type" value="fiscal" checked={formData.type === 'fiscal'} onChange={() => setFormData({...formData, type: 'fiscal'})} disabled={isViewing} />
                  <Building className={`w-4 h-4 ${formData.type === 'fiscal' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-bold ${formData.type === 'fiscal' ? 'text-primary' : 'text-muted-foreground'}`}>Fiscal (Persona Moral)</span>
                </label>
              </div>
            </div>

            {/* DATOS GENERALES */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Identificación</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {formData.type === 'general' ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nombre(s) *</label>
                      <Input disabled={isViewing} 
                        required 
                        value={formData.firstName || ""} 
                        onChange={e => setFormData({...formData, firstName: e.target.value})} 
                        placeholder="Ej. Juan" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Apellido Paterno *</label>
                      <Input disabled={isViewing} 
                        required 
                        value={formData.paternalLastName || ""} 
                        onChange={e => setFormData({...formData, paternalLastName: e.target.value})} 
                        placeholder="Ej. Pérez" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Apellido Materno (Opcional)</label>
                      <Input disabled={isViewing} 
                        value={formData.maternalLastName || ""} 
                        onChange={e => setFormData({...formData, maternalLastName: e.target.value})} 
                        placeholder="Ej. García" 
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 sm:col-span-2">
                    <label className="text-sm font-medium">Razón Social *</label>
                    <Input disabled={isViewing} 
                      required 
                      value={formData.razonSocial || ""} 
                      onChange={e => setFormData({...formData, razonSocial: e.target.value})} 
                      placeholder="Ej. Empresa Mexicana S.A. de C.V." 
                    />
                  </div>
                )}

                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Nombre Comercial (Opcional)</label>
                  <Input disabled={isViewing} 
                    value={formData.commercialName || ""} 
                    onChange={e => setFormData({...formData, commercialName: e.target.value})} 
                    placeholder="Ej. Mi Tiendita" 
                  />
                </div>

                {/* SIMILAR CLIENTS ALERT */}
                {!currentId && similarClients.length > 0 && (
                  <div className="sm:col-span-2 bg-orange-50 border border-orange-200 rounded-lg p-3 animate-in slide-in-from-top-2">
                    <p className="text-xs font-bold text-orange-800 mb-2 flex items-center gap-2">
                      ⚠️ ¡Atención! Ya existen clientes con nombres similares:
                    </p>
                    <ul className="space-y-1">
                      {similarClients.map(c => (
                        <li key={c.id} className="text-xs text-orange-700 flex items-center justify-between bg-white/50 p-1.5 rounded border border-orange-100">
                          <span className="font-medium">{c.name || c.LegalName}</span>
                          {c.rfc && <span className="opacity-70">{c.rfc}</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-orange-600 mt-2 italic">Por favor, verifica que no sea el mismo cliente antes de continuar.</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground"/> Correo Electrónico
                  </label>
                  <Input disabled={isViewing} 
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
                  <Input disabled={isViewing} 
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
                  <Input disabled={isViewing} 
                    value={formData.rfc || ""} 
                    onChange={e => setFormData({...formData, rfc: e.target.value.toUpperCase()})} 
                    placeholder="XAXX010101000" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Código Postal</label>
                  <Input disabled={isViewing} 
                    value={formData.zipCode || ""} 
                    onChange={e => setFormData({...formData, zipCode: e.target.value})} 
                    placeholder="00000" 
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Régimen Fiscal</label>
                  <select disabled={isViewing}
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
                  <Input disabled={isViewing} 
                    value={formData.street || ""} 
                    onChange={e => setFormData({...formData, street: e.target.value})} 
                    placeholder="Ej. Av. Insurgentes Sur" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Número Exterior</label>
                  <Input disabled={isViewing} 
                    value={formData.exteriorNumber || ""} 
                    onChange={e => setFormData({...formData, exteriorNumber: e.target.value})} 
                    placeholder="Ej. 1234" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Número Interior (Opcional)</label>
                  <Input disabled={isViewing} 
                    value={formData.interiorNumber || ""} 
                    onChange={e => setFormData({...formData, interiorNumber: e.target.value})} 
                    placeholder="Ej. Piso 5 / Local A" 
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Colonia</label>
                  <Input disabled={isViewing} 
                    value={formData.neighborhood || ""} 
                    onChange={e => setFormData({...formData, neighborhood: e.target.value})} 
                    placeholder="Ej. Del Valle" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ciudad / Municipio</label>
                  <Input disabled={isViewing} 
                    value={formData.city || ""} 
                    onChange={e => setFormData({...formData, city: e.target.value})} 
                    placeholder="Ej. Benito Juárez" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Estado</label>
                  <Input disabled={isViewing} 
                    value={formData.state || ""} 
                    onChange={e => setFormData({...formData, state: e.target.value})} 
                    placeholder="Ej. Ciudad de México" 
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button type="button" variant={isViewing ? "default" : "ghost"} onClick={handleCloseForm}>{isViewing ? "Cerrar" : "Cancelar"}</Button>
              {!isViewing && (
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar Cliente
                </Button>
              )}
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b">
             <div className="relative max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input disabled={isViewing} 
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
                  <TableHead className="cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("name")}>
                    <div className="flex items-center">
                      Nombre
                      {renderSortIcon("name")}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("email")}>
                    <div className="flex items-center">
                      Contacto
                      {renderSortIcon("email")}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("rfc")}>
                    <div className="flex items-center">
                      RFC
                      {renderSortIcon("rfc")}
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedClients.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium font-semibold">{(c.LegalName || c.CommercialName || c.name)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm text-muted-foreground">
                         {(c.Email || c.email) && <span>{(c.Email || c.email)}</span>}
                         {(c.Phone || c.phone) && <span>{(c.Phone || c.phone)}</span>}
                         {!(c.Email || c.email) && !(c.Phone || c.phone) && <span>-</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {(c.RFC || c.rfc) || <span className="text-xs italic text-muted-foreground/60">No registrado</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenForm(c, true)} title="Ver Cliente">
                          <Eye className="w-4 h-4" />
                        </Button>
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

