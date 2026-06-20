"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, Truck, ArrowRight, CheckCircle2, DollarSign, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExpensePaymentModal } from "@/components/payments/ExpensePaymentModal";

export interface PurchaseReceiving {
  id: string;
  vendorId: string;
  vendorName: string;
  warehouseId: string;
  warehouseName: string;
  invoiceNumber?: string;
  purchaseOrderId?: string;
  status: "COMPLETED"; // To support DRAFT/PENDING in the future
  paidAmount?: number;
  items: {
    productId: string;
    variantId: string;
    productName: string;
    quantity: number;
    unitCost: number;
  }[];
  totalCost: number;
  createdAt: string;
  createdBy: string;
  notes?: string;
}

export default function RecepcionesPage() {
  const { companyId } = useAuth();
  const [receivings, setReceivings] = useState<PurchaseReceiving[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceiving, setSelectedReceiving] = useState<PurchaseReceiving | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "createdAt" || field === "totalCost" ? "desc" : "asc");
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

  const sortedReceivings = [...receivings].sort((a, b) => {
    let aVal = a[sortField as keyof PurchaseReceiving] || "";
    let bVal = b[sortField as keyof PurchaseReceiving] || "";

    if (typeof aVal === "string" && typeof bVal === "string") {
      if (sortField === "invoiceNumber") {
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
      collection(db, "companies", companyId, "purchases"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseReceiving));
      setReceivings(data);
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recepción de Mercancía</h1>
          <p className="text-muted-foreground">
            Ingresa productos al inventario contra facturas, notas o facturas de proveedores.
          </p>
        </div>
        <Link href="/compras/recepciones/nueva" target="_blank">
          <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
            <Plus className="w-4 h-4" /> Nueva Recepción
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
                  onClick={() => handleSort("invoiceNumber")}
                >
                  <div className="flex items-center">
                    ID / Factura
                    {renderSortIcon("invoiceNumber")}
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
                  onClick={() => handleSort("warehouseName")}
                >
                  <div className="flex items-center">
                    Almacén Destino
                    {renderSortIcon("warehouseName")}
                  </div>
                </th>
                <th className="px-6 py-4">Artículos</th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("totalCost")}
                >
                  <div className="flex items-center">
                    Costo Total
                    {renderSortIcon("totalCost")}
                  </div>
                </th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedReceivings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Truck className="w-12 h-12 text-muted-foreground/30" />
                      <p>No has registrado ninguna entrada de mercancía.</p>
                      <Link href="/compras/recepciones/nueva" target="_blank">
                        <Button variant="outline" size="sm" className="mt-2">Registrar mi primera entrada</Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedReceivings.map((rec) => (
                  <tr key={rec.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-indigo-600">{rec.invoiceNumber || "S/N"}</div>
                      <div className="font-mono text-xs text-muted-foreground uppercase">{rec.id.slice(-6)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(rec.createdAt).toLocaleDateString('es-MX', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {rec.vendorName || "Proveedor General"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {rec.warehouseName}
                    </td>
                    <td className="px-6 py-4">
                      {rec.items.length} {rec.items.length === 1 ? 'artículo' : 'artículos'}
                      <span className="text-muted-foreground ml-1">({rec.items.reduce((acc, item) => acc + item.quantity, 0)} uds)</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold">${rec.totalCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                      {(rec.paidAmount || 0) > 0 && (
                        <div className="text-xs text-rose-600 font-medium">Pagado: ${(rec.paidAmount || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {(!rec.paidAmount || rec.paidAmount < rec.totalCost - 0.01) ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setSelectedReceiving(rec);
                            setIsPaymentModalOpen(true);
                          }}
                          className="bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 font-bold"
                        >
                          <DollarSign className="w-3 h-3 mr-1" /> Registrar Pago
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Pagado
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReceiving && (
        <ExpensePaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedReceiving(null);
          }}
          document={selectedReceiving}
          documentType="recepcion"
          companyId={companyId || ""}
        />
      )}
    </div>
  );
}
