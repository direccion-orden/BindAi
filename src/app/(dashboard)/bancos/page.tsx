"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, orderBy, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Building2, UploadCloud, ArrowRightLeft, Settings2, Loader2, Search, FileText, RefreshCw } from "lucide-react";
import { BankTransaction } from "@/types/bank";
import { CSVUploadModal } from "./components/CSVUploadModal";
import { TransferModal } from "./components/TransferModal";
import { AdjustmentModal } from "./components/AdjustmentModal";
import { BankSyncModal } from "./components/BankSyncModal";
import { QuickReconcileModal } from "./components/QuickReconcileModal";
import { Input } from "@/components/ui/input";

interface BankAccount {
  id: string;
  name: string;
  type: "cash" | "bank" | "terminal";
  currency: string;
  initialBalance: number;
  Name?: string;
  CurrencyCode?: string;
}

export default function BancosPage() {
  const { companyId } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");

  const [isCSVModalOpen, setIsCSVModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<"history" | "reconcile">("history");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "bankAccounts"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BankAccount));
      setAccounts(data);
      if (data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(data[0].id);
      }
      setLoadingAccounts(false);
    });
    return () => unsubscribe();
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !selectedAccountId) {
      setTransactions([]);
      return;
    }
    setLoadingTransactions(true);
    const q = query(
      collection(db, "companies", companyId, "bankAccounts", selectedAccountId, "transactions"),
      orderBy("date", "desc"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BankTransaction));
      setTransactions(data);
      setLoadingTransactions(false);
    });
    return () => unsubscribe();
  }, [companyId, selectedAccountId]);

  const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

  const currentBalance = useMemo(() => {
    if (!selectedAccount) return 0;
    const initial = selectedAccount.initialBalance || 0;
    const totalTransactions = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    return initial + totalTransactions;
  }, [selectedAccount, transactions]);

  const filteredTransactions = useMemo(() => {
    if (!searchQuery) return transactions;
    const lowerQ = searchQuery.toLowerCase();
    return transactions.filter(t => 
      t.concept.toLowerCase().includes(lowerQ) || 
      (t.reference && t.reference.toLowerCase().includes(lowerQ))
    );
  }, [transactions, searchQuery]);

  const displayedTransactions = useMemo(() => {
    if (activeTab === "reconcile") {
      return filteredTransactions.filter(t => !t.reconciled);
    }
    return filteredTransactions;
  }, [filteredTransactions, activeTab]);

  const formatMoney = (amount: number, currency: string = "MXN") => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
  };

  if (loadingAccounts) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Building2 className="w-8 h-8 text-primary" />
            Movimientos Bancarios
          </h1>
          <p className="text-muted-foreground mt-1">Consulta y concilia tus estados de cuenta</p>
        </div>
        
        <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setIsSyncModalOpen(true)} disabled={!selectedAccountId}>
                <RefreshCw className="w-4 h-4 text-indigo-600" /> Sincronizar Banco
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setIsAdjustmentModalOpen(true)} disabled={!selectedAccountId}>
                <Settings2 className="w-4 h-4" /> Ajuste Manual
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setIsTransferModalOpen(true)} disabled={accounts.length < 2}>
                <ArrowRightLeft className="w-4 h-4" /> Transferencia
            </Button>
            <Button className="gap-2" onClick={() => setIsCSVModalOpen(true)} disabled={!selectedAccountId}>
                <UploadCloud className="w-4 h-4" /> Carga Masiva CSV
            </Button>
        </div>
      </div>

      {/* Horizontal Account Banner */}
      <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cuenta Seleccionada</label>
          <select 
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="h-10 w-64 px-3 rounded-md border bg-background text-sm font-semibold focus:ring-2 focus:ring-primary outline-none"
          >
              {accounts.length === 0 && <option value="">Sin cuentas...</option>}
              {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{(acc.Name || acc.name)} ({(acc.CurrencyCode || acc.currency || 'MXN')})</option>
              ))}
          </select>
        </div>

        {selectedAccount && (
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Saldo Inicial</p>
              <p className="text-sm font-bold text-slate-700">
                {formatMoney(selectedAccount.initialBalance || 0, selectedAccount.currency)}
              </p>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="text-right">
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-0.5">Saldo Actual Calculado</p>
              <p className={`text-2xl font-black ${currentBalance < 0 ? 'text-red-600' : 'text-foreground'}`}>
                {formatMoney(currentBalance, selectedAccount.currency)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="w-full bg-card border rounded-xl shadow-sm flex flex-col h-[600px]">
              <div className="p-2 border-b flex items-center justify-between gap-4 bg-slate-50/50 rounded-t-xl shrink-0">
                  <div className="flex gap-2">
                      <button
                          onClick={() => setActiveTab("history")}
                          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'history' ? 'bg-white border shadow text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                          Historial de Movimientos
                      </button>
                      <button
                          onClick={() => setActiveTab("reconcile")}
                          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'reconcile' ? 'bg-white border shadow text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                          Conciliación Pendiente
                          {filteredTransactions.filter(t => !t.reconciled).length > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700 animate-pulse">
                              {filteredTransactions.filter(t => !t.reconciled).length}
                            </span>
                          )}
                      </button>
                  </div>
                  <div className="relative w-64">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                          type="search" 
                          placeholder="Buscar concepto o referencia..." 
                          className="pl-9 bg-background h-9"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                      />
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                  {loadingTransactions ? (
                      <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                  ) : displayedTransactions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground opacity-60">
                          <FileText className="w-12 h-12 mb-3 opacity-20" />
                          <p>No hay movimientos registrados {activeTab === "reconcile" ? "pendientes de conciliar" : ""}.</p>
                          <p className="text-sm">Realiza una carga masiva o añade un ajuste manual.</p>
                      </div>
                  ) : (
                      <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
                              <tr>
                                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Fecha</th>
                                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Concepto / Referencia</th>
                                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Cargo (-)</th>
                                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Abono (+)</th>
                                  {activeTab === "reconcile" && <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Acción</th>}
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {displayedTransactions.map((tx) => (
                                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{tx.date}</td>
                                      <td className="px-4 py-3">
                                          <p className="font-medium flex items-center gap-2">
                                            {tx.concept}
                                            {tx.reconciled ? (
                                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                Conciliado
                                              </span>
                                            ) : (
                                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-50 text-amber-700 border border-amber-200">
                                                Pendiente
                                              </span>
                                            )}
                                          </p>
                                          {tx.reference && <p className="text-xs text-muted-foreground">Ref: {tx.reference}</p>}
                                      </td>
                                      <td className="px-4 py-3 text-right text-red-600 font-medium">
                                          {tx.amount < 0 ? formatMoney(Math.abs(tx.amount), selectedAccount?.currency) : ''}
                                      </td>
                                      <td className="px-4 py-3 text-right text-green-600 font-medium">
                                          {tx.amount > 0 ? formatMoney(tx.amount, selectedAccount?.currency) : ''}
                                      </td>
                                      {activeTab === "reconcile" && (
                                        <td className="px-4 py-3 text-center">
                                          <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => {
                                              setSelectedTransaction(tx);
                                              setIsReconcileModalOpen(true);
                                            }}
                                            className="h-8 text-xs font-bold text-indigo-600 hover:text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                          >
                                            Conciliar
                                          </Button>
                                        </td>
                                      )}
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  )}
              </div>
          </div>

      {isCSVModalOpen && selectedAccount && (
          <CSVUploadModal 
              accountId={selectedAccount.id} 
              accountCurrency={selectedAccount.currency}
              onClose={() => setIsCSVModalOpen(false)} 
          />
      )}

      {isTransferModalOpen && (
          <TransferModal 
              accounts={accounts}
              currentAccountId={selectedAccountId}
              onClose={() => setIsTransferModalOpen(false)} 
          />
      )}

      {isAdjustmentModalOpen && selectedAccount && (
          <AdjustmentModal 
              accountId={selectedAccount.id}
              onClose={() => setIsAdjustmentModalOpen(false)} 
          />
      )}

      {isSyncModalOpen && selectedAccount && (
          <BankSyncModal 
              accountId={selectedAccount.id}
              onClose={() => setIsSyncModalOpen(false)} 
          />
      )}

      {isReconcileModalOpen && selectedTransaction && selectedAccount && (
          <QuickReconcileModal 
              transaction={selectedTransaction}
              accountId={selectedAccount.id}
              onClose={() => {
                setIsReconcileModalOpen(false);
                setSelectedTransaction(null);
              }}
              onSuccess={() => {
                // Success callback
              }}
          />
      )}
    </div>
  );
}

