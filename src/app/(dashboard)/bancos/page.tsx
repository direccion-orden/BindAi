"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, orderBy, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Building2, UploadCloud, ArrowRightLeft, Settings2, Loader2, Search, FileText } from "lucide-react";
import { BankTransaction } from "@/types/bank";
import { CSVUploadModal } from "./components/CSVUploadModal";
import { TransferModal } from "./components/TransferModal";
import { AdjustmentModal } from "./components/AdjustmentModal";
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-1 space-y-4">
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                  <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase">Cuenta Seleccionada</h3>
                  <select 
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border bg-background text-sm font-medium focus:ring-2 focus:ring-primary outline-none"
                  >
                      {accounts.length === 0 && <option value="">Sin cuentas...</option>}
                      {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{(acc.Name || acc.name)} ({(acc.CurrencyCode || acc.currency || 'MXN')})</option>
                      ))}
                  </select>
              </div>

              {selectedAccount && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 shadow-sm flex flex-col items-center text-center">
                      <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Saldo Actual Calculado</p>
                      <p className={`text-4xl font-black ${currentBalance < 0 ? 'text-red-600' : 'text-foreground'}`}>
                          {formatMoney(currentBalance, selectedAccount.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-4">
                          Incluye Saldo Inicial: {formatMoney(selectedAccount.initialBalance || 0, selectedAccount.currency)}
                      </p>
                  </div>
              )}
          </div>

          <div className="md:col-span-3 bg-card border rounded-xl shadow-sm flex flex-col h-[600px]">
              <div className="p-4 border-b flex items-center justify-between gap-4 bg-muted/20 rounded-t-xl shrink-0">
                  <h3 className="font-bold flex items-center gap-2">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                      Historial de Movimientos
                  </h3>
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
                  ) : filteredTransactions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground opacity-60">
                          <FileText className="w-12 h-12 mb-3 opacity-20" />
                          <p>No hay movimientos registrados.</p>
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
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              {filteredTransactions.map((tx) => (
                                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{tx.date}</td>
                                      <td className="px-4 py-3">
                                          <p className="font-medium">{tx.concept}</p>
                                          {tx.reference && <p className="text-xs text-muted-foreground">Ref: {tx.reference}</p>}
                                      </td>
                                      <td className="px-4 py-3 text-right text-red-600 font-medium">
                                          {tx.amount < 0 ? formatMoney(Math.abs(tx.amount), selectedAccount?.currency) : ''}
                                      </td>
                                      <td className="px-4 py-3 text-right text-green-600 font-medium">
                                          {tx.amount > 0 ? formatMoney(tx.amount, selectedAccount?.currency) : ''}
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  )}
              </div>
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
    </div>
  );
}

