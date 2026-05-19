"use client"

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
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

  const filteredAnticipos = anticipos.filter(a => {
    const matchesSearch = 
      (a.clientName?.toLowerCase() || "").includes(searchQuery.toLowerCase()) || 
      (a.reference?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Anticipos</h1>
          <p className="text-muted-foreground">
            Gestiona los anticipos de clientes y aplícalos a documentos del ERP.
          </p>
        </div>
        <Link href="/nuevo">
          <Button className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Registrar Anticipo
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center bg-card p-4 rounded-md border shadow-sm">
        <div className="relative w-full sm:w-72">
          <input 
            type="text" 
            placeholder="Buscar por cliente o referencia..." 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <select 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="partially_applied">Parciales</option>
            <option value="applied">Aplicados</option>
          </select>
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
