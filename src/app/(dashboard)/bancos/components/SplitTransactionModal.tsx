"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  writeBatch,
  doc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Scissors,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  RotateCcw,
} from "lucide-react";
import { BankTransaction, BankAccount } from "@/types/bank";

interface SplitPart {
  id: string;
  concept: string;
  reference: string;
  amount: string;
}

interface SplitTransactionModalProps {
  isOpen: boolean;
  transaction: BankTransaction | null;
  bankAccount: BankAccount | null;
  onClose: () => void;
  onSuccess?: (newTransactionIds: string[]) => void;
}

export function SplitTransactionModal({
  isOpen,
  transaction,
  bankAccount,
  onClose,
  onSuccess,
}: SplitTransactionModalProps) {
  const { companyId, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reverting, setReverting] = useState(false);

  const absTotal = useMemo(() => {
    return transaction ? Math.abs(transaction.amount) : 0;
  }, [transaction]);

  const isCharge = useMemo(() => {
    return transaction ? transaction.amount < 0 : true;
  }, [transaction]);

  const [parts, setParts] = useState<SplitPart[]>([
    { id: "part-1", concept: "", reference: "", amount: "" },
    { id: "part-2", concept: "", reference: "", amount: "" },
  ]);

  // Inicializar partes al abrir el modal con el movimiento
  useEffect(() => {
    if (transaction && isOpen) {
      const origConcept = transaction.concept || "Movimiento";
      const origRef = transaction.reference || "";

      setParts([
        {
          id: "part-1",
          concept: `${origConcept} - Parte 1`,
          reference: origRef,
          amount: "",
        },
        {
          id: "part-2",
          concept: `${origConcept} - Parte 2`,
          reference: origRef,
          amount: "",
        },
      ]);
    }
  }, [transaction, isOpen]);

  // Cálculos de sumas y diferencias en tiempo real
  const sumParts = useMemo(() => {
    return parts.reduce((sum, p) => {
      const val = parseFloat(p.amount);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [parts]);

  const difference = useMemo(() => {
    return absTotal - sumParts;
  }, [absTotal, sumParts]);

  const isExactMatch = useMemo(() => {
    return Math.abs(difference) < 0.009;
  }, [difference]);

  const hasInvalidAmount = useMemo(() => {
    return parts.some((p) => {
      const val = parseFloat(p.amount);
      return isNaN(val) || val <= 0;
    });
  }, [parts]);

  const canSubmit = isExactMatch && !hasInvalidAmount && parts.length >= 2 && !loading;

  // Acciones en filas
  const handleAddPart = () => {
    const nextIdx = parts.length + 1;
    const origConcept = transaction?.concept || "Movimiento";
    const origRef = transaction?.reference || "";

    // Si hay remanente positivo, sugerirlo en la nueva fila
    const suggestedAmount = difference > 0.01 ? difference.toFixed(2) : "";

    setParts((prev) => [
      ...prev,
      {
        id: `part-${Date.now()}-${nextIdx}`,
        concept: `${origConcept} - Parte ${nextIdx}`,
        reference: origRef,
        amount: suggestedAmount,
      },
    ]);
  };

  const handleRemovePart = (index: number) => {
    if (parts.length <= 2) {
      alert("Un movimiento dividido debe tener al menos 2 partes.");
      return;
    }
    setParts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdatePart = (index: number, field: keyof SplitPart, value: string) => {
    setParts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const handleAutoFillRemainder = (index: number) => {
    const otherSum = parts.reduce((sum, p, i) => {
      if (i === index) return sum;
      const val = parseFloat(p.amount);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);

    const remainder = Math.max(0, absTotal - otherSum);
    handleUpdatePart(index, "amount", remainder.toFixed(2));
  };

  // Guardar división
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !bankAccount || !transaction || !canSubmit) return;

    if (transaction.reconciled) {
      alert("No se puede dividir un movimiento que ya está conciliado. Desconcílialo primero.");
      return;
    }

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const parentSign = Math.sign(transaction.amount) || (isCharge ? -1 : 1);
      const newTxIds: string[] = [];

      const parentDataToStore = {
        id: transaction.id,
        date: transaction.date,
        concept: transaction.concept,
        reference: transaction.reference || "",
        amount: transaction.amount,
        type: transaction.type || (isCharge ? "EXPENSE" : "INCOME"),
        createdAt: transaction.createdAt || Date.now(),
      };

      // 1. Crear las transacciones hijas
      parts.forEach((p, idx) => {
        const childRef = doc(
          collection(
            db,
            "companies",
            companyId,
            "bankAccounts",
            bankAccount.id,
            "transactions"
          )
        );
        newTxIds.push(childRef.id);

        const partAbsAmt = parseFloat(p.amount);
        const signedAmt = parentSign * partAbsAmt;

        const childDoc: Partial<BankTransaction> = {
          id: childRef.id,
          date: transaction.date,
          concept: p.concept.trim() || `${transaction.concept} (Parte ${idx + 1})`,
          reference: p.reference.trim() || transaction.reference || "",
          amount: signedAmt,
          type: transaction.type || (isCharge ? "EXPENSE" : "INCOME"),
          reconciled: false,
          createdAt: Date.now() + idx,
          isSplitPart: true,
          splitParentId: transaction.id,
          splitParentConcept: transaction.concept,
          splitParentAmount: transaction.amount,
          splitParentData: parentDataToStore,
        };

        batch.set(childRef, childDoc);
      });

      // 2. Eliminar la transacción padre para que el balance contable y bancario se mantenga 100% exacto
      const parentRef = doc(
        db,
        "companies",
        companyId,
        "bankAccounts",
        bankAccount.id,
        "transactions",
        transaction.id
      );
      batch.delete(parentRef);

      await batch.commit();

      onSuccess?.(newTxIds);
      onClose();
    } catch (err: any) {
      console.error("Error al dividir el movimiento bancario:", err);
      alert(err.message || "Hubo un error al procesar la división del movimiento.");
    } finally {
      setLoading(false);
    }
  };

  // Revertir división si este movimiento es una parte hija
  const handleRevertSplit = async () => {
    if (!companyId || !bankAccount || !transaction || !transaction.splitParentId) return;

    const parentId = transaction.splitParentId;
    const parentData = transaction.splitParentData;

    const confirmRevert = window.confirm(
      "¿Deseas revertir la división de este movimiento y reunificarlo en el movimiento original?"
    );
    if (!confirmRevert) return;

    setReverting(true);
    try {
      // 1. Buscar todas las partes hijas con el mismo splitParentId
      const q = query(
        collection(
          db,
          "companies",
          companyId,
          "bankAccounts",
          bankAccount.id,
          "transactions"
        ),
        where("splitParentId", "==", parentId)
      );

      const snap = await getDocs(q);

      // Verificar que ninguna de las partes esté conciliada
      const anyReconciled = snap.docs.some((d) => d.data().reconciled);
      if (anyReconciled) {
        alert(
          "No se puede revertir la división porque una o más de las partes ya están conciliadas. Desconcílialas antes de reunificar el movimiento."
        );
        return;
      }

      const batch = writeBatch(db);

      // 2. Eliminar todas las partes hijas
      snap.docs.forEach((d) => {
        batch.delete(d.ref);
      });

      // 3. Restaurar la transacción original
      const restoredParentRef = doc(
        db,
        "companies",
        companyId,
        "bankAccounts",
        bankAccount.id,
        "transactions",
        parentId
      );

      const restoredData: any = parentData || {
        id: parentId,
        date: transaction.date,
        concept: transaction.splitParentConcept || "Movimiento original",
        amount: transaction.splitParentAmount || transaction.amount,
        type: transaction.type,
        reconciled: false,
        createdAt: Date.now(),
      };

      batch.set(restoredParentRef, {
        ...restoredData,
        reconciled: false,
        isSplitPart: false,
        splitParentId: null,
      });

      await batch.commit();

      alert("El movimiento original ha sido reunificado con éxito.");
      onSuccess?.([parentId]);
      onClose();
    } catch (err: any) {
      console.error("Error al revertir división:", err);
      alert(err.message || "Error al revertir la división.");
    } finally {
      setReverting(false);
    }
  };

  if (!isOpen || !transaction) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Encabezado del Modal */}
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-300">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Dividir Movimiento Bancario
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                  Split Transaction
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Desglosa este movimiento en 2 o más partes para conciliar cada una de forma independiente.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Cuerpo con Scroll */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Tarjeta resumen del movimiento original */}
          <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono">
                  Movimiento Original ({transaction.date})
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isCharge
                      ? "bg-red-100 text-red-700 border border-red-200"
                      : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  {isCharge ? "Cargo / Egreso" : "Abono / Ingreso"}
                </span>
                {transaction.isSplitPart && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                    Parte dividida
                  </span>
                )}
              </div>
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200 line-clamp-2">
                {transaction.concept}
              </p>
              {transaction.reference && (
                <p className="text-xs text-slate-400 font-mono">Ref: {transaction.reference}</p>
              )}
            </div>

            <div className="text-right shrink-0">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Total Original
              </span>
              <span
                className={`text-2xl font-black font-mono ${
                  isCharge ? "text-red-600" : "text-emerald-600"
                }`}
              >
                {isCharge ? "-" : "+"}${absTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Si ya es parte de una división previa, dar opción de revertir */}
          {transaction.isSplitPart && (
            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 rounded-xl p-3 flex items-center justify-between text-xs text-purple-800 dark:text-purple-300">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Este movimiento proviene de una división anterior del concepto: <strong>{transaction.splitParentConcept}</strong></span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRevertSplit}
                disabled={reverting}
                className="gap-1.5 text-xs font-bold border-purple-300 hover:bg-purple-100 text-purple-700 shrink-0 h-8"
              >
                {reverting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Reunificar Original
              </Button>
            </div>
          )}

          {/* Lista de Partes Desglosadas */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Desglose de Partes ({parts.length})
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddPart}
                className="gap-1.5 text-xs font-semibold h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar otra parte
              </Button>
            </div>

            <div className="space-y-2.5">
              {parts.map((part, idx) => (
                <div
                  key={part.id}
                  className="bg-card border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-2.5 transition-all hover:border-slate-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                      Parte {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAutoFillRemainder(idx)}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline px-2 py-0.5 rounded"
                        title="Calcular y asignar la diferencia restante a esta parte"
                      >
                        Auto-completar remanente
                      </button>
                      {parts.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePart(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                          title="Eliminar esta fila"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                    <div className="sm:col-span-6 space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase">Concepto</label>
                      <Input
                        type="text"
                        value={part.concept}
                        onChange={(e) => handleUpdatePart(idx, "concept", e.target.value)}
                        placeholder={`Concepto para la parte ${idx + 1}`}
                        className="h-9 text-xs font-medium"
                      />
                    </div>
                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase">Referencia</label>
                      <Input
                        type="text"
                        value={part.reference}
                        onChange={(e) => handleUpdatePart(idx, "reference", e.target.value)}
                        placeholder="Ref (opcional)"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-3 space-y-1">
                      <label className="text-[10px] font-semibold text-slate-400 uppercase">Importe ($ MXN)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          $
                        </span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={part.amount}
                          onChange={(e) => handleUpdatePart(idx, "amount", e.target.value)}
                          placeholder="0.00"
                          className="h-9 pl-6 text-xs font-bold font-mono text-right"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Barra de Totales y Cuadre */}
          <div className="bg-slate-50 dark:bg-slate-900/60 border rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">Total Original</span>
                <span className="text-sm font-bold font-mono text-slate-700 dark:text-slate-200">
                  ${absTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">Suma de Partes</span>
                <span className="text-sm font-bold font-mono text-slate-700 dark:text-slate-200">
                  ${sumParts.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">Diferencia</span>
                <span
                  className={`text-sm font-bold font-mono ${
                    isExactMatch ? "text-emerald-600 font-extrabold" : "text-amber-600"
                  }`}
                >
                  ${Math.abs(difference).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div
              className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-between gap-2 ${
                isExactMatch
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {isExactMatch ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>
                  {isExactMatch
                    ? "✓ Las partes cuadran exactamente con el monto original ($0.00 de diferencia)."
                    : difference > 0
                    ? `Faltan $${difference.toFixed(2)} por asignar para cuadrar el total.`
                    : `Sobran $${Math.abs(difference).toFixed(2)} respecto al total original.`}
                </span>
              </div>

              {!isExactMatch && parts.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleAutoFillRemainder(parts.length - 1)}
                  className="px-2.5 py-1 text-[11px] font-bold rounded bg-amber-200/80 hover:bg-amber-300 text-amber-900 shrink-0 transition-colors"
                >
                  Cuadrar última fila
                </button>
              )}
            </div>
          </div>

          {/* Botones de acción del pie */}
          <div className="flex justify-end items-center gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 min-w-[170px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  <Scissors className="w-4 h-4" />
                  <span>Confirmar y Dividir</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
