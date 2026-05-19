"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { Loader2, Plus, Tag, Search, Trash2, Edit2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DescuentosPage() {
  const { companyId } = useAuth();
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "discounts"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDiscounts(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Seguro que deseas eliminar este descuento? No podrás recuperarlo.")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "discounts", id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar el descuento");
    }
  };

  const filteredDiscounts = discounts.filter(d => 
    d.title?.toLowerCase().includes(search.toLowerCase()) || 
    d.code?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string, endDate?: string) => {
    if (endDate && new Date(endDate) < new Date()) {
      return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">Expirado</span>;
    }
    switch (status) {
      case "active":
        return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">Activo</span>;
      case "scheduled":
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">Programado</span>;
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  const formatValue = (discount: any) => {
    if (discount.type === "percentage") return `${discount.value}%`;
    if (discount.type === "fixed_amount") return `$${Number(discount.value).toLocaleString('es-MX', {minimumFractionDigits:2})}`;
    return discount.value;
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
          <h1 className="text-3xl font-bold tracking-tight">Descuentos</h1>
          <p className="text-muted-foreground">
            Administra cupones y descuentos automáticos para tus ventas.
          </p>
        </div>
        <Link href="/ventas/descuentos/nuevo">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Crear Descuento
          </Button>
        </Link>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b flex items-center gap-4 bg-muted/20">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código o nombre..."
              className="pl-9 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filteredDiscounts.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <Tag className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No hay descuentos</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Crea códigos de descuento para compartirlos con tus clientes o configura promociones automáticas.
            </p>
            <Link href="/ventas/descuentos/nuevo">
              <Button>Crear tu primer descuento</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título / Código</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDiscounts.map(discount => (
                  <TableRow key={discount.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <div className="font-semibold text-foreground">
                        {discount.method === "code" ? discount.code : discount.title}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(discount.startDate).toLocaleDateString()}
                        {discount.endDate && ` - ${new Date(discount.endDate).toLocaleDateString()}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(discount.status, discount.endDate)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {discount.method === "code" ? "Código" : "Automático"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {formatValue(discount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {discount.usageCount || 0} {discount.usageLimits?.totalUsageLimit ? `/ ${discount.usageLimits.totalUsageLimit}` : ''}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/ventas/descuentos/${discount.id}`}>
                            <Edit2 className="w-4 h-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(discount.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
