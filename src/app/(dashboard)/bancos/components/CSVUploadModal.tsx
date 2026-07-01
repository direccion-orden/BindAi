"use client";

import React, { useState } from "react";
import Papa from "papaparse";
import { doc, collection, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, UploadCloud, X, ArrowRight, CheckCircle2, FileText } from "lucide-react";
import { BankTransaction } from "@/types/bank";

interface CSVUploadModalProps {
  accounts: any[];
  initialAccountId: string;
  onClose: () => void;
}

export function CSVUploadModal({ accounts, initialAccountId, onClose }: CSVUploadModalProps) {
  const { companyId } = useAuth();
  const [targetAccountId, setTargetAccountId] = useState(initialAccountId);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Upload, 2: Map, 3: Preview, 4: Success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);

  // Mapping state
  const [dateCol, setDateCol] = useState("");
  const [conceptCol, setConceptCol] = useState("");
  const [amountStrategy, setAmountStrategy] = useState<"single" | "split">("single");
  const [amountCol, setAmountCol] = useState("");
  const [incomeCol, setIncomeCol] = useState("");
  const [expenseCol, setExpenseCol] = useState("");

  const [parsedTransactions, setParsedTransactions] = useState<BankTransaction[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.meta.fields) {
          setCsvHeaders(results.meta.fields);
          setCsvData(results.data);
          // Auto-guess columns
          const lowerHeaders = results.meta.fields.map(f => f.toLowerCase());
          
          const guessDate = results.meta.fields[lowerHeaders.findIndex(h => h.includes('fecha') || h.includes('date'))];
          const guessConcept = results.meta.fields[lowerHeaders.findIndex(h => h.includes('concepto') || h.includes('descrip') || h.includes('detalle'))];
          const guessAmount = results.meta.fields[lowerHeaders.findIndex(h => h === 'monto' || h === 'importe' || h === 'amount')];
          
          if (guessDate) setDateCol(guessDate);
          if (guessConcept) setConceptCol(guessConcept);
          if (guessAmount) {
            setAmountStrategy("single");
            setAmountCol(guessAmount);
          } else {
            const guessAbono = results.meta.fields[lowerHeaders.findIndex(h => h.includes('abono') || h.includes('deposito'))];
            const guessCargo = results.meta.fields[lowerHeaders.findIndex(h => h.includes('cargo') || h.includes('retiro'))];
            if (guessAbono && guessCargo) {
              setAmountStrategy("split");
              setIncomeCol(guessAbono);
              setExpenseCol(guessCargo);
            }
          }

          setStep(2);
        } else {
          setError("El archivo CSV no tiene formato de columnas válido.");
        }
      },
      error: (err) => {
        setError("Error al leer CSV: " + err.message);
      }
    });
  };

  const parseNumber = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    // Remove currency symbols, spaces and replace comma with nothing if it's thousands separator
    // If comma is decimal separator (e.g. 1.200,50), it requires more logic. 
    // Assuming standard format (1,200.50)
    const cleaned = val.toString().replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const parseDateStr = (val: any) => {
    if (!val) return "";
    const s = val.toString().trim();
    
    // Handle DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    // Handle YYYY/MM/DD or YYYY-MM-DD
    const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    }
    
    // Fallback to original if it already looks like YYYY-MM-DD
    return s;
  };

  const handlePreview = () => {
    if (!dateCol || !conceptCol) {
      setError("Debes seleccionar la columna de Fecha y Concepto.");
      return;
    }
    if (amountStrategy === "single" && !amountCol) {
      setError("Debes seleccionar la columna de Monto.");
      return;
    }
    if (amountStrategy === "split" && (!incomeCol || !expenseCol)) {
      setError("Debes seleccionar la columna de Cargos y Abonos.");
      return;
    }

    setError("");
    const txs: BankTransaction[] = [];
    
    csvData.forEach((row, i) => {
      let finalAmount = 0;
      if (amountStrategy === "single") {
        finalAmount = parseNumber(row[amountCol]);
      } else {
        const inc = parseNumber(row[incomeCol]);
        const exp = parseNumber(row[expenseCol]);
        if (inc > 0) finalAmount = inc;
        else if (exp > 0) finalAmount = -Math.abs(exp);
      }

      if (finalAmount !== 0) {
        txs.push({
          id: `csv-${Date.now()}-${i}`,
          date: parseDateStr(row[dateCol]),
          concept: row[conceptCol]?.toString().trim().substring(0, 100) || "Sin concepto",
          amount: finalAmount,
          type: finalAmount > 0 ? "INCOME" : "EXPENSE",
          createdAt: Date.now() + i
        });
      }
    });

    setParsedTransactions(txs);
    setStep(3);
  };

  const handleImport = async () => {
    if (!companyId || !targetAccountId) return;
    setLoading(true);
    try {
      // Batch write limits to 500 ops per batch
      // We will chunk it
      const chunkSize = 400;
      for (let i = 0; i < parsedTransactions.length; i += chunkSize) {
        const chunk = parsedTransactions.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        
        chunk.forEach(tx => {
            const txRef = doc(collection(db, "companies", companyId, "bankAccounts", targetAccountId, "transactions"));
            batch.set(txRef, { ...tx, id: txRef.id }); // replace temp ID with firestore ID
        });

        await batch.commit();
      }
      setStep(4);
    } catch (err) {
      console.error(err);
      setError("Error al guardar movimientos en la base de datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-lg w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b bg-muted/20 shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-primary" />
            Carga Masiva de Movimientos (CSV)
          </h2>
          {step !== 4 && (
             <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
               <X className="w-4 h-4" />
             </Button>
          )}
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-200">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6 py-4">
              <div className="bg-slate-50 border rounded-xl p-5 space-y-3.5 max-w-md mx-auto text-left shadow-sm">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider font-semibold text-slate-600">Cuenta Bancaria de Destino *</label>
                  <select
                    value={targetAccountId}
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="h-11 w-full px-3 rounded-md border bg-background text-sm font-bold focus:ring-2 focus:ring-primary outline-none text-indigo-700"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {(acc.Name || acc.name)} ({(acc.CurrencyCode || acc.currency || 'MXN')})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="text-center space-y-4 pt-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <FileText className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Sube tu archivo CSV</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                    Descarga los movimientos desde el portal de tu banco en formato CSV y súbelo aquí. En el siguiente paso te ayudaremos a identificar las columnas automáticamente.
                  </p>
                  <div className="relative inline-block">
                     <Button size="lg" className="cursor-pointer">Seleccionar Archivo .csv</Button>
                     <input 
                       type="file" 
                       accept=".csv" 
                       onChange={handleFileUpload} 
                       className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                     />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h3 className="font-bold text-lg">Mapeo de Columnas</h3>
              <p className="text-sm text-muted-foreground">Ayúdanos a identificar qué columna de tu CSV corresponde a cada dato.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/20 p-4 rounded-xl border">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Columna de Fecha</label>
                   <select value={dateCol} onChange={e => setDateCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                      <option value="">Seleccionar...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                   </select>
                 </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Columna de Concepto / Detalle</label>
                   <select value={conceptCol} onChange={e => setConceptCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                      <option value="">Seleccionar...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                   </select>
                 </div>
              </div>

              <div className="bg-muted/20 p-4 rounded-xl border space-y-4">
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Estructura de Montos en tu CSV</label>
                   <select value={amountStrategy} onChange={e => setAmountStrategy(e.target.value as any)} className="w-full h-10 border rounded px-3 text-sm">
                      <option value="single">Una columna (Montos positivos y negativos)</option>
                      <option value="split">Dos columnas (Cargos y Abonos separados)</option>
                   </select>
                 </div>

                 {amountStrategy === "single" ? (
                   <div className="space-y-2">
                     <label className="text-sm font-medium">Columna de Monto/Importe</label>
                     <select value={amountCol} onChange={e => setAmountCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                        <option value="">Seleccionar...</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                     </select>
                   </div>
                 ) : (
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <label className="text-sm font-medium">Columna de Cargos (Retiros)</label>
                       <select value={expenseCol} onChange={e => setExpenseCol(e.target.value)} className="w-full h-10 border rounded px-3 text-sm">
                          <option value="">Seleccionar...</option>
                          {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                       </select>
                     </div>
                     <div className="space-y-2">
                       <label className="text-sm font-medium">Columna de Abonos (Depósitos)</label>
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
                 <Button onClick={handlePreview}>Siguiente: Vista Previa <ArrowRight className="w-4 h-4 ml-2" /></Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                  <div>
                    <h3 className="font-bold text-lg">Vista Previa</h3>
                    <p className="text-sm text-muted-foreground">Revisa que los montos se hayan detectado correctamente ({parsedTransactions.length} movimientos).</p>
                  </div>
                  <Button onClick={handleImport} disabled={loading || parsedTransactions.length === 0} className="bg-green-600 hover:bg-green-700">
                      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      Confirmar Importación
                  </Button>
              </div>
              
              <div className="border rounded-xl overflow-hidden max-h-[350px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                          <tr>
                              <th className="px-3 py-2 text-left">Fecha</th>
                              <th className="px-3 py-2 text-left">Concepto</th>
                              <th className="px-3 py-2 text-right">Cargo</th>
                              <th className="px-3 py-2 text-right">Abono</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y bg-background">
                          {parsedTransactions.slice(0, 100).map((tx, idx) => (
                              <tr key={idx}>
                                  <td className="px-3 py-2 whitespace-nowrap">{tx.date}</td>
                                  <td className="px-3 py-2 truncate max-w-[200px]" title={tx.concept}>{tx.concept}</td>
                                  <td className="px-3 py-2 text-right text-red-600">{tx.amount < 0 ? tx.amount.toFixed(2) : ""}</td>
                                  <td className="px-3 py-2 text-right text-green-600">{tx.amount > 0 ? tx.amount.toFixed(2) : ""}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  {parsedTransactions.length > 100 && (
                      <div className="p-3 text-center text-xs text-muted-foreground bg-muted/20">
                          Y {parsedTransactions.length - 100} movimientos más...
                      </div>
                  )}
              </div>
              
              <div className="pt-2">
                 <Button variant="ghost" onClick={() => setStep(2)}>Atrás para re-mapear</Button>
              </div>
            </div>
          )}

          {step === 4 && (
             <div className="text-center py-12 space-y-4">
                 <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 mb-4">
                     <CheckCircle2 className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-bold text-green-600">Importación Exitosa</h3>
                 <p className="text-muted-foreground">
                   Se importaron {parsedTransactions.length} movimientos a la cuenta: <br />
                   <strong className="text-slate-800">
                     {accounts.find(a => a.id === targetAccountId)?.Name || accounts.find(a => a.id === targetAccountId)?.name || ""}
                   </strong>
                 </p>
                 <div className="pt-6">
                    <Button onClick={onClose} size="lg">Ir a Movimientos</Button>
                 </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
