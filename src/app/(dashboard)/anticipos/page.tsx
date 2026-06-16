"use client"

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, Search, Calendar, Wallet } from "lucide-react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { AplicarAnticipoModal } from "@/components/anticipos/AplicarAnticipoModal";
import { DetalleAnticipoModal } from "@/components/anticipos/DetalleAnticipoModal";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { companyId } = useAuth();
  const [anticipos, setAnticipos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedAnticipo, setSelectedAnticipo] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selectedAnticipoForEdit, setSelectedAnticipoForEdit] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleDateFilterChange = (option: string) => {
    setDateFilterOption(option);
    
    const getLocalDateString = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    
    if (option === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (option === "today") {
      const todayStr = getLocalDateString(now);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (option === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setDateFrom(yesterdayStr);
      setDateTo(yesterdayStr);
    } else if (option === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(getLocalDateString(startOfMonth));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(getLocalDateString(startOfLastMonth));
      setDateTo(getLocalDateString(endOfLastMonth));
    } else if (option === "this_year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setDateFrom(getLocalDateString(startOfYear));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setDateFrom(getLocalDateString(thirtyDaysAgo));
      setDateTo(getLocalDateString(now));
    }
  };

  const filteredAnticipos = anticipos.filter(a => {
    const matchesSearch = 
      (a.clientName?.toLowerCase() || "").includes(searchQuery.toLowerCase()) || 
      (a.reference?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    
    // Date filter
    let matchesDate = true;
    if (dateFrom || dateTo) {
      const localDate = (() => {
        let dateObj: Date | null = null;
        if (a.receivedAt) {
          dateObj = new Date(a.receivedAt);
        } else if (a.createdAt) {
          dateObj = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        }
        if (!dateObj || isNaN(dateObj.getTime())) return "";
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })();
      if (dateFrom && localDate < dateFrom) matchesDate = false;
      if (dateTo && localDate > dateTo) matchesDate = false;
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const totalOriginal = filteredAnticipos.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
  const totalRestante = filteredAnticipos.reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "anticipos"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnticipos(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const openModalFor = (anticipo: any) => {
    setSelectedAnticipo(anticipo);
    setIsModalOpen(true);
  };

  const openEditModalFor = (anticipo: any) => {
    setSelectedAnticipoForEdit(anticipo);
    setIsEditModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "pending":
        return <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-semibold">Pendiente</span>;
      case "partially_applied":
        return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-semibold">Parcial</span>;
      case "applied":
        return <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs font-semibold">Aplicado</span>;
      default:
        return <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs font-semibold">{status}</span>;
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Wallet className="w-8 h-8 text-indigo-600" />
            Anticipos de Clientes
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona los anticipos recibidos y aplícalos a documentos comerciales o de cobro.
          </p>
        </div>
        
        <Link href="/nuevo" target="_blank">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
            <Plus className="w-4 h-4" />
            Registrar Anticipo
          </Button>
        </Link>
      </div>

      {/* Modern Filter Panel */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-end flex-1 w-full">
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Buscar
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Cliente o referencia..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-1 w-full sm:w-40">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Estatus
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="partially_applied">Parciales</option>
              <option value="applied">Aplicados</option>
            </select>
          </div>

          <div className="space-y-1 w-full sm:w-44">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Fecha
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={dateFilterOption}
              onChange={(e) => handleDateFilterChange(e.target.value)}
            >
              <option value="all">Cualquier fecha</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="this_month">Este Mes</option>
              <option value="last_month">Mes Anterior</option>
              <option value="last_30_days">Últimos 30 Días</option>
              <option value="this_year">Este Año</option>
              <option value="custom">Rango Personalizado</option>
            </select>
          </div>

          {dateFilterOption === "custom" && (
            <>
              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desde</span>
                <Input
                  type="date"
                  className="h-9 bg-background"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hasta</span>
                <Input
                  type="date"
                  className="h-9 bg-background"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="text-right whitespace-nowrap bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2 self-center flex flex-col justify-center ml-auto">
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Total Original / Restante</span>
          <span className="text-lg font-black text-indigo-800">
            ${totalOriginal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} / ${totalRestante.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : anticipos.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            Aún no hay anticipos registrados.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden md:table-cell">Folio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Forma Pago</TableHead>
                <TableHead className="hidden md:table-cell">Cuenta Destino</TableHead>
                <TableHead className="hidden md:table-cell">Referencia</TableHead>
                <TableHead className="hidden md:table-cell">Evidencia</TableHead>
                <TableHead className="text-right">Monto Original</TableHead>
                <TableHead className="text-right">Saldo Restante</TableHead>
                <TableHead className="text-center hidden md:table-cell">Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAnticipos.map((a) => (
                <React.Fragment key={a.id}>
                  <TableRow 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openEditModalFor(a)}
                  >
                    <TableCell className="font-semibold text-muted-foreground whitespace-nowrap hidden md:table-cell">
                      ANT-{a.folio ? String(a.folio).padStart(4, '0') : a.id.substring(0, 5).toUpperCase()}
                    </TableCell>
                    <TableCell>{a.receivedAt ? new Date(a.receivedAt).toLocaleDateString() : (a.createdAt?.toDate ? a.createdAt.toDate().toLocaleDateString() : 'N/A')}</TableCell>
                    <TableCell className="font-medium">{a.clientName}</TableCell>
                    <TableCell>{a.paymentTermName || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">{a.bankAccountName || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">{a.reference || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {a.imageUrl ? (
                        <a href={a.imageUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-primary hover:underline text-xs shrink-0 line-clamp-1 block max-w-16">
                          Ver Foto
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">${a.amount?.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">${a.balance?.toFixed(2)}</TableCell>
                    <TableCell className="text-center hidden md:table-cell">{getStatusBadge(a.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={(e) => { e.stopPropagation(); openModalFor(a); }}
                        disabled={a.balance <= 0}
                      >
                        Aplicar
                      </Button>
                    </TableCell>
                  </TableRow>
                  
                  {/* Desglose de Aplicaciones */}
                  {a.applications && a.applications.length > 0 && (
                    <TableRow className="bg-muted/10 border-b">
                      <TableCell colSpan={10} className="py-2 px-6 text-sm text-muted-foreground">
                        <div className="flex flex-col gap-1 pl-4 border-l-2 border-border/50">
                          <span className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                            Historial de Aplicaciones:
                          </span>
                          {a.applications.map((app: any, idx: number) => {
                            const dateStr = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : '';
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs py-0.5">
                                <span className="text-muted-foreground w-20">{dateStr}</span>
                                <span className="w-32 truncate">• {app.erpDocumentNumber}</span>
                                <span className="font-medium text-foreground w-24">
                                  ${app.amount?.toFixed(2)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {selectedAnticipo && (
        <AplicarAnticipoModal 
          isOpen={isModalOpen}
          onOpenChange={setIsModalOpen}
          anticipo={selectedAnticipo}
          onSuccess={() => console.log('Éxito')}
        />
      )}

      {selectedAnticipoForEdit && (
        <DetalleAnticipoModal 
          isOpen={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          anticipo={selectedAnticipoForEdit}
        />
      )}
    </div>
  );
}
