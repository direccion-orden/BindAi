"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Plus, ArrowRight } from "lucide-react";
import { CashFlowModal } from "./CashFlowModal";
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { CashFlowRecord, BindERPAccount, BindERPCostCenter } from "@/types/cashFlow";

interface CashFlowBoardProps {
  month: number;
  year: number;
}

export function CashFlowBoard({ month, year }: CashFlowBoardProps) {
  const [locations, setLocations] = useState<any[]>([]);
  const [banks, setBanks] = useState<BindERPAccount[]>([]);
  
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [programmedExpenses, setProgrammedExpenses] = useState<any[]>([]);
  const [realExpenses, setRealExpenses] = useState<any[]>([]);
  const [initialBalance, setInitialBalance] = useState(0);

  const [isLoading, setIsLoading] = useState(false);

  const [editingCell, setEditingCell] = useState<{
    collectionName: string;
    entityId: string;
    day: number;
    value: string;
  } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [activeRecord, setActiveRecord] = useState<CashFlowRecord | undefined>(undefined);

  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Catalogs from Bind
      const [locRes, bankRes] = await Promise.all([
         fetch('/api/erp/locations'),
         fetch('/api/erp/bank-accounts')
      ]);
      const locData = await locRes.json();
      const bankData = await bankRes.json();
      
      setLocations(Array.isArray(locData) ? locData : locData.locations || []);
      setBanks(bankData.value || []);

      // 2. Fetch Firestore Manual Data
      const qRange = [
        where("month", "==", month),
        where("year", "==", year)
      ];
      
      const [snapFor, snapInc, snapProg, expRes] = await Promise.all([
         getDocs(query(collection(db, 'cf_forecasts'), ...qRange)),
         getDocs(query(collection(db, 'cf_incomes'), ...qRange)),
         getDocs(query(collection(db, 'cf_programmed_expenses'), ...qRange)),
         fetch(`/api/erp/expenses?month=${month}&year=${year}`)
      ]);

      setForecasts(snapFor.docs.map(d => ({ id: d.id, ...d.data() })));
      setIncomes(snapInc.docs.map(d => ({ id: d.id, ...d.data() })));
      setProgrammedExpenses(snapProg.docs.map(d => ({ id: d.id, ...d.data() })));
      
      const expData = await expRes.json();
      setRealExpenses(expData.value || []);
      
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month, year]);

  const handleCellClickEdit = (collectionName: string, entityId: string, day: number, currentValue: number) => {
    setEditingCell({ collectionName, entityId, day, value: currentValue > 0 ? currentValue.toString() : "" });
  };

  const handleCellSubmit = async () => {
    if (!editingCell) return;
    const { collectionName, entityId, day, value } = editingCell;
    const originalValue = getAmount(collectionName === "cf_forecasts" ? forecasts : incomes, entityId, day);
    
    setEditingCell(null); 

    const amount = parseFloat(value || "0");
    if (isNaN(amount) || amount < 0) return alert("Monto inválido");
    if (amount === originalValue) return;

    try {
      let stateArray = incomes;
      let setArray = setIncomes;
      if (collectionName === "cf_forecasts") {
          stateArray = forecasts;
          setArray = setForecasts;
      }

      const existing = stateArray.find(x => x.entityId === entityId && x.day === day && x.month === month && x.year === year);

      if (existing) {
         // Optimistic local UI update
         setArray(stateArray.map(item => item.id === existing.id ? { ...item, amount } : item));
         
         // Background sync without blocking UI
         await updateDoc(doc(db, collectionName, existing.id), { amount });
      } else if (amount > 0) {
         // We generate local sync after fast creation
         const docRef = await addDoc(collection(db, collectionName), {
            entityId, day, month, year, amount, createdAt: new Date()
         });
         setArray([...stateArray, { id: docRef.id, entityId, day, month, year, amount }]);
      }
    } catch (error) {
      console.error("Error background sync:", error);
      // Optional: small toast notification instead of alert for errors
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleCellSubmit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleSaveExpense = async (formData: Partial<CashFlowRecord>) => {
    if (formData.isProgrammed) {
        await addDoc(collection(db, "cf_programmed_expenses"), {
          ...formData, Date: new Date().toISOString()
        });
    } else {
        const payload = {
          ProviderID: formData.providerId,
          AccountID: formData.accountId,
          LocationID: "00000000-0000-0000-0000-000000000000",
          Amount: formData.amount,
          Concept: formData.concept,
          Date: `${formData.year}-${String(formData.month).padStart(2,'0')}-${String(formData.day).padStart(2,'0')}`
        };
        const res = await fetch("/api/erp/expenses", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
    }
    setIsModalOpen(false);
    fetchData();
  };

  const getAmount = (arr: any[], entityId: string, day: number) => {
     return arr.find(x => x.entityId === entityId && x.day === day)?.amount || 0;
  };
  const getRowTotal = (arr: any[], entityId: string) => {
     return arr.filter(x => x.entityId === entityId).reduce((s, x) => s + x.amount, 0);
  };

  const formatSec = (val: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-card border rounded-lg shadow-sm">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p>Sincronizando con Firestore y Bind ERP...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-card shadow-sm overflow-x-auto pb-4">
         <table className="w-full text-sm font-variant-numeric border-collapse min-w-[2000px]">
           <thead>
             <tr className="bg-muted text-muted-foreground uppercase text-xs tracking-wider sticky top-0 z-10 shadow-sm">
               <th className="p-3 text-left sticky left-0 z-20 bg-muted border-r min-w-[200px]">Agrupador</th>
               {daysArray.map(day => (
                 <th key={day} className="p-3 border-r min-w-[50px] text-center font-semibold">{day}</th>
               ))}
               <th className="p-3 text-right bg-muted font-bold min-w-[120px] border-r">TOTAL</th>
             </tr>
           </thead>
           <tbody>
             {/* ----------------- PRONOSTICO DE VENTAS (METAS) ----------------- */}
             <tr>
               <td colSpan={daysInMonth + 2} className="bg-blue-500/10 border-t border-b shadow-inner p-0">
                 <div className="sticky left-0 p-3 w-max text-blue-700 dark:text-blue-400 font-bold z-20 bg-blue-50 dark:bg-slate-900 shadow-[inset_-4px_0_10px_-10px_rgba(0,0,0,0.3)]">
                   1. META MENSUAL
                 </div>
               </td>
             </tr>
             {locations.map(loc => {
               const rowTotal = getRowTotal(forecasts, loc.id || loc.ID);
               return (
                 <tr key={loc.id || loc.ID} className="hover:bg-muted/30">
                   <td className="p-3 sticky left-0 z-20 bg-card border-r border-b font-medium text-muted-foreground">{loc.name || loc.Name}</td>
                   {daysArray.map(day => {
                     const val = getAmount(forecasts, loc.id || loc.ID, day);
                     const isEditing = editingCell?.collectionName === 'cf_forecasts' && editingCell?.entityId === (loc.id || loc.ID) && editingCell?.day === day;
                     return (
                       <td 
                         key={day} 
                         className="p-1 min-w-[80px] text-right border-r border-b hover:bg-blue-100 transition-colors bg-white relative"
                         onClick={() => !isEditing && handleCellClickEdit('cf_forecasts', loc.id || loc.ID, day, val)}
                       >
                         {isEditing ? (
                           <input 
                             autoFocus
                             className="w-full h-full text-right bg-blue-50 border border-blue-500 rounded p-1 outline-none text-sm font-semibold"
                             value={editingCell.value}
                             onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                             onBlur={handleCellSubmit}
                             onKeyDown={handleCellKeyDown}
                           />
                         ) : (
                           <div className="w-full h-full p-2 cursor-pointer">
                             {val > 0 ? <span className="font-semibold text-blue-600">{formatSec(val)}</span> : <span className="opacity-20">-</span>}
                           </div>
                         )}
                       </td>
                     );
                   })}
                   <td className="p-3 text-right font-bold border-r border-b bg-blue-50/50">{formatSec(rowTotal)}</td>
                 </tr>
               );
             })}
             
             {/* Total Metas Row */}
             <tr className="bg-blue-50/50">
               <td className="p-3 sticky left-0 bg-blue-100 dark:bg-blue-900/40 border-r border-b font-bold text-blue-800 text-right z-20">TOTAL METAS:</td>
               {daysArray.map(day => {
                 const dayTotal = forecasts.filter(x => parseInt(String(x.day)) === day).reduce((s, x) => s + (x.amount || 0), 0);
                 return (
                   <td key={day} className="p-3 text-right font-bold text-blue-800 border-r border-b">
                     {dayTotal > 0 ? formatSec(dayTotal) : '-'}
                   </td>
                 );
               })}
               <td className="p-3 text-right font-black text-blue-900 border-r border-b bg-blue-100/50">
                 {formatSec(forecasts.reduce((s, x) => s + (x.amount || 0), 0))}
               </td>
             </tr>

             {/* ----------------- INGRESOS REALES ----------------- */}
             <tr>
               <td colSpan={daysInMonth + 2} className="bg-emerald-500/10 border-t border-b shadow-inner p-0">
                 <div className="sticky left-0 p-3 w-max text-emerald-700 dark:text-emerald-400 font-bold z-20 bg-emerald-50 dark:bg-slate-900 shadow-[inset_-4px_0_10px_-10px_rgba(0,0,0,0.3)]">
                   2. INGRESOS REALES (CAPTURA BANCARIA DIARIA)
                 </div>
               </td>
             </tr>
             {banks.map(bank => {
               const rowTotal = getRowTotal(incomes, bank.ID);
               return (
                 <tr key={bank.ID} className="hover:bg-muted/30">
                   <td className="p-3 sticky left-0 z-20 bg-card border-r border-b font-medium text-muted-foreground" title={bank.Name}>{bank.Name}</td>
                   {daysArray.map(day => {
                     const val = getAmount(incomes, bank.ID, day);
                     const isEditing = editingCell?.collectionName === 'cf_incomes' && editingCell?.entityId === bank.ID && editingCell?.day === day;

                     return (
                       <td 
                         key={day} 
                         className="p-1 min-w-[80px] text-right border-r border-b hover:bg-emerald-100 transition-colors bg-white relative"
                         onClick={() => !isEditing && handleCellClickEdit('cf_incomes', bank.ID, day, val)}
                       >
                         {isEditing ? (
                           <input 
                             autoFocus
                             className="w-full h-full text-right bg-emerald-50 border border-emerald-500 rounded p-1 outline-none text-sm font-semibold"
                             value={editingCell.value}
                             onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                             onBlur={handleCellSubmit}
                             onKeyDown={handleCellKeyDown}
                           />
                         ) : (
                           <div className="w-full h-full p-2 cursor-pointer">
                             {val > 0 ? <span className="font-semibold text-emerald-600">{formatSec(val)}</span> : <span className="opacity-20">-</span>}
                           </div>
                         )}
                       </td>
                     );
                   })}
                   <td className="p-3 text-right font-bold text-emerald-600 border-r border-b bg-emerald-50/50">{formatSec(rowTotal)}</td>
                 </tr>
               );
             })}

             {/* Total Incomes Row */}
             <tr className="bg-emerald-50/50">
               <td className="p-3 sticky left-0 bg-emerald-100 dark:bg-emerald-900/40 border-r border-b font-bold text-emerald-800 text-right z-20">TOTAL INGRESOS:</td>
               {daysArray.map(day => {
                 const dayTotal = incomes.filter(x => parseInt(String(x.day)) === day).reduce((s, x) => s + (x.amount || 0), 0);
                 return (
                   <td key={day} className="p-3 text-right font-bold text-emerald-800 border-r border-b">
                     {dayTotal > 0 ? formatSec(dayTotal) : '-'}
                   </td>
                 );
               })}
               <td className="p-3 text-right font-black text-emerald-900 border-r border-b bg-emerald-100/50">
                 {formatSec(incomes.reduce((s, x) => s + (x.amount || 0), 0))}
               </td>
             </tr>

             {/* ----------------- GASTOS Y ÓRDENES DE COMPRA (PROVEEDORES) ----------------- */}
             <tr>
               <td colSpan={daysInMonth + 2} className="bg-rose-500/10 border-t border-b shadow-inner p-0">
                 <div className="sticky left-0 p-3 w-max text-rose-700 dark:text-rose-400 font-bold z-20 bg-rose-50 dark:bg-slate-900 shadow-[inset_-4px_0_10px_-10px_rgba(0,0,0,0.3)]">
                   3. EGRESOS Y PAGOS (ÓRDENES DE COMPRA + PROGRAMADOS)
                 </div>
               </td>
             </tr>
             {(() => {
                // Find all unique providers from both sources
                const providerMap = new Map();
                
                // Real DB programmed expenses might have providerId or costCenterId
                programmedExpenses.forEach(x => {
                    const id = x.providerId || x.costCenterId || 'unknown';
                    const name = x.providerName || x.concept || 'Proveedor Prógramado';
                    if (!providerMap.has(id)) providerMap.set(id, name);
                });
                
                realExpenses.forEach(x => {
                    // API returns costCenterId mapped as ProviderID, and providerName
                    const id = x.costCenterId || 'unknown'; 
                    const name = x.providerName || 'Proveedor General';
                    if (!providerMap.has(id)) providerMap.set(id, name);
                });

                const uniqueProviders = Array.from(providerMap.keys()).map(id => ({ ID: id, Name: providerMap.get(id) }));
                
                return uniqueProviders.length > 0 ? uniqueProviders : [{ID:'default', Name:'Sin Proveedor'}];
             })().map(provider => {
                const progExpenses = programmedExpenses.filter(x => (x.providerId || x.costCenterId) === provider.ID);
                const realBindExpenses = realExpenses.filter(x => x.costCenterId === provider.ID);
                const mixedExpenses = [...progExpenses, ...realBindExpenses];
                
                // If there are no expenses, don't show the Provider
                if (mixedExpenses.length === 0) return null;

                const rowTotal = mixedExpenses.reduce((s, x) => s + (x.amount || 0), 0);
                
                return (
                  <React.Fragment key={provider.ID}>
                    {/* Provider Grouping Header Row */}
                    <tr className="bg-muted/10">
                      <td className="p-0 border-r border-b" colSpan={daysInMonth + 2}>
                        <div className="sticky left-0 p-3 w-max font-bold text-foreground text-xs uppercase z-20 bg-slate-50 dark:bg-slate-900 shadow-[inset_-4px_0_10px_-10px_rgba(0,0,0,0.3)]">
                          {provider.Name}
                        </div>
                      </td>
                    </tr>

                    {/* Individual Expense Rows */}
                    {mixedExpenses.map((exp, expIdx) => (
                      <tr key={exp.id || expIdx} className="hover:bg-muted/20">
                        <td className="p-3 sticky left-0 z-20 bg-card border-r border-b text-xs text-muted-foreground pl-8 shadow-[inset_4px_0_0_0_theme(colors.rose.300)]" title={exp.concept}>
                          <div className="flex flex-col gap-1">
                            <span className="line-clamp-1">{exp.concept || 'Gasto sin concepto'} {exp.isProgrammed ? '(Prog.)' : ''}</span>
                            {exp.statusText && exp.statusText !== 'Desconocido' && (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] w-fit font-semibold tracking-wide ${
                                  exp.status === 1 ? 'bg-amber-100 text-amber-700' :
                                  exp.status === 2 ? 'bg-emerald-100 text-emerald-700' :
                                  exp.status === 4 ? 'bg-red-100 text-red-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {exp.statusText}
                                </span>
                            )}
                          </div>
                        </td>
                        {daysArray.map(day => {
                          const isMatch = parseInt(String(exp.day)) === day;
                          return (
                            <td 
                              key={day} 
                              className={`p-2 text-right border-r border-b relative group ${isMatch ? (exp.isProgrammed ? 'bg-amber-50' : 'bg-rose-50/40') : 'hover:bg-muted/50 cursor-pointer'}`}
                              onClick={() => {
                                if (!isMatch) {
                                  setSelectedDay(day);
                                  setActiveRecord(undefined); 
                                  setIsModalOpen(true);
                                }
                              }}
                            >
                              {isMatch ? (
                                <span className={`font-semibold text-xs ${exp.isProgrammed ? 'text-amber-600' : 'text-rose-600'}`}>
                                  {formatSec(exp.amount)}
                                </span>
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-3 h-3 text-rose-300"/></div>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 text-right text-xs font-semibold text-rose-600/60 border-r border-b">{formatSec(exp.amount)}</td>
                      </tr>
                    ))}
                    
                    {/* Subtotal Row for the Provider */}
                    {mixedExpenses.length > 1 && (
                       <tr className="bg-rose-50/10">
                         <td className="p-2 sticky left-0 bg-rose-100 dark:bg-rose-900 border-r border-b text-xs font-semibold text-rose-700 text-right pr-4 z-20">
                           Subtotal {provider.Name}:
                         </td>
                         {daysArray.map(day => {
                           const dayTotal = mixedExpenses.filter(x => parseInt(String(x.day)) === day).reduce((s, x) => s + (x.amount || 0), 0);
                           return (
                             <td key={day} className="p-2 text-right border-r border-b text-xs font-bold text-rose-700">
                               {dayTotal > 0 ? formatSec(dayTotal) : '-'}
                             </td>
                           );
                         })}
                         <td className="p-2 text-right text-xs font-bold text-rose-700 border-r border-b bg-rose-50/50">{formatSec(rowTotal)}</td>
                       </tr>
                    )}
                  </React.Fragment>
                );
              })}

             {/* Total Expenses Row */}
             <tr className="bg-rose-50/50">
               <td className="p-3 sticky left-0 bg-rose-100 dark:bg-rose-900/40 border-r border-b font-bold text-rose-800 text-right z-20">TOTAL EGRESOS:</td>
               {daysArray.map(day => {
                 const dayTotal = [...programmedExpenses, ...realExpenses].filter(x => parseInt(String(x.day)) === day).reduce((s, x) => s + (x.amount || 0), 0);
                 return (
                   <td key={day} className="p-3 text-right font-bold text-rose-800 border-r border-b">
                     {dayTotal > 0 ? formatSec(dayTotal) : '-'}
                   </td>
                 );
               })}
               <td className="p-3 text-right font-black text-rose-900 border-r border-b bg-rose-100/50">
                 {formatSec([...programmedExpenses, ...realExpenses].reduce((s, x) => s + (x.amount || 0), 0))}
               </td>
             </tr>

             {/* ----------------- FLUJO DE EFECTIVO RESUMEN ----------------- */}
             <tr>
               <td colSpan={daysInMonth + 2} className="bg-accent/10 border-t border-b mt-4 p-0">
                 <div className="sticky left-0 p-3 w-max text-accent font-bold z-20 bg-slate-100 dark:bg-slate-800 shadow-[inset_-4px_0_10px_-10px_rgba(0,0,0,0.3)]">
                   FLUJO DIARIO NETO
                 </div>
               </td>
             </tr>
             <tr className="bg-muted/20 font-bold">
               <td className="p-3 sticky left-0 bg-slate-200 dark:bg-slate-800 border-r text-foreground shadow-[1px_0_0_0_theme(colors.border)] z-20">
                 Saldo Final del Día
               </td>
               {daysArray.map(day => {
                 const inDay = incomes.filter(x => parseInt(String(x.day)) === day).reduce((s, x) => s + (x.amount || 0), 0);
                 const progExpDay = programmedExpenses.filter(x => parseInt(String(x.day)) === day).reduce((s, x) => s + (x.amount || 0), 0);
                 const realExpDay = realExpenses.filter(x => parseInt(String(x.day)) === day).reduce((s, x) => s + (x.amount || 0), 0);
                 const outDay = progExpDay + realExpDay;

                 // Accumulate running balance if needed, or just day net
                 // Since it's Flujo Diario Neto, let's just do (inDay - outDay) for now
                 const netDay = inDay - outDay;

                 return (
                   <td key={day} className={`p-3 text-right border-r shadow-inner ${netDay < 0 ? 'text-rose-500' : 'text-accent'}`}>
                     {formatSec(netDay)}
                   </td>
                 );
               })}
               <td className="p-3 text-right border-r text-lg">-</td>
             </tr>

           </tbody>
         </table>
      </div>

      <CashFlowModal
         isOpen={isModalOpen}
         onClose={() => setIsModalOpen(false)}
         day={selectedDay}
         month={month}
         year={year}
         existingRecord={activeRecord}
         title={`Capturar Gasto - Día ${selectedDay}`}
         onSave={handleSaveExpense}
      />
    </div>
  );
}
