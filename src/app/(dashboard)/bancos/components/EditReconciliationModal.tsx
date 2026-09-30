"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  updateDoc,
  addDoc,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Landmark,
  CheckCircle,
  X,
  FileText,
  BookOpen,
  AlertCircle,
  ArrowRight,
  Unlink,
  ExternalLink,
  Sparkles,
  Calendar,
  Hash,
  Building2,
  RefreshCw,
  Search,
} from "lucide-react";
import { BankTransaction, BankAccount, isCreditAccount } from "@/types/bank";
import { getNextSequence } from "@/lib/firebase/counters";
import { parseCfdiItems } from "@/lib/cfdi/parseInvoiceItems";

interface EditReconciliationModalProps {
  isOpen: boolean;
  transaction: BankTransaction | null;
  bankAccount: BankAccount | null;
  onClose: () => void;
  onSuccess: () => void;
  onOpenReconcilePanel?: (tx: BankTransaction) => void;
}

export function EditReconciliationModal({
  isOpen,
  transaction,
  bankAccount,
  onClose,
  onSuccess,
  onOpenReconcilePanel,
}: EditReconciliationModalProps) {
  const { companyId, user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [matchedDocInfo, setMatchedDocInfo] = useState<{
    title: string;
    subtitle?: string;
    details?: string;
    amount?: number;
    type?: string;
    folio?: string;
    link?: string;
    vendor?: string;
    concept?: string;
    account?: string;
    isProvisional?: boolean;
    isAiReconciled?: boolean;
    aiMatchReason?: string;
    confidenceScore?: number;
  } | null>(null);

  // States for reconciling when pending or re-reconciling
  const [isEditing, setIsEditing] = useState(false);
  const [reconcileMode, setReconcileMode] = useState<"match" | "direct">("match");
  const [unpaidDocs, setUnpaidDocs] = useState<any[]>([]);
  const [accountingAccounts, setAccountingAccounts] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [accountSearchQuery, setAccountSearchQuery] = useState("");

  const isCharge = transaction ? transaction.amount < 0 : false;
  const absAmount = transaction ? Math.abs(transaction.amount) : 0;
  const currency = bankAccount?.currency || "MXN";

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "MXN",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // 1. Fetch reconciliation details when modal opens and tx is reconciled
  useEffect(() => {
    if (!isOpen || !transaction || !companyId) {
      setMatchedDocInfo(null);
      setIsEditing(false);
      return;
    }

    if (!transaction.reconciled) {
      setMatchedDocInfo(null);
      return;
    }

    const fetchMatchedDetails = async () => {
      setFetchingDetails(true);
      try {
        const docId = (transaction as any).reconciledDocId || transaction.matchedDocumentId;
        const type = (transaction as any).reconciledType || transaction.reconcileType || "match";
        const reconciledBy = (transaction as any).reconciledBy;
        const aiMatchReason = (transaction as any).aiMatchReason;
        const confidenceScore = (transaction as any).confidenceScore;
        const isAiReconciled = reconciledBy === "AI_AGENT" || !!aiMatchReason;

        let found = false;

        // 1. Check if matched to an expense (provisional or fiscal)
        if (docId) {
          try {
            const expSnap = await getDoc(doc(db, "companies", companyId, "expenses", docId));
            if (expSnap.exists()) {
              const expData = expSnap.data();
              const isProv = expData.isProvisional === true || expData.isPendingFiscalInvoice === true;
              const folioStr = expData.documentNumber || (expData.number ? `GAS-${String(expData.number).padStart(5, "0")}` : expData.id?.slice(0, 8));

              setMatchedDocInfo({
                title: isProv ? "Gasto Provisional Registrado" : `Gasto ${folioStr || expData.concept || docId.slice(0, 8)}`,
                subtitle: expData.vendorName ? `Proveedor: ${expData.vendorName}` : undefined,
                folio: folioStr,
                link: `/gastos/${docId}`,
                vendor: expData.vendorName || "Proveedor",
                concept: expData.concept || expData.rawBankConcept || transaction.concept,
                account: expData.accountCode ? `${expData.accountCode} - ${expData.accountName || ""}` : (expData.accountName || ""),
                details: expData.uuid ? `UUID: ${expData.uuid}` : undefined,
                amount: expData.amount || expData.total || absAmount,
                type: "gasto",
                isProvisional: isProv,
                isAiReconciled: isAiReconciled || expData.createdBy?.includes("IA"),
                aiMatchReason: aiMatchReason || expData.aiMatchReason,
                confidenceScore: confidenceScore || expData.confidenceScore,
              });
              found = true;
            }
          } catch (e) {
            console.warn("Could not fetch expense", e);
          }
        }

        // 2. Check expenses_inbox (SAT XMLs received)
        if (!found && docId) {
          try {
            const inbSnap = await getDoc(doc(db, "companies", companyId, "expenses_inbox", docId));
            if (inbSnap.exists()) {
              const inbData = inbSnap.data();
              const folio = inbData.invoiceNumber || inbData.uuid?.slice(0, 8) || "XML";
              const linkedId = inbData.linkedExpenseId || inbData.expenseId;

              setMatchedDocInfo({
                title: `Gasto CFDI SAT: ${folio}`,
                subtitle: `Proveedor: ${inbData.emisorName || inbData.vendorName || "Proveedor"}`,
                folio: folio,
                link: linkedId ? `/gastos/${linkedId}` : undefined,
                vendor: inbData.emisorName || inbData.vendorName,
                concept: inbData.concept,
                details: inbData.uuid ? `UUID: ${inbData.uuid}` : undefined,
                amount: inbData.total || absAmount,
                type: "gasto_inbox",
                isAiReconciled,
                aiMatchReason,
              });
              found = true;
            }
          } catch (e) {
            console.warn("Could not fetch expenses_inbox", e);
          }
        }

        // 3. Check facturas (sales invoices)
        if (!found && docId) {
          try {
            const fSnap = await getDoc(doc(db, "companies", companyId, "facturas", docId));
            if (fSnap.exists()) {
              const fData = fSnap.data();
              const folio = fData.invoiceNumber || fData.folio || docId.slice(0, 8);

              setMatchedDocInfo({
                title: `Factura de Venta: ${folio}`,
                subtitle: `Cliente: ${fData.clientName || "Cliente"}`,
                folio: folio,
                link: `/ventas/facturas/${docId}`,
                details: fData.uuid ? `UUID: ${fData.uuid}` : undefined,
                amount: fData.totalAmount || fData.total || absAmount,
                type: "factura",
                isAiReconciled,
                aiMatchReason,
              });
              found = true;
            }
          } catch (e) {
            console.warn("Could not fetch factura", e);
          }
        }

        // 4. Check transfer
        if (!found && type === "transfer") {
          let targetAccountName = "Otra cuenta bancaria";
          if ((transaction as any).matchedAccountId) {
            try {
              const accDoc = await getDoc(
                doc(db, "companies", companyId, "bankAccounts", (transaction as any).matchedAccountId)
              );
              if (accDoc.exists()) {
                const accData = accDoc.data();
                targetAccountName = accData.Name || accData.name || targetAccountName;
              }
            } catch (e) {
              console.warn("Could not fetch counterpart bank account", e);
            }
          }

          setMatchedDocInfo({
            title: "Traspaso entre Cuentas Propias",
            subtitle: `Contraparte: ${targetAccountName}`,
            details: docId ? `ID Movimiento: ${docId.slice(0, 12)}...` : "Movimiento espejo",
            amount: absAmount,
            type: "transfer",
            isAiReconciled,
            aiMatchReason,
          });
          found = true;
        }

        // 5. Check direct accounting account
        if (!found && type === "direct") {
          let accName = "Cuenta Contable Directa";
          let accCode = "";
          const accId = docId || (transaction as any).accountingAccountId;
          if (accId) {
            try {
              const accDoc = await getDoc(doc(db, "companies", companyId, "accounts", accId));
              if (accDoc.exists()) {
                const accData = accDoc.data();
                accName = accData.name || accName;
                accCode = accData.code || "";
              }
            } catch (e) {
              console.warn("Could not fetch accounting account", e);
            }
          }

          setMatchedDocInfo({
            title: accCode ? `Cuenta ${accCode} - ${accName}` : accName,
            subtitle: isAiReconciled ? "Registro Directo por Agente IA" : "Registro Contable Directo",
            details: "Sin comprobante fiscal SAT asociado",
            amount: absAmount,
            type: "direct",
            isAiReconciled,
            aiMatchReason,
          });
          found = true;
        }

        // 6. Fallback if not found in any collection
        if (!found) {
          setMatchedDocInfo({
            title: isAiReconciled ? "Conciliado por Agente IA" : "Conciliación Directa / Manual",
            subtitle: docId ? `Documento ID: ${docId}` : "Sin comprobante fiscal vinculado en el sistema",
            amount: absAmount,
            type: "match",
            isAiReconciled,
            aiMatchReason,
          });
        }
      } catch (err) {
        console.error("Error fetching match details:", err);
      } finally {
        setFetchingDetails(false);
      }
    };

    fetchMatchedDetails();
  }, [isOpen, transaction, companyId, absAmount]);

  // 2. Load options when editing or reconciling
  useEffect(() => {
    if (!isOpen || !companyId || !transaction) return;
    if (transaction.reconciled && !isEditing) return;

    const loadOptions = async () => {
      try {
        // Accounts
        const accSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
        const allAcc = accSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        if (isCharge) {
          setAccountingAccounts(allAcc.filter((a) => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2));
        } else {
          setAccountingAccounts(allAcc.filter((a) => a.type === "INGRESOS" && a.level >= 2));
        }

        // Unpaid Docs
        if (isCharge) {
          const qInbox = query(collection(db, "companies", companyId, "expenses_inbox"), where("status", "!=", "paid"));
          const inbSnap = await getDocs(qInbox);
          const listInbox = inbSnap.docs
            .map((d) => ({ id: d.id, _type: "gasto", ...d.data() } as any))
            .filter((inv) => !inv.paidAmount || inv.paidAmount < (inv.total || 0) - 0.01);

          const qManual = query(collection(db, "companies", companyId, "expenses"), where("status", "!=", "paid"));
          const manSnap = await getDocs(qManual);
          const listManual = manSnap.docs
            .map((d) => ({ id: d.id, _type: "gasto_manual", ...d.data() } as any))
            .filter((inv) => !inv.paidAmount || inv.paidAmount < (inv.amount || 0) - 0.01);

          setUnpaidDocs([...listInbox, ...listManual]);
        } else {
          const qSales = query(collection(db, "companies", companyId, "facturas"), where("status", "==", "por_cobrar"));
          const salesSnap = await getDocs(qSales);
          const listSales = salesSnap.docs
            .map((d) => ({ id: d.id, _type: "factura", ...d.data() } as any))
            .filter((inv) => !inv.paidAmount || inv.paidAmount < (inv.totalAmount || inv.total || 0) - 0.01);
          setUnpaidDocs(listSales);
        }
      } catch (err) {
        console.error("Error loading reconciliation options:", err);
      }
    };

    loadOptions();
  }, [isOpen, companyId, transaction, isCharge, isEditing]);

  // 3. Un-reconcile logic
  const handleUnreconcile = async () => {
    if (!companyId || !bankAccount || !transaction) return;

    const confirmMsg =
      "¿Estás seguro de que deseas desconciliar este movimiento?\n\nEl movimiento volverá al estado 'Pendiente' y se revertirá la vinculación con el documento o cuenta actual.";
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const docId = (transaction as any).reconciledDocId || transaction.matchedDocumentId;
      const type = (transaction as any).reconciledType || transaction.reconcileType || "match";

      // A. Revert invoice/expense paidAmount if matched or provisional
      if (docId) {
        if (isCharge) {
          // Check expenses
          try {
            const expRef = doc(db, "companies", companyId, "expenses", docId);
            const expSnap = await getDoc(expRef);
            if (expSnap.exists()) {
              const currentPaid = expSnap.data().paidAmount || 0;
              const newPaid = Math.max(0, currentPaid - absAmount);
              await updateDoc(expRef, {
                paidAmount: newPaid,
                status: "pending",
              });
            }
          } catch (e) {
            console.warn("Could not revert expense paidAmount", e);
          }

          // Check expenses_inbox
          try {
            const inbRef = doc(db, "companies", companyId, "expenses_inbox", docId);
            const inbSnap = await getDoc(inbRef);
            if (inbSnap.exists()) {
              const currentPaid = inbSnap.data().paidAmount || 0;
              const newPaid = Math.max(0, currentPaid - absAmount);
              await updateDoc(inbRef, {
                paidAmount: newPaid,
                status: "pending",
              });
            }
          } catch (e) {
            console.warn("Could not revert expenses_inbox paidAmount", e);
          }
        } else {
          // Check facturas
          try {
            const fRef = doc(db, "companies", companyId, "facturas", docId);
            const fSnap = await getDoc(fRef);
            if (fSnap.exists()) {
              const currentPaid = fSnap.data().paidAmount || 0;
              const newPaid = Math.max(0, currentPaid - absAmount);
              await updateDoc(fRef, {
                paidAmount: newPaid,
                status: "por_cobrar",
              });
            }
          } catch (e) {
            console.warn("Could not revert factura paidAmount", e);
          }
        }
      } else if (type === "transfer" && docId && (transaction as any).matchedAccountId) {
        // Revert counterpart transaction if it was a transfer
        try {
          const counterpartRef = doc(
            db,
            "companies",
            companyId,
            "bankAccounts",
            (transaction as any).matchedAccountId,
            "transactions",
            docId
          );
          await updateDoc(counterpartRef, {
            reconciled: false,
            matchedAt: null,
            reconciledAt: null,
            reconcileType: null,
            reconciledType: null,
            matchedDocumentId: null,
            reconciledDocId: null,
            matchedAccountId: null,
          });
        } catch (e) {
          console.warn("Could not revert counterpart transfer transaction", e);
        }
      }

      // B. Update current transaction
      const txRef = doc(
        db,
        "companies",
        companyId,
        "bankAccounts",
        bankAccount.id,
        "transactions",
        transaction.id
      );
      await updateDoc(txRef, {
        reconciled: false,
        matchedAt: null,
        reconciledAt: null,
        reconcileType: null,
        reconciledType: null,
        matchedDocumentId: null,
        reconciledDocId: null,
        matchedAccountId: null,
        accountingAccountId: null,
        reconciledBy: null,
        aiMatchReason: null,
        confidenceScore: null,
      });

      alert("El movimiento ha sido desconciliado exitosamente y ahora está pendiente.");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error un-reconciling:", err);
      alert(err.message || "Error al desconciliar el movimiento.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Save new reconciliation (when pending or re-reconciling)
  const handleSaveReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !bankAccount || !transaction) return;

    setLoading(true);
    try {
      if (reconcileMode === "match") {
        if (!selectedDocId) {
          alert("Por favor selecciona un documento a asociar.");
          setLoading(false);
          return;
        }

        const selectedDoc = unpaidDocs.find((d) => d.id === selectedDocId);
        if (!selectedDoc) {
          alert("Documento no encontrado.");
          setLoading(false);
          return;
        }

        // If it was already reconciled to another doc, revert the old one first
        if (transaction.reconciled && transaction.matchedDocumentId && transaction.matchedDocumentId !== selectedDocId) {
          try {
            const oldId = transaction.matchedDocumentId;
            if (isCharge) {
              const expRef = doc(db, "companies", companyId, "expenses", oldId);
              const expSnap = await getDoc(expRef);
              if (expSnap.exists()) {
                const prev = expSnap.data().paidAmount || 0;
                await updateDoc(expRef, { paidAmount: Math.max(0, prev - absAmount), status: "pending" });
              }
            } else {
              const fRef = doc(db, "companies", companyId, "facturas", oldId);
              const fSnap = await getDoc(fRef);
              if (fSnap.exists()) {
                const prev = fSnap.data().paidAmount || 0;
                await updateDoc(fRef, { paidAmount: Math.max(0, prev - absAmount), status: "por_cobrar" });
              }
            }
          } catch (e) {
            console.warn("Could not revert previous match during re-reconciliation", e);
          }
        }

        if (isCharge) {
          const isManual = selectedDoc._type === "gasto_manual";
          const docCollection = isManual ? "expenses" : "expenses_inbox";
          let targetDocId = selectedDoc.id;

          if (!isManual) {
            const newExpenseId = crypto.randomUUID();
            const sequenceNum = await getNextSequence(companyId, "gastos");
            const numericVal = parseInt(sequenceNum.split("-")[1]) || 0;
            const totalAmt = selectedDoc.total || 0;
            const newPaid = (selectedDoc.paidAmount || 0) + absAmount;
            const status = newPaid >= totalAmt - 0.01 ? "paid" : "pending";

            let mappedItems: any[] = [];
            if (selectedDoc.items && selectedDoc.items.length > 0) {
              mappedItems = selectedDoc.items;
            } else if (selectedDoc.xmlBase64) {
              const parsed = parseCfdiItems(selectedDoc.xmlBase64);
              if (parsed.length > 0) {
                mappedItems = parsed.map((item) => ({
                  productId: null,
                  variantId: null,
                  productName: item.productName || "Partida SAT",
                  quantity: item.quantity || 1,
                  unitCost: item.unitCost || 0,
                  amount: item.amount || (item.quantity || 1) * (item.unitCost || 0),
                  claveProdServ: item.claveProdServ || "",
                  unit: item.unidad || item.claveUnidad || "PZA",
                }));
              }
            }

            if (mappedItems.length === 0) {
              mappedItems = [
                {
                  productName: selectedDoc.concept || "Gasto desde XML",
                  quantity: 1,
                  unitCost: totalAmt,
                  amount: totalAmt,
                },
              ];
            }

            const expenseDoc = {
              id: newExpenseId,
              number: numericVal,
              documentNumber: sequenceNum,
              date: selectedDoc.date || transaction.date || new Date().toISOString().split("T")[0],
              vendorId: selectedDoc.vendorId || null,
              vendorName: selectedDoc.emisorName || selectedDoc.vendorName || "Proveedor",
              concept: selectedDoc.concept || "Gasto desde XML " + (selectedDoc.invoiceNumber || selectedDoc.uuid || ""),
              amount: totalAmt,
              vatRate: selectedDoc.vatRate !== undefined ? selectedDoc.vatRate : 0.16,
              paidAmount: absAmount,
              status: status,
              items: mappedItems,
              satInvoiceId: selectedDoc.id,
              xmlBase64: selectedDoc.xmlBase64 || null,
              createdAt: new Date().toISOString(),
              createdBy: user?.email || "Sistema (Conciliación)",
              _type: "gasto_manual",
            };

            await setDoc(doc(db, "companies", companyId, "expenses", newExpenseId), expenseDoc);
            targetDocId = newExpenseId;
          }

          // Update invoice / inbox paidAmount
          const updates: any = {
            paidAmount: increment(absAmount),
          };
          const totalAmt = isManual ? selectedDoc.amount || 0 : selectedDoc.total || 0;
          const newPaid = (selectedDoc.paidAmount || 0) + absAmount;
          if (newPaid >= totalAmt - 0.01) {
            updates.status = "paid";
          }
          if (!isManual) {
            updates.expenseId = targetDocId;
            updates.linkedExpenseId = targetDocId;
          }
          await updateDoc(doc(db, "companies", companyId, docCollection, selectedDoc.id), updates);

          // Update bank transaction
          await updateDoc(
            doc(db, "companies", companyId, "bankAccounts", bankAccount.id, "transactions", transaction.id),
            {
              reconciled: true,
              matchedAt: new Date().toISOString(),
              reconcileType: "match",
              matchedDocumentId: targetDocId,
            }
          );
        } else {
          // Inflow: update sales invoice
          const updates: any = {
            paidAmount: increment(absAmount),
          };
          const totalAmt = selectedDoc.totalAmount || selectedDoc.total || 0;
          const newPaid = (selectedDoc.paidAmount || 0) + absAmount;
          if (newPaid >= totalAmt - 0.01) {
            updates.status = "cobrada";
          }
          await updateDoc(doc(db, "companies", companyId, "facturas", selectedDoc.id), updates);

          await updateDoc(
            doc(db, "companies", companyId, "bankAccounts", bankAccount.id, "transactions", transaction.id),
            {
              reconciled: true,
              matchedAt: new Date().toISOString(),
              reconcileType: "match",
              matchedDocumentId: selectedDoc.id,
            }
          );
        }
      } else {
        // Direct accounting registration
        if (!selectedAccountId) {
          alert("Por favor selecciona una cuenta contable.");
          setLoading(false);
          return;
        }

        await updateDoc(
          doc(db, "companies", companyId, "bankAccounts", bankAccount.id, "transactions", transaction.id),
          {
            reconciled: true,
            matchedAt: new Date().toISOString(),
            reconcileType: "direct",
            matchedDocumentId: selectedAccountId,
            accountingAccountId: selectedAccountId,
          }
        );
      }

      alert("Movimiento conciliado exitosamente.");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error saving reconciliation:", err);
      alert(err.message || "Error al guardar la conciliación.");
    } finally {
      setLoading(false);
    }
  };

  const filteredUnpaidDocs = useMemo(() => {
    if (!docSearchQuery) return unpaidDocs;
    const q = docSearchQuery.toLowerCase();
    return unpaidDocs.filter((d) => {
      const name = (d.emisorName || d.vendorName || d.clientName || "").toLowerCase();
      const num = (d.invoiceNumber || d.uuid || d.documentNumber || "").toLowerCase();
      const concept = (d.concept || "").toLowerCase();
      return name.includes(q) || num.includes(q) || concept.includes(q);
    });
  }, [unpaidDocs, docSearchQuery]);

  const filteredAccounts = useMemo(() => {
    if (!accountSearchQuery) return accountingAccounts;
    const q = accountSearchQuery.toLowerCase();
    return accountingAccounts.filter((a) => {
      const code = (a.code || "").toLowerCase();
      const name = (a.name || "").toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [accountingAccounts, accountSearchQuery]);

  if (!isOpen || !transaction) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${transaction.reconciled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {transaction.reconciled ? "Detalle de Conciliación" : "Conciliar Movimiento Bancario"}
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {bankAccount?.Name || bankAccount?.name || "Cuenta Bancaria"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Transaction Summary Card */}
        <div className="p-4 bg-slate-50 border-b space-y-2 text-sm">
          <div className="flex justify-between items-center text-xs">
            <span className="flex items-center gap-1 font-semibold text-slate-500">
              <Calendar className="w-3.5 h-3.5" />
              {transaction.date}
            </span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                transaction.reconciled
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {transaction.reconciled ? "Conciliado" : "Pendiente de Conciliar"}
            </span>
          </div>

          <p className="font-bold text-slate-800 leading-snug text-sm">{transaction.concept}</p>

          <div className="flex justify-between items-end pt-1">
            <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
              <Hash className="w-3 h-3 text-slate-400" />
              Ref: {transaction.reference || "S/R"}
            </span>
            <span className={`text-xl font-black ${isCharge ? "text-red-600" : "text-emerald-700"}`}>
              {isCharge ? "-" : "+"}
              {formatMoney(absAmount)}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {transaction.reconciled && !isEditing ? (
            /* VIEW RECONCILED DETAILS */
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    Vinculación Registrada
                  </span>
                  {(transaction.matchedAt || (transaction as any).reconciledAt) && (
                    <span className="text-[10px] text-slate-500">
                      Conciliado el {new Date(transaction.matchedAt || (transaction as any).reconciledAt).toLocaleDateString("es-MX")}
                    </span>
                  )}
                </div>

                {fetchingDetails ? (
                  <div className="flex items-center justify-center p-4 gap-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    Cargando información del comprobante...
                  </div>
                ) : matchedDocInfo ? (
                  <div className="space-y-3">
                    {matchedDocInfo.isProvisional && (
                      <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300 text-amber-900 px-3 py-2 rounded-lg text-xs font-semibold">
                        <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Gasto Provisional generado por el Agente Conciliador IA</span>
                      </div>
                    )}

                    <div className="bg-white rounded-lg p-3.5 border border-emerald-100 shadow-sm space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-800 text-sm leading-snug">{matchedDocInfo.title}</p>
                          {matchedDocInfo.subtitle && (
                            <p className="text-xs font-semibold text-slate-600 pt-0.5">{matchedDocInfo.subtitle}</p>
                          )}
                        </div>
                        {matchedDocInfo.isProvisional ? (
                          <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                            Pendiente SAT (XML)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            Fiscal
                          </span>
                        )}
                      </div>

                      {matchedDocInfo.concept && (
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-500">Concepto:</span> {matchedDocInfo.concept}
                        </p>
                      )}

                      {matchedDocInfo.account && (
                        <p className="text-xs text-slate-600">
                          <span className="font-semibold text-slate-500">Cuenta contable:</span> {matchedDocInfo.account}
                        </p>
                      )}

                      {matchedDocInfo.details && (
                        <p className="text-[11px] font-mono text-slate-400 truncate">{matchedDocInfo.details}</p>
                      )}

                      {/* Folio con botón / link para abrir directamente el gasto o factura */}
                      {matchedDocInfo.folio && (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-xs text-slate-500 font-semibold">Folio del documento:</span>
                          {matchedDocInfo.link ? (
                            <a
                              href={matchedDocInfo.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 border border-indigo-200 transition-all shadow-xs group"
                              title="Abrir y consultar este documento en una nueva pestaña"
                            >
                              <span>{matchedDocInfo.folio}</span>
                              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            </a>
                          ) : (
                            <span className="text-xs font-bold text-slate-800">{matchedDocInfo.folio}</span>
                          )}
                        </div>
                      )}

                      {matchedDocInfo.amount !== undefined && (
                        <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                          <span className="text-xs text-slate-500">Monto comprobante:</span>
                          <span className="text-xs font-bold text-emerald-700">
                            {formatMoney(matchedDocInfo.amount)}
                          </span>
                        </div>
                      )}
                    </div>

                    {matchedDocInfo.aiMatchReason && (
                      <div className="bg-amber-50/80 border border-amber-200/90 rounded-lg p-2.5 text-xs text-amber-950 space-y-1">
                        <span className="font-bold flex items-center gap-1 text-[11px] text-amber-800 uppercase tracking-wider">
                          <Sparkles className="w-3 h-3 text-amber-600" /> Criterio del Agente IA:
                        </span>
                        <p className="text-[11px] text-amber-900 leading-relaxed">{matchedDocInfo.aiMatchReason}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-lg p-3 border border-emerald-100 shadow-sm">
                    <p className="text-xs text-slate-600">
                      Tipo: <span className="font-bold uppercase">{transaction.reconcileType || "Manual"}</span>
                    </p>
                    {transaction.matchedDocumentId && (
                      <p className="text-[11px] font-mono text-slate-400 truncate">
                        ID: {transaction.matchedDocumentId}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons for Reconciled */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUnreconcile}
                  disabled={loading}
                  className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 font-bold text-xs h-10 gap-2 shadow-sm"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4 text-red-600" />
                  )}
                  Desconciliar Movimiento
                </Button>

                <Button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 gap-2 shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Cambiar Conciliación
                </Button>
              </div>
            </div>
          ) : (
            /* RECONCILE / EDIT FORM */
            <form onSubmit={handleSaveReconcile} className="space-y-4">
              {transaction.reconciled && isEditing && (
                <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
                  <span className="text-xs font-bold text-indigo-900">Modificando conciliación</span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="text-xs font-semibold text-indigo-700 hover:underline"
                  >
                    Cancelar edición
                  </button>
                </div>
              )}

              {/* Quick Reconcile Options or Open in Panel */}
              <div className="flex border-b bg-slate-100/50 p-1 rounded-lg gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setReconcileMode("match")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                    reconcileMode === "match"
                      ? "bg-white shadow text-indigo-600 font-extrabold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {isCharge ? "Factura / Gasto SAT" : "Factura de Venta"}
                </button>
                <button
                  type="button"
                  onClick={() => setReconcileMode("direct")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                    reconcileMode === "direct"
                      ? "bg-white shadow text-indigo-600 font-extrabold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Registro Contable Directo
                </button>
              </div>

              {reconcileMode === "match" ? (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="search"
                      placeholder="Buscar por proveedor, cliente, folio o monto..."
                      value={docSearchQuery}
                      onChange={(e) => setDocSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y bg-white custom-scrollbar text-xs">
                    {filteredUnpaidDocs.length === 0 ? (
                      <div className="p-4 text-center text-slate-400">
                        No se encontraron comprobantes pendientes por conciliar.
                      </div>
                    ) : (
                      filteredUnpaidDocs.map((docItem) => {
                        const isSelected = selectedDocId === docItem.id;
                        const docTotal = docItem.total || docItem.totalAmount || docItem.amount || 0;
                        const pendingAmt = docTotal - (docItem.paidAmount || 0);
                        const docName = docItem.emisorName || docItem.vendorName || docItem.clientName || "Comprobante";
                        const docFolio = docItem.invoiceNumber || docItem.folio || docItem.uuid?.slice(0, 8) || "S/F";

                        return (
                          <div
                            key={docItem.id}
                            onClick={() => setSelectedDocId(docItem.id)}
                            className={`p-2.5 cursor-pointer transition-colors flex items-center justify-between ${
                              isSelected ? "bg-indigo-50 border-l-4 border-indigo-600" : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex-1 pr-2 min-w-0">
                              <p className="font-bold text-slate-800 truncate">{docName}</p>
                              <p className="text-[11px] text-slate-400 font-mono">
                                Folio: {docFolio} • Fecha: {docItem.date || "N/A"}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-slate-800">{formatMoney(pendingAmt)}</p>
                              <span className="text-[10px] text-slate-400">por liquidar</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="search"
                      placeholder="Buscar por código o nombre de cuenta contable..."
                      value={accountSearchQuery}
                      onChange={(e) => setAccountSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto border rounded-lg divide-y bg-white custom-scrollbar text-xs">
                    {filteredAccounts.length === 0 ? (
                      <div className="p-4 text-center text-slate-400">
                        No se encontraron cuentas contables disponibles.
                      </div>
                    ) : (
                      filteredAccounts.map((acc) => {
                        const isSelected = selectedAccountId === acc.id;
                        return (
                          <div
                            key={acc.id}
                            onClick={() => setSelectedAccountId(acc.id)}
                            className={`p-2.5 cursor-pointer transition-colors flex items-center justify-between ${
                              isSelected ? "bg-indigo-50 border-l-4 border-indigo-600" : "hover:bg-slate-50"
                            }`}
                          >
                            <div>
                              <p className="font-bold text-slate-800">{acc.name}</p>
                              <p className="text-[11px] text-slate-400 font-mono">{acc.code}</p>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-600">
                              {acc.type}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Panel Jump / Actions */}
              <div className="pt-2 flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={loading || (reconcileMode === "match" ? !selectedDocId : !selectedAccountId)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 gap-2 shadow-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {transaction.reconciled ? "Guardar Nueva Conciliación" : "Conciliar Movimiento"}
                </Button>

                {onOpenReconcilePanel && !transaction.reconciled && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      onOpenReconcilePanel(transaction);
                      onClose();
                    }}
                    className="w-full text-indigo-600 hover:bg-indigo-50 font-bold text-xs h-9 gap-1.5"
                  >
                    <span>Abrir en Panel Avanzado de Conciliación</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
