"use client";

import React, { useState, useEffect } from "react";
import { collection, doc, writeBatch, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Target, Calendar, Copy, Save, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function MetasPage() {
  const { companyId } = useAuth();
  const [locations, setLocations] = useState<any[]>([]);
  const [goals, setGoals] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  // Years range: current year - 1 to current year + 2
  const years = Array.from({ length: 4 }, (_, i) => currentYear - 1 + i);

  // Load locations
  useEffect(() => {
    if (!companyId) return;

    const fetchLocations = async () => {
      try {
        const snap = await getDocs(collection(db, "companies", companyId, "locations"));
        const locs = snap.docs.map(d => ({
          id: d.id,
          name: d.data().name || d.data().Name || "Sucursal sin nombre"
        }));
        // Sort alphabetically
        locs.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setLocations(locs);
      } catch (err) {
        console.error("Error loading locations:", err);
        setErrorMsg("No se pudieron cargar las sucursales.");
      }
    };

    fetchLocations();
  }, [companyId]);

  // Load goals for selected year/month
  useEffect(() => {
    if (!companyId || locations.length === 0) return;

    const fetchGoals = async () => {
      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");
      try {
        const snap = await getDocs(collection(db, "companies", companyId, "sales_goals"));
        const newGoals: { [key: string]: number } = {};
        
        // Filter in memory to avoid needing a composite index
        snap.forEach(d => {
          const data = d.data();
          if (data.year === selectedYear && data.month === selectedMonth) {
            newGoals[data.locationId] = data.amount || 0;
          }
        });

        // Initialize missing locations with 0
        const updatedGoals = { ...newGoals };
        locations.forEach(loc => {
          if (updatedGoals[loc.id] === undefined) {
            updatedGoals[loc.id] = 0;
          }
        });

        setGoals(updatedGoals);
      } catch (err) {
        console.error("Error loading goals:", err);
        setErrorMsg("Error al recuperar las metas guardadas.");
      } finally {
        setLoading(false);
      }
    };

    fetchGoals();
  }, [companyId, locations, selectedYear, selectedMonth]);

  const handleAmountChange = (locationId: string, value: string) => {
    const numericVal = parseFloat(value) || 0;
    setGoals(prev => ({
      ...prev,
      [locationId]: numericVal >= 0 ? numericVal : 0
    }));
  };

  const handleCopyPreviousMonth = async () => {
    if (!companyId) return;
    setErrorMsg("");
    setSuccessMsg("");

    let prevMonth = selectedMonth - 1;
    let prevYear = selectedYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = selectedYear - 1;
    }

    try {
      const snap = await getDocs(collection(db, "companies", companyId, "sales_goals"));
      const prevGoals: { [key: string]: number } = {};
      
      snap.forEach(d => {
        const data = d.data();
        if (data.year === prevYear && data.month === prevMonth) {
          prevGoals[data.locationId] = data.amount || 0;
        }
      });

      if (Object.keys(prevGoals).length === 0) {
        setErrorMsg(`No se encontraron metas registradas para ${MONTHS[prevMonth - 1]} de ${prevYear}.`);
        return;
      }

      setGoals(prev => {
        const updated = { ...prev };
        locations.forEach(loc => {
          if (prevGoals[loc.id] !== undefined) {
            updated[loc.id] = prevGoals[loc.id];
          }
        });
        return updated;
      });

      setSuccessMsg(`Metas de ${MONTHS[prevMonth - 1]} de ${prevYear} cargadas en los campos. Recuerda presionar "Guardar" para conservarlas.`);
    } catch (err) {
      console.error("Error copying previous month goals:", err);
      setErrorMsg("Error al obtener las metas del mes anterior.");
    }
  };

  const handleSaveGoals = async () => {
    if (!companyId) return;
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const batch = writeBatch(db);

      locations.forEach(loc => {
        const amount = goals[loc.id] || 0;
        const docId = `${loc.id}_${selectedYear}_${selectedMonth}`;
        const ref = doc(db, "companies", companyId, "sales_goals", docId);
        
        batch.set(ref, {
          id: docId,
          locationId: loc.id,
          locationName: loc.name,
          year: selectedYear,
          month: selectedMonth,
          amount: amount,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await batch.commit();
      setSuccessMsg("¡Metas guardadas con éxito!");
    } catch (err) {
      console.error("Error saving goals:", err);
      setErrorMsg("Hubo un error al guardar las metas de venta.");
    } finally {
      setSaving(false);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonth(prev => prev + 1);
    }
  };

  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonth(prev => prev - 1);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Metas de Ventas</h1>
          <p className="text-muted-foreground">
            Establece metas mensuales de facturación por sucursal para medir el rendimiento comercial.
          </p>
        </div>
      </div>

      {/* Period Selector Panel */}
      <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button variant="outline" size="icon" onClick={prevMonth} className="shrink-0 h-10 w-10">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          
          <div className="flex items-center gap-2 flex-1 justify-center min-w-[200px]">
            <Calendar className="w-5 h-5 text-indigo-600 shrink-0" />
            <select
              className="bg-transparent border-none text-lg font-bold outline-none cursor-pointer text-slate-800 pr-1 py-1"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            >
              {MONTHS.map((m, idx) => (
                <option key={idx} value={idx + 1}>{m}</option>
              ))}
            </select>
            <select
              className="bg-transparent border-none text-lg font-bold outline-none cursor-pointer text-slate-800 py-1"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <Button variant="outline" size="icon" onClick={nextMonth} className="shrink-0 h-10 w-10">
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex gap-2 w-full md:w-auto justify-end">
          <Button
            variant="outline"
            onClick={handleCopyPreviousMonth}
            disabled={loading || saving}
            className="gap-2 border-slate-200 hover:border-slate-300 h-10 font-semibold"
          >
            <Copy className="w-4 h-4 text-slate-500" />
            Copiar Mes Anterior
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Goals Table/Grid */}
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm text-muted-foreground font-medium">Cargando metas del período...</p>
          </div>
        ) : locations.length === 0 ? (
          <div className="py-16 text-center">
            <Target className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold">No se encontraron sucursales registradas</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Crea sucursales en Configuración de Sucursales para poder asignarles metas de venta.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {/* Table Header */}
            <div className="grid grid-cols-12 bg-slate-50 p-4 border-b text-xs font-bold text-slate-500 uppercase tracking-wider">
              <div className="col-span-8 flex items-center">Sucursal</div>
              <div className="col-span-4 text-right">Meta Mensual (MXN)</div>
            </div>

            {/* Table Body */}
            <div className="divide-y">
              {locations.map(loc => (
                <div key={loc.id} className="grid grid-cols-12 p-4 items-center hover:bg-slate-50/50 transition-colors">
                  <div className="col-span-7 md:col-span-8 font-semibold text-slate-700 text-sm">
                    {loc.name}
                  </div>
                  <div className="col-span-5 md:col-span-4 flex justify-end">
                    <div className="relative w-full max-w-[200px]">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">$</span>
                      <Input
                        type="number"
                        className="pl-8 text-right font-bold h-10 pr-3 focus-visible:ring-indigo-500"
                        placeholder="0.00"
                        value={goals[loc.id] !== undefined ? (goals[loc.id] === 0 ? "" : goals[loc.id]) : ""}
                        onChange={(e) => handleAmountChange(loc.id, e.target.value)}
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Save Area */}
            <div className="p-6 bg-slate-50 border-t flex justify-end">
              <Button
                onClick={handleSaveGoals}
                disabled={saving}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 px-8 shadow-md"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Guardar Metas de {MONTHS[selectedMonth - 1]}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
