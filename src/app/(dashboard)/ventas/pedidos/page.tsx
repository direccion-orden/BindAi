"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Package, Truck, CheckCircle2, User, FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface Order {
  id: string;
  orderNumber: string;
  quoteNumber: string;
  clientName: string;
  totalAmount: number;
  status: string; // 'por_surtir', 'surtido', 'entregado', 'remisionado'
  createdAt: string;
  createdBy: string;
}

export default function PedidosPage() {
  const { companyId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (!companyId) return;

    const unsubQ = onSnapshot(query(collection(db, "companies", companyId, "pedidos"), orderBy("createdAt", "desc")), (snap) => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      setLoading(false);
    });

    return () => unsubQ();
  }, [companyId]);

  const filteredOrders = orders.filter(order => {
    // 1. Search text
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchesFolio = order.orderNumber?.toLowerCase().includes(term);
      const matchesClient = order.clientName?.toLowerCase().includes(term);
      if (!matchesFolio && !matchesClient) return false;
    }
    // 2. Status filter
    if (statusFilter !== "all" && order.status !== statusFilter) {
      return false;
    }
    // 3. Date range
    if (dateFrom) {
      const orderDate = order.createdAt.substring(0, 10);
      if (orderDate < dateFrom) return false;
    }
    if (dateTo) {
      const orderDate = order.createdAt.substring(0, 10);
      if (orderDate > dateTo) return false;
    }
    return true;
  });

  const totalFilteredAmount = filteredOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pedidos en Proceso</h1>
          <p className="text-muted-foreground">
            Gestiona el surtido, empaque y preparación de envíos.
          </p>
        </div>
        <Link href="/ventas/pedidos/nuevo">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
            <Plus className="w-4 h-4" /> Nuevo Pedido Directo
          </Button>
        </Link>
      </div>

      {/* Modern Filter Panel */}
      <div className="flex flex-col md:flex-row gap-4 items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-end flex-1 w-full">
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Buscar
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Folio o nombre del cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
              <option value="all">Todos</option>
              <option value="por_surtir">Por Surtir</option>
              <option value="surtido">Surtido / Listo</option>
              <option value="remisionado">Remisionado</option>
            </select>
          </div>

          <div className="space-y-1 w-full sm:w-36">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desde</span>
            <Input
              type="date"
              className="h-9"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="space-y-1 w-full sm:w-36">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hasta</span>
            <Input
              type="date"
              className="h-9"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div className="text-right whitespace-nowrap bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2 self-stretch flex flex-col justify-center">
          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Monto Total Filtrado</span>
          <span className="text-lg font-black text-indigo-800">${totalFilteredAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">No. Pedido</th>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Cotización Ref.</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Estatus</th>
                <th className="px-6 py-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No se encontraron pedidos con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{order.orderNumber}</td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        {order.clientName}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground text-xs">
                      {order.quoteNumber}
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-700">
                      ${order.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}
                    </td>
                    <td className="px-6 py-4">
                      {order.status === 'por_surtir' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">Por Surtir</span>}
                      {order.status === 'surtido' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">Surtido / Listo</span>}
                      {order.status === 'remisionado' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">Remisionado</span>}
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/ventas/pedidos/${order.id}`}>
                        <Button variant="outline" size="sm" className="h-8 gap-2">
                          <FileText className="w-4 h-4" /> Ver Detalles
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
