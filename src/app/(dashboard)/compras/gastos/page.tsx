"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { collection, query, onSnapshot, orderBy, doc, updateDoc, getDoc, writeBatch, getDocs, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getLocalDateString } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, DollarSign, PlusCircle, Search, Calendar, FileText, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Wallet, Clock, Eye, X, ShieldCheck, CheckSquare, Square, Receipt, Layers, Package, RefreshCw, Sparkles, Landmark, Check, Save, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { ExpensePaymentModal } from "@/components/payments/ExpensePaymentModal";
import { FormalizeProvisionalModal } from "./components/FormalizeProvisionalModal";
import { parseCfdiItems } from "@/lib/cfdi/parseInvoiceItems";
import { TableSearchSelect, TableSearchSelectItem } from "@/components/ui/table-search-select";
import Link from "next/link";

interface ExpenseItemPreview {
  descripcion: string;
  cantidad: number;
  unidad: string;
  valorUnitario: number;
  importe: number;
}

function ExpenseFolioWithPreview({
  exp,
  rawDocNum,
  displayDocNum,
  formatMoney,
  companyId
}: {
  exp: any;
  rawDocNum: string;
  displayDocNum: string;
  formatMoney: (val: number) => string;
  companyId?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [asyncItems, setAsyncItems] = useState<ExpenseItemPreview[] | null>(null);
  const [loadingAsync, setLoadingAsync] = useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  };

  const isProv = Boolean(
    exp.isProvisional || 
    exp.isPendingFiscalInvoice || 
    (exp.documentNumber && exp.documentNumber.startsWith("PROV-"))
  );

  // Determinar si tiene un identificador o enlace real con una factura fiscal SAT
  const hasPotentialSatLink = Boolean(
    exp.satInvoiceId ||
    exp.uuid ||
    exp.xmlBase64 ||
    (!isProv && exp.documentNumber && /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}/.test(exp.documentNumber)) ||
    (!isProv && exp.concept && /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}/.test(exp.concept))
  );

  // Base synchronous items extraction
  const syncItems: ExpenseItemPreview[] = React.useMemo(() => {
    // Si el popover no está abierto, no hacer nada de trabajo ni parseo XML
    if (!isOpen) return [];

    // 1. Si es un gasto provisional sin vínculo SAT, sus partidas son inmediatamente las de exp.items o su concepto bancario
    if (isProv && !hasPotentialSatLink) {
      if (Array.isArray(exp.items) && exp.items.length > 0) {
        return exp.items.map((it: any) => ({
          descripcion: it.productName || it.descripcion || it.concept || exp.concept || "Gasto Provisional",
          cantidad: Number(it.quantity || it.cantidad || 1),
          unidad: it.unidad || it.claveUnidad || "SERV",
          valorUnitario: Number(it.unitCost || it.valorUnitario || it.amount || exp.amount || 0),
          importe: Number(it.amount || it.importe || (Number(it.quantity || 1) * Number(it.unitCost || exp.amount || 0)))
        }));
      }
      return [{
        descripcion: exp.concept || "Gasto Provisional",
        cantidad: 1,
        unidad: "SERV",
        valorUnitario: Number(exp.amount || 0),
        importe: Number(exp.amount || 0)
      }];
    }

    // 2. Si el gasto ya tiene partidas detalladas
    if (Array.isArray(exp.items) && exp.items.length > 0) {
      // Si solo tiene 1 partida sintética creada con la descripción general (ej. "Gasto desde XML ..."),
      // solo considerarla sintética si el gasto TIENE vínculo a factura SAT
      const isSyntheticSingleItem = hasPotentialSatLink && exp.items.length === 1 && (
        (exp.items[0].productName && (
          exp.items[0].productName.startsWith("Gasto desde XML") ||
          exp.items[0].productName.startsWith("Gasto SAT:") ||
          exp.items[0].productName === exp.concept
        ))
      );

      if (!isSyntheticSingleItem) {
        return exp.items.map((it: any) => ({
          descripcion: it.productName || it.descripcion || it.concept || "Concepto",
          cantidad: Number(it.quantity || it.cantidad || 1),
          unidad: it.unidad || it.claveUnidad || "PZA",
          valorUnitario: Number(it.unitCost || it.valorUnitario || it.amount || 0),
          importe: Number(it.amount || it.importe || (Number(it.quantity || 1) * Number(it.unitCost || 0)))
        }));
      }
    }

    // 3. Si el gasto tiene XML base64
    if (exp.xmlBase64) {
      try {
        const parsed = parseCfdiItems(exp.xmlBase64);
        if (parsed.length > 0) {
          return parsed.map(it => ({
            descripcion: it.productName || "Concepto SAT",
            cantidad: it.quantity || 1,
            unidad: it.unidad || "PZA",
            valorUnitario: it.unitCost || 0,
            importe: it.amount || 0
          }));
        }
      } catch (e) {
        console.warn("Could not parse XML for expense preview:", e);
      }
    }

    return [];
  }, [isOpen, exp, isProv, hasPotentialSatLink]);

  // Si no tiene partidas ni XML local, pero tiene vínculo SAT y el usuario abre el popup, buscar en expenses_inbox
  useEffect(() => {
    if (!isOpen || syncItems.length > 0 || asyncItems !== null || !companyId || !hasPotentialSatLink) {
      return;
    }

    let isMounted = true;
    setLoadingAsync(true);

    const fetchInboxItems = async () => {
      try {
        // Temporizador de 2.5s para no quedarse nunca congelado ante demoras de red
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout al consultar CFDI SAT")), 2500)
        );

        const queryPromise = (async () => {
          let satInvoiceDoc: any = null;
          
          // 1. Extraer posibles UUIDs de satInvoiceId, uuid, documentNumber o concept
          const potentialUuids: string[] = [];
          if (exp.satInvoiceId) potentialUuids.push(exp.satInvoiceId);
          if (exp.uuid) potentialUuids.push(exp.uuid);
          if (exp.documentNumber) {
            const match = exp.documentNumber.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
            if (match) potentialUuids.push(match[0]);
          }
          if (exp.concept) {
            const match = exp.concept.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
            if (match) potentialUuids.push(match[0]);
          }
          if (Array.isArray(exp.items) && exp.items[0]?.productName) {
            const match = exp.items[0].productName.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
            if (match) potentialUuids.push(match[0]);
          }

          // Buscar por ID directo considerando mayúsculas y minúsculas
          for (const candidateId of potentialUuids) {
            const variations = [candidateId, candidateId.toLowerCase(), candidateId.toUpperCase()];
            for (const testId of variations) {
              const snap = await getDoc(doc(db, "companies", companyId, "expenses_inbox", testId));
              if (snap.exists()) {
                satInvoiceDoc = snap.data();
                break;
              }
            }
            if (satInvoiceDoc) break;
          }

          // Si no se encontró por ID directo y no es provisional, buscar por folio
          if (!satInvoiceDoc && !isProv) {
            const docNumClean = (exp.documentNumber || "").trim();
            if (docNumClean) {
              const inboxCol = collection(db, "companies", companyId, "expenses_inbox");
              const qFolio = query(inboxCol, where("folio", "==", docNumClean), limit(1));
              const snapFolio = await getDocs(qFolio);
              if (!snapFolio.empty) {
                satInvoiceDoc = snapFolio.docs[0].data();
              }
            }
          }

          if (satInvoiceDoc && satInvoiceDoc.xmlBase64) {
            const parsed = parseCfdiItems(satInvoiceDoc.xmlBase64);
            if (parsed.length > 0) {
              return parsed.map(it => ({
                descripcion: it.productName || "Concepto SAT",
                cantidad: it.quantity || 1,
                unidad: it.unidad || "PZA",
                valorUnitario: it.unitCost || 0,
                importe: it.amount || 0
              }));
            }
          }

          return [];
        })();

        const result = await Promise.race([queryPromise, timeoutPromise]) as ExpenseItemPreview[];
        if (isMounted) {
          setAsyncItems(result || []);
        }
      } catch (err) {
        console.warn("Could not fetch remote SAT invoice items:", err);
        if (isMounted) {
          setAsyncItems([]);
        }
      } finally {
        if (isMounted) {
          setLoadingAsync(false);
        }
      }
    };

    fetchInboxItems();

    return () => {
      isMounted = false;
    };
  }, [isOpen, syncItems.length, asyncItems, exp, companyId, hasPotentialSatLink, isProv]);

  const items: ExpenseItemPreview[] = useMemo(() => {
    if (!isOpen) return [];
    if (syncItems.length > 0) return syncItems;
    if (asyncItems && asyncItems.length > 0) return asyncItems;
    return [
      {
        descripcion: exp.concept || (isProv ? "Gasto Provisional" : "Gasto general / concepto único"),
        cantidad: 1,
        unidad: "SERV",
        valorUnitario: Number(exp.amount || 0),
        importe: Number(exp.amount || 0)
      }
    ];
  }, [isOpen, syncItems, asyncItems, exp, isProv]);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        className="cursor-pointer font-bold text-slate-700 hover:text-indigo-600 hover:underline decoration-indigo-300 underline-offset-2 transition-colors flex items-center gap-1"
        title="Pasa el cursor para previsualizar partidas"
      >
        <Receipt className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>{displayDocNum}</span>
      </span>

      {/* Pop-up flotante con las partidas */}
      {isOpen && (
        <div 
          className="absolute left-0 top-full mt-2 w-80 sm:w-96 max-w-[90vw] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 p-3.5 text-left animate-in fade-in zoom-in-95 duration-150"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header del pop-up */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 mb-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="p-1 rounded bg-indigo-50 text-indigo-600">
                  <Package className="w-3.5 h-3.5" />
                </span>
                <span className="font-extrabold text-xs text-slate-900 truncate" title={rawDocNum}>
                  {rawDocNum}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5" title={exp.vendorName}>
                {exp.vendorName || "Proveedor no especificado"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[9px] uppercase font-bold text-slate-400 block">Total</span>
              <span className="font-black text-xs text-indigo-700">
                {formatMoney(exp.amount || 0)}
              </span>
            </div>
          </div>

          {/* Lista de Partidas */}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Partidas del Gasto ({items.length}):
            </span>
            {loadingAsync ? (
              <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>Extrayendo partidas del CFDI SAT...</span>
              </div>
            ) : (
              items.map((item, idx) => (
                <div 
                  key={idx} 
                  className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs hover:bg-slate-100/70 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-800 text-[11px] leading-snug line-clamp-2">
                      {item.descripcion}
                    </p>
                    <span className="font-black text-slate-900 shrink-0 text-[11px]">
                      {formatMoney(item.importe)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 pt-1 border-t border-slate-200/50">
                    <span>
                      Cantidad: <strong className="text-slate-700">{item.cantidad} {item.unidad}</strong>
                    </span>
                    {item.cantidad > 1 && (
                      <span>
                        P.U.: <strong className="text-slate-700">{formatMoney(item.valorUnitario)}</strong>
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer del Pop-up */}
          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span>
              {exp.isProvisional ? "Gasto Provisional" : exp.isNonDeductible ? "No Deducible" : "Gasto Formal"}
            </span>
            {exp.date && (
              <span>Fecha: {exp.date.split("T")[0]}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ExpenseTableRowProps {
  exp: any;
  isSelected: boolean;
  effective: {
    locationId: string;
    accountId: string;
    costCenterId: string;
    isNonDeductible: boolean;
    isDirty: boolean;
  };
  isSaving: boolean;
  pendingBalance: number;
  outflowInfo?: { bankIds: Set<string>; bankNames: Set<string> };
  locations: any[];
  accountItems: TableSearchSelectItem[];
  costCenterItems: TableSearchSelectItem[];
  bankAccounts: any[];
  formatMoney: (amount: number) => string;
  companyId?: string | null;
  onToggleSelect: (id: string) => void;
  onFieldChange: (id: string, field: string, val: any) => void;
  onSave: (exp: any) => void;
  onPay: (exp: any) => void;
  onCancel: (id: string, status: string) => void;
}

const ExpenseTableRow = React.memo(function ExpenseTableRow({
  exp,
  isSelected,
  effective,
  isSaving,
  pendingBalance,
  outflowInfo,
  locations,
  accountItems,
  costCenterItems,
  bankAccounts,
  formatMoney,
  companyId,
  onToggleSelect,
  onFieldChange,
  onSave,
  onPay,
  onCancel,
}: ExpenseTableRowProps) {
  const isProv = Boolean(
    exp.isProvisional || 
    exp.isPendingFiscalInvoice || 
    (exp.documentNumber && exp.documentNumber.startsWith("PROV-"))
  );
  const isDirty = effective.isDirty;
  const displayDate = exp.date ? exp.date.split("T")[0] : "-";
  const rawDocNum = exp.documentNumber || "-";
  const displayDocNum = rawDocNum.length > 15 ? `${rawDocNum.substring(0, 15)}...` : rawDocNum;

  // Banks names derivation
  const bankDisplay = React.useMemo(() => {
    const names = new Set<string>();
    if (outflowInfo) {
      outflowInfo.bankIds.forEach(id => {
        const b = bankAccounts.find(acc => acc.id === id);
        if (b?.Name || b?.name) names.add(b.Name || b.name);
      });
      outflowInfo.bankNames.forEach(n => { if (n) names.add(n); });
    }
    if (names.size === 0 && exp.bankAccountId) {
      const directBank = bankAccounts.find(b => b.id === exp.bankAccountId);
      if (directBank?.Name || directBank?.name) names.add(directBank.Name || directBank.name);
    }
    return Array.from(names);
  }, [outflowInfo, exp.bankAccountId, bankAccounts]);

  const isCancelled = exp.status === "cancelado";

  return (
    <tr className={`hover:bg-slate-50 transition-colors ${isCancelled ? 'bg-slate-100/70 opacity-60 text-slate-500' : isSelected ? 'bg-indigo-50/40' : isDirty ? 'bg-amber-50/30' : ''}`}>
      <td className="px-3 py-2.5 text-center">
        {!isCancelled ? (
          <button
            type="button"
            onClick={() => onToggleSelect(exp.id)}
            className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
            title={isSelected ? "Deseleccionar gasto" : "Seleccionar gasto"}
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-indigo-600" />
            ) : (
              <Square className="w-4 h-4 text-slate-300" />
            )}
          </button>
        ) : null}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 text-xs font-medium">
        {displayDate}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-700 text-xs">
        <ExpenseFolioWithPreview 
          exp={exp}
          rawDocNum={rawDocNum}
          displayDocNum={displayDocNum}
          formatMoney={formatMoney}
          companyId={companyId}
        />
      </td>
      <td className="px-3 py-2.5 font-medium text-slate-900 max-w-[180px] truncate text-xs" title={exp.vendorName}>
        {exp.vendorName}
      </td>

      {/* Columna Sucursal */}
      <td className="px-2 py-2.5">
        <select
          value={effective.locationId}
          disabled={isCancelled}
          onChange={(e) => onFieldChange(exp.id, "locationId", e.target.value)}
          className={`h-8 w-full text-xs rounded-md border px-2 py-1 outline-none font-medium transition-colors ${
            isCancelled
              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              : isDirty && effective.locationId !== (exp.locationId || "")
              ? "bg-amber-50 border-amber-300 text-amber-950 font-semibold"
              : "bg-white border-slate-200 text-slate-800 hover:border-slate-300"
          }`}
        >
          <option value="">(Sin asignar)</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>
              {loc.name || loc.Name || loc.id}
            </option>
          ))}
        </select>
      </td>

      {/* Columna Cuenta Contable con buscador */}
      <td className="px-2 py-2.5">
        <TableSearchSelect
          value={effective.accountId}
          disabled={isCancelled}
          onChange={(id) => onFieldChange(exp.id, "accountId", id)}
          items={accountItems}
          placeholder="Seleccionar cuenta..."
          emptyLabel="(Sin cuenta contable)"
          highlightChanged={isDirty && effective.accountId !== (exp.accountId || "")}
          minWidth={280}
        />
      </td>

      {/* Columna Centro de Costos con buscador */}
      <td className="px-2 py-2.5">
        <TableSearchSelect
          value={effective.costCenterId}
          disabled={isCancelled}
          onChange={(id) => onFieldChange(exp.id, "costCenterId", id)}
          items={costCenterItems}
          placeholder="Centro de costos..."
          emptyLabel="(Sin centro de costos)"
          highlightChanged={isDirty && effective.costCenterId !== (exp.costCenterId || "")}
          minWidth={240}
        />
      </td>

      {/* Columna Tipo Fiscal (Deducibilidad) */}
      <td className="px-2 py-2.5">
        <select
          value={effective.isNonDeductible ? "no_deducible" : "deducible"}
          disabled={isCancelled}
          onChange={(e) => onFieldChange(exp.id, "isNonDeductible", e.target.value === "no_deducible")}
          className={`h-8 w-full text-xs rounded-md border px-2 py-1 outline-none font-bold transition-colors ${
            isCancelled
              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
              : effective.isNonDeductible
              ? "bg-slate-100 border-slate-300 text-slate-700"
              : "bg-emerald-50 border-emerald-300 text-emerald-800"
          }`}
        >
          <option value="deducible">Deducible</option>
          <option value="no_deducible">No Deducible</option>
        </select>
      </td>

      {/* Columna Cuenta Bancaria */}
      <td className="px-2 py-2.5 text-xs">
        {bankDisplay.length === 0 ? (
          <span className="text-slate-400 font-mono text-[11px]">-</span>
        ) : (
          <div className="flex flex-col gap-1">
            {bankDisplay.map((name, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full max-w-[130px] truncate" title={name}>
                <Landmark className="w-2.5 h-2.5 shrink-0 text-indigo-600" />
                <span className="truncate">{name}</span>
              </span>
            ))}
          </div>
        )}
      </td>

      {/* Columna Estatus - Cancelado tiene MÁXIMA prioridad */}
      <td className="px-2 py-2.5 text-center">
        {isCancelled ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200">
            Cancelado
          </span>
        ) : effective.isNonDeductible ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-bold border border-slate-300">
            No Deducible
          </span>
        ) : isProv ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300 animate-pulse">
            Provisional
          </span>
        ) : exp.isRecurring ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold border border-purple-200">
            Recurrente
          </span>
        ) : exp.status === "paid" ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
            Pagado
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
            Pendiente
          </span>
        )}
      </td>

      {/* Montos */}
      <td className="px-3 py-2.5 text-right font-bold text-slate-900 text-xs">
        {formatMoney(exp.amount)}
      </td>
      <td className="px-2 py-2.5 text-right text-emerald-600 font-semibold text-xs">
        {formatMoney(exp.paidAmount || 0)}
      </td>
      <td className={`px-2 py-2.5 text-right font-bold text-xs ${pendingBalance > 0.01 && exp.status !== "cancelado" ? "text-amber-600" : "text-slate-400"}`}>
        {formatMoney(pendingBalance)}
      </td>

      {/* Acciones */}
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5 flex-nowrap min-w-max">
          {/* Botón Guardar individual */}
          <Button 
            type="button" 
            size="sm"
            disabled={isSaving || isCancelled}
            onClick={() => onSave(exp)}
            className={`h-8 px-2.5 text-xs font-bold gap-1 transition-all shadow-xs ${
              isDirty
                ? "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                : isProv
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
            }`}
            title="Guardar asignaciones de este gasto"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Guardar</span>
          </Button>

          <Link href={`/gastos/${exp.id}`} target="_blank">
            <Button 
              variant="outline" 
              size="icon"
              className="h-8 w-8 bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-800 shrink-0"
              title="Ver Detalle"
            >
              <Eye className="w-4 h-4 text-indigo-600" />
            </Button>
          </Link>

          {pendingBalance > 0.01 && exp.status !== "cancelado" && (
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => onPay(exp)}
              className="h-8 w-8 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 shrink-0"
              title="Registrar Pago"
            >
              <DollarSign className="w-4 h-4 font-bold" />
            </Button>
          )}

          {exp.status !== "cancelado" && (
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => onCancel(exp.id, exp.status)}
              className="h-8 w-8 bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 hover:text-rose-800 shrink-0"
              title="Cancelar Gasto"
            >
              <X className="w-4 h-4 font-bold" />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
});

export default function GastosManualesPage() {
  const { companyId, user } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bankAccountFilter, setBankAccountFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [outflowsByExpense, setOutflowsByExpense] = useState<Map<string, { bankIds: Set<string>; bankNames: Set<string> }>>(new Map());

  // Catalogs for inline assignment
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);

  // Inline row edits: { [expenseId]: { locationId?, accountId?, costCenterId?, isNonDeductible?, isDirty? } }
  const [rowEdits, setRowEdits] = useState<Record<string, {
    locationId?: string;
    accountId?: string;
    costCenterId?: string;
    isNonDeductible?: boolean;
    isDirty?: boolean;
  }>>({});

  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Batch assignment inputs
  const [batchLocationId, setBatchLocationId] = useState<string>("");
  const [batchAccountId, setBatchAccountId] = useState<string>("");
  const [batchCostCenterId, setBatchCostCenterId] = useState<string>("");
  const [batchNonDeductible, setBatchNonDeductible] = useState<string>("keep");

  // Modals State
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);

  // Provisional Formalization State
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [isFormalizeModalOpen, setIsFormalizeModalOpen] = useState(false);
  const [formalizeTargetExpenses, setFormalizeTargetExpenses] = useState<any[]>([]);

  // Sorting state
  const [sortField, setSortField] = useState<string>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Retroactive items sync state
  const [syncingItems, setSyncingItems] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const handleSyncRetroactiveItems = async () => {
    if (!companyId) return;
    setSyncingItems(true);
    setSyncStatus("Iniciando análisis retroactivo de partidas con facturas SAT...");

    try {
      // 1. Obtener todas las facturas de expenses_inbox con XML
      const inboxSnap = await getDocs(collection(db, "companies", companyId, "expenses_inbox"));
      const satMapById = new Map<string, any>();
      const satMapByFolio = new Map<string, any>();
      const satMapByAmount = new Map<number, any[]>();

      inboxSnap.forEach(d => {
        const data = { id: d.id, ...d.data() } as any;
        if (data.xmlBase64) {
          satMapById.set(d.id, data);
          if (data.uuid) satMapById.set(data.uuid, data);
          
          const cleanFolio = (data.folio || data.invoiceNumber || "").trim().toLowerCase();
          if (cleanFolio) {
            satMapByFolio.set(cleanFolio, data);
          }

          const total = Number(data.total || data.amount || 0);
          if (total > 0) {
            const list = satMapByAmount.get(total) || [];
            list.push(data);
            satMapByAmount.set(total, list);
          }
        }
      });

      // 2. Identificar gastos que no tengan partidas o tengan solo 1 concepto genérico
      let updatedCount = 0;
      let batch = writeBatch(db);
      let batchOperations = 0;

      for (const exp of expenses) {
        // Si ya tiene un arreglo de items detallado con más de 1 partida o con código SAT, saltar
        const hasDetailedItems = Array.isArray(exp.items) && exp.items.length > 1;
        if (hasDetailedItems) continue;

        // Buscar factura candidata
        let satCandidate: any = null;

        // Búsqueda por ID directo
        if (exp.satInvoiceId && satMapById.has(exp.satInvoiceId)) {
          satCandidate = satMapById.get(exp.satInvoiceId);
        } else if (exp.uuid && satMapById.has(exp.uuid)) {
          satCandidate = satMapById.get(exp.uuid);
        }

        // Búsqueda por Folio
        if (!satCandidate && exp.documentNumber) {
          const docClean = exp.documentNumber.replace(/^PROV-/, "").trim().toLowerCase();
          if (docClean && satMapByFolio.has(docClean)) {
            satCandidate = satMapByFolio.get(docClean);
          }
        }

        // Búsqueda por Monto exacto y Proveedor
        if (!satCandidate && exp.amount) {
          const candidates = satMapByAmount.get(Number(exp.amount)) || [];
          if (candidates.length === 1) {
            satCandidate = candidates[0];
          } else if (candidates.length > 1) {
            const expVendor = (exp.vendorName || exp.concept || "").toLowerCase();
            satCandidate = candidates.find(c => {
              const emisor = (c.emisorName || c.vendorName || "").toLowerCase();
              return emisor && expVendor && (emisor.includes(expVendor) || expVendor.includes(emisor));
            });
          }
        }

        if (satCandidate && satCandidate.xmlBase64) {
          const parsed = parseCfdiItems(satCandidate.xmlBase64);
          if (parsed && parsed.length > 0) {
            const normalizedItems = parsed.map(p => ({
              lineKey: p.lineKey,
              productId: p.productId || "custom",
              variantId: p.variantId || p.lineKey,
              productName: p.productName || "Concepto SAT",
              variantTitle: p.variantTitle || "",
              quantity: p.quantity || 1,
              unitCost: p.unitCost || 0,
              amount: p.amount || ((p.quantity || 1) * (p.unitCost || 0)),
              claveProdServ: p.claveProdServ || "",
              claveUnidad: p.claveUnidad || "",
              unidad: p.unidad || "PZA",
              accountId: exp.accountId || "",
              costCenterId: exp.costCenterId || "",
              locationId: exp.locationId || ""
            }));

            const expRef = doc(db, "companies", companyId, "expenses", exp.id);
            batch.update(expRef, {
              items: normalizedItems,
              xmlBase64: satCandidate.xmlBase64,
              satInvoiceId: satCandidate.id || satCandidate.uuid,
              uuid: satCandidate.uuid || exp.uuid || ""
            });

            updatedCount++;
            batchOperations++;

            if (batchOperations >= 350) {
              await batch.commit();
              batch = writeBatch(db);
              batchOperations = 0;
            }
          }
        }
      }

      if (batchOperations > 0) {
        await batch.commit();
      }

      if (updatedCount > 0) {
        setSyncStatus(`¡Ajuste retroactivo completado! Se actualizaron ${updatedCount} gastos con sus partidas desglosadas.`);
      } else {
        setSyncStatus("Todos los gastos ya cuentan con sus partidas o no se encontraron facturas SAT pendientes de asociar.");
      }
      setTimeout(() => setSyncStatus(null), 7000);
    } catch (err: any) {
      console.error("Error en sincronización retroactiva:", err);
      setSyncStatus(`Error: ${err.message || "No se pudo completar la sincronización retroactiva."}`);
      setTimeout(() => setSyncStatus(null), 7000);
    } finally {
      setSyncingItems(false);
    }
  };

  const handleDateFilterChange = (option: string) => {
    setDateFilterOption(option);
    
    const now = new Date();
    
    if (option === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (option === "today") {
      const todayStr = getLocalDateString(now);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (option === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setDateFrom(yesterdayStr);
      setDateTo(yesterdayStr);
    } else if (option === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(getLocalDateString(startOfMonth));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(getLocalDateString(startOfLastMonth));
      setDateTo(getLocalDateString(endOfLastMonth));
    } else if (option === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setDateFrom(getLocalDateString(thirtyDaysAgo));
      setDateTo(getLocalDateString(now));
    } else if (option === "this_year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setDateFrom(getLocalDateString(startOfYear));
      setDateTo(getLocalDateString(now));
    }
  };

  // Realtime listener for manual expenses, bank accounts, and outflows
  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "expenses"),
      orderBy("date", "desc")
    );

    const unsubscribeExpenses = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenses(data);
      setLoading(false);
    }, (error) => {
      console.error("Error loading manual expenses:", error);
      setLoading(false);
    });

    const unsubscribeBanks = onSnapshot(
      query(collection(db, "companies", companyId, "bankAccounts")),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBankAccounts(data);
      }
    );

    const unsubscribeOutflows = onSnapshot(
      query(collection(db, "companies", companyId, "outflows")),
      (snapshot) => {
        const map = new Map<string, { bankIds: Set<string>; bankNames: Set<string> }>();
        snapshot.docs.forEach((doc) => {
          const d = doc.data();
          const docId = d.documentId;
          const bankId = d.bankAccountId;
          const bankName = d.bankAccountName;
          if (docId) {
            if (!map.has(docId)) {
              map.set(docId, { bankIds: new Set(), bankNames: new Set() });
            }
            const entry = map.get(docId)!;
            if (bankId) entry.bankIds.add(bankId);
            if (bankName) entry.bankNames.add(bankName);
          }
        });
        setOutflowsByExpense(map);
      }
    );

    const unsubscribeLocations = onSnapshot(
      query(collection(db, "companies", companyId, "locations")),
      (snapshot) => {
        setLocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubscribeAccounts = onSnapshot(
      query(collection(db, "companies", companyId, "accounts")),
      (snapshot) => {
        setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubscribeCostCenters = onSnapshot(
      query(collection(db, "companies", companyId, "cost_centers")),
      (snapshot) => {
        setCostCenters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => {
      unsubscribeExpenses();
      unsubscribeBanks();
      unsubscribeOutflows();
      unsubscribeLocations();
      unsubscribeAccounts();
      unsubscribeCostCenters();
    };
  }, [companyId]);

  // Items for dropdowns & search selects
  const locationItems: TableSearchSelectItem[] = useMemo(() => {
    return locations.map(l => ({ id: l.id, name: l.name || l.Name || l.id }));
  }, [locations]);

  const costCenterItems: TableSearchSelectItem[] = useMemo(() => {
    return costCenters.map(c => ({
      id: c.id,
      name: `${c.code ? c.code + " - " : ""}${c.name || c.Name || c.id}`,
      code: c.code || "",
      subtitle: c.description || ""
    }));
  }, [costCenters]);

  const accountItems: TableSearchSelectItem[] = useMemo(() => {
    return [...accounts]
      .sort((a, b) => {
        const aIsExp = a.type === "GASTOS" || a.type === "COSTOS" || (a.code && (a.code.startsWith("60") || a.code.startsWith("50")));
        const bIsExp = b.type === "GASTOS" || b.type === "COSTOS" || (b.code && (b.code.startsWith("60") || b.code.startsWith("50")));
        if (aIsExp && !bIsExp) return -1;
        if (!aIsExp && bIsExp) return 1;
        return (a.code || "").localeCompare(b.code || "");
      })
      .map(a => ({
        id: a.id,
        name: `${a.code ? a.code + " - " : ""}${a.name || a.Name || a.id}`,
        code: a.code || "",
        subtitle: a.type || ""
      }));
  }, [accounts]);

  // Helper to get active editable values for a row
  const getEffectiveRow = useCallback((exp: any) => {
    const edit = rowEdits[exp.id] || {};
    return {
      locationId: edit.locationId !== undefined ? edit.locationId : (exp.locationId || ""),
      accountId: edit.accountId !== undefined ? edit.accountId : (exp.accountId || ""),
      costCenterId: edit.costCenterId !== undefined ? edit.costCenterId : (exp.costCenterId || ""),
      isNonDeductible: edit.isNonDeductible !== undefined ? edit.isNonDeductible : Boolean(exp.isNonDeductible),
      isDirty: Boolean(edit.isDirty)
    };
  }, [rowEdits]);

  const handleRowFieldChange = useCallback((expenseId: string, field: string, val: any) => {
    setRowEdits(prev => {
      const existing = prev[expenseId] || {};
      return {
        ...prev,
        [expenseId]: {
          ...existing,
          [field]: val,
          isDirty: true
        }
      };
    });
  }, []);

  const dirtyExpenseIds = useMemo(() => {
    return Object.keys(rowEdits).filter(id => rowEdits[id]?.isDirty);
  }, [rowEdits]);

  // Guardar un gasto individual
  const handleSaveSingleRow = async (exp: any) => {
    if (!companyId) return;
    const effective = getEffectiveRow(exp);

    setSavingRowId(exp.id);
    try {
      const selectedLoc = locations.find(l => l.id === effective.locationId);
      const selectedCC = costCenters.find(c => c.id === effective.costCenterId);
      const selectedAcc = accounts.find(a => a.id === effective.accountId);

      const now = new Date().toISOString();
      const batch = writeBatch(db);
      const expRef = doc(db, "companies", companyId, "expenses", exp.id);

      const updatePayload: any = {
        locationId: effective.locationId || "",
        locationName: selectedLoc?.name || selectedLoc?.Name || exp.locationName || "",
        accountId: effective.accountId || "",
        accountCode: selectedAcc?.code || exp.accountCode || "",
        accountName: selectedAcc?.name || exp.accountName || "",
        costCenterId: effective.costCenterId || null,
        costCenterName: selectedCC?.name || selectedCC?.Name || "",
        isNonDeductible: Boolean(effective.isNonDeductible),
        isProvisional: false,
        isPendingFiscalInvoice: false,
        reviewedBy: user?.email || "Guardado en Tabla",
        reviewedAt: now,
        updatedAt: now
      };

      batch.update(expRef, updatePayload);

      // Actualizar póliza contable asociada si existe
      if (effective.accountId && selectedAcc) {
        try {
          const qJournal = query(
            collection(db, "companies", companyId, "journal_entries"),
            where("documentId", "==", exp.id)
          );
          const snapJournal = await getDocs(qJournal);
          snapJournal.forEach(jDoc => {
            const jData = jDoc.data();
            const entries = Array.isArray(jData.entries) ? [...jData.entries] : [];
            let changed = false;
            entries.forEach(entry => {
              if (entry.debit > 0) {
                entry.accountCode = selectedAcc.code || entry.accountCode;
                entry.accountName = selectedAcc.name || entry.accountName;
                changed = true;
              }
            });
            if (changed) {
              batch.update(jDoc.ref, {
                entries,
                updatedAt: now
              });
            }
          });
        } catch (jErr) {
          console.warn("Could not update journal entry:", jErr);
        }
      }

      await batch.commit();

      setRowEdits(prev => {
        const copy = { ...prev };
        delete copy[exp.id];
        return copy;
      });

      setActionFeedback(`¡Gasto ${exp.documentNumber || exp.id} guardado con éxito!`);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err: any) {
      console.error("Error al guardar gasto:", err);
      alert(`Error al guardar: ${err.message || "Error desconocido"}`);
    } finally {
      setSavingRowId(null);
    }
  };

  // Guardar en lote los seleccionados (aplicando valores comunes si se especificaron)
  const handleSaveBatch = async (applyCommonValues: boolean = false) => {
    if (!companyId || selectedExpenseIds.length === 0) return;
    setSavingBatch(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      const commonLoc = locations.find(l => l.id === batchLocationId);
      const commonCC = costCenters.find(c => c.id === batchCostCenterId);
      const commonAcc = accounts.find(a => a.id === batchAccountId);

      for (const expId of selectedExpenseIds) {
        const exp = expenses.find(e => e.id === expId);
        if (!exp) continue;

        const effective = getEffectiveRow(exp);
        const expRef = doc(db, "companies", companyId, "expenses", expId);

        const finalLocationId = applyCommonValues && batchLocationId ? batchLocationId : effective.locationId;
        const finalLoc = locations.find(l => l.id === finalLocationId);

        const finalAccountId = applyCommonValues && batchAccountId ? batchAccountId : effective.accountId;
        const finalAcc = accounts.find(a => a.id === finalAccountId);

        const finalCostCenterId = applyCommonValues && batchCostCenterId !== "" ? batchCostCenterId : effective.costCenterId;
        const finalCC = costCenters.find(c => c.id === finalCostCenterId);

        let finalNonDeductible = effective.isNonDeductible;
        if (applyCommonValues && batchNonDeductible !== "keep") {
          finalNonDeductible = batchNonDeductible === "no_deducible";
        }

        const updatePayload: any = {
          locationId: finalLocationId || "",
          locationName: finalLoc?.name || finalLoc?.Name || exp.locationName || "",
          accountId: finalAccountId || "",
          accountCode: finalAcc?.code || exp.accountCode || "",
          accountName: finalAcc?.name || exp.accountName || "",
          costCenterId: finalCostCenterId || null,
          costCenterName: finalCC?.name || finalCC?.Name || "",
          isNonDeductible: Boolean(finalNonDeductible),
          isProvisional: false,
          isPendingFiscalInvoice: false,
          reviewedBy: user?.email || "Guardado en Lote",
          reviewedAt: now,
          updatedAt: now
        };

        batch.update(expRef, updatePayload);
      }

      await batch.commit();

      setRowEdits(prev => {
        const copy = { ...prev };
        selectedExpenseIds.forEach(id => delete copy[id]);
        return copy;
      });

      setActionFeedback(`¡${selectedExpenseIds.length} gastos guardados con éxito!`);
      setTimeout(() => setActionFeedback(null), 3500);
      setSelectedExpenseIds([]);
    } catch (err: any) {
      console.error("Error al guardar en lote:", err);
      alert(`Error al guardar en lote: ${err.message || "Error desconocido"}`);
    } finally {
      setSavingBatch(false);
    }
  };

  // Guardar todas las filas que tengan cambios pendientes
  const handleSaveAllDirtyRows = async () => {
    if (!companyId || dirtyExpenseIds.length === 0) return;
    setSavingBatch(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      for (const expId of dirtyExpenseIds) {
        const exp = expenses.find(e => e.id === expId);
        if (!exp) continue;
        const effective = getEffectiveRow(exp);
        const selectedLoc = locations.find(l => l.id === effective.locationId);
        const selectedCC = costCenters.find(c => c.id === effective.costCenterId);
        const selectedAcc = accounts.find(a => a.id === effective.accountId);

        const expRef = doc(db, "companies", companyId, "expenses", expId);
        const updatePayload: any = {
          locationId: effective.locationId || "",
          locationName: selectedLoc?.name || selectedLoc?.Name || exp.locationName || "",
          accountId: effective.accountId || "",
          accountCode: selectedAcc?.code || exp.accountCode || "",
          accountName: selectedAcc?.name || exp.accountName || "",
          costCenterId: effective.costCenterId || null,
          costCenterName: selectedCC?.name || selectedCC?.Name || "",
          isNonDeductible: Boolean(effective.isNonDeductible),
          isProvisional: false,
          isPendingFiscalInvoice: false,
          reviewedBy: user?.email || "Guardado en Lote",
          reviewedAt: now,
          updatedAt: now
        };
        batch.update(expRef, updatePayload);
      }

      await batch.commit();

      setRowEdits({});
      setActionFeedback(`¡${dirtyExpenseIds.length} gastos modificados guardados con éxito!`);
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (err: any) {
      console.error("Error al guardar modificaciones:", err);
      alert(`Error: ${err.message || "Error al guardar"}`);
    } finally {
      setSavingBatch(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "date" || field === "amount" ? "desc" : "asc");
    }
  };

  const cancelExpenseInternal = async (expenseId: string) => {
    if (!companyId) return;
    const now = new Date().toISOString();
    const expenseRef = doc(db, "companies", companyId, "expenses", expenseId);
    const expenseSnap = await getDoc(expenseRef);
    if (!expenseSnap.exists()) return;
    const expenseData = expenseSnap.data();

    // 1. Cancel expense document
    await updateDoc(expenseRef, {
      status: "cancelado",
      cancelledAt: now,
      cancelledBy: user?.email || "Usuario",
      updatedAt: now
    });

    // 2. Desconciliar movimiento(s) bancario(s) vinculados
    const linkedTxId = expenseData?.linkedBankTransactionId;
    const directBankId = expenseData?.bankAccountId || expenseData?.linkedBankAccountId;

    const unreconcileTxPayload: any = {
      reconciled: false,
      reconcileType: null,
      reconciledType: null,
      reconciledDocId: null,
      matchedDocumentId: null,
      matchedAccountId: null,
      accountingAccountId: null,
      reconciledBy: null,
      aiMatchReason: null,
      confidenceScore: null,
      matchedAt: null,
      reconciledAt: null,
      unreconciledAt: now,
      unreconciledBy: user?.email || "Cancelación de Gasto"
    };

    if (linkedTxId) {
      const candidateBankAccounts = directBankId 
        ? bankAccounts.filter(b => b.id === directBankId) 
        : bankAccounts;

      for (const b of candidateBankAccounts) {
        try {
          const txRef = doc(db, "companies", companyId, "bankAccounts", b.id, "transactions", linkedTxId);
          const txSnap = await getDoc(txRef);
          if (txSnap.exists()) {
            await updateDoc(txRef, unreconcileTxPayload);
            break;
          }
        } catch (errTx) {
          console.warn(`Error updating tx ${linkedTxId} in bank ${b.id}:`, errTx);
        }
      }
    }

    // Desconciliar cualquier transacción en bankAccounts que tenga este expenseId como reconciledDocId o matchedDocumentId
    for (const b of bankAccounts) {
      try {
        const qDoc = query(
          collection(db, "companies", companyId, "bankAccounts", b.id, "transactions"),
          where("reconciledDocId", "==", expenseId)
        );
        const snapDoc = await getDocs(qDoc);
        for (const d of snapDoc.docs) {
          await updateDoc(d.ref, unreconcileTxPayload);
        }

        const qMatched = query(
          collection(db, "companies", companyId, "bankAccounts", b.id, "transactions"),
          where("matchedDocumentId", "==", expenseId)
        );
        const snapMatched = await getDocs(qMatched);
        for (const d of snapMatched.docs) {
          await updateDoc(d.ref, unreconcileTxPayload);
        }
      } catch (errB) {
        console.warn(`Error querying transactions in bank ${b.id}:`, errB);
      }
    }

    // 3. Anular egresos (outflows) vinculados
    try {
      const qOutflows = query(
        collection(db, "companies", companyId, "outflows"),
        where("documentId", "==", expenseId)
      );
      const snapOutflows = await getDocs(qOutflows);
      for (const oDoc of snapOutflows.docs) {
        await updateDoc(oDoc.ref, {
          status: "cancelado",
          cancelledAt: now,
          cancelledBy: user?.email || "Usuario",
          updatedAt: now
        });
      }
    } catch (errOut) {
      console.warn("Error cancelling outflows for expense:", errOut);
    }

    // 4. Anular pólizas contables vinculadas
    try {
      const qJournal = query(
        collection(db, "companies", companyId, "journal_entries"),
        where("documentId", "==", expenseId)
      );
      const snapJournal = await getDocs(qJournal);
      for (const jDoc of snapJournal.docs) {
        await updateDoc(jDoc.ref, {
          status: "cancelada",
          cancelledAt: now,
          cancelledBy: user?.email || "Usuario",
          updatedAt: now
        });
      }
    } catch (errJ) {
      console.warn("Error cancelling journal entries for expense:", errJ);
    }

    // 5. Revertir factura SAT si aplicaba
    if (expenseData?.satInvoiceId) {
      const satId = expenseData.satInvoiceId;
      const idToCheck = [satId, satId.toLowerCase(), satId.toUpperCase()];
      for (const testId of idToCheck) {
        try {
          const satRef = doc(db, "companies", companyId, "expenses_inbox", testId);
          const snap = await getDoc(satRef);
          if (snap.exists()) {
            await updateDoc(satRef, {
              status: null, // Reset to Pending
              paidAmount: 0,
              expenseId: null
            });
          }
        } catch (e) {
          console.error(`Error reverting SAT invoice ${testId}:`, e);
        }
      }
    }
  };

  const handleCancelExpense = async (expenseId: string, currentStatus: string) => {
    if (!companyId) return;

    const confirmCancel = window.confirm(
      currentStatus === "paid"
        ? "¿Estás seguro de que deseas cancelar este gasto? Se cancelará el gasto, se anularán sus egresos/pólizas y el movimiento bancario vinculado volverá a quedar pendiente (desconciliado)."
        : "¿Estás seguro de que deseas cancelar este gasto operativo?"
    );

    if (!confirmCancel) return;

    try {
      await cancelExpenseInternal(expenseId);

      setRowEdits(prev => {
        const copy = { ...prev };
        delete copy[expenseId];
        return copy;
      });
      setSelectedExpenseIds(prev => prev.filter(id => id !== expenseId));

      setActionFeedback("Gasto cancelado y movimiento bancario desconciliado exitosamente.");
      setTimeout(() => setActionFeedback(null), 3500);
    } catch (error: any) {
      console.error("Error canceling expense:", error);
      alert(`Hubo un error al cancelar el gasto: ${error.message || "Error desconocido"}`);
    }
  };

  const handleCancelBatch = async () => {
    if (!companyId || selectedExpenseIds.length === 0) return;
    const count = selectedExpenseIds.length;
    const confirmCancel = window.confirm(
      `¿Estás seguro de cancelar ${count} ${count === 1 ? "gasto seleccionado" : "gastos seleccionados"}?\n\nSe cancelarán los gastos, se anularán sus egresos y pólizas contables, y todos los movimientos bancarios vinculados volverán a quedar pendientes (desconciliados) en Bancos.`
    );
    if (!confirmCancel) return;

    setSavingBatch(true);
    try {
      for (const expId of selectedExpenseIds) {
        await cancelExpenseInternal(expId);
      }

      setRowEdits(prev => {
        const copy = { ...prev };
        selectedExpenseIds.forEach(id => delete copy[id]);
        return copy;
      });
      setSelectedExpenseIds([]);

      setActionFeedback(`¡${count} ${count === 1 ? "gasto cancelado" : "gastos cancelados"} y movimientos bancarios desconciliados exitosamente!`);
      setTimeout(() => setActionFeedback(null), 4000);
    } catch (err: any) {
      console.error("Error al cancelar en lote:", err);
      alert(`Error al cancelar en lote: ${err.message || "Error desconocido"}`);
    } finally {
      setSavingBatch(false);
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 ml-1.5 inline shrink-0" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    );
  };

  // Set indexado de tuplas `${parentExpenseId}_${YYYY-MM}` para resolver gastos recurrentes en O(1)
  const recurringChildrenSet = useMemo(() => {
    const set = new Set<string>();
    for (const exp of expenses) {
      if (exp.parentExpenseId && exp.date) {
        set.add(`${exp.parentExpenseId}_${exp.date.substring(0, 7)}`);
      }
    }
    return set;
  }, [expenses]);

  // Helper para calcular saldo pendiente de cualquier gasto en O(1)
  const getPendingBalance = useCallback((exp: any) => {
    if (exp.isRecurring) {
      const parentYearMonth = (exp.date || "").substring(0, 7);
      const key = `${exp.id}_${parentYearMonth}`;
      return recurringChildrenSet.has(key) ? 0 : (exp.amount || 0);
    }
    return Math.max(0, (exp.amount || 0) - (exp.paidAmount || 0));
  }, [recurringChildrenSet]);

  // Filtro memoizado
  const filteredExpenses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return expenses.filter(exp => {
      // 1. Search term (provider, concept or folio)
      if (term) {
        const matchProvider = (exp.vendorName || "").toLowerCase().includes(term);
        const matchConcept = (exp.concept || "").toLowerCase().includes(term);
        const matchFolio = (exp.documentNumber || "").toLowerCase().includes(term);
        if (!matchProvider && !matchConcept && !matchFolio) return false;
      }
      // 2. Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "paid" && exp.status !== "paid") return false;
        if (statusFilter === "pending") {
          if (exp.status !== "pending") return false;
          // Ocultar plantillas padre recurrentes que ya están pagadas
          if (exp.isRecurring && getPendingBalance(exp) < 0.01) return false;
        }
        if (statusFilter === "cancelado" && exp.status !== "cancelado") return false;
        if (statusFilter === "provisionales") {
          const isProv = (exp.isProvisional || exp.isPendingFiscalInvoice || (exp.documentNumber && exp.documentNumber.startsWith("PROV-"))) && exp.status !== "cancelado";
          if (!isProv) return false;
        }
        if (statusFilter === "no_deducibles") {
          if (!exp.isNonDeductible || exp.status === "cancelado") return false;
        }
      }
      // 3. Bank Account filter
      if (bankAccountFilter !== "all") {
        const outflowInfo = outflowsByExpense.get(exp.id);
        const directBankId = exp.bankAccountId || exp.linkedBankAccountId;

        if (bankAccountFilter === "no_account") {
          const hasOutflow = outflowInfo && outflowInfo.bankIds.size > 0;
          if (hasOutflow || directBankId) return false;
        } else {
          const matchesOutflow = outflowInfo && outflowInfo.bankIds.has(bankAccountFilter);
          const matchesDirect = directBankId === bankAccountFilter;
          if (!matchesOutflow && !matchesDirect) return false;
        }
      }
      // 4. Date range filter
      if (dateFrom || dateTo) {
        if (dateFrom && exp.date < dateFrom) return false;
        if (dateTo && exp.date > dateTo) return false;
      }
      return true;
    });
  }, [expenses, searchTerm, statusFilter, bankAccountFilter, outflowsByExpense, dateFrom, dateTo, getPendingBalance]);

  // Ordenamiento memoizado
  const sortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      let aVal = a[sortField] || "";
      let bVal = b[sortField] || "";

      if (sortField === "amount") {
        const aNum = parseFloat(aVal) || 0;
        const bNum = parseFloat(bVal) || 0;
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal, "es")
          : bVal.localeCompare(aVal, "es");
      }

      return 0;
    });
  }, [filteredExpenses, sortField, sortDirection]);

  // Cálculo de páginas y slice paginado
  const totalPages = Math.max(1, Math.ceil(sortedExpenses.length / pageSize));
  const paginatedExpenses = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedExpenses.slice(startIndex, startIndex + pageSize);
  }, [sortedExpenses, currentPage, pageSize]);

  // Reset de página al cambiar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, bankAccountFilter, dateFilterOption, dateFrom, dateTo, pageSize]);

  // Métricas financieras calculadas en un solo pase O(N)
  const { totalGastado, totalPagado, totalPendiente } = useMemo(() => {
    let gastado = 0;
    let pagado = 0;
    let pendiente = 0;

    for (const e of filteredExpenses) {
      if (e.isRecurring) {
        const key = `${e.id}_${(e.date || "").substring(0, 7)}`;
        const hasChildInSameMonth = recurringChildrenSet.has(key);
        if (!hasChildInSameMonth) {
          gastado += (e.amount || 0);
          pagado += (e.paidAmount || 0);
        }
      } else {
        gastado += (e.amount || 0);
        pagado += (e.paidAmount || 0);
      }
      pendiente += getPendingBalance(e);
    }

    return { totalGastado: gastado, totalPagado: pagado, totalPendiente: pendiente };
  }, [filteredExpenses, recurringChildrenSet, getPendingBalance]);

  // Callbacks para ExpenseTableRow
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedExpenseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const handlePayExpense = useCallback((exp: any) => {
    setSelectedExpense(exp);
    setIsPaymentModalOpen(true);
  }, []);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in w-full max-w-[1650px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 text-indigo-950">
            <DollarSign className="w-8 h-8 text-indigo-600" />
            Gastos Operativos
          </h1>
          <p className="text-muted-foreground mt-1">Registra y administra todos los gastos operativos manuales de la empresa.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={syncingItems}
            onClick={handleSyncRetroactiveItems}
            className="gap-2 border-indigo-200 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 hover:text-indigo-800 font-semibold shadow-sm"
            title="Asocia y desglosa automáticamente las partidas de la factura SAT para todos los gastos históricos que aún no las tienen"
          >
            {syncingItems ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Sincronizando partidas...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                <span>Sincronizar Partidas SAT</span>
              </>
            )}
          </Button>

          <Link href="/compras/gastos/nuevo" target="_blank">
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
              <PlusCircle className="w-4 h-4" />
              Registrar Gasto
            </Button>
          </Link>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border border-indigo-500/40 text-white text-xs px-4 py-3 rounded-xl flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 gap-3">
          <div className="flex items-center gap-2.5 font-medium truncate">
            {syncingItems ? (
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            )}
            <span className="truncate">{syncStatus}</span>
          </div>
        </div>
      )}

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Gastado</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(totalGastado)}</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Pagado</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(totalPagado)}</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saldo Pendiente</p>
            <p className="text-xl font-bold text-slate-800">{formatMoney(totalPendiente)}</p>
          </div>
        </div>
      </div>

      {/* Filters Header Panel */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-end justify-between bg-card p-4 rounded-xl border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-end flex-1 w-full">
          {/* Búsqueda */}
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buscar</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Proveedor o concepto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Estatus */}
          <div className="space-y-1 w-full sm:w-44">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estatus</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="paid">Pagados</option>
              <option value="pending">Pendientes</option>
              <option value="provisionales">Provisionales / Sin Factura</option>
              <option value="no_deducibles">Oficial No Deducible</option>
              <option value="cancelado">Cancelados</option>
            </select>
          </div>

          {/* Cuenta Bancaria */}
          <div className="space-y-1 w-full sm:w-48">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cuenta Bancaria</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={bankAccountFilter}
              onChange={(e) => setBankAccountFilter(e.target.value)}
            >
              <option value="all">Todas las cuentas</option>
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.Name || acc.name || "Cuenta Bancaria"}
                </option>
              ))}
              <option value="no_account">Sin cuenta / No pagado</option>
            </select>
          </div>

          {/* Fecha */}
          <div className="space-y-1 w-full sm:w-44">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rango de Fecha</span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={dateFilterOption}
              onChange={(e) => handleDateFilterChange(e.target.value)}
            >
              <option value="all">Cualquier fecha</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="this_month">Este Mes</option>
              <option value="last_month">Mes Anterior</option>
              <option value="last_30_days">Últimos 30 Días</option>
              <option value="this_year">Este Año</option>
              <option value="custom">Rango Personalizado</option>
            </select>
          </div>

          {dateFilterOption === "custom" && (
            <>
              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desde</span>
                <Input
                  type="date"
                  className="h-9 bg-background"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hasta</span>
                <Input
                  type="date"
                  className="h-9 bg-background"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {actionFeedback && (
        <div className="bg-emerald-600 text-white text-xs px-4 py-2.5 rounded-xl flex items-center justify-between shadow-md animate-in fade-in slide-in-from-top-2 gap-2 font-semibold">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-emerald-200 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating reminder for in-table edits */}
      {dirtyExpenseIds.length > 0 && selectedExpenseIds.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between shadow-xs animate-in fade-in gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
            <span className="text-xs font-semibold">
              Tienes {dirtyExpenseIds.length} {dirtyExpenseIds.length === 1 ? "gasto modificado" : "gastos modificados"} en la tabla sin guardar.
            </span>
          </div>
          <Button
            size="sm"
            disabled={savingBatch}
            onClick={handleSaveAllDirtyRows}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-7 px-3.5 gap-1.5 shadow-xs"
          >
            {savingBatch ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            <span>Guardar Todas las Modificaciones ({dirtyExpenseIds.length})</span>
          </Button>
        </div>
      )}

      {/* Batch Action Banner for Expenses */}
      {selectedExpenseIds.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/40 text-white p-4 rounded-xl shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-800/40 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-indigo-600/40 rounded-lg border border-indigo-400/30 text-indigo-200">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">
                  {selectedExpenseIds.length} {selectedExpenseIds.length === 1 ? "gasto seleccionado" : "gastos seleccionados"}
                  <span className="text-indigo-200 font-normal ml-2">
                    (Total: {formatMoney(expenses.filter(e => selectedExpenseIds.includes(e.id)).reduce((s, e) => s + (Number(e.amount) || 0), 0))})
                  </span>
                </p>
                <p className="text-[11px] text-slate-300">
                  Asigna valores comunes para aplicarlos a todos los seleccionados o guárdalos con los valores de cada fila.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedExpenseIds([])}
                className="text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border-white/20 h-8"
              >
                Deseleccionar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={savingBatch}
                onClick={handleCancelBatch}
                className="bg-rose-500/20 hover:bg-rose-600 text-rose-200 hover:text-white border-rose-500/40 text-xs font-bold h-8 px-3 gap-1.5 transition-colors"
                title="Cancelar todos los gastos seleccionados y desconciliar sus movimientos bancarios"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar Seleccionados</span>
              </Button>
              <Button
                size="sm"
                disabled={savingBatch}
                onClick={() => handleSaveBatch(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 px-4 gap-1.5 shadow-sm"
              >
                {savingBatch ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Guardar Seleccionados</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Quick batch selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 text-slate-800">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Sucursal en Lote</span>
              <select
                value={batchLocationId}
                onChange={(e) => setBatchLocationId(e.target.value)}
                className="h-8 w-full text-xs rounded-md border border-slate-600 bg-slate-800 text-white px-2 py-1 outline-none font-medium focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">(Mantener individual)</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name || loc.Name || loc.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Cuenta Contable en Lote</span>
              <TableSearchSelect
                value={batchAccountId}
                onChange={(id) => setBatchAccountId(id)}
                items={accountItems}
                placeholder="(Mantener individual)"
                emptyLabel="(Sin cuenta contable)"
                minWidth={280}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Centro de Costos en Lote</span>
              <TableSearchSelect
                value={batchCostCenterId}
                onChange={(id) => setBatchCostCenterId(id)}
                items={costCenterItems}
                placeholder="(Mantener individual)"
                emptyLabel="(Sin centro de costos)"
                minWidth={250}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-300 block">Tipo Fiscal en Lote</span>
              <select
                value={batchNonDeductible}
                onChange={(e) => setBatchNonDeductible(e.target.value)}
                className="h-8 w-full text-xs rounded-md border border-slate-600 bg-slate-800 text-white px-2 py-1 outline-none font-medium focus:ring-1 focus:ring-indigo-400"
              >
                <option value="keep">(Mantener individual)</option>
                <option value="deducible">Marcar como Deducible</option>
                <option value="no_deducible">Marcar como No Deducible</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Main Expenses Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1680px] text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  {(() => {
                    const selectableExpenses = paginatedExpenses.filter(e => e.status !== "cancelado");
                    const allSelected = selectableExpenses.length > 0 && selectableExpenses.every(e => selectedExpenseIds.includes(e.id));
                    if (selectableExpenses.length === 0) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            setSelectedExpenseIds(prev => prev.filter(id => !selectableExpenses.some(v => v.id === id)));
                          } else {
                            const newIds = Array.from(new Set([...selectedExpenseIds, ...selectableExpenses.map(v => v.id)]));
                            setSelectedExpenseIds(newIds);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                        title={allSelected ? "Deseleccionar visibles en esta página" : "Seleccionar visibles en esta página"}
                      >
                        {allSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </button>
                    );
                  })()}
                </th>
                <th className="px-3 py-3 w-24 whitespace-nowrap cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("date")}>
                  <div className="flex items-center">Fecha {renderSortIcon("date")}</div>
                </th>
                <th className="px-3 py-3 w-28 whitespace-nowrap cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("documentNumber")}>
                  <div className="flex items-center">Folio {renderSortIcon("documentNumber")}</div>
                </th>
                <th className="px-3 py-3 min-w-[140px] max-w-[180px] cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("vendorName")}>
                  <div className="flex items-center">Proveedor {renderSortIcon("vendorName")}</div>
                </th>
                <th className="px-2 py-3 min-w-[140px] whitespace-nowrap">Sucursal</th>
                <th className="px-2 py-3 min-w-[210px] whitespace-nowrap">Cuenta Contable</th>
                <th className="px-2 py-3 min-w-[180px] whitespace-nowrap">Centro de Costos</th>
                <th className="px-2 py-3 min-w-[125px] whitespace-nowrap">Tipo Fiscal</th>
                <th className="px-2 py-3 min-w-[110px] whitespace-nowrap">Cuenta Bancaria</th>
                <th className="px-2 py-3 w-20 text-center whitespace-nowrap">Estatus</th>
                <th className="px-3 py-3 w-24 text-right whitespace-nowrap cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("amount")}>
                  <div className="flex items-center justify-end">Monto {renderSortIcon("amount")}</div>
                </th>
                <th className="px-2 py-3 w-20 text-right whitespace-nowrap">Pagado</th>
                <th className="px-2 py-3 w-20 text-right whitespace-nowrap">Pendiente</th>
                <th className="px-3 py-3 min-w-[140px] text-center whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">
                    No se encontraron gastos operativos registrados.
                  </td>
                </tr>
              ) : (
                paginatedExpenses.map((exp) => (
                  <ExpenseTableRow
                    key={exp.id}
                    exp={exp}
                    isSelected={selectedExpenseIds.includes(exp.id)}
                    effective={getEffectiveRow(exp)}
                    isSaving={savingRowId === exp.id}
                    pendingBalance={getPendingBalance(exp)}
                    outflowInfo={outflowsByExpense.get(exp.id)}
                    locations={locations}
                    accountItems={accountItems}
                    costCenterItems={costCenterItems}
                    bankAccounts={bankAccounts}
                    formatMoney={formatMoney}
                    companyId={companyId}
                    onToggleSelect={handleToggleSelect}
                    onFieldChange={handleRowFieldChange}
                    onSave={handleSaveSingleRow}
                    onPay={handlePayExpense}
                    onCancel={handleCancelExpense}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="bg-white border rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span>Mostrar</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold outline-none focus:border-indigo-500"
          >
            <option value={25}>25 filas</option>
            <option value={50}>50 filas</option>
            <option value={100}>100 filas</option>
            <option value={200}>200 filas</option>
          </select>
          <span className="text-slate-400">|</span>
          <span>
            Mostrando <span className="font-semibold text-slate-900">{sortedExpenses.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> a{" "}
            <span className="font-semibold text-slate-900">{Math.min(currentPage * pageSize, sortedExpenses.length)}</span> de{" "}
            <span className="font-semibold text-slate-900">{sortedExpenses.length}</span> gastos
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(1)}
            className="h-8 w-8 p-0"
            title="Primera página"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="h-8 px-2.5 gap-1"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </Button>

          <span className="px-2 font-medium text-slate-700">
            Página <span className="font-bold text-indigo-600">{currentPage}</span> de <span className="font-bold">{totalPages}</span>
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            className="h-8 px-2.5 gap-1"
            title="Página siguiente"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            className="h-8 w-8 p-0"
            title="Última página"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Pay Pending Expense Modal */}
      {selectedExpense && (
        <ExpensePaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedExpense(null);
          }}
          document={selectedExpense}
          documentType="gasto_manual"
          companyId={companyId || ""}
        />
      )}

      {/* Formalize Provisional Expenses Modal (Single & Batch) */}
      <FormalizeProvisionalModal
        isOpen={isFormalizeModalOpen}
        onClose={() => {
          setIsFormalizeModalOpen(false);
          setFormalizeTargetExpenses([]);
        }}
        expenses={formalizeTargetExpenses}
        companyId={companyId || ""}
        userEmail={user?.email || undefined}
        onSuccess={() => {
          setSelectedExpenseIds([]);
        }}
      />
    </div>
  );
}
