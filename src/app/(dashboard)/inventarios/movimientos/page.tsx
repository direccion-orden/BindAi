"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ArrowUpRight, ArrowDownRight, RefreshCcw } from "lucide-react";

export interface InventoryTransaction {
  id: string;
  type: "IN" | "OUT" | "TRANSFER" | "ADJUSTMENT";
  productId: string;
  productName: string;
  quantity: number;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  referenceId?: string | null;
  reason?: string;
  createdAt: string;
  createdBy: string;
}

export default function MovimientosPage() {
  const { companyId } = useAuth();
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    // Listen to the last 100 transactions
    const q = query(
      collection(db, "companies", companyId, "inventory_transactions"),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryTransaction));
      setTransactions(data);
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

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "IN": return <ArrowDownRight className="w-4 h-4 text-emerald-500" />;
      case "OUT": return <ArrowUpRight className="w-4 h-4 text-destructive" />;
      case "TRANSFER": return <RefreshCcw className="w-4 h-4 text-blue-500" />;
      default: return <RefreshCcw className="w-4 h-4 text-amber-500" />;
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case "IN": return "Entrada";
      case "OUT": return "Salida";
      case "TRANSFER": return "Transferencia";
      case "ADJUSTMENT": return "Ajuste";
      default: return type;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Movimientos de Inventario</h1>
        <p className="text-muted-foreground">
          Libro mayor de transacciones. Todas las entradas, salidas y ajustes quedan registrados aquí de forma inmutable.
        </p>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4 text-right">Cantidad</th>
                <th className="px-6 py-4">Motivo / Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No hay movimientos registrados aún.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString('es-MX', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-background rounded-full border shadow-sm">
                          {getTransactionIcon(tx.type)}
                        </div>
                        <span className="font-medium">{getTransactionLabel(tx.type)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {tx.productName}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-flex items-center px-2 py-1 rounded-md font-bold ${
                        tx.type === 'IN' ? 'text-emerald-700 bg-emerald-100' : 
                        tx.type === 'OUT' ? 'text-destructive bg-destructive/10' : 
                        'text-blue-700 bg-blue-100'
                      }`}>
                        {tx.type === 'IN' ? '+' : tx.type === 'OUT' ? '-' : ''}{tx.quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {tx.reason || tx.referenceId || "N/A"}
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
