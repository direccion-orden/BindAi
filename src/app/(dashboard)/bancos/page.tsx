"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, orderBy, doc, getDoc, getDocs, where, deleteDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Building2, UploadCloud, ArrowRightLeft, Settings2, Loader2, Search, FileText, RefreshCw, Sparkles, Landmark, Trash2 } from "lucide-react";
import { BankTransaction } from "@/types/bank";
import { BankImportModal } from "./components/BankImportModal";
import { TransferModal } from "./components/TransferModal";
import { AdjustmentModal } from "./components/AdjustmentModal";
import { ReconcilePanel } from "./components/ReconcilePanel";
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

function normalizeDateToISO(dateStr: string): string {
  if (!dateStr) return "";
  
  // If it's already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Handle DD-mmm-YY format, e.g. "30-jun-26" or "05-may-26" or "5-may-26"
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    let [day, month, year] = parts;
    
    // Normalize year
    if (year.length === 2) {
      year = "20" + year;
    }
    
    // Map Spanish/English month names
    const lowerMonth = month.toLowerCase().substring(0, 3);
    const monthsMap: Record<string, string> = {
      ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
      jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
      jan: "01", apr: "04", aug: "08", dec: "12"
    };
    
    const monthNum = monthsMap[lowerMonth] || "01";
    const formattedDay = day.padStart(2, '0');
    
    return `${year}-${monthNum}-${formattedDay}`;
  }

  return dateStr;
}

export default function BancosPage() {
  const { companyId } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateFilterOption, setDateFilterOption] = useState<string>("all");

  const handleDateFilterChange = (option: string) => {
    setDateFilterOption(option);
    
    const getLocalDateString = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    
    if (option === "all") {
      setStartDate("");
      setEndDate("");
    } else if (option === "today") {
      const todayStr = getLocalDateString(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (option === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setStartDate(yesterdayStr);
      setEndDate(yesterdayStr);
    } else if (option === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(getLocalDateString(startOfMonth));
      setEndDate(getLocalDateString(now));
    } else if (option === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(getLocalDateString(startOfLastMonth));
      setEndDate(getLocalDateString(endOfLastMonth));
    } else if (option === "this_year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setStartDate(getLocalDateString(startOfYear));
      setEndDate(getLocalDateString(now));
    } else if (option === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setStartDate(getLocalDateString(thirtyDaysAgo));
      setEndDate(getLocalDateString(now));
    }
  };

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<"history" | "reconcile">("history");
  const [selectedTxs, setSelectedTxs] = useState<BankTransaction[]>([]);

  // Sync state from URL on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab") as "history" | "reconcile";
      const account = params.get("account");
      if (tab) setActiveTab(tab);
      if (account) setSelectedAccountId(account);
    }
  }, []);

  // Sync state to URL in a side-effect (safe from React render phase warning)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      let changed = false;

      const currentTab = params.get("tab");
      if (activeTab && currentTab !== activeTab) {
        params.set("tab", activeTab);
        changed = true;
      }

      const currentAccount = params.get("account");
      if (selectedAccountId && currentAccount !== selectedAccountId) {
        params.set("account", selectedAccountId);
        changed = true;
      }

      if (changed) {
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      }
    }
  }, [activeTab, selectedAccountId]);

  useEffect(() => {
    setSelectedTxs([]);
  }, [selectedAccountId]);

  // Reconcile data loading states
  const [unpaidSales, setUnpaidSales] = useState<any[]>([]);
  const [unpaidExpenses, setUnpaidExpenses] = useState<any[]>([]);
  const [accountingAccountsAll, setAccountingAccountsAll] = useState<any[]>([]);
  const [loadingReconcileData, setLoadingReconcileData] = useState(false);
  const [reconcileTrigger, setReconcileTrigger] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "bankAccounts"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as BankAccount))
        .sort((a, b) => (a.Name || a.name || "").localeCompare(b.Name || b.name || "", "es"));
      setAccounts(data);
      
      setSelectedAccountId(current => {
        let urlAccount = "";
        if (typeof window !== "undefined") {
          urlAccount = new URLSearchParams(window.location.search).get("account") || "";
        }
        
        const activeId = current || urlAccount;
        if (data.length > 0 && !activeId) {
          return data[0].id;
        }
        return activeId;
      });
      
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

  useEffect(() => {
    if (!companyId || activeTab !== "reconcile") return;
    
    const loadReconcileData = async () => {
      setLoadingReconcileData(true);
      try {
        // 1. Fetch accounting accounts
        const accountsSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
        const allAcc = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setAccountingAccountsAll(allAcc);

        // 2. Fetch sales invoices
        const salesQuery = query(
          collection(db, "companies", companyId, "facturas"),
          where("status", "==", "por_cobrar")
        );
        const salesSnap = await getDocs(salesQuery);
        const salesList = salesSnap.docs.map(d => ({ id: d.id, _type: "factura", ...d.data() } as any));
        const unpaidSalesFiltered = salesList.filter(inv => !inv.paidAmount || inv.paidAmount < (inv.totalAmount || inv.total || 0) - 0.01);
        setUnpaidSales(unpaidSalesFiltered);

        // 3. Fetch inbox/received expenses
        const expInboxQuery = query(
          collection(db, "companies", companyId, "expenses_inbox"),
          where("status", "!=", "paid")
        );
        const expInboxSnap = await getDocs(expInboxQuery);
        const expInboxList = expInboxSnap.docs.map(d => ({ id: d.id, _type: "gasto", ...d.data() } as any));
        const unpaidInboxFiltered = expInboxList.filter(inv => !inv.paidAmount || inv.paidAmount < (inv.total || 0) - 0.01);

        // 4. Fetch manual expenses
        const expManualQuery = query(
          collection(db, "companies", companyId, "expenses"),
          where("status", "!=", "paid")
        );
        const expManualSnap = await getDocs(expManualQuery);
        const expManualList = expManualSnap.docs.map(d => ({ id: d.id, _type: "gasto_manual", ...d.data() } as any));
        const unpaidManualFiltered = expManualList.filter(inv => !inv.paidAmount || inv.paidAmount < (inv.amount || 0) - 0.01);

        setUnpaidExpenses([...unpaidInboxFiltered, ...unpaidManualFiltered]);
      } catch (err) {
        console.error("Error loading reconciliation data:", err);
      } finally {
        setLoadingReconcileData(false);
      }
    };

    loadReconcileData();
  }, [companyId, activeTab, reconcileTrigger]);

  const selectedAccount = useMemo(() => accounts.find(a => a.id === selectedAccountId), [accounts, selectedAccountId]);

  const currentBalance = useMemo(() => {
    if (!selectedAccount) return 0;
    const initial = selectedAccount.initialBalance || 0;
    const totalTransactions = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    return initial + totalTransactions;
  }, [selectedAccount, transactions]);

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.concept.toLowerCase().includes(lowerQ) || 
        (t.reference && t.reference.toLowerCase().includes(lowerQ))
      );
    }

    if (startDate) {
      filtered = filtered.filter(t => {
        const isoDate = normalizeDateToISO(t.date);
        return isoDate >= startDate;
      });
    }

    if (endDate) {
      filtered = filtered.filter(t => {
        const isoDate = normalizeDateToISO(t.date);
        return isoDate <= endDate;
      });
    }

    return filtered;
  }, [transactions, searchQuery, startDate, endDate]);

  const displayedTransactions = useMemo(() => {
    if (activeTab === "reconcile") {
      return filteredTransactions.filter(t => !t.reconciled);
    }
    return filteredTransactions;
  }, [filteredTransactions, activeTab]);

  const eligibleTransactions = useMemo(() => {
    if (displayedTransactions.length === 0) return [];
    const isSelectingCharges = selectedTxs.length > 0 ? selectedTxs[0].amount < 0 : null;
    if (isSelectingCharges !== null) {
      return displayedTransactions.filter(t => (t.amount < 0) === isSelectingCharges);
    } else {
      const firstIsCharge = displayedTransactions[0].amount < 0;
      return displayedTransactions.filter(t => (t.amount < 0) === firstIsCharge);
    }
  }, [displayedTransactions, selectedTxs]);

  const allEligibleSelected = useMemo(() => {
    if (eligibleTransactions.length === 0) return false;
    return eligibleTransactions.every(tx => selectedTxs.some(t => t.id === tx.id));
  }, [eligibleTransactions, selectedTxs]);

  const handleSelectAllToggle = () => {
    if (allEligibleSelected) {
      setSelectedTxs(prev => prev.filter(tx => !eligibleTransactions.some(e => e.id === tx.id)));
    } else {
      setSelectedTxs(prev => {
        const filteredPrev = prev.filter(tx => !eligibleTransactions.some(e => e.id === tx.id));
        return [...filteredPrev, ...eligibleTransactions];
      });
    }
  };

  const formatMoney = (amount: number, currency: string = "MXN") => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
  };

  const getMatchCount = (tx: BankTransaction) => {
    const isCharge = tx.amount < 0;
    const absAmt = Math.abs(tx.amount);
    const candidates = isCharge ? unpaidExpenses : unpaidSales;
    return candidates.filter(doc => {
      const docTotal = doc._type === "gasto_manual" ? (doc.amount || 0) : (doc.totalAmount || doc.total || 0);
      const docPaid = doc.paidAmount || 0;
      const docOutstanding = docTotal - docPaid;
      return Math.abs(docOutstanding - absAmt) < 0.01;
    }).length;
  };

  const handleCleanSyntheticPosMovements = async () => {
    if (!companyId || !selectedAccountId) return;
    
    const confirmClean = window.confirm(
      "¿Deseas escanear y eliminar los movimientos sintéticos 'Venta POS REM...' de esta cuenta bancaria y descontar su importe del saldo acumulado para reflejar únicamente los movimientos reales importados?"
    );
    if (!confirmClean) return;

    setLoadingTransactions(true);
    try {
      const txsRef = collection(db, "companies", companyId, "bankAccounts", selectedAccountId, "transactions");
      const snap = await getDocs(txsRef);
      
      let deletedCount = 0;
      let totalPosAmount = 0;

      for (const d of snap.docs) {
        const data = d.data();
        const concept = (data.concept || "").toLowerCase();
        const reference = (data.reference || "").toLowerCase();
        
        if (concept.includes("venta pos") || concept.includes("pos rem") || reference.includes("pos-") || reference.includes("rem-")) {
          totalPosAmount += Number(data.amount) || 0;
          await deleteDoc(d.ref);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        const bankAccRef = doc(db, "companies", companyId, "bankAccounts", selectedAccountId);
        await updateDoc(bankAccRef, {
          balance: increment(-totalPosAmount),
          Balance: increment(-totalPosAmount)
        });
        alert(`Se eliminaron ${deletedCount} movimientos sintéticos 'Venta POS REM' por un total de $${totalPosAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}. El saldo acumulado de la cuenta bancaria ha sido ajustado.`);
      } else {
        alert("No se encontraron movimientos sintéticos 'Venta POS REM' en esta cuenta bancaria.");
      }
    } catch (error) {
      console.error("Error al limpiar movimientos sintéticos POS:", error);
      alert("Hubo un error al depurar los movimientos sintéticos.");
    } finally {
      setLoadingTransactions(false);
    }
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
        
        <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setIsImportModalOpen(true)} disabled={!selectedAccountId}>
                <UploadCloud className="w-4 h-4 text-indigo-600" /> Importar Estado de Cuenta (CSV/PDF)
            </Button>
            <Button variant="outline" className="gap-2 text-rose-600 border-rose-200 hover:bg-rose-50" onClick={handleCleanSyntheticPosMovements} disabled={!selectedAccountId}>
                <Trash2 className="w-4 h-4" /> Depurar "Venta POS REM"
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setIsAdjustmentModalOpen(true)} disabled={!selectedAccountId}>
                <Settings2 className="w-4 h-4" /> Ajuste Manual
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setIsTransferModalOpen(true)} disabled={accounts.length < 2}>
                <ArrowRightLeft className="w-4 h-4" /> Transferencia
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

      <div className="w-full bg-card border rounded-xl shadow-sm flex flex-col h-[850px]">
              <div className="p-2 border-b flex items-center justify-between gap-4 bg-slate-50/50 rounded-t-xl shrink-0">
                  <div className="flex gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
                      <button
                          onClick={() => setActiveTab("history")}
                          className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                            activeTab === 'history' 
                              ? 'bg-purple-600 text-white font-extrabold shadow-sm' 
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                          }`}
                      >
                          Historial de Movimientos
                          {transactions.length > 0 && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-black rounded-full transition-colors ${
                              activeTab === 'history'
                                ? 'bg-purple-800 text-purple-100'
                                : 'bg-purple-100 text-purple-700'
                            }`}>
                              {transactions.length}
                            </span>
                          )}
                      </button>
                      <button
                          onClick={() => setActiveTab("reconcile")}
                          className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                            activeTab === 'reconcile' 
                              ? 'bg-purple-600 text-white font-extrabold shadow-sm' 
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
                          }`}
                      >
                          Conciliación Pendiente
                          {transactions.filter(t => !t.reconciled).length > 0 && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-black rounded-full transition-colors ${
                              activeTab === 'reconcile'
                                ? 'bg-purple-800 text-purple-100'
                                : 'bg-purple-100 text-purple-700 animate-pulse'
                            }`}>
                              {transactions.filter(t => !t.reconciled).length}
                            </span>
                          )}
                      </button>
                  </div>
                  <div className="flex items-center gap-2">                       <div className="flex items-center bg-background border rounded-md px-1.5 h-9 shadow-sm">
                        <select
                          className="bg-transparent border-none text-xs font-semibold outline-none focus:ring-0 p-1 cursor-pointer text-slate-700 w-36"
                          value={dateFilterOption}
                          onChange={(e) => handleDateFilterChange(e.target.value)}
                        >
                          <option value="all">Cualquier fecha</option>
                          <option value="today">Hoy</option>
                          <option value="yesterday">Ayer</option>
                          <option value="this_month">Mes a la Fecha</option>
                          <option value="last_month">Mes Pasado</option>
                          <option value="last_30_days">Últimos 30 Días</option>
                          <option value="this_year">Este Año</option>
                          <option value="custom">Rango Personalizado</option>
                        </select>
                      </div>

                      {dateFilterOption === "custom" && (
                        <>
                          <div className="flex items-center bg-background border rounded-md px-2 gap-2 h-9 shadow-sm animate-in fade-in slide-in-from-left-1 duration-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Desde</span>
                            <input 
                              type="date" 
                              value={startDate}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="bg-transparent border-none text-xs font-semibold outline-none focus:ring-0 p-0 w-28"
                            />
                          </div>
                          <div className="flex items-center bg-background border rounded-md px-2 gap-2 h-9 shadow-sm animate-in fade-in slide-in-from-left-1 duration-100">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Hasta</span>
                            <input 
                              type="date" 
                              value={endDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="bg-transparent border-none text-xs font-semibold outline-none focus:ring-0 p-0 w-28"
                            />
                          </div>
                        </>
                      )}
                      <div className="relative w-64">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input 
                              type="search" 
                              placeholder="Buscar concepto o referencia..." 
                              className="pl-9 bg-background h-9 text-xs font-medium"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                          />
                      </div>
                      {(searchQuery || startDate || endDate || dateFilterOption !== "all") && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setSearchQuery("");
                            setStartDate("");
                            setEndDate("");
                            setDateFilterOption("all");
                          }}
                          className="h-9 px-2 text-slate-400 hover:text-slate-600"
                          title="Limpiar filtros"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                  </div>
              </div>

              <div className="flex-1 overflow-hidden p-0 flex flex-col">
                  {loadingTransactions ? (
                      <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                  ) : displayedTransactions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground opacity-60 flex-1">
                          <FileText className="w-12 h-12 mb-3 opacity-20" />
                          <p>No hay movimientos registrados {activeTab === "reconcile" ? "pendientes de conciliar" : ""}.</p>
                          <p className="text-sm">Realiza una carga masiva o añade un ajuste manual.</p>
                      </div>
                  ) : activeTab === "history" ? (
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  ) : (
                      /* Split Pane Layout for Reconcile Tab */
                      <div className="flex-1 flex flex-col lg:flex-row gap-6 p-4 bg-slate-50/40 overflow-hidden">
                          {/* Left pane: list of pending transactions */}
                          <div className="lg:w-[40%] bg-card border rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
                              <div className="p-3 border-b bg-slate-50 flex items-center justify-between shrink-0">
                                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                      Movimientos ({displayedTransactions.length})
                                  </span>
                                  {displayedTransactions.length > 0 && (
                                      <button
                                          type="button"
                                          onClick={handleSelectAllToggle}
                                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 transition-all bg-white hover:bg-slate-50 border border-slate-200 px-2 py-1 rounded"
                                      >
                                          <div className={`w-3 h-3 rounded border flex items-center justify-center shrink-0 transition-all ${
                                              allEligibleSelected 
                                                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                                                  : 'border-slate-300 bg-white'
                                          }`}>
                                              {allEligibleSelected && (
                                                  <svg className="w-2 h-2 fill-current text-white" viewBox="0 0 20 20">
                                                      <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                                                  </svg>
                                              )}
                                          </div>
                                          {allEligibleSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                      </button>
                                  )}
                              </div>
                              <div className="flex-1 overflow-y-auto divide-y custom-scrollbar">
                                  {displayedTransactions.map((tx) => {
                                      const matches = getMatchCount(tx);
                                      const isSelected = selectedTxs.some(t => t.id === tx.id);
                                      const isTxCharge = tx.amount < 0;
                                      
                                      const isSelectingCharges = selectedTxs.length > 0 ? selectedTxs[0].amount < 0 : null;
                                      const isDifferentType = isSelectingCharges !== null && (tx.amount < 0) !== isSelectingCharges;

                                      return (
                                          <div 
                                              key={tx.id}
                                              onClick={() => {
                                                  if (isDifferentType) return;
                                                  if (isSelected) {
                                                      setSelectedTxs(prev => prev.filter(t => t.id !== tx.id));
                                                  } else {
                                                      setSelectedTxs(prev => [...prev, tx]);
                                                  }
                                              }}
                                              className={`p-3.5 cursor-pointer hover:bg-slate-100/55 transition-all flex flex-row items-center gap-3 border-l-4 ${
                                                  isSelected 
                                                      ? 'bg-indigo-50/40 border-l-indigo-600' 
                                                      : 'border-l-transparent'
                                              } ${isDifferentType ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                                          >
                                              {/* Checkbox wrapper */}
                                              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                                                  isSelected 
                                                      ? 'bg-indigo-600 border-indigo-600 text-white' 
                                                      : 'border-slate-300 bg-white'
                                              }`}>
                                                  {isSelected && (
                                                      <svg className="w-2.5 h-2.5 fill-current text-white" viewBox="0 0 20 20">
                                                          <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                                                      </svg>
                                                  )}
                                              </div>

                                              <div className="flex-1 flex flex-col gap-1">
                                                  <div className="flex justify-between items-start">
                                                      <span className="text-[10px] font-semibold font-mono text-slate-400">{tx.date}</span>
                                                      <span className={`text-sm font-bold ${isTxCharge ? 'text-red-600' : 'text-emerald-700'}`}>
                                                          {isTxCharge ? '-' : '+'}${Math.abs(tx.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                                      </span>
                                                  </div>
                                                  
                                                  <p className="text-xs font-bold text-slate-700 leading-tight line-clamp-2">{tx.concept}</p>
                                                  
                                                  <div className="flex justify-between items-center pt-1">
                                                      <span className="text-[10px] text-slate-400 font-mono">Ref: {tx.reference || "S/R"}</span>
                                                      {matches > 0 && (
                                                          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-0.5 border border-emerald-200">
                                                              <Sparkles className="w-2.5 h-2.5 text-emerald-700" />
                                                              Coincidencia
                                                          </span>
                                                      )}
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>

                          {/* Right pane: reconciliation details */}
                          <div className="lg:w-[60%] h-full overflow-hidden">
                              {selectedTxs.length > 0 && selectedAccountId ? (
                                  <ReconcilePanel 
                                      transactions={selectedTxs}
                                      accountId={selectedAccountId}
                                      unpaidDocs={selectedTxs[0].amount < 0 ? unpaidExpenses : unpaidSales}
                                      accountingAccounts={
                                          selectedTxs[0].amount < 0 
                                              ? accountingAccountsAll.filter(a => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2)
                                              : accountingAccountsAll.filter(a => a.type === "INGRESOS" && a.level >= 2)
                                      }
                                      accountingAccountsAll={accountingAccountsAll}
                                      onDeselect={() => setSelectedTxs([])}
                                      onSuccess={() => {
                                          // 1. Trigger state reload for invoices/expenses
                                          setReconcileTrigger(prev => prev + 1);

                                          // 2. Select next pending transaction for seamless workflow
                                          if (selectedTxs.length === 1) {
                                              const currentTx = selectedTxs[0];
                                              const currentIndex = displayedTransactions.findIndex(t => t.id === currentTx.id);
                                              const nextTx = displayedTransactions.find((t, idx) => idx > currentIndex && t.id !== currentTx.id);
                                              const prevTx = displayedTransactions.find((t, idx) => idx < currentIndex && t.id !== currentTx.id);

                                              if (nextTx) {
                                                  setSelectedTxs([nextTx]);
                                              } else if (prevTx) {
                                                  setSelectedTxs([prevTx]);
                                              } else {
                                                  setSelectedTxs([]);
                                              }
                                          } else {
                                              setSelectedTxs([]);
                                          }
                                      }}
                                  />
                              ) : (
                                  <div className="bg-card border rounded-xl flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full border-dashed">
                                      <div className="relative mb-4 p-4 rounded-full bg-slate-50 border">
                                          <Landmark className="w-10 h-10 text-indigo-500 relative z-10" />
                                      </div>
                                      <h4 className="font-extrabold text-slate-700 text-sm mb-1">Selecciona un Movimiento Bancario</h4>
                                      <p className="text-xs text-slate-400 max-w-[280px] leading-relaxed">
                                          Haz clic en cualquiera de los movimientos pendientes de la izquierda para comenzar a asociarlo o clasificarlo.
                                      </p>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}
              </div>
          </div>

      {isImportModalOpen && selectedAccount && (
          <BankImportModal 
              accounts={accounts}
              initialAccountId={selectedAccountId}
              onClose={() => setIsImportModalOpen(false)} 
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

