"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Search, FileText, ArrowUpRight, ArrowDownRight, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function PolizasPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "journal_entries"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [companyId]);

  const filteredEntries = entries.filter(e => 
    e.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.entries?.some((entry: any) => entry.accountName?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <BookOpen className="w-8 h-8 text-indigo-600" />
            Libro de Pólizas (Diario)
          </h1>
          <p className="text-muted-foreground mt-1">
            Consulta los asientos contables generados automáticamente por los movimientos del sistema.
          </p>
        </div>
      </div>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-220px)]">
        <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por concepto o cuenta..." 
              className="pl-9 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm font-medium text-slate-500 bg-white px-3 py-1.5 rounded-full border">
            {filteredEntries.length} pólizas
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/50">
          {filteredEntries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium text-slate-600">No hay pólizas registradas</p>
              <p className="text-sm">Registra ingresos y egresos para generar asientos contables.</p>
            </div>
          ) : (
            filteredEntries.map(entry => (
              <div key={entry.id} className="bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className={`px-4 py-3 border-b flex justify-between items-center ${entry.type === 'ingreso' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${entry.type === 'ingreso' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {entry.type === 'ingreso' ? <ArrowDownRight className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{entry.description}</h3>
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <span>Póliza de {entry.type}</span>
                        <span>•</span>
                        <span>{new Date(entry.createdAt).toLocaleString('es-MX')}</span>
                        <span>•</span>
                        <span className="font-mono text-slate-400 text-[10px]">ID: {entry.id}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 border-b">
                      <tr>
                        <th className="text-left font-semibold px-4 py-2 w-1/2">Cuenta Contable</th>
                        <th className="text-right font-semibold px-4 py-2 w-1/4">Cargo (Debe)</th>
                        <th className="text-right font-semibold px-4 py-2 w-1/4">Abono (Haber)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entry.entries?.map((line: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{line.accountName}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">{line.accountCode}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">
                            {line.debit > 0 ? `$${line.debit.toLocaleString('es-MX', {minimumFractionDigits: 2})}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">
                            {line.credit > 0 ? `$${line.credit.toLocaleString('es-MX', {minimumFractionDigits: 2})}` : '-'}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 border-t-2 border-slate-200">
                        <td className="px-4 py-3 text-right font-bold text-slate-700">Sumas Iguales:</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">
                          ${entry.entries?.reduce((sum: number, e: any) => sum + (e.debit || 0), 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700">
                          ${entry.entries?.reduce((sum: number, e: any) => sum + (e.credit || 0), 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
