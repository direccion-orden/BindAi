"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, FolderOpen, Plus, User, Calendar, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Project {
  id: string;
  name: string;
  description: string;
  clientId: string;
  clientName: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  
  // These will be calculated or stored
  accumulatedSales?: number;
  balanceDue?: number;
}

export default function ProyectosPage() {
  const { companyId } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // New Project Form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");

  useEffect(() => {
    if (!companyId) return;

    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "projects"), orderBy("createdAt", "desc")), (snap) => {
      setProjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
      setLoading(false);
    });
    
    const unsubC = onSnapshot(collection(db, "companies", companyId, "clients"), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubP(); unsubC(); };
  }, [companyId]);

  const handleCreateProject = async () => {
    if (!companyId || !newName || !newClientId) {
      alert("El nombre y el cliente son obligatorios.");
      return;
    }
    
    const client = clients.find(c => c.id === newClientId);

    try {
      const projId = crypto.randomUUID();
      await setDoc(doc(db, "companies", companyId, "projects", projId), {
        id: projId,
        name: newName,
        description: newDesc,
        clientId: newClientId,
        clientName: client?.name || "Desconocido",
        startDate: newStartDate,
        endDate: newEndDate,
        accumulatedSales: 0,
        balanceDue: 0,
        createdAt: new Date().toISOString()
      });
      
      setIsModalOpen(false);
      setNewName("");
      setNewDesc("");
      setNewClientId("");
      setNewStartDate("");
      setNewEndDate("");
    } catch (error) {
      console.error(error);
      alert("Error al crear el proyecto.");
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proyectos</h1>
          <p className="text-muted-foreground">
            Agrupa cotizaciones, pedidos y remisiones por proyecto.
          </p>
        </div>
        
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-4 h-4" /> Nuevo Proyecto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nuevo Proyecto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre del Proyecto *</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej. Instalación Torre B" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cliente *</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={newClientId}
                  onChange={e => setNewClientId(e.target.value)}
                >
                  <option value="">Selecciona un cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Descripción</label>
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Breve descripción del alcance..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fecha Inicio</label>
                  <Input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Fecha Fin (Estimada)</label>
                  <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
                </div>
              </div>
              <Button className="w-full mt-4 bg-indigo-600" onClick={handleCreateProject}>Guardar Proyecto</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed rounded-xl border-slate-200">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <h3 className="font-medium text-slate-900">No hay proyectos</h3>
            <p className="text-sm text-slate-500 mt-1">Crea tu primer proyecto para empezar a organizar tus ventas.</p>
          </div>
        ) : (
          projects.map(project => (
            <div key={project.id} className="bg-white border rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow relative group">
              <Button variant="ghost" size="icon" className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="w-4 h-4 text-slate-400" />
              </Button>
              
              <div className="mb-4">
                <h3 className="font-bold text-lg text-slate-900 line-clamp-1" title={project.name}>{project.name}</h3>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 min-h-[32px]">{project.description || 'Sin descripción'}</p>
              </div>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <User className="w-4 h-4 text-slate-400" />
                  <span className="font-medium truncate">{project.clientName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>
                    {project.startDate ? new Date(project.startDate + "T12:00:00").toLocaleDateString() : '--'} 
                    <span className="mx-1 text-slate-300">/</span> 
                    {project.endDate ? new Date(project.endDate + "T12:00:00").toLocaleDateString() : '--'}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Venta Acumulada</p>
                  <p className="font-bold text-emerald-700">${(project.accumulatedSales || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Saldo X Cobrar</p>
                  <p className="font-bold text-rose-600">${(project.balanceDue || 0).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
