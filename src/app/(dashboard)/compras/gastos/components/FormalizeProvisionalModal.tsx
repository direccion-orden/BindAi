"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, query, onSnapshot, doc, writeBatch, getDocs, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, X, CheckCircle2, ShieldCheck, Building2, Layers, BookOpen, AlertCircle } from "lucide-react";

interface FormalizeProvisionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: any[]; // List of 1 or more expenses to formalize
  companyId: string;
  userEmail?: string;
  onSuccess: () => void;
}

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

  // Catalogs
  const [locations, setLocations] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(true);

  // Form State
  const [locationId, setLocationId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [concept, setConcept] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Load catalogs
  useEffect(() => {
    if (!companyId || !isOpen) return;
    setLoadingCatalogs(true);

    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Locations listener warning:", err);
    });

    const unsubCC = onSnapshot(query(collection(db, "companies", companyId, "cost_centers")), (snap) => {
      setCostCenters(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Cost centers listener warning:", err);
    });

    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(all);
      setLoadingCatalogs(false);
    }, (err) => {
      console.warn("Accounts listener warning:", err);
      setLoadingCatalogs(false);
    });

    return () => {
      unsubLoc();
      unsubCC();
      unsubAcc();
    };
  }, [companyId, isOpen]);

  // Pre-fill fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage("");
      if (isSingle && singleExpense) {
        setLocationId(singleExpense.locationId || "");
        setCostCenterId(singleExpense.costCenterId || "");
        setAccountId(singleExpense.accountId || "");
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
  }, [isOpen, isSingle, singleExpense]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!locationId) {
      setErrorMessage("Por favor selecciona una Sucursal.");
      return;
    }
    if (!accountId) {
      setErrorMessage("Por favor selecciona la Cuenta Contable de gasto.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const selectedLoc = locations.find(l => l.id === locationId);
      const selectedCC = costCenters.find(c => c.id === costCenterId);
      const selectedAcc = accounts.find(a => a.id === accountId);

      const batch = writeBatch(db);
      const now = new Date().toISOString();

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
              // If it was the debit line of expense, update to the chosen account
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
      <div className="bg-card w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between border-b border-indigo-500/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-400/40 text-indigo-300">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                {isSingle ? "Formalizar Gasto No Deducible" : `Formalización Masiva de Gastos (${expenses.length})`}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isSingle 
                  ? `Convierte ${singleExpense?.documentNumber || 'el gasto provisional'} en un gasto oficial clasificado.`
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

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          {/* Summary Box */}
          <div className="bg-slate-50 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {isSingle ? "Detalle del Movimiento" : "Resumen del Lote"}
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
            <div className="text-right sm:border-l sm:pl-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importe Total</span>
              <p className="text-xl font-black text-indigo-700">{formatMoney(totalAmount)}</p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

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
              disabled={saving || loadingCatalogs}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9 px-5 gap-2 shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar y Oficializar</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
