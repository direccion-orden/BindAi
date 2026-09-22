"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, query, onSnapshot, orderBy, doc, updateDoc, getDoc, writeBatch, getDocs, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getLocalDateString } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, DollarSign, PlusCircle, Search, Calendar, FileText, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown, Wallet, Clock, Eye, X, ShieldCheck, CheckSquare, Square, Receipt, Layers, Package, RefreshCw, Sparkles } from "lucide-react";
import { ExpensePaymentModal } from "@/components/payments/ExpensePaymentModal";
import { FormalizeProvisionalModal } from "./components/FormalizeProvisionalModal";
import { parseCfdiItems } from "@/lib/cfdi/parseInvoiceItems";
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
  }, [exp, isProv, hasPotentialSatLink]);

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
  }, [syncItems, asyncItems, exp, isProv]);

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

export default function GastosManualesPage() {
  const { companyId, user } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  // Realtime listener for manual expenses
  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "expenses"),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenses(data);
      setLoading(false);
    }, (error) => {
      console.error("Error loading manual expenses:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "date" || field === "amount" ? "desc" : "asc");
    }
  };

  const handleCancelExpense = async (expenseId: string, currentStatus: string) => {
    if (!companyId) return;

    const confirmCancel = window.confirm(
      currentStatus === "paid"
        ? "¿Estás seguro de que deseas cancelar este gasto? Ya tiene egresos registrados."
        : "¿Estás seguro de que deseas cancelar este gasto operativo?"
    );

    if (!confirmCancel) return;

    try {
      const expenseRef = doc(db, "companies", companyId, "expenses", expenseId);
      const expenseSnap = await getDoc(expenseRef);
      const expenseData = expenseSnap.data();

      await updateDoc(expenseRef, {
        status: "cancelado"
      });

      // If linked to a SAT Invoice, revert it to pending
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

      alert("Gasto cancelado exitosamente.");
    } catch (error) {
      console.error("Error canceling expense:", error);
      alert("Hubo un error al cancelar el gasto.");
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

  // Helper to calculate pending balance of any expense, factoring in recurring parent templates
  const getPendingBalance = (exp: any) => {
    if (exp.isRecurring) {
      const parentYearMonth = (exp.date || "").substring(0, 7);
      const hasChildInSameMonth = expenses.some(child => 
        child.parentExpenseId === exp.id && 
        child.date && 
        child.date.substring(0, 7) === parentYearMonth
      );
      return hasChildInSameMonth ? 0 : exp.amount;
    }
    return Math.max(0, exp.amount - (exp.paidAmount || 0));
  };

  // Filter logic
  const filteredExpenses = expenses.filter(exp => {
    // 1. Search term (provider, concept or folio)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
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
        // Hide recurring parent templates from the pending filter if they've already been paid for their month
        if (exp.isRecurring && getPendingBalance(exp) < 0.01) return false;
      }
      if (statusFilter === "cancelado" && exp.status !== "cancelado") return false;
      if (statusFilter === "provisionales") {
        const isProv = exp.isProvisional || exp.isPendingFiscalInvoice || (exp.documentNumber && exp.documentNumber.startsWith("PROV-"));
        if (!isProv) return false;
      }
      if (statusFilter === "no_deducibles") {
        if (!exp.isNonDeductible) return false;
      }
    }
    // 3. Date range filter
    if (dateFrom || dateTo) {
      if (dateFrom && exp.date < dateFrom) return false;
      if (dateTo && exp.date > dateTo) return false;
    }
    return true;
  });

  // Sort logic
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
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

  // Financial Metrics with duplicate child/parent handling
  const totalGastado = filteredExpenses.reduce((sum, e) => {
    if (e.isRecurring) {
      const parentYearMonth = (e.date || "").substring(0, 7);
      const hasChildInSameMonth = expenses.some(child => 
        child.parentExpenseId === e.id && 
        child.date && 
        child.date.substring(0, 7) === parentYearMonth
      );
      return sum + (hasChildInSameMonth ? 0 : (e.amount || 0));
    }
    return sum + (e.amount || 0);
  }, 0);

  const totalPagado = filteredExpenses.reduce((sum, e) => {
    if (e.isRecurring) {
      const parentYearMonth = (e.date || "").substring(0, 7);
      const hasChildInSameMonth = expenses.some(child => 
        child.parentExpenseId === e.id && 
        child.date && 
        child.date.substring(0, 7) === parentYearMonth
      );
      return sum + (hasChildInSameMonth ? 0 : (e.paidAmount || 0));
    }
    return sum + (e.paidAmount || 0);
  }, 0);

  const totalPendiente = filteredExpenses.reduce((sum, e) => sum + getPendingBalance(e), 0);

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
    <div className="space-y-6 animate-in fade-in max-w-7xl mx-auto">
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

      {/* Batch Action Banner for Expenses */}
      {selectedExpenseIds.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/40 text-white px-5 py-3 rounded-xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/30 rounded-lg border border-indigo-400/40 text-indigo-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold">
                {selectedExpenseIds.length} {selectedExpenseIds.length === 1 ? "gasto seleccionado" : "gastos seleccionados"} para clasificar/formalizar
              </p>
              <p className="text-xs text-slate-300">
                Suma total: {formatMoney(
                  expenses
                    .filter(e => selectedExpenseIds.includes(e.id))
                    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
                )}
                {(() => {
                  const selExpenses = expenses.filter(e => selectedExpenseIds.includes(e.id));
                  const provCount = selExpenses.filter(e => e.isProvisional || e.isPendingFiscalInvoice || (e.documentNumber && e.documentNumber.startsWith("PROV-"))).length;
                  return provCount > 0 ? ` • ${provCount} provisional(es)` : "";
                })()}
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
              size="sm"
              onClick={() => {
                const targetList = expenses.filter(e => selectedExpenseIds.includes(e.id));
                setFormalizeTargetExpenses(targetList);
                setIsFormalizeModalOpen(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-8 px-4 gap-2 shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              Formalizar / Clasificar en Lote
            </Button>
          </div>
        </div>
      )}

      {/* Main Expenses Table */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  {(() => {
                    const selectableExpenses = sortedExpenses.filter(e => e.status !== "cancelado");
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
                        title={allSelected ? "Deseleccionar todos los visibles" : "Seleccionar todos los visibles"}
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
                <th className="px-3 py-3 w-28 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("date")}>
                  <div className="flex items-center">Fecha {renderSortIcon("date")}</div>
                </th>
                <th className="px-3 py-3 w-32 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("documentNumber")}>
                  <div className="flex items-center">Folio {renderSortIcon("documentNumber")}</div>
                </th>
                <th className="px-3 py-3 min-w-[140px] max-w-[200px] cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("vendorName")}>
                  <div className="flex items-center">Proveedor {renderSortIcon("vendorName")}</div>
                </th>
                <th className="px-3 py-3 w-28">Sucursal</th>
                <th className="px-3 py-3 w-24 text-center">Estatus</th>
                <th className="px-3 py-3 w-28 text-right cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors" onClick={() => handleSort("amount")}>
                  <div className="flex items-center justify-end">Monto {renderSortIcon("amount")}</div>
                </th>
                <th className="px-3 py-3 w-24 text-right">Pagado</th>
                <th className="px-3 py-3 w-24 text-right">Pendiente</th>
                <th className="px-3 py-3 w-40 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No se encontraron gastos operativos registrados.
                  </td>
                </tr>
              ) : (
                sortedExpenses.map((exp) => {
                  const isProv = exp.isProvisional || exp.isPendingFiscalInvoice || (exp.documentNumber && exp.documentNumber.startsWith("PROV-"));
                  const isSelected = selectedExpenseIds.includes(exp.id);

                  // Extract date only (YYYY-MM-DD)
                  const displayDate = exp.date ? exp.date.split("T")[0] : "-";
                  const rawDocNum = exp.documentNumber || "-";
                  const displayDocNum = rawDocNum.length > 15 ? `${rawDocNum.substring(0, 15)}...` : rawDocNum;

                  return (
                     <tr key={exp.id} className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/40' : ''}`}>
                       <td className="px-3 py-3 text-center">
                         {exp.status !== "cancelado" ? (
                           <button
                             type="button"
                             onClick={() => {
                               if (isSelected) {
                                 setSelectedExpenseIds(prev => prev.filter(id => id !== exp.id));
                               } else {
                                 setSelectedExpenseIds(prev => [...prev, exp.id]);
                               }
                             }}
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
                       <td className="px-3 py-3 whitespace-nowrap text-slate-600 text-xs font-medium">
                         {displayDate}
                       </td>
                        <td className="px-3 py-3 whitespace-nowrap font-medium text-slate-700 text-xs">
                          <ExpenseFolioWithPreview 
                            exp={exp}
                            rawDocNum={rawDocNum}
                            displayDocNum={displayDocNum}
                            formatMoney={formatMoney}
                            companyId={companyId}
                          />
                        </td>
                       <td className="px-3 py-3 font-medium text-slate-900 max-w-[200px] truncate text-xs" title={exp.vendorName}>
                         {exp.vendorName}
                       </td>
                       <td className="px-3 py-3 text-slate-500 font-medium text-xs truncate max-w-[120px]" title={exp.locationName}>
                         {exp.locationName || "-"}
                       </td>
                       <td className="px-3 py-3 text-center">
                         {exp.isNonDeductible ? (
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
                         ) : exp.status === "cancelado" ? (
                           <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200">
                             Cancelado
                           </span>
                         ) : (
                           <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                             Pendiente
                           </span>
                         )}
                       </td>
                       <td className="px-3 py-3 text-right font-bold text-slate-900 text-xs">
                         {formatMoney(exp.amount)}
                       </td>
                       <td className="px-3 py-3 text-right text-emerald-600 font-semibold text-xs">
                         {formatMoney(exp.paidAmount || 0)}
                       </td>
                       <td className={`px-3 py-3 text-right font-bold text-xs ${getPendingBalance(exp) > 0.01 && exp.status !== "cancelado" ? "text-amber-600" : "text-slate-400"}`}>
                         {formatMoney(getPendingBalance(exp))}
                       </td>
                       <td className="px-3 py-3 text-center">
                         <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                           {isProv && (
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={() => {
                                 setFormalizeTargetExpenses([exp]);
                                 setIsFormalizeModalOpen(true);
                               }}
                               className="h-8 px-2 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 text-[11px] font-bold gap-1 shrink-0"
                               title="Formalizar gasto (vincular CFDI fiscal o declarar no deducible)"
                             >
                               <ShieldCheck className="w-3.5 h-3.5" />
                               <span>Formalizar</span>
                             </Button>
                           )}
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
                           {getPendingBalance(exp) > 0.01 && exp.status !== "cancelado" && (
                             <Button 
                               variant="outline" 
                               size="icon" 
                               onClick={() => {
                                   setSelectedExpense(exp);
                                   setIsPaymentModalOpen(true);
                               }}
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
                               onClick={() => handleCancelExpense(exp.id, exp.status)}
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
                })
              )}
            </tbody>
          </table>
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
