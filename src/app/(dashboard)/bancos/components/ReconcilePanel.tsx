"use client";

import React, { useState, useEffect, useMemo } from "react";
import { doc, collection, getDocs, updateDoc, addDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Landmark, DollarSign, BookOpen, AlertCircle, Sparkles, Receipt, FileCheck } from "lucide-react";
import { BankTransaction } from "@/types/bank";

interface ReconcilePanelProps {
  transaction: BankTransaction;
  accountId: string;
  unpaidDocs: any[]; // Already filtered by transaction type (inflow/outflow)
  accountingAccounts: any[]; // Filtered by type (GASTOS/COSTOS vs INGRESOS)
  accountingAccountsAll: any[]; // All accounting accounts
  onSuccess: () => void;
  onDeselect: () => void;
}

export function ReconcilePanel({
  transaction,
  accountId,
  unpaidDocs,
  accountingAccounts,
  accountingAccountsAll,
  onSuccess,
  onDeselect
}: ReconcilePanelProps) {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reconcileMode, setReconcileMode] = useState<"match" | "direct">("match");

  // Form selections
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedExpenseOrIncomeAccountId, setSelectedExpenseOrIncomeAccountId] = useState("");
  const [vatRate, setVatRate] = useState<number>(0.16);

  const isCharge = transaction.amount < 0;
  const absAmount = Math.abs(transaction.amount);

  // Auto-suggest and sort exact matches
  const sortedAndMatchedDocs = useMemo(() => {
    return unpaidDocs.map(doc => {
      const docTotal = doc._type === "gasto_manual" ? (doc.amount || 0) : (doc.totalAmount || doc.total || 0);
      const docPaid = doc.paidAmount || 0;
      const docOutstanding = docTotal - docPaid;
      // Is exact match within 1 cent (tolerance for float precision)
      const isExactMatch = Math.abs(docOutstanding - absAmount) < 0.01;
      return { ...doc, docOutstanding, docTotal, isExactMatch };
    }).sort((a, b) => {
      if (a.isExactMatch && !b.isExactMatch) return -1;
      if (!a.isExactMatch && b.isExactMatch) return 1;
      return b.docOutstanding - a.docOutstanding; // Sort descending by outstanding amount
    });
  }, [unpaidDocs, absAmount]);

  // Auto-select exact match if found
  useEffect(() => {
    const exactMatch = sortedAndMatchedDocs.find(d => d.isExactMatch);
    if (exactMatch) {
      setSelectedDocId(exactMatch.id);
    } else {
      setSelectedDocId("");
    }
  }, [sortedAndMatchedDocs]);

  // Auto-select first categorization account if empty and we switch to direct
  useEffect(() => {
    if (reconcileMode === "direct" && accountingAccounts.length > 0 && !selectedExpenseOrIncomeAccountId) {
      setSelectedExpenseOrIncomeAccountId(accountingAccounts[0].id);
    }
  }, [reconcileMode, accountingAccounts, selectedExpenseOrIncomeAccountId]);

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !accountId) return;

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

        // --- Option A: Match with Existing Invoice ---
        if (isCharge) {
          const isManual = selectedDoc._type === "gasto_manual";
          const docType = isManual ? "gasto_manual" : "gasto";
          const docCollection = isManual ? "expenses" : "expenses_inbox";

          // 1. Create outflow record
          const outflowData = {
            amount: absAmount,
            date: transaction.date,
            method: "Transferencia",
            reference: transaction.reference || "CONCILIACION",
            documentId: selectedDoc.id,
            documentType: docType,
            documentNumber: selectedDoc.invoiceNumber || selectedDoc.uuid || selectedDoc.id,
            providerName: selectedDoc.emisorName || selectedDoc.vendorName || "Proveedor",
            bankAccountId: accountId,
            expenseAccountId: selectedDoc.accountId || "",
            createdAt: new Date().toISOString(),
          };
          await addDoc(collection(db, "companies", companyId, "outflows"), outflowData);

          // 2. Update invoice paidAmount
          const updates: any = {
            paidAmount: increment(absAmount)
          };
          const newPaid = (selectedDoc.paidAmount || 0) + absAmount;
          const totalAmt = selectedDoc.docTotal;
          if (newPaid >= totalAmt - 0.01) {
            updates.status = "paid";
          }
          await updateDoc(doc(db, "companies", companyId, docCollection, selectedDoc.id), updates);
        } else {
          // 1. Create incoming payment record
          const paymentData = {
            amount: absAmount,
            date: transaction.date,
            method: "Transferencia",
            reference: transaction.reference || "CONCILIACION",
            documentId: selectedDoc.id,
            documentType: "factura",
            documentNumber: selectedDoc.invoiceNumber || selectedDoc.id,
            clientName: selectedDoc.clientName || "Cliente",
            bankAccountId: accountId,
            createdAt: new Date().toISOString(),
          };
          await addDoc(collection(db, "companies", companyId, "payments"), paymentData);

          // 2. Update sales invoice paidAmount
          const updates: any = {
            paidAmount: increment(absAmount)
          };
          const newPaid = (selectedDoc.paidAmount || 0) + absAmount;
          const totalAmt = selectedDoc.docTotal;
          if (newPaid >= totalAmt - 0.01) {
            updates.status = "cobrada";
          }
          await updateDoc(doc(db, "companies", companyId, "facturas", selectedDoc.id), updates);
        }
      } else {
        // --- Option B: Register Direct Expense/Income ---
        if (!selectedExpenseOrIncomeAccountId) {
          alert("Por favor selecciona una clasificación contable.");
          setLoading(false);
          return;
        }

        const selectedAccount = accountingAccounts.find(a => a.id === selectedExpenseOrIncomeAccountId);
        const bankAccountSnap = await getDocs(collection(db, "companies", companyId, "bankAccounts"));
        const bankAccountsList = bankAccountSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const physicalBankAccount = bankAccountsList.find(b => b.id === accountId);
        
        const bankAccountingId = physicalBankAccount?.accountId;
        const bankAccountingAccount = bankAccountingId ? accountingAccountsAll.find(a => a.id === bankAccountingId) : null;

        if (isCharge) {
          // 1. Register Outflow
          const outflowData = {
            amount: absAmount,
            date: transaction.date,
            method: "Transferencia",
            reference: transaction.reference || "CONCILIACION_DIRECTA",
            documentId: null,
            documentType: "gasto_directo",
            documentNumber: `CONC-${transaction.id.substring(0, 5)}`,
            providerName: "Banco / Varios",
            bankAccountId: accountId,
            expenseAccountId: selectedExpenseOrIncomeAccountId,
            createdAt: new Date().toISOString(),
          };
          await addDoc(collection(db, "companies", companyId, "outflows"), outflowData);

          // 2. Journal Entry (Póliza)
          if (physicalBankAccount && selectedAccount && bankAccountingAccount) {
            let subtotalAmount = absAmount;
            let vatAmount = 0;
            const vatAccounts = accountingAccountsAll.filter(a => a.code?.startsWith("118") && a.level >= 2);
            const vatAccount = vatAccounts.length > 0 ? vatAccounts[0] : null;

            if (vatRate > 0) {
              subtotalAmount = absAmount / (1 + vatRate);
              vatAmount = absAmount - subtotalAmount;
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
                credit: absAmount
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
              date: transaction.date,
              description: `Conciliación de gasto directo: ${transaction.concept}`,
              referenceId: transaction.id,
              referenceType: "bank_transaction_reconciliation",
              createdAt: new Date().toISOString(),
              status: "activa",
              entries
            });

            // Update Balances
            await updateDoc(doc(db, "companies", companyId, "accounts", selectedExpenseOrIncomeAccountId), {
              balance: increment(subtotalAmount)
            });
            await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
              balance: increment(-absAmount)
            });
            await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId), {
              balance: increment(-absAmount)
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
            amount: absAmount,
            date: transaction.date,
            method: "Transferencia",
            reference: transaction.reference || "CONCILIACION_DIRECTA",
            documentId: null,
            documentType: "ingreso_directo",
            documentNumber: `CONC-${transaction.id.substring(0, 5)}`,
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
                debit: absAmount,
                credit: 0
              },
              {
                accountId: selectedExpenseOrIncomeAccountId,
                accountCode: selectedAccount.code,
                accountName: selectedAccount.name,
                debit: 0,
                credit: absAmount
              }
            ];

            await addDoc(collection(db, "companies", companyId, "journal_entries"), {
              type: "ingreso",
              date: transaction.date,
              description: `Conciliación de ingreso directo: ${transaction.concept}`,
              referenceId: transaction.id,
              referenceType: "bank_transaction_reconciliation",
              createdAt: new Date().toISOString(),
              status: "activa",
              entries
            });

            // Update Balances
            await updateDoc(doc(db, "companies", companyId, "accounts", selectedExpenseOrIncomeAccountId), {
              balance: increment(absAmount)
            });
            await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
              balance: increment(absAmount)
            });
            await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId), {
              balance: increment(absAmount)
            });
          }
        }
      }

      // --- Reconcile the Bank Transaction document ---
      await updateDoc(doc(db, "companies", companyId, "bankAccounts", accountId, "transactions", transaction.id), {
        reconciled: true,
        matchedAt: new Date().toISOString(),
        reconcileType: reconcileMode,
        matchedDocumentId: reconcileMode === "match" ? selectedDocId : selectedExpenseOrIncomeAccountId
      });

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
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                  required
                >
                  <option value="" disabled>Selecciona un documento pendiente...</option>
                  {sortedAndMatchedDocs.map(doc => {
                    const isManualLabel = doc._type === "gasto_manual" ? " (Manual)" : "";
                    const partnerName = doc.vendorName || doc.emisorName || doc.clientName || "Proveedor/Cliente";
                    const docNumber = doc.invoiceNumber || doc.folio || doc.uuid?.substring(0, 8) || doc.id;
                    const matchLabel = doc.isExactMatch ? "⭐ [SUGERIDO]" : "";

                    return (
                      <option key={doc.id} value={doc.id} className={doc.isExactMatch ? "font-bold text-emerald-700 bg-emerald-50" : ""}>
                        {matchLabel} {partnerName} - #{docNumber}{isManualLabel} (Pendiente: ${doc.docOutstanding.toLocaleString('es-MX', { minimumFractionDigits: 2 })} / Total: ${doc.docTotal.toLocaleString('es-MX')})
                      </option>
                    );
                  })}
                </select>

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
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                Clasificación Contable *
              </label>
              <select
                value={selectedExpenseOrIncomeAccountId}
                onChange={(e) => setSelectedExpenseOrIncomeAccountId(e.target.value)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                required
              >
                <option value="" disabled>Selecciona la cuenta de clasificación...</option>
                {accountingAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>

            {isCharge && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-indigo-600" />
                  IVA Acreditable Incluido *
                </label>
                <select
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value))}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none"
                  required
                >
                  <option value={0.16}>16% (General)</option>
                  <option value={0.08}>8% (Frontera)</option>
                  <option value={0}>0% / Exento / Sin IVA</option>
                </select>
              </div>
            )}
            
            <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">Póliza Automática:</p>
              <p className="text-[11px] leading-relaxed">
                Al conciliar directamente, el sistema creará una póliza contable de {isCharge ? "egreso" : "ingreso"} afectando a la cuenta seleccionada y a la cuenta contable de este banco.
              </p>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-4 border-t flex flex-col gap-2 shrink-0">
          <Button 
            type="submit" 
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            disabled={loading || (reconcileMode === "match" && sortedAndMatchedDocs.length === 0)}
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
