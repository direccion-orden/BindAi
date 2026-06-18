"use client";

import React, { useState, useEffect } from "react";
import { doc, collection, getDocs, setDoc, query, where, updateDoc, addDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, Landmark, CheckCircle, X, DollarSign, BookOpen, AlertCircle } from "lucide-react";
import { BankTransaction } from "@/types/bank";

interface QuickReconcileModalProps {
  transaction: BankTransaction;
  accountId: string; // Physical bank account id
  onClose: () => void;
  onSuccess: () => void;
}

export function QuickReconcileModal({ transaction, accountId, onClose, onSuccess }: QuickReconcileModalProps) {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reconcileMode, setReconcileMode] = useState<"match" | "direct">("match");

  // Options loaded from DB
  const [unpaidDocs, setUnpaidDocs] = useState<any[]>([]);
  const [accountingAccounts, setAccountingAccounts] = useState<any[]>([]);
  const [accountingAccountsAll, setAccountingAccountsAll] = useState<any[]>([]);

  // Selections
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedExpenseOrIncomeAccountId, setSelectedExpenseOrIncomeAccountId] = useState("");
  const [vatRate, setVatRate] = useState<number>(0.16);

  const isCharge = transaction.amount < 0;
  const absAmount = Math.abs(transaction.amount);

  useEffect(() => {
    if (!companyId) return;

    const loadOptions = async () => {
      try {
        // 1. Fetch accounting accounts for direct categorization
        const accountsSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
        const allAcc = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setAccountingAccountsAll(allAcc);

        if (isCharge) {
          // Charges are mapped to Expenses/Costs accounts
          setAccountingAccounts(allAcc.filter(a => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2));
        } else {
          // Deposits are mapped to Income accounts
          setAccountingAccounts(allAcc.filter(a => a.type === "INGRESOS" && a.level >= 2));
        }

        // 2. Fetch unpaid invoices/documents to match
        if (isCharge) {
          // Received invoices (Gastos / expenses_inbox)
          const q = query(
            collection(db, "companies", companyId, "expenses_inbox"),
            where("status", "!=", "paid")
          );
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, _type: "gasto", ...d.data() } as any));
          // Filter dynamically in memory for safety
          const unpaidInbox = list.filter(inv => !inv.paidAmount || inv.paidAmount < inv.total - 0.01);

          // Manual expenses (expenses)
          const qManual = query(
            collection(db, "companies", companyId, "expenses"),
            where("status", "!=", "paid")
          );
          const snapManual = await getDocs(qManual);
          const listManual = snapManual.docs.map(d => ({ id: d.id, _type: "gasto_manual", ...d.data() } as any));
          const unpaidManual = listManual.filter(inv => !inv.paidAmount || inv.paidAmount < inv.amount - 0.01);

          setUnpaidDocs([...unpaidInbox, ...unpaidManual]);
        } else {
          // Sales invoices (ventas/facturas)
          const q = query(
            collection(db, "companies", companyId, "facturas"),
            where("status", "==", "por_cobrar") // or pending status
          );
          const snap = await getDocs(q);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          const unpaid = list.filter(inv => !inv.paidAmount || inv.paidAmount < inv.totalAmount - 0.01);
          setUnpaidDocs(unpaid);
        }
      } catch (err) {
        console.error("Error loading options for conciliation:", err);
      }
    };

    loadOptions();
  }, [companyId, isCharge]);

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

        const selectedDoc = unpaidDocs.find(d => d.id === selectedDocId);
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
          const outflowRef = await addDoc(collection(db, "companies", companyId, "outflows"), outflowData);

          // 2. Update invoice paidAmount
          const updates: any = {
            paidAmount: increment(absAmount)
          };
          const newPaid = (selectedDoc.paidAmount || 0) + absAmount;
          const totalAmt = isManual ? (selectedDoc.amount || 0) : (selectedDoc.total || 0);
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
          const paymentRef = await addDoc(collection(db, "companies", companyId, "payments"), paymentData);

          // 2. Update sales invoice paidAmount
          const updates: any = {
            paidAmount: increment(absAmount)
          };
          const newPaid = (selectedDoc.paidAmount || 0) + absAmount;
          const totalAmt = selectedDoc.totalAmount || selectedDoc.total || 0;
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

      alert("Movimiento conciliado exitosamente.");
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      alert("Hubo un error al conciliar el movimiento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-muted/20">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            Conciliación Rápida de Movimiento
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Transaction Summary Info Card */}
        <div className="p-4 bg-slate-50 border-b space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-500 font-semibold uppercase">Concepto del Banco</span>
            <span className="text-xs text-slate-500 font-mono">{transaction.date}</span>
          </div>
          <p className="font-bold text-slate-800 leading-tight">{transaction.concept}</p>
          <div className="flex justify-between items-end pt-1">
            <span className="text-xs text-slate-500 font-mono">Ref: {transaction.reference || "S/R"}</span>
            <span className={`text-xl font-black ${isCharge ? 'text-red-600' : 'text-emerald-700'}`}>
              {isCharge ? '-' : '+'}${absAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b bg-slate-100/30 p-1 gap-1 shrink-0">
          <button
            onClick={() => setReconcileMode("match")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${reconcileMode === 'match' ? 'bg-white shadow text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Asociar a Factura / Docto.
          </button>
          <button
            onClick={() => setReconcileMode("direct")}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${reconcileMode === 'direct' ? 'bg-white shadow text-indigo-600 font-extrabold' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Registrar como Directo
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleReconcile} className="p-6 space-y-4">
          {reconcileMode === "match" ? (
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                Selecciona la Factura Pendiente a Asociar *
              </label>
              {unpaidDocs.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6 border border-dashed rounded-lg bg-slate-50">
                  No se encontraron facturas pendientes de cobro/pago para asociar.
                </p>
              ) : (
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none"
                  required
                >
                  <option value="" disabled>Selecciona el documento...</option>
                  {unpaidDocs.map(doc => {
                    const docNumber = doc.invoiceNumber || doc.folio || doc.uuid?.substring(0, 8) || doc.id;
                    const docTotal = doc._type === "gasto_manual" ? (doc.amount || 0) : (doc.totalAmount || doc.total || 0);
                    const docPaid = doc.paidAmount || 0;
                    const docOutstanding = docTotal - docPaid;
                    const partnerName = doc.vendorName || doc.emisorName || doc.clientName || "Proveedor/Cliente";
                    const isManualLabel = doc._type === "gasto_manual" ? " (Manual)" : "";
                    return (
                      <option key={doc.id} value={doc.id}>
                        {partnerName} - #{docNumber}{isManualLabel} (Pendiente: ${docOutstanding.toLocaleString('es-MX', { minimumFractionDigits: 2 })} / Total: ${docTotal.toLocaleString('es-MX')})
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  Clasificación Contable *
                </label>
                <select
                  value={selectedExpenseOrIncomeAccountId}
                  onChange={(e) => setSelectedExpenseOrIncomeAccountId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none"
                  required
                >
                  <option value="" disabled>Selecciona la cuenta de clasificación...</option>
                  {accountingAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>
              </div>

              {isCharge && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    IVA Acreditable Incluido *
                  </label>
                  <select
                    value={vatRate}
                    onChange={(e) => setVatRate(Number(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none"
                    required
                  >
                    <option value={0.16}>16% (General)</option>
                    <option value={0.08}>8% (Frontera)</option>
                    <option value={0}>0% / Exento</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-4 flex gap-3 border-t">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Cerrar
            </Button>
            <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold" disabled={loading || (reconcileMode === "match" && unpaidDocs.length === 0)}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Conciliar Movimiento
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
