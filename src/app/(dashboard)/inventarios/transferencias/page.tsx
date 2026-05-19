"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, Truck, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export interface InventoryTransfer {
  id: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseName: string;
  status: "DRAFT" | "IN_TRANSIT" | "COMPLETED";
  items: {
    productId: string;
    variantId: string;
    productName: string;
    quantity: number;
  }[];
  createdAt: string;
  completedAt?: string;
  createdBy: string;
  notes?: string;
}

export default function TransferenciasPage() {
  const { companyId } = useAuth();
  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "inventory_transfers"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryTransfer));
      setTransfers(data);
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
      case "IN_TRANSIT":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Truck className="w-3.5 h-3.5"/> En Tránsito</span>;
      case "COMPLETED":
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle2 className="w-3.5 h-3.5"/> Completada</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transferencias</h1>
          <p className="text-muted-foreground">
            Mueve mercancía entre tus almacenes y sucursales.
          </p>
        </div>
        <Link href="/inventarios/transferencias/nueva">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Nueva Transferencia
          </Button>
        </Link>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Origen / Destino</th>
                <th className="px-6 py-4">Artículos</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Truck className="w-12 h-12 text-muted-foreground/30" />
                      <p>No hay transferencias registradas.</p>
                      <Link href="/inventarios/transferencias/nueva">
                        <Button variant="outline" size="sm" className="mt-2">Crear mi primera transferencia</Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                transfers.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs uppercase">
                      {tx.id.slice(-6)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleDateString('es-MX', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="text-muted-foreground">{tx.fromWarehouseName}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <span>{tx.toWarehouseName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {tx.items.length} {tx.items.length === 1 ? 'artículo' : 'artículos'}
                      <span className="text-muted-foreground ml-1">({tx.items.reduce((acc, item) => acc + item.quantity, 0)} uds)</span>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(tx.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/inventarios/transferencias/${tx.id}`}>
                        <Button variant="ghost" size="sm">
                          Ver Detalles
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
