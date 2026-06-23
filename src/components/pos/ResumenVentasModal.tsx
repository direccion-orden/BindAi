"use client";

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { usePOS } from "@/context/POSContext";
import { X, Target, TrendingUp, Loader2, Calendar, DollarSign, Award, Store } from "lucide-react";

interface ResumenVentasModalProps {
  onClose: () => void;
}

const parseSafeDate = (createdAt: any): Date => {
  if (!createdAt) return new Date();
  if (typeof createdAt.toDate === "function") {
    return createdAt.toDate();
  }
  if (createdAt.seconds) {
    return new Date(createdAt.seconds * 1000);
  }
  if (typeof createdAt === "string" || typeof createdAt === "number") {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const getLocalDateString = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function ResumenVentasModal({ onClose }: ResumenVentasModalProps) {
  const { companyId } = useAuth();
  const { branchId } = usePOS();

  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState("");
  const [activeSession, setActiveSession] = useState<any>(null);
  const [monthlyGoal, setMonthlyGoal] = useState<number>(0);
  const [allRemisiones, setAllRemisiones] = useState<any[]>([]);

  // Format currency helper
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  // 1. Fetch branch name
  useEffect(() => {
    if (!companyId || !branchId) return;

    const fetchBranch = async () => {
      try {
        const branchDoc = await getDoc(doc(db, "companies", companyId, "locations", branchId));
        if (branchDoc.exists()) {
          const bd = branchDoc.data();
          setBranchName(bd.name || bd.Name || "Sucursal");
        } else {
          setBranchName("Sucursal");
        }
      } catch (err) {
        console.error("Error fetching branch name:", err);
      }
    };

    fetchBranch();
  }, [companyId, branchId]);

  // 2. Fetch active cashier session
  useEffect(() => {
    if (!companyId || !branchId) return;

    const q = query(
      collection(db, "companies", companyId, "cash_sessions"),
      where("status", "==", "open"),
      where("locationId", "==", branchId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const sess = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          setActiveSession(sess);
        } else {
          setActiveSession(null);
        }
      },
      (err) => {
        console.error("Error fetching cash session:", err);
      }
    );

    return () => unsubscribe();
  }, [companyId, branchId]);

  // 3. Fetch monthly goal amount
  useEffect(() => {
    if (!companyId || !branchId) return;

    const goalDocId = `${branchId}_${currentYear}_${currentMonth}`;
    const goalRef = doc(db, "companies", companyId, "sales_goals", goalDocId);

    const unsubscribe = onSnapshot(
      goalRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setMonthlyGoal(snapshot.data().amount || 0);
        } else {
          setMonthlyGoal(0);
        }
      },
      (err) => {
        console.error("Error fetching monthly sales goal:", err);
      }
    );

    return () => unsubscribe();
  }, [companyId, branchId, currentYear, currentMonth]);

  // 4. Fetch remisiones created in the current month or shift
  useEffect(() => {
    if (!companyId || !branchId) return;

    // Start with 1st of the month at UTC midnight
    const startOfMonthUtc = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0, 0));
    let queryStartIso = startOfMonthUtc.toISOString();

    // If shift is open and started before the start of the month, use that instead
    if (activeSession) {
      let openedAtDate: Date;
      if (activeSession.openedAt?.seconds) {
        openedAtDate = new Date(activeSession.openedAt.seconds * 1000);
      } else if (activeSession.openedAt?.toDate) {
        openedAtDate = activeSession.openedAt.toDate();
      } else {
        openedAtDate = new Date(activeSession.openedAt);
      }
      const openedAtIso = openedAtDate.toISOString();
      if (openedAtIso < queryStartIso) {
        queryStartIso = openedAtIso;
      }
    }

    const q = query(
      collection(db, "companies", companyId, "remisiones"),
      where("createdAt", ">=", queryStartIso)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as any[];

        // Filter in memory to ensure we only get matching location and active (non-cancelled) remisiones
        const branchActiveRemisiones = docs.filter(
          (rem: any) => rem.locationId === branchId && rem.status !== "cancelada"
        );

        setAllRemisiones(branchActiveRemisiones);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching remisiones for summary:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [companyId, branchId, currentYear, currentMonth, activeSession]);

  // Calculate stats
  const dailyGoal = monthlyGoal / daysInMonth;

  // Filter shift remisiones if there is an active session
  let shiftRemisiones: any[] = [];
  let openedAtDate: Date | null = null;
  if (activeSession) {
    if (activeSession.openedAt?.seconds) {
      openedAtDate = new Date(activeSession.openedAt.seconds * 1000);
    } else if (activeSession.openedAt?.toDate) {
      openedAtDate = activeSession.openedAt.toDate();
    } else {
      openedAtDate = new Date(activeSession.openedAt);
    }

    shiftRemisiones = allRemisiones.filter((rem) => {
      const remDate = parseSafeDate(rem.createdAt);
      return openedAtDate ? remDate >= openedAtDate : true;
    });
  }

  // Filter monthly remisiones using localDate matching the sales module filter exactly
  const dateFrom = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const todayStr = getLocalDateString(now);

  const monthRemisiones = allRemisiones.filter((rem) => {
    const localDate = getLocalDateString(parseSafeDate(rem.createdAt));
    return localDate >= dateFrom && localDate <= todayStr;
  });

  // Sort shift remisiones descending by creation date
  shiftRemisiones.sort((a, b) => {
    return parseSafeDate(b.createdAt).getTime() - parseSafeDate(a.createdAt).getTime();
  });

  const totalShiftSales = shiftRemisiones.reduce((sum, rem) => sum + (rem.totalAmount || 0), 0);
  const totalMonthSales = monthRemisiones.reduce((sum, rem) => sum + (rem.totalAmount || 0), 0);

  const dailyGoalPct = dailyGoal > 0 ? (totalShiftSales / dailyGoal) * 100 : 0;
  const monthlyGoalPct = monthlyGoal > 0 ? (totalMonthSales / monthlyGoal) * 100 : 0;

  // Adjusted daily goal calculation
  const remainingDays = daysInMonth - now.getDate() + 1;
  const remainingMonthGoal = Math.max(0, monthlyGoal - totalMonthSales);
  const adjustedDailyGoal = remainingMonthGoal / remainingDays;
  const adjustedDailyGoalPct = adjustedDailyGoal > 0 ? (totalShiftSales / adjustedDailyGoal) * 100 : 0;

  const formatDateLabel = (createdAt: any) => {
    const d = parseSafeDate(createdAt);
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  };

  const getPaymentMethodsLabel = (rem: any) => {
    if (rem.payments && Array.isArray(rem.payments) && rem.payments.length > 0) {
      return rem.payments.map((p: any) => p.method).join(", ");
    }
    return rem.paymentMethod || "Efectivo";
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 rounded-xl">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Resumen de Ventas</h2>
              <p className="text-sm text-muted-foreground">
                Control de metas e historial de remisiones del turno actual.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted dark:hover:bg-slate-800 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
            <p className="text-sm font-medium">Obteniendo datos de ventas y metas...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {/* Info Badge Bar */}
            <div className="bg-muted/30 border border-border/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <span className="font-bold text-foreground">{branchName}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    (Meta Mensual: {formatMoney(monthlyGoal)})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Turno:{" "}
                  {activeSession ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Activo ({activeSession.openedByEmail || "POS"})
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Sin turno activo
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Daily Sales Card */}
              <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Ventas del Turno
                    </span>
                    <span className="text-3xl font-extrabold text-foreground tracking-tight">
                      {formatMoney(totalShiftSales)}
                    </span>
                  </div>
                  <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Meta del Día */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-muted-foreground">
                        Meta del Día: {formatMoney(dailyGoal)}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {dailyGoalPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          dailyGoalPct >= 100 ? "bg-emerald-500" : "bg-indigo-500"
                        }`}
                        style={{ width: `${Math.min(100, dailyGoalPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Meta Ajustada */}
                  <div className="space-y-1 pt-1.5 border-t border-border/30">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-muted-foreground flex items-center gap-1">
                        Meta Ajustada: {formatMoney(adjustedDailyGoal)}
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({remainingDays} {remainingDays === 1 ? 'día rest.' : 'días rest.'})
                        </span>
                      </span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                        {adjustedDailyGoalPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          adjustedDailyGoalPct >= 100 ? "bg-emerald-500" : "bg-indigo-600"
                        }`}
                        style={{ width: `${Math.min(100, adjustedDailyGoalPct)}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground italic pt-1">
                    {totalShiftSales >= adjustedDailyGoal
                      ? "¡Meta ajustada del día superada!"
                      : `Faltan ${formatMoney(Math.max(0, adjustedDailyGoal - totalShiftSales))} para alcanzar la meta ajustada`}
                  </p>
                </div>
              </div>

              {/* Monthly Accumulated Card */}
              <div className="bg-card border border-border/80 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Acumulado del Mes
                    </span>
                    <span className="text-3xl font-extrabold text-foreground tracking-tight">
                      {formatMoney(totalMonthSales)}
                    </span>
                  </div>
                  <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-muted-foreground">
                      Meta Mensual: {formatMoney(monthlyGoal)}
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400">
                      {monthlyGoalPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 bg-indigo-600`}
                      style={{ width: `${Math.min(100, monthlyGoalPct)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground italic">
                    {totalMonthSales >= monthlyGoal
                      ? "¡Meta mensual superada!"
                      : `Progreso acumulado respecto al objetivo de ${now.toLocaleString("es-MX", {
                          month: "long",
                        })}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Shift Sales Table Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Remisiones Generadas en el Turno ({shiftRemisiones.length})
              </h3>

              <div className="border border-border/85 rounded-xl overflow-hidden bg-card shadow-sm">
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900 text-muted-foreground uppercase text-[10px] tracking-wider sticky top-0 border-b font-bold">
                      <tr>
                        <th className="px-4 py-3">Hora</th>
                        <th className="px-4 py-3">Folio / Número</th>
                        <th className="px-4 py-3">Cliente</th>
                        <th className="px-4 py-3">Método de Pago</th>
                        <th className="px-4 py-3 text-right">Importe Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {shiftRemisiones.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground italic">
                            No se han generado remisiones en el turno actual.
                          </td>
                        </tr>
                      ) : (
                        shiftRemisiones.map((rem) => (
                          <tr key={rem.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 text-muted-foreground font-medium whitespace-nowrap">
                              {formatDateLabel(rem.createdAt)}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-foreground">
                              {rem.orderNumber?.replace("POS-", "") || rem.remissionNumber || "S/F"}
                            </td>
                            <td className="px-4 py-3 truncate max-w-[150px]" title={rem.clientName}>
                              {rem.clientName || "Público en General"}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                {getPaymentMethodsLabel(rem)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-foreground">
                              {formatMoney(rem.totalAmount || 0)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-border/60 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border/80 hover:bg-muted dark:hover:bg-slate-800 rounded-lg text-sm font-semibold transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
