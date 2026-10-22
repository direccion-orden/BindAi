"use client";

import React, { useState, useEffect, useMemo } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  BankTransaction, 
  isCreditAccount 
} from "@/types/bank";
import { unreconcileBankTransaction } from "@/lib/services/bankReconciliationService";
import { 
  Search, 
  Sparkles, 
  Undo2, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Receipt, 
  Building2, 
  ArrowRightLeft, 
  FileText, 
  CreditCard, 
  Calendar, 
  Hash, 
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  Layers,
  ArrowUpDown,
  Scissors,
  Clock
} from "lucide-react";

interface ReconciliationAuditViewProps {
  companyId: string;
  transactions: BankTransaction[];
  bankAccounts: any[];
  currentAccountId: string | null;
  accountingAccountsAll: any[];
  onReconciliationChanged: () => void;
}

interface MatchedItemDetail {
  type: "gasto" | "factura" | "remision" | "tpv_batch" | "transfer" | "direct" | "unknown";
  title: string;
  subtitle?: string;
  folio?: string;
  partnerName?: string;
  docDate?: string;
  docDateLabel?: string;
  counterpartAccountName?: string;
  counterpartReference?: string;
  counterpartConcept?: string;
  docAmount?: number;
  link?: string;
  details?: string;
  accountName?: string;
  tpvDocs?: {
    id: string;
    folio: string;
    clientName: string;
    date: string;
    amount: number;
  }[];
}

function calculateDaysDifference(dateStr1?: string, dateStr2?: string): { days: number; text: string; isSame: boolean } | null {
  if (!dateStr1 || !dateStr2) return null;
  const cleanDate2 = dateStr2.includes(" al ") ? dateStr2.split(" al ")[1] : dateStr2;
  
  const d1 = new Date(dateStr1.slice(0, 10) + "T00:00:00");
  const d2 = new Date(cleanDate2.slice(0, 10) + "T00:00:00");
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;

  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { days: 0, text: "Mismo día", isSame: true };
  } else if (diffDays > 0) {
    return { days: diffDays, text: `+${diffDays}d desfase`, isSame: false };
  } else {
    return { days: diffDays, text: `${diffDays}d desfase`, isSame: false };
  }
}

export function ReconciliationAuditView({
  companyId,
  transactions,
  bankAccounts,
  currentAccountId,
  accountingAccountsAll,
  onReconciliationChanged,
}: ReconciliationAuditViewProps) {
  const [detailsCache, setDetailsCache] = useState<Record<string, MatchedItemDetail>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [unreconcilingId, setUnreconcilingId] = useState<string | null>(null);
  const [expandedReasonId, setExpandedReasonId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<"all" | "ai" | "manual">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");

  // Filter only reconciled transactions
  const reconciledTxs = useMemo(() => {
    return transactions.filter(t => t.reconciled);
  }, [transactions]);

  // Load details for reconciled transactions
  useEffect(() => {
    if (!companyId || reconciledTxs.length === 0) return;

    const fetchDetailsForTx = async (tx: BankTransaction) => {
      if (detailsCache[tx.id] || loadingDetails[tx.id]) return;

      setLoadingDetails(prev => ({ ...prev, [tx.id]: true }));

      try {
        const docId = (tx as any).reconciledDocId || tx.matchedDocumentId;
        const txType = (tx as any).reconciledType || tx.reconcileType || "match";
        const matchedIds: string[] = (tx as any).matchedDocumentIds || (docId ? [docId] : []);
        const absAmount = Math.abs(tx.amount);

        // 1. TPV Batch
        if (txType === "tpv_batch" || ((tx as any).matchedDocumentIds && (tx as any).matchedDocumentIds.length > 1)) {
          const tpvDocsList: any[] = [];
          let totalTpv = 0;

          for (const mId of matchedIds) {
            try {
              const rSnap = await getDoc(doc(db, "companies", companyId, "remisiones", mId));
              if (rSnap.exists()) {
                const rData = rSnap.data();
                const folio = rData.remissionNumber || rData.number || mId.slice(0, 8);
                const amt = Number(rData.cardAmount || rData.totalAmount || rData.total || 0);
                totalTpv += amt;
                tpvDocsList.push({
                  id: mId,
                  folio,
                  clientName: rData.clientName || "Cliente",
                  date: rData.date || rData.createdAt?.slice(0, 10) || "N/A",
                  amount: amt
                });
              }
            } catch (e) {
              console.warn("Could not fetch remision in audit:", mId, e);
            }
          }

          const dates = tpvDocsList
            .map(d => d.date)
            .filter((d): d is string => !!d && d !== "N/A" && d.length >= 8)
            .sort();
          
          let tpvDateStr = "N/A";
          let tpvDateLabel = "Fecha Ventas Lote";
          if (dates.length > 0) {
            if (dates[0] === dates[dates.length - 1]) {
              tpvDateStr = dates[0];
              tpvDateLabel = "Fecha Ventas Lote";
            } else {
              tpvDateStr = `${dates[0]} al ${dates[dates.length - 1]}`;
              tpvDateLabel = "Rango Fechas Lote";
            }
          }

          setDetailsCache(prev => ({
            ...prev,
            [tx.id]: {
              type: "tpv_batch",
              title: `Liquidación TPV (${tpvDocsList.length} remisiones)`,
              subtitle: `Lote de ventas pagadas con tarjeta en mostrador`,
              docDate: tpvDateStr,
              docDateLabel: tpvDateLabel,
              docAmount: totalTpv || absAmount,
              tpvDocs: tpvDocsList,
              details: (tx as any).reconcileNotes || `Cobro consolidado TPV de ${tpvDocsList.length} tickets`
            }
          }));
          return;
        }

        // 2. Transfer between own accounts
        if (txType === "transfer") {
          let counterpartName = "Cuenta Bancaria Propia";
          let counterpartDate: string | undefined = undefined;
          let counterpartConcept: string | undefined = undefined;
          let counterpartReference: string | undefined = undefined;
          const targetAccId = (tx as any).matchedAccountId;

          if (targetAccId) {
            const acc = bankAccounts.find(b => b.id === targetAccId);
            if (acc) {
              counterpartName = acc.Name || acc.name || counterpartName;
            } else {
              try {
                const accSnap = await getDoc(doc(db, "companies", companyId, "bankAccounts", targetAccId));
                if (accSnap.exists()) {
                  counterpartName = accSnap.data().Name || accSnap.data().name || counterpartName;
                }
              } catch (e) {}
            }

            // Consultar la transacción espejo en el banco contraparte
            if (docId) {
              try {
                const cTxSnap = await getDoc(doc(db, "companies", companyId, "bankAccounts", targetAccId, "transactions", docId));
                if (cTxSnap.exists()) {
                  const cData = cTxSnap.data();
                  counterpartDate = cData.date;
                  counterpartConcept = cData.concept;
                  counterpartReference = cData.reference;
                }
              } catch (e) {
                console.warn("Could not fetch mirror transaction for transfer:", e);
              }
            }
          }

          setDetailsCache(prev => ({
            ...prev,
            [tx.id]: {
              type: "transfer",
              title: "Traspaso entre Cuentas Propias",
              subtitle: tx.amount < 0 ? `Cuenta Destino: ${counterpartName}` : `Cuenta Origen: ${counterpartName}`,
              docDate: counterpartDate,
              docDateLabel: tx.amount < 0 ? "Fecha Banco Destino" : "Fecha Banco Origen",
              counterpartAccountName: counterpartName,
              counterpartConcept,
              counterpartReference,
              docAmount: absAmount,
              details: counterpartConcept 
                ? `Movimiento espejo: "${counterpartConcept}" (Ref: ${counterpartReference || "S/R"})`
                : (docId ? `Movimiento espejo ID: #${docId.slice(0, 8)}` : "Movimiento espejo vinculado")
            }
          }));
          return;
        }

        // 3. Direct accounting account
        if (txType === "direct") {
          const accId = docId || (tx as any).accountingAccountId;
          let accName = "Cuenta Contable Directa";
          let accCode = "";

          if (accId) {
            const acc = accountingAccountsAll.find(a => a.id === accId);
            if (acc) {
              accName = acc.name;
              accCode = acc.code;
            } else {
              try {
                const aSnap = await getDoc(doc(db, "companies", companyId, "accounts", accId));
                if (aSnap.exists()) {
                  accName = aSnap.data().name || accName;
                  accCode = aSnap.data().code || "";
                }
              } catch (e) {}
            }
          }

          const directDate = (tx as any).matchedAt ? (tx as any).matchedAt.slice(0, 10) : tx.date;

          setDetailsCache(prev => ({
            ...prev,
            [tx.id]: {
              type: "direct",
              title: accCode ? `Cuenta ${accCode} - ${accName}` : accName,
              subtitle: tx.amount < 0 ? "Registro Contable Directo de Gasto" : "Registro Contable Directo de Ingreso",
              docDate: directDate,
              docDateLabel: "Fecha Registro Contable",
              docAmount: absAmount,
              accountName: accName
            }
          }));
          return;
        }

        // 4. Inflows: Facturas de Venta o Remisiones
        if (tx.amount > 0 && docId) {
          // Check facturas
          try {
            const fSnap = await getDoc(doc(db, "companies", companyId, "facturas", docId));
            if (fSnap.exists()) {
              const fData = fSnap.data();
              const folio = fData.invoiceNumber || fData.folio || docId.slice(0, 8);
              const docDate = fData.date || fData.issuedAt?.slice(0, 10) || fData.createdAt?.slice(0, 10);
              setDetailsCache(prev => ({
                ...prev,
                [tx.id]: {
                  type: "factura",
                  title: `Factura de Venta: #${folio}`,
                  subtitle: `Cliente: ${fData.clientName || "Cliente"}`,
                  folio,
                  partnerName: fData.clientName,
                  docDate,
                  docDateLabel: "Fecha Emisión Factura",
                  docAmount: Number(fData.totalAmount || fData.total || absAmount),
                  link: `/ventas/facturas/${docId}`,
                  details: fData.uuid ? `UUID: ${fData.uuid}` : undefined
                }
              }));
              return;
            }
          } catch (e) {}

          // Check remisiones
          try {
            const rSnap = await getDoc(doc(db, "companies", companyId, "remisiones", docId));
            if (rSnap.exists()) {
              const rData = rSnap.data();
              const folio = rData.remissionNumber || rData.number || docId.slice(0, 8);
              const docDate = rData.date || rData.createdAt?.slice(0, 10);
              setDetailsCache(prev => ({
                ...prev,
                [tx.id]: {
                  type: "remision",
                  title: `Remisión de Venta: #${folio}`,
                  subtitle: `Cliente: ${rData.clientName || "Cliente"}`,
                  folio,
                  partnerName: rData.clientName,
                  docDate,
                  docDateLabel: "Fecha Remisión",
                  docAmount: Number(rData.totalAmount || rData.total || absAmount),
                  link: `/ventas/remisiones/${docId}`,
                  details: rData.orderNumber ? `Pedido: #${rData.orderNumber}` : undefined
                }
              }));
              return;
            }
          } catch (e) {}
        }

        // 5. Outflows: Expenses (Manual o SAT XML)
        if (tx.amount < 0 && docId) {
          // Check expenses
          try {
            const expSnap = await getDoc(doc(db, "companies", companyId, "expenses", docId));
            if (expSnap.exists()) {
              const expData = expSnap.data();
              const folio = expData.documentNumber || (expData.number ? `GAS-${String(expData.number).padStart(5, "0")}` : docId.slice(0, 8));
              const docDate = expData.date || expData.expenseDate || expData.createdAt?.slice(0, 10);
              setDetailsCache(prev => ({
                ...prev,
                [tx.id]: {
                  type: "gasto",
                  title: `Gasto: #${folio}`,
                  subtitle: `Proveedor: ${expData.vendorName || "Proveedor"}`,
                  folio,
                  partnerName: expData.vendorName,
                  docDate,
                  docDateLabel: "Fecha Comprobante Gasto",
                  docAmount: Number(expData.amount || expData.total || absAmount),
                  link: `/gastos/${docId}`,
                  details: expData.concept || expData.accountName
                }
              }));
              return;
            }
          } catch (e) {}

          // Check expenses_inbox
          try {
            const inbSnap = await getDoc(doc(db, "companies", companyId, "expenses_inbox", docId));
            if (inbSnap.exists()) {
              const inbData = inbSnap.data();
              const folio = inbData.invoiceNumber || inbData.uuid?.slice(0, 8) || "XML";
              const docDate = inbData.date || inbData.fecha || inbData.issuedAt?.slice(0, 10) || inbData.createdAt?.slice(0, 10);
              setDetailsCache(prev => ({
                ...prev,
                [tx.id]: {
                  type: "gasto",
                  title: `CFDI SAT: #${folio}`,
                  subtitle: `Proveedor: ${inbData.emisorName || inbData.vendorName || "Proveedor"}`,
                  folio,
                  partnerName: inbData.emisorName || inbData.vendorName,
                  docDate,
                  docDateLabel: "Fecha XML SAT",
                  docAmount: Number(inbData.total || absAmount),
                  details: inbData.concept || (inbData.uuid ? `UUID: ${inbData.uuid}` : undefined)
                }
              }));
              return;
            }
          } catch (e) {}
        }

        // 6. Fallback
        setDetailsCache(prev => ({
          ...prev,
          [tx.id]: {
            type: "unknown",
            title: docId ? `Documento vinculado #${docId.slice(0, 8)}` : "Registro Vinculado",
            subtitle: "Comprobante registrado en el sistema",
            docAmount: absAmount
          }
        }));
      } catch (err) {
        console.warn("Error fetching matched detail for tx:", tx.id, err);
      } finally {
        setLoadingDetails(prev => ({ ...prev, [tx.id]: false }));
      }
    };

    reconciledTxs.forEach(tx => {
      fetchDetailsForTx(tx);
    });
  }, [reconciledTxs, companyId, bankAccounts, accountingAccountsAll, detailsCache, loadingDetails]);

  // Handle Unreconcile Action
  const handleUnreconcile = async (tx: BankTransaction) => {
    const isAi = !!tx.aiMatchReason || !!(tx as any).aiConfidenceScore;
    const confirmText = `¿Estás seguro de desconciliar este movimiento?\n\n• Fecha: ${tx.date}\n• Monto: $${Math.abs(tx.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n• Concepto: ${tx.concept}\n\nEl movimiento volverá a la pestaña de 'Conciliación Pendiente' y se revertirán los vínculos del documento.`;

    if (!window.confirm(confirmText)) return;

    const accountIdToUse = currentAccountId || (tx as any).bankAccountId || (bankAccounts[0]?.id as string);
    if (!accountIdToUse) {
      alert("No se pudo identificar la cuenta bancaria para este movimiento.");
      return;
    }

    setUnreconcilingId(tx.id);
    try {
      await unreconcileBankTransaction(companyId, accountIdToUse, tx);
      setDetailsCache(prev => {
        const next = { ...prev };
        delete next[tx.id];
        return next;
      });
      onReconciliationChanged();
    } catch (err: any) {
      console.error("Error unreconciling from audit view:", err);
      alert(err.message || "Error al desconciliar el movimiento.");
    } finally {
      setUnreconcilingId(null);
    }
  };

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = reconciledTxs.length;
    const aiCount = reconciledTxs.filter(t => !!t.aiMatchReason || !!(t as any).aiConfidenceScore).length;
    const manualCount = total - aiCount;
    const totalVolume = reconciledTxs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // Average AI Confidence
    const aiTxsWithScore = reconciledTxs.filter(t => (t as any).aiConfidenceScore !== undefined && (t as any).aiConfidenceScore !== null);
    const avgConfidence = aiTxsWithScore.length > 0
      ? Math.round((aiTxsWithScore.reduce((sum, t) => sum + (t as any).aiConfidenceScore, 0) / aiTxsWithScore.length) * 100)
      : null;

    return { total, aiCount, manualCount, totalVolume, avgConfidence };
  }, [reconciledTxs]);

  // Filtered & Sorted list
  const filteredTxs = useMemo(() => {
    let list = [...reconciledTxs];

    // Filter by Origin (AI vs Manual)
    if (originFilter === "ai") {
      list = list.filter(t => !!t.aiMatchReason || !!(t as any).aiConfidenceScore);
    } else if (originFilter === "manual") {
      list = list.filter(t => !t.aiMatchReason && !(t as any).aiConfidenceScore);
    }

    // Filter by Reconcile Type
    if (typeFilter !== "all") {
      list = list.filter(t => {
        const detail = detailsCache[t.id];
        const txType = (t as any).reconciledType || t.reconcileType || "";
        if (typeFilter === "tpv") return txType === "tpv_batch" || detail?.type === "tpv_batch";
        if (typeFilter === "gasto") return detail?.type === "gasto" || txType.includes("gasto");
        if (typeFilter === "venta") return detail?.type === "factura" || detail?.type === "remision" || txType === "match";
        if (typeFilter === "transfer") return detail?.type === "transfer" || txType === "transfer";
        if (typeFilter === "direct") return detail?.type === "direct" || txType === "direct";
        return true;
      });
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(t => {
        const concept = (t.concept || "").toLowerCase();
        const ref = (t.reference || "").toLowerCase();
        const detail = detailsCache[t.id];
        const title = (detail?.title || "").toLowerCase();
        const partner = (detail?.partnerName || "").toLowerCase();
        const folio = (detail?.folio || "").toLowerCase();
        const desc = (detail?.details || "").toLowerCase();

        return concept.includes(q) || ref.includes(q) || title.includes(q) || partner.includes(q) || folio.includes(q) || desc.includes(q);
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortOrder === "date_desc") return (b.date || "").localeCompare(a.date || "");
      if (sortOrder === "date_asc") return (a.date || "").localeCompare(b.date || "");
      if (sortOrder === "amount_desc") return Math.abs(b.amount) - Math.abs(a.amount);
      if (sortOrder === "amount_asc") return Math.abs(a.amount) - Math.abs(b.amount);
      return 0;
    });

    return list;
  }, [reconciledTxs, originFilter, typeFilter, search, sortOrder, detailsCache]);

  const currentBank = bankAccounts.find(b => b.id === currentAccountId);
  const isCredit = currentBank ? isCreditAccount(currentBank) : false;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50">
      {/* 1. Header KPIs */}
      <div className="p-4 border-b bg-white shrink-0 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Conciliados</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-slate-900">{kpis.total}</span>
              <span className="text-[11px] font-bold text-slate-500">movimientos</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-indigo-50/40 border border-purple-200/80 rounded-xl p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-600" />
                Conciliados por IA
              </span>
              {kpis.avgConfidence !== null && (
                <span className="text-[10px] font-extrabold bg-purple-200 text-purple-900 px-1.5 py-0.2 rounded-full">
                  {kpis.avgConfidence}% prom.
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-purple-950">{kpis.aiCount}</span>
              <span className="text-[11px] font-bold text-purple-600">
                ({kpis.total > 0 ? Math.round((kpis.aiCount / kpis.total) * 100) : 0}%)
              </span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Conciliados Manualmente</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xl font-black text-slate-800">{kpis.manualCount}</span>
              <span className="text-[11px] font-bold text-slate-500">movimientos</span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Volumen Total Conciliado</span>
            <p className="text-xl font-black text-slate-900 mt-0.5 font-mono">
              ${kpis.totalVolume.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* 2. Filters Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="search"
                placeholder="Buscar por concepto, folio, cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs bg-slate-50 border-slate-200"
              />
            </div>

            {/* Origin Filter */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 shrink-0 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setOriginFilter("all")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  originFilter === "all" ? "bg-white text-slate-900 shadow-sm font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Todos ({kpis.total})
              </button>
              <button
                type="button"
                onClick={() => setOriginFilter("ai")}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  originFilter === "ai" ? "bg-purple-600 text-white shadow-sm font-bold" : "text-purple-700 hover:text-purple-900"
                }`}
              >
                <Sparkles className="w-3 h-3" /> Solo IA ({kpis.aiCount})
              </button>
              <button
                type="button"
                onClick={() => setOriginFilter("manual")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  originFilter === "manual" ? "bg-white text-slate-900 shadow-sm font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Manual ({kpis.manualCount})
              </button>
            </div>

            {/* Reconcile Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 px-2 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Todos los tipos</option>
              <option value="tpv">Lotes TPV Tarjeta</option>
              <option value="gasto">Gastos / Compras SAT</option>
              <option value="venta">Ventas / Remisiones</option>
              <option value="transfer">Traspasos entre Cuentas</option>
              <option value="direct">Registros Directos</option>
            </select>
          </div>

          {/* Sort order */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Ordenar:
            </span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="h-8 px-2 text-xs font-semibold rounded-md border border-slate-200 bg-white text-slate-700 outline-none cursor-pointer"
            >
              <option value="date_desc">Fecha (Más recientes primero)</option>
              <option value="date_asc">Fecha (Más antiguos primero)</option>
              <option value="amount_desc">Monto (Mayor a menor)</option>
              <option value="amount_asc">Monto (Menor a mayor)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Section Column Titles (Two Halves) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 border-b bg-slate-100/90 text-slate-600 text-[11px] font-black uppercase tracking-wider px-4 py-2 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-500" />
          <span>Lado Izquierdo: Movimiento Bancario Real</span>
        </div>
        <div className="hidden lg:flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-600" />
            <span>Lado Derecho: Elemento Correspondiente Conciliado</span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold lowercase">acción auditor</span>
        </div>
      </div>

      {/* 4. Split-Row Records List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200 custom-scrollbar">
        {filteredTxs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-slate-300 stroke-[1.5]" />
            <div>
              <p className="text-sm font-bold text-slate-600">No hay movimientos conciliados para mostrar</p>
              <p className="text-xs text-slate-400 mt-1">
                {reconciledTxs.length === 0 
                  ? "Esta cuenta bancaria aún no tiene movimientos conciliados." 
                  : "Ningún movimiento coincide con los filtros aplicados."}
              </p>
            </div>
            {(search || originFilter !== "all" || typeFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setOriginFilter("all");
                  setTypeFilter("all");
                }}
                className="text-xs font-bold"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          filteredTxs.map((tx) => {
            const detail = detailsCache[tx.id];
            const isLoadingDetail = loadingDetails[tx.id];
            const isCharge = tx.amount < 0;
            const absAmt = Math.abs(tx.amount);
            const isAi = !!tx.aiMatchReason || !!(tx as any).aiConfidenceScore;
            const confidenceScore = (tx as any).aiConfidenceScore;
            const aiReasoning = (tx as any).aiReasoning || tx.aiMatchReason;
            const isUnreconciling = unreconcilingId === tx.id;
            const isExpandedReason = expandedReasonId === tx.id;

            // Difference calculation
            const docAmt = detail?.docAmount || absAmt;
            const diff = Math.abs(docAmt - absAmt);
            const isCuadrado = diff < 0.05;

            // Audit Dates
            const rawMatchedAt = (tx as any).matchedAt || (tx as any).reconciledAt;
            const reconciledTimestamp = rawMatchedAt ? rawMatchedAt.replace('T', ' ').slice(0, 16) : null;
            const dateDiff = calculateDaysDifference(tx.date, detail?.docDate);

            return (
              <div 
                key={tx.id} 
                className="grid grid-cols-1 lg:grid-cols-2 hover:bg-slate-50 transition-colors border-b last:border-b-0 bg-white"
              >
                {/* --- LADO IZQUIERDO: MOVIMIENTO BANCARIO --- */}
                <div className="p-4 flex flex-col justify-between gap-3 border-b lg:border-b-0 lg:border-r border-slate-200/80">
                  <div className="space-y-2">
                    {/* Header: Account Name & Badges + Amount */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-extrabold text-xs text-slate-800">
                          {currentBank?.Name || currentBank?.name || "Cuenta Bancaria"}
                        </span>
                        {isCredit && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">
                            TC
                          </span>
                        )}
                        {tx.isSplitPart && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                            <Scissors className="w-2.5 h-2.5" /> Split
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                          Ref: {tx.reference || "S/R"}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-base font-black font-mono tracking-tight ${
                          isCharge ? "text-rose-600" : "text-emerald-700"
                        }`}>
                          {isCharge ? "-" : "+"}${absAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* FECHA ORIGINAL DEL MOVIMIENTO BANCARIO (EXTRACTO) */}
                    <div className="flex items-center justify-between bg-slate-100/90 border border-slate-200/90 rounded-md px-2.5 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                          {detail?.type === "transfer" 
                            ? (isCharge ? "Fecha Banco Origen" : "Fecha Banco Destino")
                            : (isCharge ? "Fecha Mov. Bancario (Cargo)" : "Fecha Mov. Bancario (Depósito)")}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-black text-slate-900 bg-white px-2 py-0.5 rounded shadow-2xs border border-slate-200">
                        {tx.date}
                      </span>
                    </div>

                    {/* Concept */}
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                        Concepto en Banco:
                      </span>
                      <p className="text-xs font-bold text-slate-800 leading-snug break-words">
                        {tx.concept}
                      </p>
                    </div>
                  </div>

                  {/* AI or Manual Badge & Timestamp de Conciliación en el Sistema */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    {isAi ? (
                      <div className="bg-purple-50/70 border border-purple-200/80 rounded-lg p-2.5 text-xs text-purple-900 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[11px] flex items-center gap-1.5 text-purple-950">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                            Conciliado por Agente IA
                          </span>
                          {confidenceScore !== undefined && confidenceScore !== null && (
                            <span className="text-[10px] font-black bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded-full">
                              {Math.round(confidenceScore * 100)}% Confianza
                            </span>
                          )}
                        </div>

                        {aiReasoning && (
                          <div className="text-[11px] text-purple-800/90 leading-relaxed pt-0.5">
                            <p className={isExpandedReason ? "" : "line-clamp-2"}>
                              {aiReasoning}
                            </p>
                            {aiReasoning.length > 120 && (
                              <button
                                type="button"
                                onClick={() => setExpandedReasonId(isExpandedReason ? null : tx.id)}
                                className="text-[10px] font-bold text-purple-700 hover:text-purple-950 underline mt-1"
                              >
                                {isExpandedReason ? "Ver menos" : "Ver razonamiento completo"}
                              </button>
                            )}
                          </div>
                        )}

                        {reconciledTimestamp && (
                          <div className="text-[10px] text-purple-700/80 pt-1 border-t border-purple-200/50 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-purple-500" />
                              Conciliado en sistema:
                            </span>
                            <span className="font-mono font-bold text-purple-950">{reconciledTimestamp}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-slate-500 text-[11px] bg-slate-50 border border-slate-200/60 px-2.5 py-1.5 rounded-md">
                        <span className="font-semibold flex items-center gap-1 text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Conciliación Manual
                        </span>
                        {reconciledTimestamp && (
                          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            Conciliado: {reconciledTimestamp}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* --- LADO DERECHO: ELEMENTO CORRESPONDIENTE CONCILIADO --- */}
                <div className="p-4 flex flex-col justify-between gap-3 bg-slate-50/40">
                  {isLoadingDetail ? (
                    <div className="flex items-center justify-center py-8 text-xs text-slate-400 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      Consultando detalles del comprobante...
                    </div>
                  ) : detail ? (
                    <div className="space-y-2.5">
                      {/* Top Type Tag & Document Number & Cuadre */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            detail.type === "tpv_batch"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : detail.type === "factura"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : detail.type === "remision"
                              ? "bg-blue-100 text-blue-800 border border-blue-200"
                              : detail.type === "transfer"
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-slate-200 text-slate-800"
                          }`}>
                            {detail.type === "tpv_batch" ? "Lote TPV Tarjetas" :
                             detail.type === "factura" ? "Factura Emitida" :
                             detail.type === "remision" ? "Remisión de Venta" :
                             detail.type === "transfer" ? "Traspaso Propio" :
                             detail.type === "direct" ? "Contable Directo" : "Gasto / Compra"}
                          </span>

                          {detail.folio && (
                            <span className="text-xs font-mono font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                              #{detail.folio}
                            </span>
                          )}
                        </div>

                        {/* Cuadre badge */}
                        <div>
                          {isCuadrado ? (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Cuadre 100%
                            </span>
                          ) : (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              Dif: ${diff.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* FECHA DE LA CONTRAPARTE (XML SAT / BANCO DESTINO / REMISIÓN) */}
                      <div className="flex items-center justify-between bg-white border border-slate-200/90 rounded-md px-2.5 py-1.5 shadow-2xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide truncate">
                            {detail.docDateLabel || "Fecha Comprobante"}:
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs font-black text-indigo-950 bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded">
                            {detail.docDate || "Sin fecha"}
                          </span>
                          {dateDiff && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              dateDiff.isSame 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}>
                              {dateDiff.text}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Main Document Title / Client / Partner */}
                      <div>
                        <p className="text-xs font-extrabold text-slate-800">
                          {detail.title}
                        </p>
                        {detail.subtitle && (
                          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                            {detail.subtitle}
                          </p>
                        )}
                      </div>

                      {/* Specific: TPV Batch Remisiones List */}
                      {detail.type === "tpv_batch" && detail.tpvDocs && detail.tpvDocs.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-lg p-2 space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar shadow-xs">
                          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">
                            Remisiones en este Lote ({detail.tpvDocs.length}):
                          </p>
                          {detail.tpvDocs.map((rem) => (
                            <div 
                              key={rem.id} 
                              className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 last:border-0"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-bold text-slate-800 font-mono">#{rem.folio}</span>
                                <span className="text-slate-500 font-normal"> • {rem.clientName}</span>
                                <span className="text-indigo-600 font-mono text-[10px] font-bold"> ({rem.date})</span>
                              </div>
                              <span className="font-mono font-bold text-slate-900 shrink-0">
                                ${rem.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Details / UUID / Concept */}
                      {detail.details && detail.type !== "tpv_batch" && (
                        <p className="text-[11px] text-slate-600 bg-white border border-slate-200/60 rounded px-2.5 py-1.5 font-medium leading-relaxed">
                          {detail.details}
                        </p>
                      )}

                      {/* Document Totals */}
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <span>Importe Registrado:</span>
                        <span className="font-mono font-extrabold text-slate-900 text-sm">
                          ${(detail.docAmount || absAmt).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 py-4">
                      Sin datos del comprobante asociado.
                    </div>
                  )}

                  {/* Bottom Action: Desconciliar */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
                    <span className="text-[10px] text-slate-400 font-medium">
                      Auditoría: Validar concordancia de fechas, importes y concepto
                    </span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnreconcile(tx)}
                      disabled={isUnreconciling}
                      className="h-8 text-xs font-bold text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 gap-1.5 shrink-0 shadow-xs"
                      title="Desconciliar este movimiento y revertir el estado del documento"
                    >
                      {isUnreconciling ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Desconciliando...
                        </>
                      ) : (
                        <>
                          <Undo2 className="w-3.5 h-3.5" />
                          Desconciliar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
