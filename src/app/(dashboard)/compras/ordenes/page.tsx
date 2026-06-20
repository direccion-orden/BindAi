"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, FileText, Clock, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export interface PurchaseOrderItem {
  productId?: string;
  productName: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  status: "DRAFT" | "SENT" | "PARTIAL" | "COMPLETED" | "CANCELLED";
  totalAmount: number;
  expectedDate?: string;
  createdAt: string;
  createdBy: string;
  notes?: string;
  paidAmount?: number;
  locationId?: string;
  locationName?: string;
  items: PurchaseOrderItem[];
}

export default function OrdenesCompraPage() {
  const { companyId } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Sorting state
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "createdAt" || field === "totalAmount" ? "desc" : "asc");
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

  const sortedOrders = [...orders].sort((a, b) => {
    let aVal = a[sortField as keyof PurchaseOrder] || "";
    let bVal = b[sortField as keyof PurchaseOrder] || "";

    if (typeof aVal === "string" && typeof bVal === "string") {
      if (sortField === "orderNumber") {
        const aNum = parseInt(aVal.replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(bVal.replace(/\D/g, ""), 10) || 0;
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
      return sortDirection === "asc" 
        ? aVal.localeCompare(bVal, "es") 
        : bVal.localeCompare(aVal, "es");
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "purchase_orders"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder));
      setOrders(data);
      setLoading(false);
    });

    return () => unsub();
  }, [companyId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><Clock className="w-3.5 h-3.5"/> Borrador</span>;
      case "SENT":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><FileText className="w-3.5 h-3.5"/> Enviada</span>;
      case "PARTIAL":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800"><Truck className="w-3.5 h-3.5"/> Surtida Parcial</span>;
      case "COMPLETED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-3.5 h-3.5"/> Surtida</span>;
      case "CANCELLED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"><CheckCircle2 className="w-3.5 h-3.5"/> Cancelada</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Órdenes de Compra</h1>
          <p className="text-muted-foreground">
            Gestiona requisiciones a proveedores y haz seguimiento a las entregas.
          </p>
        </div>
        <Link href="/compras/ordenes/nueva" target="_blank">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
            <Plus className="w-4 h-4" /> Nueva Orden
          </Button>
        </Link>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("orderNumber")}
                >
                  <div className="flex items-center">
                    Folio
                    {renderSortIcon("orderNumber")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("createdAt")}
                >
                  <div className="flex items-center">
                    Fecha
                    {renderSortIcon("createdAt")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("vendorName")}
                >
                  <div className="flex items-center">
                    Proveedor
                    {renderSortIcon("vendorName")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center">
                    Estado
                    {renderSortIcon("status")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("totalAmount")}
                >
                  <div className="flex items-center">
                    Total Esperado
                    {renderSortIcon("totalAmount")}
                  </div>
                </th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <FileText className="w-12 h-12 text-muted-foreground/30" />
                      <p>Aún no hay órdenes de compra registradas.</p>
                      <p className="text-xs max-w-md mx-auto">Este módulo se encuentra en desarrollo. Por ahora, registra tus compras finalizadas directamente en el módulo de Recepción de Mercancía.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-indigo-600">
                      {order.orderNumber || order.id.slice(-6).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString('es-MX', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {order.vendorName || "Proveedor General"}
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="px-6 py-4 font-bold">
                      ${order.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/compras/ordenes/${order.id}`} target="_blank">
                        <Button variant="ghost" size="sm">Ver Detalle</Button>
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
