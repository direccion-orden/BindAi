"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, query, onSnapshot, doc, writeBatch, getDocs, where, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { 
  Loader2, X, CheckCircle2, ShieldCheck, Building2, Layers, BookOpen, 
  AlertCircle, FileCheck, Receipt, Search, UploadCloud, Sparkles, Check
} from "lucide-react";

interface FormalizeProvisionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: any[]; // List of 1 or more expenses to formalize
  companyId: string;
  userEmail?: string;
  onSuccess: () => void;
}

// Helper para parsear CFDI XML en navegador
const parseXmlInvoice = (xmlText: string): any => {
  try {
    const cleanXml = xmlText.trim().replace(/^\uFEFF/, "");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(cleanXml, "text/xml");
    
    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) return null;

    // 1. UUID
    let uuid = "";
    const timbreNode = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] 
                   || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
    if (timbreNode) {
      uuid = timbreNode.getAttribute("UUID") || "";
    } else {
      const uuidMatch = cleanXml.match(/UUID="([^"]{36})"/i);
      if (uuidMatch) uuid = uuidMatch[1];
    }

    if (!uuid || uuid.length !== 36) return null;

    // 2. Comprobante (Total, Fecha, Folio)
    const comprobanteNode = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0]
                        || xmlDoc.getElementsByTagName("Comprobante")[0];
    let total = 0;
    let subtotal = 0;
    let date = "";
    let folio = "";
    let serie = "";
    if (comprobanteNode) {
      total = parseFloat(comprobanteNode.getAttribute("Total") || "0") || 0;
      subtotal = parseFloat(comprobanteNode.getAttribute("SubTotal") || "0") || 0;
      date = comprobanteNode.getAttribute("Fecha") || "";
      folio = comprobanteNode.getAttribute("Folio") || "";
      serie = comprobanteNode.getAttribute("Serie") || "";
    } else {
      const totalMatch = cleanXml.match(/\bTotal="([^"]+)"/i);
      const subtotalMatch = cleanXml.match(/\bSubTotal="([^"]+)"/i);
      const fechaMatch = cleanXml.match(/\bFecha="([^"]+)"/i);
      const folioMatch = cleanXml.match(/\bFolio="([^"]+)"/i);
      const serieMatch = cleanXml.match(/\bSerie="([^"]+)"/i);
      if (totalMatch) total = parseFloat(totalMatch[1]) || 0;
      if (subtotalMatch) subtotal = parseFloat(subtotalMatch[1]) || 0;
      if (fechaMatch) date = fechaMatch[1];
      if (folioMatch) folio = folioMatch[1];
      if (serieMatch) serie = serieMatch[1];
    }
    const combinedFolio = (serie ? `${serie}-${folio}` : folio) || "";

    // 3. Emisor (Rfc, Nombre)
    const emisorNode = xmlDoc.getElementsByTagName("cfdi:Emisor")[0]
                   || xmlDoc.getElementsByTagName("Emisor")[0];
    let emisorRfc = "Desconocido";
    let emisorName = "Desconocido";
    if (emisorNode) {
      emisorRfc = emisorNode.getAttribute("Rfc") || "Desconocido";
      emisorName = emisorNode.getAttribute("Nombre") || "Desconocido";
    }

    const xmlBase64 = btoa(unescape(encodeURIComponent(cleanXml)));

    return {
      id: uuid,
      uuid,
      total,
      subtotal: subtotal || (total / 1.16),
      tax: total - (subtotal || (total / 1.16)),
      date: date ? date.split("T")[0] : new Date().toISOString().split("T")[0],
      emisorRfc,
      emisorName,
      vendorName: emisorName,
      vendorRfc: emisorRfc,
      folio: combinedFolio,
      invoiceNumber: combinedFolio,
      xmlBase64,
      status: "pending_review",
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    console.error("Error parsing XML:", err);
    return null;
  }
};

export function FormalizeProvisionalModal({
  isOpen,
  onClose,
  expenses,
  companyId,
  userEmail,
  onSuccess
}: FormalizeProvisionalModalProps) {
  const isSingle = expenses.length === 1;
  const singleExpense = isSingle ? expenses[0] : null;

  // Tabs
  const [activeTab, setActiveTab] = useState<"fiscal" | "nondeductible">(isSingle ? "fiscal" : "nondeductible");

  // Catalogs
  const [locations, setLocations] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  // Fiscal Invoices Catalog from expenses_inbox
  const [inboxInvoices, setInboxInvoices] = useState<any[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [selectedInboxId, setSelectedInboxId] = useState<string>("");
  const [inboxSearch, setInboxSearch] = useState("");
  const [uploadingXml, setUploadingXml] = useState(false);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [locationId, setLocationId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [concept, setConcept] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState("");

  // Load catalogs
  useEffect(() => {
    if (!companyId || !isOpen) return;
    setLoadingCatalogs(true);

    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCC = onSnapshot(query(collection(db, "companies", companyId, "cost_centers")), (snap) => {
      setCostCenters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(all);
      setLoadingCatalogs(false);
    });

    return () => {
      unsubLoc();
      unsubCC();
      unsubAcc();
    };
  }, [companyId, isOpen]);

  // Load candidate invoices from expenses_inbox
  useEffect(() => {
    if (!companyId || !isOpen || !isSingle) return;
    setLoadingInbox(true);

    const unsubInbox = onSnapshot(collection(db, "companies", companyId, "expenses_inbox"), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(inv => inv.status !== "paid" && !inv.reconciled);

      setInboxInvoices(list);
      setLoadingInbox(false);

      // Auto-preselect exact match if available
      if (singleExpense && singleExpense.amount) {
        const exactMatch = list.find(inv => {
          const invTotal = Number(inv.total || inv.amount || 0);
          return Math.abs(invTotal - Number(singleExpense.amount)) < 0.05;
        });
        if (exactMatch) {
          setSelectedInboxId(prev => prev || exactMatch.id || exactMatch.uuid);
        }
      }
    }, (err) => {
      console.warn("Could not load expenses_inbox:", err);
      setLoadingInbox(false);
    });

    return () => unsubInbox();
  }, [companyId, isOpen, isSingle, singleExpense]);

  // Pre-fill fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage("");
      setUploadSuccessMessage("");
      setActiveTab(isSingle ? "fiscal" : "nondeductible");
      setSelectedInboxId("");
      setInboxSearch("");

      if (isSingle && singleExpense) {
        setLocationId(singleExpense.locationId || "");
        setCostCenterId(singleExpense.costCenterId || "");
        
        // Pre-fill accountId from expense or find matching account by accountCode
        const matchedAcc = accounts.find(a => 
          a.id === singleExpense.accountId || 
          (singleExpense.accountCode && a.code === singleExpense.accountCode)
        ) || accounts.find(a => a.code === "601.01") || accounts.find(a => a.code?.startsWith("601"));

        setAccountId(matchedAcc ? matchedAcc.id : (singleExpense.accountId || ""));
        setVendorName(singleExpense.vendorName || "");
        setConcept(singleExpense.concept || "");
        setReviewNotes(singleExpense.reviewNotes || "");
      } else {
        setLocationId("");
        setCostCenterId("");
        setAccountId("");
        setVendorName("");
        setConcept("");
        setReviewNotes("");
      }
    }
  }, [isOpen, isSingle, singleExpense, accounts]);

  // Selectable items
  const locationItems = useMemo(() => {
    return locations.map(l => ({ id: l.id, name: l.name || l.Name || l.id }));
  }, [locations]);

  const costCenterItems = useMemo(() => {
    return costCenters.map(c => ({ 
      id: c.id, 
      name: `${c.code ? c.code + " - " : ""}${c.name || c.Name || c.id}` 
    }));
  }, [costCenters]);

  const expenseAccountItems = useMemo(() => {
    return accounts
      .filter((a: any) => a.type === "GASTOS" || a.type === "COSTOS" || (a.code && a.code.startsWith("601")))
      .map(a => ({
        id: a.id,
        name: `${a.code ? a.code + " - " : ""}${a.name || a.Name || a.id}`,
        subtitle: a.type || ""
      }));
  }, [accounts]);

  const totalAmount = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses]);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
  };

  // Filter and sort candidate invoices
  const candidateInvoices = useMemo(() => {
    if (!isSingle || !singleExpense) return [];
    const expAmount = Number(singleExpense.amount || 0);
    const expVendor = (singleExpense.vendorName || "").toLowerCase();
    const q = inboxSearch.toLowerCase().trim();

    return [...inboxInvoices]
      .filter(inv => {
        if (!q) return true;
        const folio = (inv.invoiceNumber || inv.folio || "").toLowerCase();
        const emisor = (inv.emisorName || inv.vendorName || "").toLowerCase();
        const rfc = (inv.emisorRfc || inv.vendorRfc || "").toLowerCase();
        const uuid = (inv.uuid || inv.id || "").toLowerCase();
        return folio.includes(q) || emisor.includes(q) || rfc.includes(q) || uuid.includes(q);
      })
      .sort((a, b) => {
        const aTotal = Number(a.total || a.amount || 0);
        const bTotal = Number(b.total || b.amount || 0);
        const aExact = Math.abs(aTotal - expAmount) < 0.05;
        const bExact = Math.abs(bTotal - expAmount) < 0.05;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aVendor = (a.emisorName || a.vendorName || "").toLowerCase().includes(expVendor);
        const bVendor = (b.emisorName || b.vendorName || "").toLowerCase().includes(expVendor);
        if (aVendor && !bVendor) return -1;
        if (!aVendor && bVendor) return 1;

        return (b.date || "").localeCompare(a.date || "");
      });
  }, [inboxInvoices, singleExpense, isSingle, inboxSearch]);

  const selectedInvoice = useMemo(() => {
    return inboxInvoices.find(inv => (inv.id || inv.uuid) === selectedInboxId) || null;
  }, [inboxInvoices, selectedInboxId]);

  // Manejador de subida directa de XML
  const handleXmlFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    setUploadingXml(true);
    setErrorMessage("");
    setUploadSuccessMessage("");

    try {
      const text = await file.text();
      const parsed = parseXmlInvoice(text);
      if (!parsed || !parsed.uuid) {
        throw new Error("El archivo no es un CFDI XML válido del SAT o carece de Timbre Fiscal.");
      }

      // Guardar en Firestore expenses_inbox
      const satDocRef = doc(db, "companies", companyId, "expenses_inbox", parsed.uuid);
      await setDoc(satDocRef, parsed, { merge: true });

      // Actualizar estado local
      setInboxInvoices(prev => [parsed, ...prev.filter(p => (p.uuid || p.id) !== parsed.uuid)]);
      setSelectedInboxId(parsed.uuid);
      setUploadSuccessMessage(`¡Factura ${parsed.folio || parsed.uuid.substring(0, 8)} (${parsed.emisorName}) cargada y seleccionada!`);
    } catch (err: any) {
      console.error("Error al procesar XML:", err);
      setErrorMessage(err.message || "Error al leer el archivo XML.");
    } finally {
      setUploadingXml(false);
      if (xmlInputRef.current) xmlInputRef.current.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    // Validaciones según modo
    if (activeTab === "nondeductible") {
      if (!locationId) {
        setErrorMessage("Por favor selecciona una Sucursal.");
        return;
      }
      if (!accountId) {
        setErrorMessage("Por favor selecciona la Cuenta Contable de gasto.");
        return;
      }
    } else {
      if (!selectedInvoice) {
        setErrorMessage("Por favor selecciona o sube una Factura Fiscal (CFDI) para vincular.");
        return;
      }
      if (!accountId) {
        setErrorMessage("Por favor selecciona la Cuenta Contable de gasto.");
        return;
      }
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const selectedLoc = locations.find(l => l.id === locationId);
      const selectedCC = costCenters.find(c => c.id === costCenterId);
      const selectedAcc = accounts.find(a => a.id === accountId);

      const batch = writeBatch(db);
      const now = new Date().toISOString();

      if (activeTab === "fiscal" && isSingle && singleExpense && selectedInvoice) {
        // ─────────────────────────────────────────────────────────────
        // FORMALIZACIÓN VINCULANDO FACTURA FISCAL (CFDI / DEDUCIBLE)
        // ─────────────────────────────────────────────────────────────
        const expRef = doc(db, "companies", companyId, "expenses", singleExpense.id);
        const satId = selectedInvoice.id || selectedInvoice.uuid;
        const satDocNumber = selectedInvoice.folio || selectedInvoice.invoiceNumber || selectedInvoice.uuid.substring(0, 8);
        const satTotal = Number(selectedInvoice.total || singleExpense.amount);
        const satVat = selectedInvoice.tax !== undefined ? Number(selectedInvoice.tax) : (satTotal - (satTotal / 1.16));
        const satSubtotal = selectedInvoice.subtotal !== undefined ? Number(selectedInvoice.subtotal) : (satTotal - satVat);

        const updatePayload: any = {
          isProvisional: false,
          isPendingFiscalInvoice: false,
          isNonDeductible: false,
          formalizedWithSat: true,
          status: "paid",
          satInvoiceId: satId,
          uuid: selectedInvoice.uuid || "",
          documentNumber: satDocNumber,
          vendorName: selectedInvoice.emisorName || selectedInvoice.vendorName || singleExpense.vendorName,
          vendorRfc: selectedInvoice.emisorRfc || selectedInvoice.vendorRfc || singleExpense.vendorRfc || "",
          concept: singleExpense.concept || selectedInvoice.concept || `Gasto amparado por CFDI ${satDocNumber}`,
          subtotal: satSubtotal,
          tax: satVat,
          vatRate: 0.16,
          locationId: locationId || singleExpense.locationId || "",
          locationName: selectedLoc?.name || selectedLoc?.Name || singleExpense.locationName || "",
          costCenterId: costCenterId || singleExpense.costCenterId || "",
          costCenterName: selectedCC?.name || selectedCC?.Name || singleExpense.costCenterName || "",
          accountId: accountId || singleExpense.accountId || "",
          accountCode: selectedAcc?.code || singleExpense.accountCode || "601.01",
          accountName: selectedAcc?.name || singleExpense.accountName || "Gastos Generales",
          reviewedBy: userEmail || "Formalización Fiscal",
          reviewedAt: now,
          reviewNotes: reviewNotes || `Formalizado y vinculado a CFDI ${satDocNumber}`
        };

        batch.update(expRef, updatePayload);

        // Actualizar factura en expenses_inbox como pagada y enlazada
        const satRef = doc(db, "companies", companyId, "expenses_inbox", satId);
        batch.update(satRef, {
          status: "paid",
          reconciled: true,
          reconciledAt: now,
          linkedExpenseId: singleExpense.id,
          paidAmount: satTotal
        });

        // Actualizar la Póliza Contable para desglosar IVA Acreditable Pagado (118.01)
        try {
          const qJournal = query(
            collection(db, "companies", companyId, "journal_entries"),
            where("documentId", "==", singleExpense.id)
          );
          const snapJournal = await getDocs(qJournal);
          snapJournal.forEach(jDoc => {
            const jData = jDoc.data();
            const entries = Array.isArray(jData.entries) ? [...jData.entries] : [];
            
            // Buscar la entrada de banco/tarjeta crédito
            const creditEntry = entries.find(e => e.credit > 0) || {
              accountCode: "102.01",
              accountName: "Banco",
              debit: 0,
              credit: satTotal
            };

            const targetExpenseCode = selectedAcc?.code || singleExpense.accountCode || "601.01";
            const targetExpenseName = selectedAcc?.name || singleExpense.accountName || "Gastos Generales";

            // Reconstruir partidas con desglose formal de IVA
            const updatedEntries = [
              {
                accountCode: targetExpenseCode,
                accountName: targetExpenseName,
                debit: satSubtotal,
                credit: 0
              },
              {
                accountCode: "118.01",
                accountName: "IVA Acreditable Pagado",
                debit: satVat,
                credit: 0
              },
              {
                accountCode: creditEntry.accountCode,
                accountName: creditEntry.accountName,
                debit: 0,
                credit: satTotal
              }
            ];

            batch.update(jDoc.ref, {
              entries: updatedEntries,
              updatedAt: now,
              reference: satDocNumber,
              concept: `Formalización Fiscal CFDI: ${selectedInvoice.emisorName || singleExpense.vendorName} - ${singleExpense.concept || ''}`
            });
          });
        } catch (jErr) {
          console.warn("No se pudo actualizar la póliza del gasto formalizado:", jErr);
        }

      } else {
        // ─────────────────────────────────────────────────────────────
        // FORMALIZACIÓN COMO GASTO NO DEDUCIBLE (FLUJO ANTERIOR)
        // ─────────────────────────────────────────────────────────────
        for (const exp of expenses) {
          const expRef = doc(db, "companies", companyId, "expenses", exp.id);
          
          const updatePayload: any = {
            isProvisional: false,
            isPendingFiscalInvoice: false,
            isNonDeductible: true,
            status: exp.status || "paid",
            locationId: locationId,
            locationName: selectedLoc?.name || selectedLoc?.Name || "",
            costCenterId: costCenterId || "",
            costCenterName: selectedCC?.name || selectedCC?.Name || "",
            accountId: accountId,
            accountCode: selectedAcc?.code || "",
            accountName: selectedAcc?.name || "",
            reviewedBy: userEmail || "Revisión Manual",
            reviewedAt: now,
            reviewNotes: reviewNotes || "Formalizado como gasto no deducible oficial"
          };

          if (isSingle) {
            if (vendorName.trim()) updatePayload.vendorName = vendorName.trim();
            if (concept.trim()) updatePayload.concept = concept.trim();
          }

          batch.update(expRef, updatePayload);

          // Update corresponding Journal Entry if exists
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
                if (entry.debit > 0 && entry.accountCode?.startsWith("601")) {
                  entry.accountCode = selectedAcc?.code || entry.accountCode;
                  entry.accountName = selectedAcc?.name || entry.accountName;
                  changed = true;
                }
              });

              if (changed) {
                batch.update(jDoc.ref, { 
                  entries,
                  updatedAt: now,
                  concept: `Gasto Oficial No Deducible: ${isSingle && vendorName ? vendorName : (exp.vendorName || exp.concept || '')}`
                });
              }
            });
          } catch (jErr) {
            console.warn("Could not update journal entry for expense:", exp.id, jErr);
          }
        }
      }

      await batch.commit();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error al formalizar gasto(s):", err);
      setErrorMessage(`Error: ${err.message || "No se pudo guardar la formalización."}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between border-b border-indigo-500/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-400/40 text-indigo-300">
              {activeTab === "fiscal" ? <FileCheck className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                {isSingle ? "Formalizar Gasto Provisional" : `Formalización Masiva de Gastos (${expenses.length})`}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isSingle 
                  ? `Vincula una factura fiscal CFDI o clasifícalo como no deducible para oficializar ${singleExpense?.documentNumber || 'el gasto'}.`
                  : `Asigna sucursal, centro de costos y cuenta a ${expenses.length} gastos provisionales seleccionados.`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher (Visible when single expense) */}
        {isSingle && (
          <div className="bg-slate-100 p-1.5 border-b flex gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab("fiscal");
                setErrorMessage("");
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === "fiscal" 
                  ? "bg-white text-indigo-700 shadow-sm border border-slate-200" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <Receipt className="w-4 h-4 text-emerald-600" />
              <span>Vincular Factura Fiscal (CFDI / Deducible)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("nondeductible");
                setErrorMessage("");
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === "nondeductible" 
                  ? "bg-white text-indigo-700 shadow-sm border border-slate-200" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              <span>Declarar como No Deducible</span>
            </button>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Summary Box */}
          <div className="bg-slate-50 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {isSingle ? "Gasto Provisional a Formalizar" : "Resumen del Lote"}
              </span>
              {isSingle && singleExpense ? (
                <>
                  <p className="text-sm font-black text-slate-800 mt-0.5">
                    {singleExpense.documentNumber || "PROV-XXXXXX"} &bull; {singleExpense.vendorName || "Proveedor"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{singleExpense.concept}</p>
                </>
              ) : (
                <p className="text-sm font-black text-slate-800 mt-0.5">
                  {expenses.length} gastos provisionales seleccionados
                </p>
              )}
            </div>
            <div className="text-right sm:border-l sm:pl-4 shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importe Total</span>
              <p className="text-xl font-black text-indigo-700">{formatMoney(totalAmount)}</p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-center gap-2 font-medium animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {uploadSuccessMessage && (
            <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200 flex items-center gap-2 font-medium animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{uploadSuccessMessage}</span>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 1: VINCULAR FACTURA FISCAL (CFDI)
             ───────────────────────────────────────────────────────────── */}
          {activeTab === "fiscal" && isSingle && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    Seleccionar Factura Fiscal del SAT (CFDI)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Elige una factura recibida del buzón o sube el XML directamente.
                  </p>
                </div>

                {/* Subir XML Button */}
                <div>
                  <input
                    type="file"
                    ref={xmlInputRef}
                    accept=".xml"
                    onChange={handleXmlFileChange}
                    className="hidden"
                    id="upload-xml-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingXml}
                    onClick={() => xmlInputRef.current?.click()}
                    className="text-xs font-bold gap-1.5 border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 h-8"
                  >
                    {uploadingXml ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Leyendo XML...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Subir XML</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Buscador de facturas */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  placeholder="Buscar por Proveedor, RFC, Folio o UUID..."
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Lista de facturas candidatas */}
              <div className="border rounded-xl max-h-56 overflow-y-auto divide-y bg-white shadow-inner custom-scrollbar">
                {loadingInbox ? (
                  <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Cargando facturas del buzón SAT...</span>
                  </div>
                ) : candidateInvoices.length === 0 ? (
                  <div className="p-6 text-center">
                    <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-slate-600">No se encontraron facturas fiscales pendientes</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Puedes subir el archivo .xml del gasto con el botón superior "Subir XML".
                    </p>
                  </div>
                ) : (
                  candidateInvoices.map((inv) => {
                    const invId = inv.id || inv.uuid;
                    const isSelected = selectedInboxId === invId;
                    const invTotal = Number(inv.total || inv.amount || 0);
                    const isExactMatch = Math.abs(invTotal - Number(singleExpense?.amount || 0)) < 0.05;

                    return (
                      <div
                        key={invId}
                        onClick={() => setSelectedInboxId(invId)}
                        className={`p-3 cursor-pointer transition-all flex items-start justify-between gap-3 ${
                          isSelected 
                            ? "bg-indigo-50/80 border-l-4 border-indigo-600 font-semibold" 
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-800">
                                {inv.folio || inv.invoiceNumber || "Sin Folio"}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {inv.emisorRfc || inv.vendorRfc || ""}
                              </span>
                              {isExactMatch && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                                  Monto Exacto
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-700 line-clamp-1 mt-0.5 font-medium">
                              {inv.emisorName || inv.vendorName || "Proveedor"}
                            </p>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Fecha: {inv.date || "N/A"} &bull; UUID: {(inv.uuid || inv.id || "").substring(0, 13)}...
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-slate-900 block">
                            {formatMoney(invTotal)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Detalle de factura seleccionada e impacto contable */}
              {selectedInvoice && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-emerald-900 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-emerald-700" />
                      Factura Seleccionada para Formalizar
                    </span>
                    <span className="font-mono text-[11px] font-bold text-emerald-800">
                      Folio: {selectedInvoice.folio || selectedInvoice.invoiceNumber || selectedInvoice.uuid.substring(0, 8)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-emerald-200/60 text-slate-700 text-[11px]">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Subtotal (Gasto):</span>
                      <span className="font-bold">
                        {formatMoney(selectedInvoice.subtotal !== undefined ? Number(selectedInvoice.subtotal) : (Number(selectedInvoice.total) / 1.16))}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">IVA Acreditable (16%):</span>
                      <span className="font-bold text-emerald-700">
                        {formatMoney(selectedInvoice.tax !== undefined ? Number(selectedInvoice.tax) : (Number(selectedInvoice.total) - (Number(selectedInvoice.total) / 1.16)))}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Total CFDI:</span>
                      <span className="font-black text-slate-900">
                        {formatMoney(Number(selectedInvoice.total || singleExpense?.amount || 0))}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-800 font-medium pt-1">
                    ✓ La póliza contable se actualizará automáticamente acreditando el IVA pagado en la cuenta <b>118.01</b>.
                  </p>
                </div>
              )}

              {/* Clasificación contable y operativa */}
              <div className="space-y-3 pt-2 bg-slate-50/80 border rounded-xl p-3.5">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  Clasificación Contable y Operativa
                </h4>

                {/* Cuenta Contable de Gasto */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                    Cuenta Contable de Gasto <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    placeholder="Busca cuenta contable (ej. 601.01 Gastos Generales)..."
                    items={expenseAccountItems}
                    selectedId={accountId}
                    onSelect={setAccountId}
                    className="text-xs bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Sucursal (Opcional)</label>
                    <SearchableSelect
                      placeholder="Selecciona sucursal..."
                      items={locationItems}
                      selectedId={locationId}
                      onSelect={setLocationId}
                      className="text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Centro de Costos (Opcional)</label>
                    <SearchableSelect
                      placeholder="Selecciona centro de costos..."
                      items={costCenterItems}
                      selectedId={costCenterId}
                      onSelect={setCostCenterId}
                      className="text-xs bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 2: DECLARAR COMO NO DEDUCIBLE (O LOTE MASIVO)
             ───────────────────────────────────────────────────────────── */}
          {(activeTab === "nondeductible" || !isSingle) && (
            <div className="space-y-4">
              {isSingle && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Proveedor / Beneficiario</label>
                    <Input
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="Nombre o Razón Social..."
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Concepto Descriptivo</label>
                    <Input
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                      placeholder="Descripción del gasto..."
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Classification Selectors */}
              <div className="space-y-4 bg-white border rounded-xl p-4 shadow-sm">
                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  Clasificación Contable y Operativa Requerida
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Sucursal */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      Sucursal <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      placeholder="Selecciona una sucursal..."
                      items={locationItems}
                      selectedId={locationId}
                      onSelect={setLocationId}
                      className="text-xs"
                    />
                  </div>

                  {/* Centro de Costos */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Centro de Costos (Opcional)
                    </label>
                    <SearchableSelect
                      placeholder="Selecciona centro de costos..."
                      items={costCenterItems}
                      selectedId={costCenterId}
                      onSelect={setCostCenterId}
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Cuenta Contable */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    Cuenta Contable de Gasto <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    placeholder="Busca cuenta contable (ej. 601.99 Gastos No Deducibles)..."
                    items={expenseAccountItems}
                    selectedId={accountId}
                    onSelect={setAccountId}
                    className="text-xs"
                  />
                </div>

                {/* Observaciones */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    Observaciones / Justificación de la revisión
                  </label>
                  <Input
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Motivo de no deducibilidad o aclaración contable..."
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t flex items-center justify-end gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
              className="text-xs font-bold h-9"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || loadingCatalogs || (activeTab === "fiscal" && !selectedInvoice)}
              className={`${
                activeTab === "fiscal" 
                  ? "bg-emerald-600 hover:bg-emerald-700" 
                  : "bg-indigo-600 hover:bg-indigo-700"
              } text-white text-xs font-bold h-9 px-5 gap-2 shadow-sm`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Guardando...</span>
                </>
              ) : activeTab === "fiscal" ? (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>Vincular CFDI y Formalizar</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar y Oficializar No Deducible</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
