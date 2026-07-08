"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { doc, collection, getDocs, updateDoc, addDoc, increment, setDoc, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getNextSequence } from "@/lib/firebase/counters";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Landmark, DollarSign, BookOpen, AlertCircle, Sparkles, Receipt, FileCheck, ArrowRightLeft, ChevronDown } from "lucide-react";
import { BankTransaction } from "@/types/bank";

interface ReconcilePanelProps {
  transactions: BankTransaction[];
  accountId: string;
  unpaidDocs: any[]; // Already filtered by transaction type (inflow/outflow)
  accountingAccounts: any[]; // Filtered by type (GASTOS/COSTOS vs INGRESOS)
  accountingAccountsAll: any[]; // All accounting accounts
  onSuccess: () => void;
  onDeselect: () => void;
}

interface SearchableSelectProps {
  label: string;
  placeholder: string;
  items: { id: string; name: string; subtitle?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  required?: boolean;
}

function SearchableSelect({
  label,
  placeholder,
  items,
  selectedId,
  onSelect,
  required = false
}: SearchableSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find(item => item.id === selectedId);

  useEffect(() => {
    if (!open) {
      setSearch(selectedItem ? selectedItem.name : "");
    }
  }, [selectedId, selectedItem, open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter(item => 
      item.name.toLowerCase().includes(q) || 
      (item.subtitle && item.subtitle.toLowerCase().includes(q))
    );
  }, [items, search]);

  return (
    <div className="space-y-1.5 relative w-full" ref={containerRef}>
      <label className="text-xs font-bold text-slate-600 flex justify-between">
        <span>{label} {required && <span className="text-red-500">*</span>}</span>
        {selectedItem && (
          <button 
            type="button" 
            onClick={() => {
              onSelect("");
              setSearch("");
            }} 
            className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold"
          >
            Limpiar
          </button>
        )}
      </label>
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            if (!e.target.value) {
              onSelect("");
            }
          }}
          onFocus={() => setOpen(true)}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none font-semibold text-slate-800"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="absolute z-[100] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-52 overflow-y-auto custom-scrollbar animate-in fade-in duration-100">
          {filteredItems.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 text-center">
              No se encontraron resultados
            </div>
          ) : (
            filteredItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  setSearch(item.name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 flex flex-col border-b last:border-b-0 transition-colors ${
                  item.id === selectedId ? "bg-indigo-50/50 font-bold" : ""
                }`}
              >
                <span className="text-slate-800 font-medium">{item.name}</span>
                {item.subtitle && (
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5">{item.subtitle}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export const findBankAccountingAccount = (physicalBankAccount: any, accountingAccountsAll: any[]) => {
  if (!physicalBankAccount) return null;
  const bankAccountingId = physicalBankAccount.accountId;
  if (bankAccountingId && bankAccountingId !== "undefined") {
    const acc = accountingAccountsAll.find(a => a.id === bankAccountingId);
    if (acc) return acc;
  }
  
  // Fallback: search by name
  const bankName = (physicalBankAccount.Name || physicalBankAccount.name || "").toLowerCase().trim();
  if (bankName) {
    // Try exact match first on bank accounts (102) or cash accounts (101)
    let matchedAcc = accountingAccountsAll.find(a => 
      (a.code?.startsWith("102") || a.code?.startsWith("101")) && 
      a.name.toLowerCase().trim() === bankName
    );
    if (matchedAcc) return matchedAcc;

    // Try partial match
    matchedAcc = accountingAccountsAll.find(a => 
      (a.code?.startsWith("102") || a.code?.startsWith("101")) && 
      (bankName.includes(a.name.toLowerCase().trim()) || a.name.toLowerCase().trim().includes(bankName))
    );
    if (matchedAcc) return matchedAcc;
  }
  return null;
};

export function ReconcilePanel({
  transactions,
  accountId,
  unpaidDocs,
  accountingAccounts,
  accountingAccountsAll,
  onSuccess,
  onDeselect
}: ReconcilePanelProps) {
  const { companyId, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reconcileMode, setReconcileMode] = useState<"match" | "direct" | "transfer">("match");

  // Catalog Data
  const [vendors, setVendors] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);

  // Form selections
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedExpenseOrIncomeAccountId, setSelectedExpenseOrIncomeAccountId] = useState("");
  const [vatRate, setVatRate] = useState<number>(0.16);

  // New fields for direct classification of charges (gasto + egreso)
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [selectedCostCenterId, setSelectedCostCenterId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [directDescription, setDirectDescription] = useState("");

  // Own transfer reconciliation states
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedTargetAccountId, setSelectedTargetAccountId] = useState("");
  const [targetAccountTransactions, setTargetAccountTransactions] = useState<any[]>([]);
  const [selectedTargetTxId, setSelectedTargetTxId] = useState("");

  const transaction = transactions[0];
  const isCharge = transaction ? transaction.amount < 0 : true;
  const absAmount = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const sortedVendors = useMemo(() => {
    return [...vendors].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [vendors]);

  const searchableVendors = useMemo(() => {
    return sortedVendors.map(v => ({
      id: v.id,
      name: v.name,
      subtitle: v.rfc
    }));
  }, [sortedVendors]);

  const sortedAccounts = useMemo(() => {
    return [...accountingAccounts].sort((a, b) => {
      const aLabel = `${a.code} - ${a.name}`;
      const bLabel = `${b.code} - ${b.name}`;
      return aLabel.localeCompare(bLabel, "es");
    });
  }, [accountingAccounts]);

  const searchableAccounts = useMemo(() => {
    return sortedAccounts.map(a => ({
      id: a.id,
      name: `${a.code} - ${a.name}`,
      subtitle: a.type
    }));
  }, [sortedAccounts]);

  const sortedCostCenters = useMemo(() => {
    return [...costCenters]
      .filter(cc => cc.isActive)
      .sort((a, b) => {
        const aLabel = `${a.code} - ${a.name}`;
        const bLabel = `${b.code} - ${b.name}`;
        return aLabel.localeCompare(bLabel, "es");
      });
  }, [costCenters]);

  const searchableCostCenters = useMemo(() => {
    return sortedCostCenters.map(cc => ({
      id: cc.id,
      name: `${cc.code} - ${cc.name}`,
      subtitle: cc.isActive ? "Activo" : "Inactivo"
    }));
  }, [sortedCostCenters]);

  // Auto-suggest and sort exact matches
  const sortedAndMatchedDocs = useMemo(() => {
    return unpaidDocs.map(doc => {
      const docTotal = doc._type === "gasto_manual" ? (doc.amount || 0) : (doc.totalAmount || doc.total || 0);
      const docPaid = doc.paidAmount || 0;
      const docOutstanding = docTotal - docPaid;
      // Is exact match within 1 cent (tolerance for float precision)
      const isExactMatch = Math.abs(docOutstanding - absAmount) < 0.01;

      // Parse document date
      let docDateStr = '';
      if (doc.date && typeof doc.date === 'string') {
        docDateStr = doc.date.substring(0, 10);
      } else if (doc.createdAt && typeof doc.createdAt === 'string') {
        docDateStr = doc.createdAt.substring(0, 10);
      }

      // Calculate absolute difference in days
      let diffDays = 999999;
      if (docDateStr && transaction.date) {
        try {
          const docDateObj = new Date(docDateStr + 'T00:00:00');
          const txDateObj = new Date(transaction.date + 'T00:00:00');
          if (!isNaN(docDateObj.getTime()) && !isNaN(txDateObj.getTime())) {
            const diffTime = Math.abs(txDateObj.getTime() - docDateObj.getTime());
            diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          }
        } catch (e) {
          console.error("Error parsing date for matching:", e);
        }
      }

      return { ...doc, docOutstanding, docTotal, isExactMatch, docDateStr, diffDays };
    }).sort((a, b) => {
      // First priority: Exact match
      if (a.isExactMatch && !b.isExactMatch) return -1;
      if (!a.isExactMatch && b.isExactMatch) return 1;

      // Second priority: Days difference (closer date first)
      if (a.diffDays !== b.diffDays) {
        return a.diffDays - b.diffDays;
      }

      // Third priority: Outstanding amount descending
      return b.docOutstanding - a.docOutstanding;
    });
  }, [unpaidDocs, absAmount, transaction.date]);

  // Auto-select exact match if found
  useEffect(() => {
    const exactMatch = sortedAndMatchedDocs.find(d => d.isExactMatch);
    if (exactMatch) {
      setSelectedDocId(exactMatch.id);
    } else {
      setSelectedDocId("");
    }
  }, [sortedAndMatchedDocs]);

  const selectedDoc = useMemo(() => {
    if (!selectedDocId || reconcileMode !== "match") return null;
    return sortedAndMatchedDocs.find(d => d.id === selectedDocId);
  }, [selectedDocId, sortedAndMatchedDocs, reconcileMode]);

  const searchableDocs = useMemo(() => {
    return sortedAndMatchedDocs.map(doc => {
      const isManualLabel = doc._type === "gasto_manual" ? " (Manual)" : "";
      const partnerName = doc.vendorName || doc.emisorName || doc.clientName || "Proveedor/Cliente";
      const docNumber = doc.invoiceNumber || doc.folio || doc.uuid?.substring(0, 8) || doc.id;
      const matchLabel = doc.isExactMatch ? "⭐ [SUGERIDO] " : "";
      const dateDisplay = doc.docDateStr ? ` [${doc.docDateStr}]` : "";

      return {
        id: doc.id,
        name: `${matchLabel}${partnerName} - #${docNumber}${isManualLabel}${dateDisplay}`,
        subtitle: `Pendiente: $${doc.docOutstanding.toLocaleString('es-MX', { minimumFractionDigits: 2 })} / Total: $${doc.docTotal.toLocaleString('es-MX')}`
      };
    });
  }, [sortedAndMatchedDocs]);

  // Auto-select first categorization account if empty and we switch to direct
  useEffect(() => {
    if (reconcileMode === "direct" && accountingAccounts.length > 0 && !selectedExpenseOrIncomeAccountId) {
      setSelectedExpenseOrIncomeAccountId(accountingAccounts[0].id);
    }
  }, [reconcileMode, accountingAccounts, selectedExpenseOrIncomeAccountId]);

  // Load catalogs (vendors, locations, cost centers, bank accounts)
  useEffect(() => {
    if (!companyId) return;

    // Load vendors
    const unsubV = onSnapshot(collection(db, "companies", companyId, "vendors"), (snap) => {
      setVendors(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.LegalName || data.name || data.CommercialName || "Proveedor sin nombre",
          rfc: data.rfc || data.RFC || ""
        };
      }));
    });

    // Load locations
    const unsubLoc = onSnapshot(collection(db, "companies", companyId, "locations"), (snap) => {
      setLocations(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      })));
    });

    // Load cost centers
    const unsubCC = onSnapshot(collection(db, "companies", companyId, "cost_centers"), (snap) => {
      setCostCenters(snap.docs.map(d => ({
        id: d.id,
        code: d.data().code || "",
        name: d.data().name || "",
        isActive: d.data().isActive ?? true
      })));
    });

    // Load bank accounts
    const unsubBank = onSnapshot(collection(db, "companies", companyId, "bankAccounts"), (snap) => {
      setBankAccounts(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Banco sin nombre",
        accountId: d.data().accountId || "",
        currency: d.data().currency || "MXN"
      })));
    });

    return () => {
      unsubV();
      unsubLoc();
      unsubCC();
      unsubBank();
    };
  }, [companyId]);

  // Load target account pending transactions
  useEffect(() => {
    if (!companyId || !selectedTargetAccountId) {
      setTargetAccountTransactions([]);
      setSelectedTargetTxId("");
      return;
    }

    const q = query(
      collection(db, "companies", companyId, "bankAccounts", selectedTargetAccountId, "transactions")
    );

    const unsub = onSnapshot(q, (snap) => {
      const txs = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(tx => !tx.reconciled); // Filter in memory to include undefined/null reconciled fields
      
      // Sort by date descending in memory to avoid Firestore index requirement
      txs.sort((a, b) => {
        const dateA = a.date || "";
        const dateB = b.date || "";
        return dateB.localeCompare(dateA);
      });
      setTargetAccountTransactions(txs);
    }, (err) => {
      console.error("Error loading target transactions:", err);
    });

    return () => unsub();
  }, [companyId, selectedTargetAccountId]);

  // Set default values for expenseDate and directDescription when transactions changes
  useEffect(() => {
    if (transactions.length > 0) {
      setExpenseDate(transactions[0].date || new Date().toISOString().split("T")[0]);
      setDirectDescription(transactions[0].concept || "");
      setSelectedVendorId("");
      setSelectedLocationId("");
      setSelectedCostCenterId("");
      setSelectedTargetAccountId("");
      setSelectedTargetTxId("");
    }
  }, [transactions]);

  // Pre-fill selections from selected document when selectedDocId changes (for charges in match mode)
  useEffect(() => {
    if (!selectedDocId || !isCharge || reconcileMode !== "match") return;
    const selectedDoc = sortedAndMatchedDocs.find(d => d.id === selectedDocId);
    if (selectedDoc) {
      setSelectedExpenseOrIncomeAccountId(selectedDoc.accountId || "");
      setSelectedLocationId(selectedDoc.locationId || "");
      
      const docCostCenterId = selectedDoc.costCenterId || selectedDoc.items?.[0]?.costCenterId || "";
      setSelectedCostCenterId(docCostCenterId);
      
      if (selectedDoc.vatRate !== undefined) {
        setVatRate(Number(selectedDoc.vatRate));
      } else {
        setVatRate(0.16);
      }

      // Pre-fill expenseDate with document date if available, otherwise fallback to transaction date
      if (selectedDoc.date) {
        setExpenseDate(selectedDoc.date.substring(0, 10));
      } else if (selectedDoc.createdAt) {
        setExpenseDate(selectedDoc.createdAt.substring(0, 10));
      } else if (transactions.length > 0) {
        setExpenseDate(transactions[0].date || new Date().toISOString().split("T")[0]);
      }
    }
  }, [selectedDocId, sortedAndMatchedDocs, isCharge, reconcileMode, transactions]);

  // Suggestion and sorting logic for own transfer matching
  const sortedTargetTransactions = useMemo(() => {
    if (transactions.length !== 1 || targetAccountTransactions.length === 0) return [];
    
    const currentTx = transactions[0];
    const currentTxAbsAmount = Math.abs(currentTx.amount);

    return targetAccountTransactions.map(tx => {
      const txAbsAmount = Math.abs(tx.amount);
      const isExactAmount = Math.abs(txAbsAmount - currentTxAbsAmount) < 0.01;
      const isOppositeSign = Math.sign(tx.amount) !== Math.sign(currentTx.amount);
      
      // Calculate day difference
      let diffDays = 999999;
      if (tx.date && currentTx.date) {
        try {
          const tDate = new Date(tx.date + 'T00:00:00');
          const cDate = new Date(currentTx.date + 'T00:00:00');
          if (!isNaN(tDate.getTime()) && !isNaN(cDate.getTime())) {
            diffDays = Math.ceil(Math.abs(tDate.getTime() - cDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        } catch (e) {
          console.error("Error calculating day diff for transfer suggest:", e);
        }
      }

      return { ...tx, isExactAmount, isOppositeSign, diffDays };
    }).filter(tx => tx.isOppositeSign) // Show only opposite sign transactions
    .sort((a, b) => {
      // First priority: Exact amount matches
      if (a.isExactAmount && !b.isExactAmount) return -1;
      if (!a.isExactAmount && b.isExactAmount) return 1;

      // Second priority: Days difference (closer date first)
      if (a.diffDays !== b.diffDays) {
        return a.diffDays - b.diffDays;
      }

      return 0;
    });
  }, [transactions, targetAccountTransactions]);

  // Auto-select best match when suggestions list changes
  useEffect(() => {
    const exactMatch = sortedTargetTransactions.find(t => t.isExactAmount);
    if (exactMatch) {
      setSelectedTargetTxId(exactMatch.id);
    } else if (sortedTargetTransactions.length > 0) {
      setSelectedTargetTxId(sortedTargetTransactions[0].id);
    } else {
      setSelectedTargetTxId("");
    }
  }, [sortedTargetTransactions]);

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !accountId || transactions.length === 0) return;

    setLoading(true);
    try {
      if (reconcileMode === "match") {
        if (!selectedDocId) {
          alert("Por favor selecciona un documento a asociar.");
          setLoading(false);
          return;
        }

        const selectedDoc = sortedAndMatchedDocs.find(d => d.id === selectedDocId);
        if (!selectedDoc) {
          alert("Documento no encontrado.");
          setLoading(false);
          return;
        }

        if (isCharge) {
          if (!selectedExpenseOrIncomeAccountId) {
            alert("Por favor selecciona una cuenta contable.");
            setLoading(false);
            return;
          }
          if (!selectedLocationId) {
            alert("Por favor selecciona una sucursal.");
            setLoading(false);
            return;
          }
        }

        const isManual = selectedDoc._type === "gasto_manual";
        const docType = isManual ? "gasto_manual" : selectedDoc._type === "gasto" ? "gasto" : "factura";
        const docCollection = isManual ? "expenses" : selectedDoc._type === "gasto" ? "expenses_inbox" : "facturas";

        const selectedAccount = accountingAccountsAll.find(a => a.id === selectedExpenseOrIncomeAccountId);
        const physicalBankAccount = bankAccounts.find(b => b.id === accountId);
        const bankAccountingAccount = findBankAccountingAccount(physicalBankAccount, accountingAccountsAll);
        const bankAccountingId = bankAccountingAccount?.id;

        if (isCharge && !bankAccountingAccount) {
          alert(`La cuenta/caja "${physicalBankAccount?.Name || physicalBankAccount?.name || 'seleccionada'}" no está enlazada a una cuenta contable. Por favor configúrala.`);
          setLoading(false);
          return;
        }

        let targetDocId = selectedDoc.id;
        let targetDocType = docType;
        let targetDocNumber = selectedDoc.invoiceNumber || selectedDoc.uuid || selectedDoc.id;

        if (isCharge && selectedDoc._type === "gasto") {
          // Create the main expense record in the "expenses" collection from XML
          const newExpenseId = crypto.randomUUID();
          const sequenceNum = await getNextSequence(companyId, "gastos");
          const numericVal = parseInt(sequenceNum.split("-")[1]) || 0;
          const locationName = locations.find(l => l.id === selectedLocationId)?.name || "";

          const totalAbsAmount = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
          const newPaid = (selectedDoc.paidAmount || 0) + totalAbsAmount;
          const totalAmt = selectedDoc.docTotal || selectedDoc.total || 0;
          const status = newPaid >= totalAmt - 0.01 ? "paid" : "pending";

          let mappedItems = [];
          if (selectedDoc.items && selectedDoc.items.length > 0) {
            mappedItems = selectedDoc.items.map((item: any) => ({
              ...item,
              accountId: selectedExpenseOrIncomeAccountId,
              locationId: selectedLocationId,
              costCenterId: selectedCostCenterId || null
            }));
          } else {
            mappedItems = [
              {
                productId: null,
                variantId: null,
                productName: selectedDoc.concept || "Gasto desde XML",
                variantTitle: "",
                quantity: 1,
                unitCost: totalAmt,
                lineKey: "",
                costCenterId: selectedCostCenterId || null,
                accountId: selectedExpenseOrIncomeAccountId,
                locationId: selectedLocationId
              }
            ];
          }

          const expenseDoc = {
            id: newExpenseId,
            number: numericVal,
            documentNumber: sequenceNum,
            date: expenseDate || selectedDoc.date || new Date().toISOString().split("T")[0],
            vendorId: selectedDoc.vendorId || null,
            vendorName: selectedDoc.emisorName || selectedDoc.vendorName || "Proveedor",
            concept: selectedDoc.concept || "Gasto desde XML " + (selectedDoc.invoiceNumber || selectedDoc.uuid || ""),
            amount: totalAmt,
            vatRate: vatRate !== undefined ? vatRate : (selectedDoc.vatRate || 0.16),
            locationId: selectedLocationId,
            locationName,
            accountId: selectedExpenseOrIncomeAccountId,
            accountCode: selectedAccount?.code || "",
            accountName: selectedAccount?.name || "",
            paidAmount: totalAbsAmount,
            status: status,
            items: mappedItems,
            satInvoiceId: selectedDoc.id,
            createdAt: new Date().toISOString(),
            createdBy: user?.email || "Sistema (Conciliación)",
            _type: "gasto_manual"
          };

          await setDoc(doc(db, "companies", companyId, "expenses", newExpenseId), expenseDoc);

          targetDocId = newExpenseId;
          targetDocType = "gasto_manual";
          targetDocNumber = sequenceNum;
        }

        // Loop and reconcile each transaction
        for (const tx of transactions) {
          const txAbsAmount = Math.abs(tx.amount);
          
          if (isCharge) {
            // 1. Create outflow record for each payment
            const outflowData = {
              amount: txAbsAmount,
              date: tx.date,
              method: "Transferencia",
              reference: tx.reference || "CONCILIACION",
              documentId: targetDocId,
              documentType: targetDocType,
              documentNumber: targetDocNumber,
              providerName: selectedDoc.emisorName || selectedDoc.vendorName || "Proveedor",
              bankAccountId: accountId,
              expenseAccountId: selectedExpenseOrIncomeAccountId,
              createdAt: new Date().toISOString(),
            };
            const paymentRef = await addDoc(collection(db, "companies", companyId, "outflows"), outflowData);

            // 2. Journal Entry (Póliza de egreso)
            if (physicalBankAccount && selectedAccount && bankAccountingAccount) {
              let subtotalAmount = txAbsAmount;
              let vatAmount = 0;
              const vatAccounts = accountingAccountsAll.filter(a => a.code?.startsWith("118") && a.level >= 2);
              const vatAccount = vatAccounts.length > 0 ? vatAccounts[0] : null;

              if (vatRate > 0) {
                subtotalAmount = txAbsAmount / (1 + vatRate);
                vatAmount = txAbsAmount - subtotalAmount;
              }

              const entries = [
                {
                  accountId: selectedExpenseOrIncomeAccountId,
                  accountCode: selectedAccount.code,
                  accountName: selectedAccount.name,
                  debit: subtotalAmount,
                  credit: 0
                },
                {
                  accountId: bankAccountingId,
                  accountCode: bankAccountingAccount.code,
                  accountName: bankAccountingAccount.name,
                  debit: 0,
                  credit: txAbsAmount
                }
              ];

              if (vatAmount > 0 && vatAccount) {
                entries.push({
                  accountId: vatAccount.id,
                  accountCode: vatAccount.code,
                  accountName: vatAccount.name,
                  debit: vatAmount,
                  credit: 0
                });
              }

              await addDoc(collection(db, "companies", companyId, "journal_entries"), {
                type: "egreso",
                date: tx.date,
                description: `Pago de gasto (Conciliación): ${targetDocNumber}`,
                referenceId: paymentRef.id,
                referenceType: "payment_outflow",
                createdAt: new Date().toISOString(),
                status: "activa",
                entries
              });

              // Update Balances
              await updateDoc(doc(db, "companies", companyId, "accounts", selectedExpenseOrIncomeAccountId), {
                balance: increment(subtotalAmount)
              });
              await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
                balance: increment(-txAbsAmount)
              });
              await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId), {
                balance: increment(-txAbsAmount)
              });
              if (vatAmount > 0 && vatAccount) {
                await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
                  balance: increment(vatAmount)
                });
              }
            }
          } else {
            // 1. Create incoming payment record for each payment received
            const paymentData = {
              amount: txAbsAmount,
              date: tx.date,
              method: "Transferencia",
              reference: tx.reference || "CONCILIACION",
              documentId: selectedDoc.id,
              documentType: "factura",
              documentNumber: selectedDoc.invoiceNumber || selectedDoc.id,
              clientName: selectedDoc.clientName || "Cliente",
              bankAccountId: accountId,
              createdAt: new Date().toISOString(),
            };
            await addDoc(collection(db, "companies", companyId, "payments"), paymentData);
          }

          // 3. Mark the Bank Transaction document as Reconciled
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId, "transactions", tx.id), {
            reconciled: true,
            matchedAt: new Date().toISOString(),
            reconcileType: reconcileMode,
            matchedDocumentId: selectedDocId
          });
        }

        // 4. Update document paidAmount by incrementing it with total amount and save classification
        const totalAbsAmount = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        const updates: any = {
          paidAmount: increment(totalAbsAmount)
        };

        if (isCharge) {
          const locationName = locations.find(l => l.id === selectedLocationId)?.name || "";
          updates.accountId = selectedExpenseOrIncomeAccountId;
          updates.accountCode = selectedAccount?.code || "";
          updates.accountName = selectedAccount?.name || "";
          updates.locationId = selectedLocationId;
          updates.locationName = locationName;
          updates.costCenterId = selectedCostCenterId || null;
          updates.vatRate = vatRate;
          updates.date = expenseDate;
          
          if (selectedDoc.items && selectedDoc.items.length > 0) {
            updates.items = selectedDoc.items.map((item: any) => ({
              ...item,
              accountId: selectedExpenseOrIncomeAccountId,
              locationId: selectedLocationId,
              costCenterId: selectedCostCenterId || null
            }));
          }

          if (selectedDoc._type === "gasto") {
            updates.expenseId = targetDocId;
          }
        }

        const newPaid = (selectedDoc.paidAmount || 0) + totalAbsAmount;
        const totalAmt = selectedDoc.docTotal;
        if (newPaid >= totalAmt - 0.01) {
          updates.status = docCollection === "facturas" ? "cobrada" : "paid";
        }
        await updateDoc(doc(db, "companies", companyId, docCollection, selectedDoc.id), updates);

      } else if (reconcileMode === "direct") {
        // --- Option B: Register Direct Expense/Income ---
        if (!selectedExpenseOrIncomeAccountId) {
          alert("Por favor selecciona una clasificación contable.");
          setLoading(false);
          return;
        }

        if (isCharge) {
          if (!selectedVendorId) {
            alert("Por favor selecciona un proveedor.");
            setLoading(false);
            return;
          }
          if (!expenseDate) {
            alert("Por favor especifica la fecha del gasto.");
            setLoading(false);
            return;
          }
          if (!selectedLocationId) {
            alert("Por favor selecciona una sucursal.");
            setLoading(false);
            return;
          }
          if (!directDescription.trim()) {
            alert("Por favor ingresa una descripción para el gasto.");
            setLoading(false);
            return;
          }
        }

        const selectedAccount = accountingAccounts.find(a => a.id === selectedExpenseOrIncomeAccountId);
        const bankAccountSnap = await getDocs(collection(db, "companies", companyId, "bankAccounts"));
        const bankAccountsList = bankAccountSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const physicalBankAccount = bankAccountsList.find(b => b.id === accountId);
        
        const bankAccountingAccount = findBankAccountingAccount(physicalBankAccount, accountingAccountsAll);
        const bankAccountingId = bankAccountingAccount?.id;

        let expenseId = "";
        let sequenceNum = "";
        let vendorName = "Proveedor General";
        let locationName = "";

        if (isCharge) {
          expenseId = crypto.randomUUID();
          sequenceNum = await getNextSequence(companyId, "gastos");
          const numericVal = parseInt(sequenceNum.split("-")[1]) || 0;
          vendorName = vendors.find(v => v.id === selectedVendorId)?.name || "Proveedor General";
          locationName = locations.find(l => l.id === selectedLocationId)?.name || "";

          // Create Expense Record (gasto administrativo)
          const expenseDoc = {
            id: expenseId,
            number: numericVal,
            documentNumber: sequenceNum,
            date: expenseDate,
            vendorId: selectedVendorId,
            vendorName,
            concept: directDescription,
            amount: absAmount,
            vatRate,
            locationId: selectedLocationId,
            locationName,
            accountId: selectedExpenseOrIncomeAccountId,
            accountCode: selectedAccount?.code || "",
            accountName: selectedAccount?.name || "",
            paidAmount: absAmount,
            status: "paid",
            items: [
              {
                productId: null,
                variantId: null,
                productName: directDescription,
                variantTitle: "",
                quantity: 1,
                unitCost: absAmount,
                lineKey: "",
                costCenterId: selectedCostCenterId || null,
                accountId: selectedExpenseOrIncomeAccountId,
                locationId: selectedLocationId
              }
            ],
            createdAt: new Date().toISOString(),
            createdBy: user?.email || "Unknown",
            _type: "gasto_manual"
          };

          await setDoc(doc(db, "companies", companyId, "expenses", expenseId), expenseDoc);
        }

        for (const tx of transactions) {
          const txAbsAmount = Math.abs(tx.amount);
          
          if (isCharge) {
            // 1. Register Outflow
            const outflowData = {
              amount: txAbsAmount,
              date: tx.date,
              method: "Transferencia",
              reference: tx.reference || "CONCILIACION_DIRECTA",
              documentId: expenseId,
              documentType: "gasto_manual",
              documentNumber: sequenceNum,
              providerName: vendorName,
              bankAccountId: accountId,
              expenseAccountId: selectedExpenseOrIncomeAccountId,
              createdAt: new Date().toISOString(),
            };
            await addDoc(collection(db, "companies", companyId, "outflows"), outflowData);

            // 2. Journal Entry (Póliza)
            if (physicalBankAccount && selectedAccount && bankAccountingAccount) {
              let subtotalAmount = txAbsAmount;
              let vatAmount = 0;
              const vatAccounts = accountingAccountsAll.filter(a => a.code?.startsWith("118") && a.level >= 2);
              const vatAccount = vatAccounts.length > 0 ? vatAccounts[0] : null;

              if (vatRate > 0) {
                subtotalAmount = txAbsAmount / (1 + vatRate);
                vatAmount = txAbsAmount - subtotalAmount;
              }

              const entries = [
                {
                  accountId: selectedExpenseOrIncomeAccountId,
                  accountCode: selectedAccount.code,
                  accountName: selectedAccount.name,
                  debit: subtotalAmount,
                  credit: 0
                },
                {
                  accountId: bankAccountingId,
                  accountCode: bankAccountingAccount.code,
                  accountName: bankAccountingAccount.name,
                  debit: 0,
                  credit: txAbsAmount
                }
              ];

              if (vatAmount > 0 && vatAccount) {
                entries.push({
                  accountId: vatAccount.id,
                  accountCode: vatAccount.code,
                  accountName: vatAccount.name,
                  debit: vatAmount,
                  credit: 0
                });
              }

              await addDoc(collection(db, "companies", companyId, "journal_entries"), {
                type: "egreso",
                date: tx.date,
                description: `Clasificación directa: ${tx.concept} - ${directDescription}`,
                referenceId: tx.id,
                referenceType: "bank_transaction_reconciliation",
                createdAt: new Date().toISOString(),
                status: "activa",
                entries
              });

              // Update Balances
              await updateDoc(doc(db, "companies", companyId, "accounts", selectedExpenseOrIncomeAccountId), {
                balance: increment(-subtotalAmount)
              });
              await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
                balance: increment(-txAbsAmount)
              });
              await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId), {
                balance: increment(-txAbsAmount)
              });
              if (vatAmount > 0 && vatAccount) {
                await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
                  balance: increment(vatAmount)
                });
              }
            }
          } else {
            // 1. Register Inflow (Payment)
            const paymentData = {
              amount: txAbsAmount,
              date: tx.date,
              method: "Transferencia",
              reference: tx.reference || "CONCILIACION_DIRECTA",
              documentId: null,
              documentType: "ingreso_directo",
              documentNumber: `CONC-${tx.id.substring(0, 5)}`,
              clientName: "Público en General / Varios",
              bankAccountId: accountId,
              createdAt: new Date().toISOString(),
            };
            await addDoc(collection(db, "companies", companyId, "payments"), paymentData);

            // 2. Journal Entry (Póliza)
            if (physicalBankAccount && selectedAccount && bankAccountingAccount) {
              const entries = [
                {
                  accountId: bankAccountingId,
                  accountCode: bankAccountingAccount.code,
                  accountName: bankAccountingAccount.name,
                  debit: txAbsAmount,
                  credit: 0
                },
                {
                  accountId: selectedExpenseOrIncomeAccountId,
                  accountCode: selectedAccount.code,
                  accountName: selectedAccount.name,
                  debit: 0,
                  credit: txAbsAmount
                }
              ];

              await addDoc(collection(db, "companies", companyId, "journal_entries"), {
                type: "ingreso",
                date: tx.date,
                description: `Conciliación de ingreso directo: ${tx.concept}`,
                referenceId: tx.id,
                referenceType: "bank_transaction_reconciliation",
                createdAt: new Date().toISOString(),
                status: "activa",
                entries
              });

              // Update Balances
              await updateDoc(doc(db, "companies", companyId, "accounts", selectedExpenseOrIncomeAccountId), {
                balance: increment(txAbsAmount)
              });
              await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
                balance: increment(txAbsAmount)
              });
              await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId), {
                balance: increment(txAbsAmount)
              });
            }
          }

          // Reconcile the Bank Transaction document
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId, "transactions", tx.id), {
            reconciled: true,
            matchedAt: new Date().toISOString(),
            reconcileType: reconcileMode,
            matchedDocumentId: isCharge ? expenseId : selectedExpenseOrIncomeAccountId
          });
        }
      } else if (reconcileMode === "transfer") {
        if (!selectedTargetAccountId) {
          alert("Por favor selecciona la cuenta bancaria relacionada.");
          setLoading(false);
          return;
        }
        if (!selectedTargetTxId) {
          alert("Por favor selecciona el movimiento de emparejamiento.");
          setLoading(false);
          return;
        }

        const targetTx = sortedTargetTransactions.find(t => t.id === selectedTargetTxId);
        if (!targetTx) {
          alert("No se encontró el movimiento de emparejamiento seleccionado.");
          setLoading(false);
          return;
        }

        const currentTx = transactions[0];
        const txAbsAmount = Math.abs(currentTx.amount);

        // Get accounting accounts for both bank accounts
        const currentBankAccount = bankAccounts.find(b => b.id === accountId);
        const targetBankAccount = bankAccounts.find(b => b.id === selectedTargetAccountId);

        if (!currentBankAccount || !targetBankAccount) {
          alert("Error al cargar la información de las cuentas bancarias.");
          setLoading(false);
          return;
        }

        const currentAccountingAccount = findBankAccountingAccount(currentBankAccount, accountingAccountsAll);
        const currentBankAccountingId = currentAccountingAccount?.id;
        const targetAccountingAccount = findBankAccountingAccount(targetBankAccount, accountingAccountsAll);
        const targetBankAccountingId = targetAccountingAccount?.id;

        // Mark current transaction as reconciled
        await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId, "transactions", currentTx.id), {
          reconciled: true,
          matchedAt: new Date().toISOString(),
          reconcileType: "transfer",
          matchedDocumentId: selectedTargetTxId,
          matchedAccountId: selectedTargetAccountId
        });

        // Mark target transaction as reconciled
        await updateDoc(doc(db, "companies", companyId, "bankAccounts", selectedTargetAccountId, "transactions", selectedTargetTxId), {
          reconciled: true,
          matchedAt: new Date().toISOString(),
          reconcileType: "transfer",
          matchedDocumentId: currentTx.id,
          matchedAccountId: accountId
        });

        // Adjust bank accounts and accounting account balances
        if (isCharge) {
          // Current is charge (money leaves current, enters target)
          // Current bank account: decrement balance
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId), {
            balance: increment(-txAbsAmount)
          });
          // Target bank account: increment balance
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", selectedTargetAccountId), {
            balance: increment(txAbsAmount)
          });

          // Ledger updates
          if (currentBankAccountingId) {
            await updateDoc(doc(db, "companies", companyId, "accounts", currentBankAccountingId), {
              balance: increment(-txAbsAmount)
            });
          }
          if (targetBankAccountingId) {
            await updateDoc(doc(db, "companies", companyId, "accounts", targetBankAccountingId), {
              balance: increment(txAbsAmount)
            });
          }

          // Create Journal Entry
          if (currentAccountingAccount && targetAccountingAccount) {
            const entries = [
              {
                accountId: targetBankAccountingId,
                accountCode: targetAccountingAccount.code,
                accountName: targetAccountingAccount.name,
                debit: txAbsAmount,
                credit: 0
              },
              {
                accountId: currentBankAccountingId,
                accountCode: currentAccountingAccount.code,
                accountName: currentAccountingAccount.name,
                debit: 0,
                credit: txAbsAmount
              }
            ];

            await addDoc(collection(db, "companies", companyId, "journal_entries"), {
              type: "diario",
              date: currentTx.date,
              description: `Traspaso propio: ${currentTx.concept} -> ${targetTx.concept}`,
              referenceId: currentTx.id,
              referenceType: "bank_transfer_reconciliation",
              createdAt: new Date().toISOString(),
              status: "activa",
              entries
            });
          }
        } else {
          // Current is deposit (money enters current, leaves target)
          // Current bank account: increment balance
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId), {
            balance: increment(txAbsAmount)
          });
          // Target bank account: decrement balance
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", selectedTargetAccountId), {
            balance: increment(-txAbsAmount)
          });

          // Ledger updates
          if (currentBankAccountingId) {
            await updateDoc(doc(db, "companies", companyId, "accounts", currentBankAccountingId), {
              balance: increment(txAbsAmount)
            });
          }
          if (targetBankAccountingId) {
            await updateDoc(doc(db, "companies", companyId, "accounts", targetBankAccountingId), {
              balance: increment(-txAbsAmount)
            });
          }

          // Create Journal Entry
          if (currentAccountingAccount && targetAccountingAccount) {
            const entries = [
              {
                accountId: currentBankAccountingId,
                accountCode: currentAccountingAccount.code,
                accountName: currentAccountingAccount.name,
                debit: txAbsAmount,
                credit: 0
              },
              {
                accountId: targetBankAccountingId,
                accountCode: targetAccountingAccount.code,
                accountName: targetAccountingAccount.name,
                debit: 0,
                credit: txAbsAmount
              }
            ];

            await addDoc(collection(db, "companies", companyId, "journal_entries"), {
              type: "diario",
              date: currentTx.date,
              description: `Traspaso propio: ${targetTx.concept} -> ${currentTx.concept}`,
              referenceId: currentTx.id,
              referenceType: "bank_transfer_reconciliation",
              createdAt: new Date().toISOString(),
              status: "activa",
              entries
            });
          }
        }
      }

      onSuccess();
    } catch (err) {
      console.error(err);
      alert("Hubo un error al conciliar el movimiento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border rounded-xl overflow-hidden shadow-md h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header card info */}
      <div className="p-5 border-b bg-gradient-to-r from-slate-950 to-slate-800 text-white space-y-3 relative overflow-hidden shrink-0">
        <div className="absolute right-[-20px] top-[-20px] opacity-10">
          <Landmark className="w-32 h-32 text-white" />
        </div>
        
        {transactions.length === 1 ? (
          <>
            <div className="flex justify-between items-start z-10 relative">
              <div>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded bg-white/20 text-white">
                  {isCharge ? "Egreso / Cargo" : "Ingreso / Abono"}
                </span>
                <p className="text-xs text-slate-300 font-mono mt-1">{transaction.date}</p>
              </div>
              <button 
                type="button"
                onClick={onDeselect} 
                className="text-xs font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded transition-colors"
              >
                Deseleccionar
              </button>
            </div>

            <h3 className="font-extrabold text-lg leading-tight z-10 relative line-clamp-2">
              {transaction.concept}
            </h3>

            <div className="flex justify-between items-end pt-1 z-10 relative">
              <span className="text-xs text-slate-300 font-mono">Ref: {transaction.reference || "Sin Referencia"}</span>
              <span className={`text-2xl font-black ${isCharge ? 'text-red-400' : 'text-emerald-400'}`}>
                {isCharge ? '-' : '+'}${absAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-start z-10 relative">
              <div>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded bg-indigo-600 text-white">
                  {isCharge ? "Egreso Múltiple" : "Ingreso Múltiple"}
                </span>
                <p className="text-xs text-slate-300 font-mono mt-1">{transactions.length} movimientos seleccionados</p>
              </div>
              <button 
                type="button"
                onClick={onDeselect} 
                className="text-xs font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded transition-colors"
              >
                Cancelar Selección
              </button>
            </div>

            {/* Scrollable list of concepts */}
            <div className="bg-slate-900/50 p-2.5 rounded-lg border border-white/10 text-xs space-y-1.5 max-h-[110px] overflow-y-auto custom-scrollbar z-10 relative animate-in fade-in zoom-in-95 duration-200">
              {transactions.map(tx => (
                <div key={tx.id} className="flex justify-between items-center text-[11px] text-slate-300 gap-2 border-b border-white/5 pb-1 last:border-0 last:pb-0">
                  <span className="truncate max-w-[200px] font-medium" title={tx.concept}>{tx.concept}</span>
                  <div className="flex items-center gap-2 shrink-0 font-mono">
                    <span className="text-slate-400 text-[10px]">{tx.date}</span>
                    <span className="font-bold">${Math.abs(tx.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-end pt-1 z-10 relative">
              <span className="text-xs text-slate-300">Total Acumulado</span>
              <span className={`text-2xl font-black ${isCharge ? 'text-red-400' : 'text-emerald-400'}`}>
                {isCharge ? '-' : '+'}${absAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Mode tabs */}
      <div className="flex border-b bg-slate-50 p-1.5 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setReconcileMode("match")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            reconcileMode === "match" 
              ? "bg-white shadow text-indigo-700 font-extrabold border" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          }`}
        >
          <Receipt className="w-3.5 h-3.5 text-indigo-600" />
          Asociar a Factura / Docto.
        </button>
        <button
          type="button"
          onClick={() => setReconcileMode("direct")}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
            reconcileMode === "direct" 
              ? "bg-white shadow text-indigo-700 font-extrabold border" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
          Clasificación Directa
        </button>
        {transactions.length === 1 && (
          <button
            type="button"
            onClick={() => setReconcileMode("transfer")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              reconcileMode === "transfer" 
                ? "bg-white shadow text-indigo-700 font-extrabold border" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
            Traspaso Propio
          </button>
        )}
      </div>

      {/* Form content */}
      <form onSubmit={handleReconcile} className="flex-1 overflow-y-auto p-5 flex flex-col justify-between space-y-6">
        
        {reconcileMode === "match" ? (
          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-indigo-600" />
              Selecciona el documento pendiente *
            </label>

            {sortedAndMatchedDocs.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-lg bg-slate-50 text-slate-500 space-y-2">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-400" />
                <p className="text-xs font-semibold">No hay facturas pendientes.</p>
                <p className="text-[11px] text-slate-400">
                  {isCharge 
                    ? "Registra egresos recibidos o manuales para poder asociar este cargo." 
                    : "Emite facturas pendientes de cobro para asociar este abono."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <SearchableSelect
                  label="Seleccionar Documento Pendiente"
                  placeholder="Busca por cliente/proveedor, folio, total..."
                  items={searchableDocs}
                  selectedId={selectedDocId}
                  onSelect={setSelectedDocId}
                  required
                />

                {/* Details box of the selected invoice/document */}
                {selectedDoc && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in duration-200 mt-2">
                    <div className="flex justify-between items-start border-b border-slate-200 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Documento Seleccionado
                          </span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase ${
                            selectedDoc._type === "factura" 
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-blue-100 text-blue-800"
                          }`}>
                            {selectedDoc._type === "factura" ? "Factura emit." : "Gasto / Compra"}
                          </span>
                        </div>
                        <p className="text-xs font-black text-slate-800 mt-0.5">
                          {selectedDoc.vendorName || selectedDoc.emisorName || selectedDoc.clientName || "Proveedor/Cliente"}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg">
                          #{selectedDoc.invoiceNumber || selectedDoc.folio || selectedDoc.uuid?.substring(0, 8) || selectedDoc.id}
                        </span>
                        {(selectedDoc.docDateStr || selectedDoc.date) && (
                          <span className="block text-[10px] font-bold text-slate-500 mt-1">
                            {selectedDoc.docDateStr || selectedDoc.date}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Items list */}
                    <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                      {selectedDoc.items && selectedDoc.items.length > 0 ? (
                        selectedDoc.items.map((item: any, idx: number) => {
                          const itemName = item.productName || item.concept || item.description || item.name || "Concepto sin nombre";
                          const qty = item.quantity || 1;
                          const price = item.unitPrice || item.unitCost || item.price || item.cost || 0;
                          const total = item.total || item.lineTotal || (qty * price);

                          return (
                            <div key={idx} className="flex justify-between items-start text-xs pb-2 border-b border-slate-100 last:border-0 last:pb-0 gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 truncate" title={itemName}>
                                  {itemName}
                                </p>
                                {item.variantTitle && (
                                  <p className="text-[10px] text-slate-400 font-medium">{item.variantTitle}</p>
                                )}
                              </div>
                              <div className="text-right shrink-0 font-mono text-[11px] text-slate-500">
                                <span>{qty} x ${price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <span className="block font-black text-slate-700">${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex justify-between items-center text-xs text-slate-600 py-1">
                          <span className="font-medium">{selectedDoc.concept || "Concepto general"}</span>
                          <span className="font-mono font-bold">${(selectedDoc.docTotal || selectedDoc.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                    </div>

                    {/* Totals */}
                    <div className="border-t border-slate-200 pt-2.5 flex justify-between items-center font-bold text-slate-800 text-xs">
                      <span>Total del Documento</span>
                      <span className="font-mono text-sm text-slate-900">${(selectedDoc.docTotal || selectedDoc.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}

                {/* Highlight exact match */}
                {sortedAndMatchedDocs.find(d => d.isExactMatch) && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-xs flex items-start gap-2.5 animate-in zoom-in-95">
                    <Sparkles className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold flex items-center gap-1.5 text-emerald-900">
                        ¡Coincidencia Sugerida Encontrada!
                      </p>
                      <p className="text-[11px] text-emerald-700 mt-0.5">
                        Hemos detectado una factura pendiente con el monto exacto de ${absAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}. Se ha seleccionado automáticamente para facilitar tu conciliación.
                      </p>
                    </div>
                  </div>
                )}

                {/* Classification controls for matched charges */}
                {isCharge && selectedDocId && (
                  <div className="space-y-4 border-t pt-4 mt-4 animate-in fade-in duration-300">
                    <p className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                      Datos de Clasificación del Gasto
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600">
                          Fecha del Gasto *
                        </label>
                        <input
                          type="date"
                          value={expenseDate}
                          onChange={(e) => setExpenseDate(e.target.value)}
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600">
                          Sucursal *
                        </label>
                        <select
                          value={selectedLocationId}
                          onChange={(e) => setSelectedLocationId(e.target.value)}
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                          required
                        >
                          <option value="" disabled>Selecciona sucursal...</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600">
                          IVA Incluido *
                        </label>
                        <select
                          value={vatRate}
                          onChange={(e) => setVatRate(Number(e.target.value))}
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                          required
                        >
                          <option value={0.16}>16% (General)</option>
                          <option value={0.08}>8% (Frontera)</option>
                          <option value={0}>0% / Exento</option>
                        </select>
                      </div>
                    </div>

                    <SearchableSelect
                      label="Cuenta Contable"
                      placeholder="Selecciona cuenta..."
                      items={searchableAccounts}
                      selectedId={selectedExpenseOrIncomeAccountId}
                      onSelect={setSelectedExpenseOrIncomeAccountId}
                      required
                    />

                    <SearchableSelect
                      label="Centro de Costos"
                      placeholder="Ninguno / General"
                      items={searchableCostCenters}
                      selectedId={selectedCostCenterId}
                      onSelect={setSelectedCostCenterId}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        ) : reconcileMode === "direct" ? (
          <div className="space-y-4 animate-in fade-in duration-300">
            {isCharge ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">
                      Fecha de Gasto *
                    </label>
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">
                      Sucursal *
                    </label>
                    <select
                      value={selectedLocationId}
                      onChange={(e) => setSelectedLocationId(e.target.value)}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                      required
                    >
                      <option value="" disabled>Selecciona sucursal...</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <SearchableSelect
                  label="Proveedor"
                  placeholder="Selecciona proveedor..."
                  items={searchableVendors}
                  selectedId={selectedVendorId}
                  onSelect={setSelectedVendorId}
                  required
                />

                <div className="grid grid-cols-2 gap-3">
                  <SearchableSelect
                    label="Cuenta Contable"
                    placeholder="Selecciona cuenta..."
                    items={searchableAccounts}
                    selectedId={selectedExpenseOrIncomeAccountId}
                    onSelect={setSelectedExpenseOrIncomeAccountId}
                    required
                  />

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">
                      IVA Incluido *
                    </label>
                    <select
                      value={vatRate}
                      onChange={(e) => setVatRate(Number(e.target.value))}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                      required
                    >
                      <option value={0.16}>16% (General)</option>
                      <option value={0.08}>8% (Frontera)</option>
                      <option value={0}>0% / Exento</option>
                    </select>
                  </div>
                </div>

                <SearchableSelect
                  label="Centro de Costos"
                  placeholder="Ninguno / General"
                  items={searchableCostCenters}
                  selectedId={selectedCostCenterId}
                  onSelect={setSelectedCostCenterId}
                />

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">
                    Descripción / Concepto *
                  </label>
                  <input
                    type="text"
                    value={directDescription}
                    onChange={(e) => setDirectDescription(e.target.value)}
                    placeholder="Descripción del gasto..."
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <SearchableSelect
                  label="Clasificación Contable"
                  placeholder="Selecciona la cuenta de clasificación..."
                  items={searchableAccounts}
                  selectedId={selectedExpenseOrIncomeAccountId}
                  onSelect={setSelectedExpenseOrIncomeAccountId}
                  required
                />
              </>
            )}

            <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">Póliza y Gasto Automático:</p>
              <p className="text-[11px] leading-relaxed">
                Al conciliar directamente, el sistema creará el documento de Gasto administrativo (con estado Pagado) y registrará los egresos correspondientes. También se generarán las pólizas contables automáticas.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Traspaso Propio (transfer) Form */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
                {isCharge ? "Banco Destino *" : "Banco Origen *"}
              </label>
              <select
                value={selectedTargetAccountId}
                onChange={(e) => setSelectedTargetAccountId(e.target.value)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                required
              >
                <option value="" disabled>Selecciona la cuenta bancaria relacionada...</option>
                {bankAccounts.filter(b => b.id !== accountId).map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.currency})
                  </option>
                ))}
              </select>
            </div>

            {selectedTargetAccountId && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-indigo-600" />
                  Movimiento de Emparejamiento *
                </label>
                {sortedTargetTransactions.length === 0 ? (
                  <div className="p-4 border rounded-lg bg-slate-50 text-slate-500 text-center text-xs space-y-1">
                    <AlertCircle className="w-6 h-6 mx-auto text-slate-400" />
                    <p className="font-semibold">No se encontraron movimientos no conciliados.</p>
                    <p className="text-[10px] text-slate-400">
                      Carga el estado de cuenta del otro banco para conciliar el traspaso. Debe ser un movimiento de signo opuesto.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <select
                      value={selectedTargetTxId}
                      onChange={(e) => setSelectedTargetTxId(e.target.value)}
                      className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                      required
                    >
                      <option value="" disabled>Selecciona el movimiento correspondiente...</option>
                      {sortedTargetTransactions.map(tx => {
                        const matchTag = tx.isExactAmount ? "⭐ [COINCIDENCIA DE MONTO]" : "";
                        const dateTag = tx.date ? ` [${tx.date}]` : "";
                        const txAmount = Math.abs(tx.amount);
                        return (
                          <option key={tx.id} value={tx.id} className={tx.isExactAmount ? "font-bold text-emerald-700 bg-emerald-50" : ""}>
                            {matchTag} {tx.concept} - ${txAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}{dateTag}
                          </option>
                        );
                      })}
                    </select>

                    {sortedTargetTransactions.find(t => t.isExactAmount) && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-xs flex items-start gap-2.5 animate-in zoom-in-95">
                        <Sparkles className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-extrabold flex items-center gap-1.5 text-emerald-900">
                            ¡Coincidencia de Traspaso Encontrada!
                          </p>
                          <p className="text-[11px] text-emerald-700 mt-0.5">
                            Hemos encontrado un movimiento en el banco seleccionado con el monto opuesto exacto de ${absAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}. Se ha preseleccionado de forma sugerida.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">Póliza de Traspaso y Saldos:</p>
              <p className="text-[11px] leading-relaxed">
                Al conciliar el traspaso propio, el sistema marcará ambos movimientos como conciliados y creará una póliza contable de diario traspasando los fondos entre las cuentas de ambos bancos.
              </p>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-4 border-t flex flex-col gap-2 shrink-0">
          <Button 
            type="submit" 
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            disabled={loading || (reconcileMode === "match" && sortedAndMatchedDocs.length === 0) || (reconcileMode === "transfer" && (!selectedTargetAccountId || !selectedTargetTxId))}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Conciliando Movimiento...
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                Conciliar Movimiento
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
