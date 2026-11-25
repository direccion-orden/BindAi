"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Check, Loader2, AlertCircle, Building2, User, Landmark, CreditCard, Eye, ExternalLink } from "lucide-react";
import {
  collection,
  query as firestoreQuery,
  orderBy,
  limit,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { getLocalDateString } from "@/lib/utils";

const PAYMENT_TERMS = [
  { id: "3", name: "Transferencia Electrónica" },
  { id: "1", name: "Efectivo" },
  { id: "2", name: "Cheque" },
  { id: "4", name: "Tarjeta de Crédito" },
  { id: "5", name: "Tarjeta de Débito" },
];

interface PaymentEvidenceLinkModalProps {
  evidence: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newAnticipoFolio?: number) => void;
}

export function PaymentEvidenceLinkModal({
  evidence,
  isOpen,
  onClose,
  onSuccess,
}: PaymentEvidenceLinkModalProps) {
  const { user, companyId } = useAuth();

  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [selectedPaymentTerm, setSelectedPaymentTerm] = useState("3");
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");

  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFullImageOpen, setIsFullImageOpen] = useState(false);

  // Inicializar estados con la evidencia seleccionada
  useEffect(() => {
    if (evidence && isOpen) {
      setDate(evidence.date || getLocalDateString(new Date()));
      setAmount(evidence.amount ? String(evidence.amount) : "");
      setReference(evidence.notes || "");
      setSelectedPaymentTerm("3");
      setErrorMessage("");
    }
  }, [evidence, isOpen]);

  // Cargar cuentas bancarias de la empresa
  useEffect(() => {
    if (!companyId || !isOpen) return;

    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const q = firestoreQuery(collection(db, "companies", companyId, "bankAccounts"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().Name || d.data().name || "Cuenta sin nombre",
        }));
        setBankAccounts(data);
        if (data.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data[0].id);
        }
      } catch (err) {
        console.error("Error al cargar cuentas bancarias:", err);
      } finally {
        setLoadingAccounts(false);
      }
    };

    fetchAccounts();
  }, [companyId, isOpen]);

  const handleScrollIntoView = (e: React.FocusEvent<HTMLElement>) => {
    const el = e.currentTarget;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  };

  if (!evidence) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!companyId || !evidence) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage("Por favor ingresa un monto válido mayor a 0.");
      return;
    }

    if (!selectedAccountId) {
      setErrorMessage("Por favor selecciona una cuenta bancaria receptora.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Obtener el siguiente folio consecutivo
      let nextFolio = 1;
      const qFolio = firestoreQuery(
        collection(db, "companies", companyId, "anticipos"),
        orderBy("folio", "desc"),
        limit(1)
      );
      const folioSnap = await getDocs(qFolio);
      if (!folioSnap.empty) {
        nextFolio = ((folioSnap.docs[0].data() as any).folio || 0) + 1;
      }

      const selectedAccount = bankAccounts.find((b) => b.id === selectedAccountId);
      const termName = PAYMENT_TERMS.find((p) => p.id === selectedPaymentTerm)?.name || "Transferencia Electrónica";

      let finalBankTransactionId = "";

      // 2. Si es Efectivo, registrar movimiento en la cuenta bancaria de caja y actualizar saldo
      if (selectedPaymentTerm === "1") {
        const txData = {
          amount: parsedAmount,
          date: date,
          concept: `Anticipo de Cliente (Efectivo): ${evidence.clientName} - Ref: ${reference || "Evidencia"}`,
          reference: reference || "",
          reconciled: true,
          matchedAt: new Date().toISOString(),
          reconcileType: "direct",
          matchedDocumentId: `ANT-${nextFolio}`,
          createdAt: new Date().toISOString(),
        };
        const txRef = await addDoc(
          collection(db, "companies", companyId, "bankAccounts", selectedAccountId, "transactions"),
          txData
        );
        finalBankTransactionId = txRef.id;

        await updateDoc(doc(db, "companies", companyId, "bankAccounts", selectedAccountId), {
          balance: increment(parsedAmount),
        });
      }

      // 3. Crear el Anticipo en Firestore
      const anticipoData = {
        folio: nextFolio,
        clientId: evidence.clientId,
        clientName: evidence.clientName,
        locationId: evidence.locationId || "",
        locationName: evidence.locationName || "Sucursal",
        amount: parsedAmount,
        balance: parsedAmount,
        reference: reference.trim(),
        bankAccountId: selectedAccountId,
        bankAccountName: selectedAccount?.name || "Cuenta Principal",
        bankTransactionId: finalBankTransactionId || null,
        paymentTermId: parseInt(selectedPaymentTerm),
        paymentTermName: termName,
        imageUrl: evidence.imageUrl,
        paymentEvidenceId: evidence.id,
        receivedAt: date,
        createdBy: user?.email || "Usuario",
        createdAt: serverTimestamp(),
        status: "pending", // pending -> partially_applied -> applied
      };

      const anticipoRef = await addDoc(collection(db, "companies", companyId, "anticipos"), anticipoData);

      // 4. Actualizar la Evidencia de Pago a estatus "linked"
      const evidenceRef = doc(db, "companies", companyId, "payment_evidences", evidence.id);
      await updateDoc(evidenceRef, {
        status: "linked",
        amount: parsedAmount,
        linkedTo: {
          anticipoId: anticipoRef.id,
          anticipoFolio: nextFolio,
          linkedAt: new Date().toISOString(),
          linkedBy: user?.email || "Usuario",
        },
        updatedAt: serverTimestamp(),
      });

      onSuccess(nextFolio);
    } catch (err: any) {
      console.error("Error al crear anticipo desde evidencia:", err);
      setErrorMessage("Error al registrar el anticipo: " + (err.message || ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-lg w-[95vw] sm:w-full p-4 sm:p-6 pb-28 sm:pb-6 max-h-[92vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-indigo-600" />
            Crear Anticipo desde Evidencia
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Verifica los datos precargados del comprobante para registrar el nuevo anticipo.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* TARJETA RESUMEN DE LA EVIDENCIA (FOTO + CLIENTE + SUCURSAL) */}
        <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl flex items-center gap-3">
          {evidence.imageUrl && (
            <div className="relative group shrink-0">
              <img
                src={evidence.imageUrl}
                alt="Comprobante"
                className="w-16 h-16 object-cover rounded-lg border border-indigo-200 shadow-sm cursor-pointer"
                onClick={() => setIsFullImageOpen(true)}
              />
              <button
                type="button"
                onClick={() => setIsFullImageOpen(true)}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white rounded-lg transition"
                title="Ver imagen completa"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 truncate">
              <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="truncate">{evidence.clientName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-600 truncate">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{evidence.locationName || "Sucursal"}</span>
            </div>
            {evidence.imageUrl && (
              <button
                type="button"
                onClick={() => window.open(evidence.imageUrl, "_blank")}
                className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                <span>Abrir comprobante</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* MODAL LIGHTBOX PARA LA IMAGEN COMPLETA */}
        {isFullImageOpen && (
          <Dialog open={isFullImageOpen} onOpenChange={setIsFullImageOpen}>
            <DialogContent className="max-w-2xl p-2 bg-black/90 border-0 rounded-2xl flex items-center justify-center">
              <img
                src={evidence.imageUrl}
                alt="Comprobante completo"
                className="max-h-[85vh] w-auto object-contain rounded-xl"
              />
            </DialogContent>
          </Dialog>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          {/* FECHA Y MONTO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* FECHA */}
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Fecha de Recepción <span className="text-rose-500">*</span>
              </label>
              <div className="w-full min-w-0 overflow-hidden rounded-xl">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  onFocus={handleScrollIntoView}
                  className="flex h-10 w-full rounded-xl border border-input bg-white px-3 py-0 text-base sm:text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  style={{
                    WebkitAppearance: "none",
                    appearance: "none",
                    height: "40px",
                    minHeight: "40px",
                    maxHeight: "40px",
                    width: "100%",
                    maxWidth: "100%",
                    boxSizing: "border-box",
                    margin: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    lineHeight: "40px",
                  }}
                  required
                />
              </div>
            </div>

            {/* MONTO */}
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Monto del Anticipo <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">$</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onFocus={handleScrollIntoView}
                  className="pl-7 h-10 text-base sm:text-xs rounded-xl font-bold text-slate-900 w-full"
                  required
                />
              </div>
            </div>
          </div>

          {/* CUENTA BANCARIA */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Landmark className="w-3.5 h-3.5 text-slate-500" />
              <span>Cuenta Bancaria Receptora <span className="text-rose-500">*</span></span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              disabled={loadingAccounts}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-xs ring-offset-background outline-none focus:ring-2 focus:ring-indigo-500"
              required
            >
              {loadingAccounts ? (
                <option value="">Cargando cuentas...</option>
              ) : bankAccounts.length === 0 ? (
                <option value="">No hay cuentas bancarias registradas</option>
              ) : (
                bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* FORMA DE PAGO */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-slate-500" />
              <span>Forma de Pago</span>
            </label>
            <select
              value={selectedPaymentTerm}
              onChange={(e) => setSelectedPaymentTerm(e.target.value)}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-base sm:text-xs ring-offset-background outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PAYMENT_TERMS.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>

          {/* REFERENCIA / CONCEPTO */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Referencia / Concepto (opcional)
            </label>
            <Input
              placeholder="Ej. Transferencia Banamex / Folio de comprobante"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              onFocus={handleScrollIntoView}
              className="h-10 text-base sm:text-xs rounded-xl"
            />
          </div>

          <DialogFooter className="pt-2 flex flex-row gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl flex-1 sm:flex-none text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-2 shadow"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Guardando Anticipo...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Guardar Anticipo
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
