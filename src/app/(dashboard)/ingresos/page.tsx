"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, DollarSign, ArrowUpRight, Search, FileText, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { NewIncomeModal } from "@/components/payments/NewIncomeModal";

export default function IngresosPage() {
  const { companyId } = useAuth();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewIncomeModalOpen, setIsNewIncomeModalOpen] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "payments"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPayments(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching payments:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const filteredPayments = payments.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.clientName?.toLowerCase().includes(term) ||
      p.documentNumber?.toLowerCase().includes(term) ||
      p.reference?.toLowerCase().includes(term) ||
      p.method?.toLowerCase().includes(term)
    );
  });

  const totalIngresos = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

  const getDocumentLink = (type: string, id: string) => {
    switch (type) {
      case "pedido": return `/ventas/pedidos/${id}`;
      case "remision": return `/ventas/remisiones/${id}`;
      case "factura": return `/ventas/facturas/${id}`;
      case "pos": return null; // No detail page for POS sales yet
      default: return null;
    }
  };

  const getDocumentLabel = (type: string, number: string) => {
    const num = number || "N/A";
    switch (type) {
      case "pedido": return `PED-${num}`;
      case "remision": return `REM-${num}`;
      case "factura": return `FAC-${num}`;
      case "pos": return `POS-${num}`;
      default: return `DOC-${num}`;
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-emerald-600" />
            Ingresos Recibidos
          </h1>
          <p className="text-muted-foreground mt-1">Historial de pagos registrados contra documentos comerciales y Punto de Venta.</p>
        </div>
        
        <Button onClick={() => setIsNewIncomeModalOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
          <PlusCircle className="w-4 h-4" />
          Registrar Ingreso
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex flex-col justify-center">
          <p className="text-emerald-800 font-semibold text-sm uppercase mb-1">Total Ingresos Mostrados</p>
          <p className="text-4xl font-black text-emerald-700">
            ${totalIngresos.toLocaleString('es-MX', {minimumFractionDigits: 2})}
          </p>
        </div>
        <div className="md:col-span-2 bg-white rounded-xl shadow-sm border p-6 flex flex-col justify-center">
          <p className="text-sm font-semibold text-slate-500 mb-2">Buscar Pagos</p>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Buscar por cliente, folio, referencia o método..." 
              className="pl-10 h-12 text-lg bg-slate-50 border-slate-200"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600">Fecha</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Cliente</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Documento</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Método</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Referencia</th>
                <th className="px-4 py-3 font-semibold text-slate-600 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No se encontraron pagos.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => {
                  const docLink = getDocumentLink(payment.documentType, payment.documentId);
                  
                  return (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {payment.date}
                        {payment.createdAt && <div className="text-[10px] text-muted-foreground">{new Date(payment.createdAt).toLocaleTimeString()}</div>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {payment.clientName}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold capitalize border">
                            {payment.documentType}
                          </span>
                          {docLink ? (
                            <Link href={docLink} className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center font-medium">
                              {getDocumentLabel(payment.documentType, payment.documentNumber)} <ArrowUpRight className="w-3 h-3 ml-0.5" />
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-700">
                              {getDocumentLabel(payment.documentType, payment.documentNumber)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 capitalize font-medium text-slate-700">
                        {payment.method}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {payment.reference || '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        ${(parseFloat(payment.amount) || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewIncomeModal 
        isOpen={isNewIncomeModalOpen} 
        onClose={() => setIsNewIncomeModalOpen(false)} 
        companyId={companyId || ""} 
      />
    </div>
  );
}
