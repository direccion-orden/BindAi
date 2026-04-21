"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import type { CashFlowRecord, BindERPProvider, BindERPAccount } from "@/types/cashFlow";

interface CashFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  day: number;
  month: number;
  year: number;
  existingRecord?: CashFlowRecord;
  onSave: (data: Partial<CashFlowRecord>) => Promise<void>;
  title: string;
}

export function CashFlowModal({
  isOpen,
  onClose,
  day,
  month,
  year,
  existingRecord,
  onSave,
  title
}: CashFlowModalProps) {
  const [amount, setAmount] = useState(existingRecord?.amount?.toString() || "");
  const [concept, setConcept] = useState(existingRecord?.concept || "");
  const [providerId, setProviderId] = useState(existingRecord?.providerId || "");
  const [providerQuery, setProviderQuery] = useState("");
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [accountId, setAccountId] = useState(existingRecord?.accountId || "");
  const [isProgrammed, setIsProgrammed] = useState(existingRecord?.isProgrammed || false);
  
  const [providers, setProviders] = useState<BindERPProvider[]>([]);
  const [banks, setBanks] = useState<BindERPAccount[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (existingRecord) {
        setAmount(existingRecord.amount.toString());
        setConcept(existingRecord.concept);
        setProviderId(existingRecord.providerId || "");
        setAccountId(existingRecord.accountId || "");
        setIsProgrammed(existingRecord.isProgrammed || false);
      } else {
        setAmount("");
        setConcept("");
        setProviderId("");
        setProviderQuery("");
        setAccountId("");
        setIsProgrammed(false);
      }
      fetchCatalogs();
    }
  }, [isOpen, existingRecord]);

  useEffect(() => {
    if (providerId && providers.length > 0) {
      const p = providers.find(x => x.ID === providerId);
      if (p) setProviderQuery(p.LegalName);
    }
  }, [providerId, providers]);

  const fetchCatalogs = async () => {
    setIsLoadingCatalogs(true);
    try {
      const [provRes, bankRes] = await Promise.all([
         fetch('/api/erp/providers'),
         fetch('/api/erp/bank-accounts')
      ]);
      const provData = await provRes.json();
      const bankData = await bankRes.json();
      
      setProviders(provData.providers || []);
      setBanks(bankData.value || []);
    } catch (e) {
      console.error("Error fetching catalogs", e);
    } finally {
      setIsLoadingCatalogs(false);
    }
  };

  const handleSave = async () => {
    if (!amount || !providerId || !concept || (!isProgrammed && !accountId)) {
      return alert("Por favor llena todos los campos: Proveedor, Monto, Concepto (y Cuenta si no está programado).");
    }
    
    setIsSubmitting(true);
    try {
      await onSave({
        day, month, year,
        amount: parseFloat(amount),
        concept,
        providerId,
        accountId: accountId || undefined,
        isProgrammed,
        isApplied: isProgrammed ? false : undefined
      });
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error al guardar: " + String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
      <div className="w-full max-w-md bg-background h-full shadow-xl flex flex-col animate-in slide-in-from-right">
        <div className="p-6 border-b flex justify-between items-center bg-card">
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:bg-muted p-2 rounded-full">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
           <div className="text-sm text-muted-foreground mb-4 bg-muted/30 p-2 rounded-md">
             Registro para el: <span className="font-bold text-foreground">{day}/{month}/{year}</span>
           </div>

           {isLoadingCatalogs ? (
             <div className="flex justify-center p-8"><Loader2 className="animate-spin w-6 h-6" /></div>
           ) : (
             <>
               <div className="space-y-2">
                 <label className="text-sm font-medium">Concepto principal</label>
                 <Input 
                   placeholder="Ej: Pago de Luz, Papelería..." 
                   value={concept} 
                   onChange={(e) => setConcept(e.target.value)}
                 />
               </div>
               <div className="space-y-2">
                 <label className="text-sm font-medium">Monto del gasto ($ MXN)</label>
                 <Input 
                   type="number" 
                   step="0.01"
                   placeholder="0.00" 
                   value={amount} 
                   onChange={(e) => setAmount(e.target.value)}
                 />
               </div>
               <div className="space-y-2 relative z-50">
                 <label className="text-sm font-medium">Proveedor (buscar)</label>
                 <Input 
                   placeholder="Escribe el nombre o RFC..." 
                   value={providerQuery}
                   onFocus={() => setShowProviderMenu(true)}
                   onChange={(e) => {
                     setProviderQuery(e.target.value);
                     setShowProviderMenu(true);
                     if (providerId) setProviderId(""); // Limpiar ID si modifica texto
                   }}
                 />
                 {showProviderMenu && (
                   <>
                     <div className="fixed inset-0" onClick={() => setShowProviderMenu(false)} />
                     <div className="absolute z-50 w-full mt-1 bg-card border text-card-foreground rounded-md shadow-lg max-h-48 overflow-y-auto">
                       {providers
                         .filter(p => 
                           p.LegalName.toLowerCase().includes(providerQuery.toLowerCase()) || 
                           p.RFC?.toLowerCase().includes(providerQuery.toLowerCase())
                         )
                         .map(p => (
                           <div 
                             key={p.ID} 
                             className="px-3 py-2 text-sm cursor-pointer hover:bg-muted border-b last:border-0"
                             onClick={() => {
                               setProviderId(p.ID);
                               setProviderQuery(p.LegalName);
                               setShowProviderMenu(false);
                             }}
                           >
                             <div className="font-medium">{p.LegalName}</div>
                             <div className="text-xs text-muted-foreground">{p.RFC}</div>
                           </div>
                       ))}
                       {providers.filter(p => 
                           p.LegalName.toLowerCase().includes(providerQuery.toLowerCase()) || 
                           p.RFC?.toLowerCase().includes(providerQuery.toLowerCase())
                         ).length === 0 && (
                           <div className="px-3 py-3 text-sm text-muted-foreground text-center italic">
                             No se encontraron proveedores
                           </div>
                       )}
                     </div>
                   </>
                 )}
               </div>
               <div className="space-y-4 pt-2">
                 <div className="flex items-center space-x-2 bg-primary/5 p-3 rounded-md border border-primary/20">
                   <input 
                     type="checkbox" 
                     id="isProgrammed"
                     className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                     checked={isProgrammed}
                     onChange={(e) => setIsProgrammed(e.target.checked)}
                   />
                   <label htmlFor="isProgrammed" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                     Gasto Programado (Guardar para aplicar después)
                   </label>
                 </div>
               </div>

               {!isProgrammed && (
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Cuenta origen de pago</label>
                   <select 
                     className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                     value={accountId}
                     onChange={e => setAccountId(e.target.value)}
                   >
                     <option value="">-- Seleccionar Cuenta / Banco --</option>
                     {banks.map((b: any) => (
                       <option key={b.ID} value={b.ID}>{b.Name}</option>
                     ))}
                   </select>
                 </div>
               )}
             </>
           )}
        </div>

        <div className="p-6 border-t bg-muted/10 grid grid-cols-2 gap-3 mt-auto">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSubmitting || isLoadingCatalogs}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existingRecord ? 'Actualizar Gasto' : isProgrammed ? 'Guardar Programado' : 'Crear en Bind ERP'}
          </Button>
        </div>
      </div>
    </div>
  );
}
