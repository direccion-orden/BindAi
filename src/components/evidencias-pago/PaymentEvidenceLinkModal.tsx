"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link2, PlusCircle, CheckCircle2, Loader2, AlertCircle, Calendar } from "lucide-react";
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/utils";

interface PaymentEvidenceLinkModalProps {
  evidence: any | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentEvidenceLinkModal({
  evidence,
  isOpen,
  onClose,
  onSuccess,
}: PaymentEvidenceLinkModalProps) {
  const router = useRouter();
  const { user, companyId } = useAuth();

  const [loadingAnticipos, setLoadingAnticipos] = useState(false);
  const [anticipos, setAnticipos] = useState<any[]>([]);
  const [selectedAnticipoId, setSelectedAnticipoId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (isOpen && evidence && companyId) {
      fetchCandidateAnticipos();
    }
  }, [isOpen, evidence, companyId]);

  const fetchCandidateAnticipos = async () => {
    if (!companyId || !evidence) return;
    setLoadingAnticipos(true);
    setErrorMessage("");
    try {
      const q = query(
        collection(db, "companies", companyId, "anticipos"),
        where("clientId", "==", evidence.clientId)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.folio || 0) - (a.folio || 0));
      setAnticipos(list);
    } catch (err: any) {
      console.error("Error al buscar anticipos:", err);
      setErrorMessage("No se pudieron cargar los anticipos del cliente.");
    } finally {
      setLoadingAnticipos(false);
    }
  };

  if (!evidence) return null;

  const handleLinkToExisting = async () => {
    if (!selectedAnticipoId || !companyId || !evidence) return;
    const anticipoObj = anticipos.find((a) => a.id === selectedAnticipoId);
    if (!anticipoObj) return;

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const batch = writeBatch(db);

      const anticipoRef = doc(db, "companies", companyId, "anticipos", selectedAnticipoId);
      batch.update(anticipoRef, {
        imageUrl: evidence.imageUrl,
        paymentEvidenceId: evidence.id,
      });

      const evidenceRef = doc(db, "companies", companyId, "payment_evidences", evidence.id);
      batch.update(evidenceRef, {
        status: "linked",
        linkedTo: {
          anticipoId: selectedAnticipoId,
          anticipoFolio: anticipoObj.folio || selectedAnticipoId,
          linkedAt: new Date().toISOString(),
          linkedBy: user?.email || "Usuario",
        },
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      onSuccess();
    } catch (err: any) {
      console.error("Error al vincular evidencia:", err);
      setErrorMessage("Error al vincular con el anticipo: " + (err.message || ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToNewAnticipo = () => {
    onClose();
    router.push(`/nuevo?evidenceId=${evidence.id}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-md w-[95vw] sm:w-full p-4 sm:p-6 rounded-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Link2 className="w-5 h-5 text-indigo-600" />
            Relacionar Comprobante con Anticipo
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Vincula esta evidencia a un anticipo existente o genera uno nuevo usándola.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-4 pt-2">
          {/* Opción 1: Crear Nuevo Anticipo */}
          <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
            <div>
              <p className="text-xs font-bold text-indigo-950">Crear un Nuevo Anticipo</p>
              <p className="text-[11px] text-indigo-700">
                Abre la pantalla de captura precargando este comprobante, cliente y sucursal.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleGoToNewAnticipo}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl gap-2 mt-1 shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              Crear Nuevo Anticipo con este Comprobante
            </Button>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-[10px] uppercase font-bold text-slate-400">
              O vincular a uno existente
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Opción 2: Seleccionar anticipo existente */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Anticipos del Cliente ({evidence.clientName})
            </label>

            {loadingAnticipos ? (
              <div className="p-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                Cargando anticipos...
              </div>
            ) : anticipos.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {anticipos.map((ant) => {
                  const isSelected = selectedAnticipoId === ant.id;
                  const alreadyHasImg = Boolean(ant.imageUrl);
                  return (
                    <div
                      key={ant.id}
                      onClick={() => setSelectedAnticipoId(ant.id)}
                      className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/80 shadow-sm"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      }`}
                    >
                      <div className="space-y-0.5 truncate pr-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">
                            ANT-{ant.folio || ant.id}
                          </span>
                          <span className="font-semibold text-emerald-700">
                            {formatMoney(ant.amount || 0)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {ant.receivedAt || "Sin fecha"}
                          </span>
                          {alreadyHasImg && (
                            <span className="text-amber-600 font-medium">
                              (Ya tiene foto asignada, se reemplazará)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-slate-300"></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                No hay anticipos registrados para este cliente.
              </div>
            )}

            <Button
              type="button"
              disabled={!selectedAnticipoId || isSubmitting}
              onClick={handleLinkToExisting}
              className="w-full rounded-xl text-xs font-bold gap-2 mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Vinculando...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  Confirmar Vinculación
                </>
              )}
            </Button>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full text-xs"
          >
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
