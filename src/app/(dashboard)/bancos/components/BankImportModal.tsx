"use client";

import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import { doc, collection, writeBatch, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, X, ArrowRight, CheckCircle2, FileText, AlertCircle, Info, ShieldCheck } from "lucide-react";
import { BankTransaction } from "@/types/bank";
import { parseBBVAPdf } from "@/lib/bank-parsers/bbva";

interface BankImportModalProps {
  accounts: any[];
  initialAccountId: string;
  onClose: () => void;
}

type ImportStep = 1 | 2 | 3 | 4 | 5; // 1: Upload, 2: Map (CSV), 3: De-duplicate, 4: Preview/Confirm, 5: Success

export function BankImportModal({ accounts, initialAccountId, onClose }: BankImportModalProps) {
  const { companyId } = useAuth();
  const [targetAccountId, setTargetAccountId] = useState(initialAccountId);
  const isCredit = accounts.find(a => a.id === targetAccountId)?.isCredit === true;
  const [step, setStep] = useState<ImportStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fileType, setFileType] = useState<"csv" | "pdf" | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);

  // Mapping state (for CSV)
  const [dateCol, setDateCol] = useState("");
  const [conceptCol, setConceptCol] = useState("");
  const [refCol, setRefCol] = useState("");
  const [amountStrategy, setAmountStrategy] = useState<"single" | "split">("single");
  const [amountCol, setAmountCol] = useState("");
  const [incomeCol, setIncomeCol] = useState("");
  const [expenseCol, setExpenseCol] = useState("");

  const [candidateTransactions, setCandidateTransactions] = useState<BankTransaction[]>([]);
  const [existingHashes, setExistingHashes] = useState<Set<string>>(new Set());
  const [finalTransactions, setFinalTransactions] = useState<(BankTransaction & { isDuplicate: boolean; selected: boolean })[]>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    if (file.type === "application/pdf") {
      setFileType("pdf");
      setLoading(true);
      try {
        const txs = await parseBBVAPdf(file);
        if (txs.length === 0) {
            throw new Error("No se encontraron movimientos en el PDF o el formato no es compatible.");
        }
        if (isCredit) {
          txs.forEach(t => {
            t.amount = -t.amount;
            t.type = t.amount > 0 ? "INCOME" : "EXPENSE";
          });
        }
        setCandidateTransactions(txs);
        await prepareDeduplication(txs);
      } catch (err: any) {
        setError(err.message || "Error al procesar PDF.");
        setLoading(false);
      }
    } else if (file.name.endsWith(".csv")) {
      setFileType("csv");
      setLoading(true);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          let text = "";
          try {
            const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
            text = utf8Decoder.decode(arrayBuffer);
          } catch (e) {
            // Fallback to ISO-8859-1 (Latin1)
            const latin1Decoder = new TextDecoder("iso-8859-1");
            text = latin1Decoder.decode(arrayBuffer);
          }

          Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
              setLoading(false);
              if (results.meta.fields) {
                setCsvHeaders(results.meta.fields);
                setCsvData(results.data);
                guessCSVColumns(results.meta.fields);
                setStep(2);
              } else {
                setError("El archivo CSV no tiene formato de columnas válido.");
              }
            },
            error: (err: any) => {
              setLoading(false);
              setError("Error al procesar CSV: " + err.message);
            }
          });
        } catch (err: any) {
          setLoading(false);
          setError("Error al leer el archivo: " + err.message);
        }
      };
      reader.onerror = () => {
        setLoading(false);
        setError("Error al cargar el archivo.");
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError("Solo se admiten archivos .csv y .pdf (BBVA).");
    }
  };

  const guessCSVColumns = (headers: string[]) => {
    const lower = headers.map(h => h.toLowerCase());
    const find = (keywords: string[]) => headers[lower.findIndex(h => keywords.some(k => h.includes(k)))];
    
    setDateCol(find(['fecha', 'date']) || "");
    setConceptCol(find(['concepto', 'descrip', 'detalle']) || "");
    setRefCol(find(['referencia', 'ref', 'folio']) || "");
    
    const amount = find(['monto', 'importe', 'amount']);
    if (amount) {
      setAmountStrategy("single");
      setAmountCol(amount);
    } else {
      const abono = find(['abono', 'deposito', 'income']);
      const cargo = find(['cargo', 'retiro', 'expense']);
      if (abono && cargo) {
        setAmountStrategy("split");
        setIncomeCol(abono);
        setExpenseCol(cargo);
      }
    }
  };

  const parseNumber = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleaned = val.toString().replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const parseDateStr = (val: any) => {
    if (!val) return "";
    const s = val.toString().trim();
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    return s;
  };

  const handleCSVMappingConfirm = async () => {
    if (!dateCol || !conceptCol || (amountStrategy === 'single' ? !amountCol : (!incomeCol || !expenseCol))) {
      setError("Faltan columnas por mapear.");
      return;
    }

    const txs: BankTransaction[] = [];
    csvData.forEach((row, i) => {
      let amount = 0;
      if (amountStrategy === "single") {
        amount = parseNumber(row[amountCol]);
      } else {
        const inc = parseNumber(row[incomeCol]);
        const exp = parseNumber(row[expenseCol]);
        if (inc !== 0) amount = Math.abs(inc);
        else if (exp !== 0) amount = -Math.abs(exp);
      }

      if (amount !== 0) {
        // Invert charges and credits for credit cards
        if (isCredit) {
          amount = -amount;
        }

        txs.push({
          id: `temp-${Date.now()}-${i}`,
          date: parseDateStr(row[dateCol]),
          concept: row[conceptCol]?.toString().trim() || "Sin concepto",
          reference: refCol ? row[refCol]?.toString().trim() : "",
          amount: amount,
          type: amount > 0 ? "INCOME" : "EXPENSE",
          createdAt: Date.now()
        });
      }
    });

    setCandidateTransactions(txs);
    await prepareDeduplication(txs);
  };

  const getTxHash = (tx: Partial<BankTransaction>) => {
    // Key fields for deduplication: date, amount (2 decimals), and part of concept
    const amt = (tx.amount || 0).toFixed(2);
    const concept = (tx.concept || "").toUpperCase().trim().substring(0, 50);
    const ref = (tx.reference || "").toUpperCase().trim();
    return `${tx.date}|${amt}|${concept}|${ref}`;
  };

  const prepareDeduplication = async (candidates: BankTransaction[]) => {
    if (!companyId || !targetAccountId) return;
    setLoading(true);
    try {
      const dates = candidates.map(t => t.date).filter(Boolean).sort();
      if (dates.length === 0) throw new Error("No se detectaron fechas válidas.");
      
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      // Fetch existing txs in range
      const q = query(
        collection(db, "companies", companyId, "bankAccounts", targetAccountId, "transactions"),
        where("date", ">=", minDate),
        where("date", "<=", maxDate)
      );
      
      const snap = await getDocs(q);
      const hashes = new Set<string>();
      snap.docs.forEach(doc => {
        hashes.add(getTxHash(doc.data() as BankTransaction));
      });

      setExistingHashes(hashes);
      
      const enriched = candidates.map(tx => {
        const isDuplicate = hashes.has(getTxHash(tx));
        return {
          ...tx,
          isDuplicate,
          selected: !isDuplicate // Auto-unselect duplicates
        };
      });

      setFinalTransactions(enriched);
      setStep(4);
    } catch (err: any) {
      setError("Error al validar duplicados: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const toImport = finalTransactions.filter(t => t.selected);
    if (toImport.length === 0) {
      setError("No hay movimientos seleccionados para importar.");
      return;
    }

    setLoading(true);
    try {
      const chunkSize = 400;
      const cid = companyId as string; // Guaranteed by check at start of function
      for (let i = 0; i < toImport.length; i += chunkSize) {
        const chunk = toImport.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(tx => {
            const { isDuplicate, selected, ...cleanTx } = tx;
            const txRef = doc(collection(db, "companies", cid, "bankAccounts", targetAccountId, "transactions"));
            batch.set(txRef, { ...cleanTx, id: txRef.id });
        });
        await batch.commit();
      }
      setStep(5);
    } catch (err) {
      setError("Error al guardar en la base de datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-lg w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b bg-muted/20 shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Importar Movimientos (CSV / PDF)
          </h2>
          {step !== 5 && (
             <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
               <X className="w-4 h-4" />
             </Button>
          )}
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 py-4">
              <div className="bg-slate-50 border rounded-xl p-5 space-y-3.5 max-w-md mx-auto text-left shadow-sm">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cuenta Bancaria de Destino *</label>
                  <select
                    value={targetAccountId}
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="h-11 w-full px-3 rounded-md border bg-background text-sm font-bold focus:ring-2 focus:ring-primary outline-none text-indigo-700"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{(acc.Name || acc.name)} ({(acc.CurrencyCode || acc.currency || 'MXN')})</option>
                    ))}
                  </select>
                  {isCredit && (
                    <div className="bg-purple-50 text-purple-700 border border-purple-200 p-3 rounded-lg text-xs flex items-start gap-2 mt-2">
                      <Info className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                      <span>
                        <strong>Tarjeta de Crédito:</strong> Los cargos y abonos se procesarán con lógica inversa de signos automáticamente.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center space-y-4 pt-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <UploadCloud className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Sube tu archivo bancario</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                    Aceptamos formatos <strong>.csv</strong> de cualquier banco y <strong>.pdf</strong> de BBVA (Maestra Pyme). 
                    Detectaremos automáticamente duplicados contra tus cargas previas.
                  </p>
                  <div className="relative inline-block">
                     <Button size="lg" className="cursor-pointer min-w-[240px]" disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Seleccionar Archivo
                     </Button>
                     <input 
                       type="file" 
                       accept=".csv,.pdf" 
                       onChange={handleFileUpload} 
                       className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                       disabled={loading}
                     />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                 <Info className="w-5 h-5 text-indigo-600" />
                 <div>
                    <h4 className="text-sm font-bold text-indigo-900">Mapeo de CSV</h4>
                    <p className="text-xs text-indigo-700">Identifica las columnas de tu archivo para procesar los movimientos.</p>
                 </div>
              </div>

              {isCredit && (
                <div className="bg-purple-50 text-purple-700 border border-purple-200 p-3 rounded-lg text-xs flex items-center gap-2">
                  <Info className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>
                    <strong>Tarjeta de Crédito detectada:</strong> La lógica de signos de cargos y abonos se invertirá automáticamente (cargos positivos, abonos negativos).
                  </span>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                   <label className="text-xs font-bold text-slate-500 uppercase">Fecha</label>
                   <select value={dateCol} onChange={e => setDateCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                      <option value="">Seleccionar...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                   </select>
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-xs font-bold text-slate-500 uppercase">Concepto</label>
                   <select value={conceptCol} onChange={e => setConceptCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                      <option value="">Seleccionar...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                   </select>
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-xs font-bold text-slate-500 uppercase">Referencia (Opcional)</label>
                   <select value={refCol} onChange={e => setRefCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                      <option value="">Ninguna</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                   </select>
                 </div>
              </div>

              <div className="bg-muted/30 p-4 rounded-xl border space-y-4">
                 <div className="space-y-1.5">
                   <label className="text-xs font-bold text-slate-500 uppercase">Estructura de Montos</label>
                   <select value={amountStrategy} onChange={e => setAmountStrategy(e.target.value as any)} className="w-full h-10 border rounded px-3 text-sm">
                      <option value="single">Una columna (Positivos/Negativos)</option>
                      <option value="split">Dos columnas (Cargos y Abonos)</option>
                   </select>
                 </div>

                 {amountStrategy === "single" ? (
                   <div className="space-y-1.5">
                     <label className="text-xs font-bold text-slate-500 uppercase">Columna de Monto</label>
                     <select value={amountCol} onChange={e => setAmountCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                        <option value="">Seleccionar...</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                     </select>
                   </div>
                 ) : (
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                       <label className="text-xs font-bold text-slate-500 uppercase">Cargos (-)</label>
                       <select value={expenseCol} onChange={e => setExpenseCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                          <option value="">Seleccionar...</option>
                          {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-xs font-bold text-slate-500 uppercase">Abonos (+)</label>
                       <select value={incomeCol} onChange={e => setIncomeCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                          <option value="">Seleccionar...</option>
                          {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                     </div>
                   </div>
                 )}
              </div>

              <div className="flex justify-between items-center pt-4">
                 <Button variant="ghost" onClick={() => setStep(1)}>Volver</Button>
                 <Button onClick={handleCSVMappingConfirm} disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Validar Movimientos <ArrowRight className="w-4 h-4 ml-2" />
                 </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                  <div className="flex items-center gap-3">
                     <ShieldCheck className="w-6 h-6 text-emerald-600" />
                     <div>
                        <h3 className="font-bold text-emerald-900 text-sm">Validación de Duplicados Completa</h3>
                        <p className="text-xs text-emerald-700">
                           Se detectaron {finalTransactions.filter(t => t.isDuplicate).length} movimientos ya registrados.
                        </p>
                     </div>
                  </div>
                  <Button onClick={handleImport} disabled={loading || finalTransactions.filter(t => t.selected).length === 0} className="bg-emerald-600 hover:bg-emerald-700 font-bold">
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Importar {finalTransactions.filter(t => t.selected).length} nuevos
                  </Button>
              </div>
              
              <div className="border rounded-xl overflow-hidden flex-1 flex flex-col max-h-[400px]">
                  <div className="overflow-y-auto custom-scrollbar">
                  <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0 z-10">
                          <tr>
                              <th className="px-3 py-2 text-left w-10">
                                 <input 
                                   type="checkbox" 
                                   checked={finalTransactions.every(t => t.selected)} 
                                   onChange={(e) => {
                                      const checked = e.target.checked;
                                      setFinalTransactions(prev => prev.map(t => ({ ...t, selected: checked })));
                                   }}
                                 />
                              </th>
                              <th className="px-3 py-2 text-left">Fecha</th>
                              <th className="px-3 py-2 text-left">Concepto / Ref</th>
                              <th className="px-3 py-2 text-right">Monto</th>
                              <th className="px-3 py-2 text-center">Estado</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y bg-background">
                          {finalTransactions.map((tx, idx) => (
                              <tr key={idx} className={`${tx.isDuplicate ? 'bg-amber-50/30' : ''} hover:bg-muted/20 transition-colors`}>
                                  <td className="px-3 py-2 text-center">
                                     <input 
                                       type="checkbox" 
                                       checked={tx.selected} 
                                       onChange={(e) => {
                                          const checked = e.target.checked;
                                          setFinalTransactions(prev => prev.map((t, i) => i === idx ? { ...t, selected: checked } : t));
                                       }}
                                     />
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground font-mono">{tx.date}</td>
                                  <td className="px-3 py-2">
                                     <p className="font-bold text-slate-700 truncate max-w-[250px]" title={tx.concept}>{tx.concept}</p>
                                     {tx.reference && <p className="text-[10px] text-muted-foreground truncate max-w-[250px]">{tx.reference}</p>}
                                  </td>
                                  <td className={`px-3 py-2 text-right font-bold ${tx.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                     {tx.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                     {tx.isDuplicate ? (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200">Duplicado</span>
                                     ) : (
                                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100">Nuevo</span>
                                     )}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  </div>
              </div>
              
              <div className="flex justify-between items-center pt-2">
                 <Button variant="ghost" size="sm" onClick={() => setStep(fileType === 'pdf' ? 1 : 2)}>Atrás</Button>
                 <p className="text-[10px] text-muted-foreground italic">Se excluyeron automáticamente los movimientos que coinciden exactamente en Fecha, Monto y Concepto.</p>
              </div>
            </div>
          )}

          {step === 5 && (
             <div className="text-center py-12 space-y-4">
                 <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 mb-4">
                     <CheckCircle2 className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-bold text-green-600">Importación Exitosa</h3>
                 <p className="text-muted-foreground">
                   Se importaron correctamente los nuevos movimientos a tu cuenta bancaria.
                 </p>
                 <div className="pt-6">
                    <Button onClick={onClose} size="lg" className="min-w-[200px]">Cerrar y Ver Historial</Button>
                 </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
