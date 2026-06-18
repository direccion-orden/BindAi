import React, { useState, useEffect, useRef } from "react";
import { doc, collection, addDoc, updateDoc, setDoc, increment, query, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, DollarSign, Calendar, CreditCard, FileText, BookOpen, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NewExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
}

export function NewExpenseModal({ isOpen, onClose, companyId }: NewExpenseModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Form Fields
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [vendorId, setVendorId] = useState("");
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(0.16); // Default 16%
  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");

  const [isPaidImmediately, setIsPaidImmediately] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");

  // Catalog Data
  const [vendors, setVendors] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [accountingAccounts, setAccountingAccounts] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [vatAccounts, setVatAccounts] = useState<any[]>([]);

  const vendorSelectorRef = useRef<HTMLDivElement>(null);

  // Click outside for vendor autocomplete list
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (vendorSelectorRef.current && !vendorSelectorRef.current.contains(event.target as Node)) {
        setShowVendorDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Catalogs
  useEffect(() => {
    if (!isOpen || !companyId) return;

    // Load vendors
    const unsubV = onSnapshot(query(collection(db, "companies", companyId, "vendors")), (snap) => {
      setVendors(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.LegalName || data.name || data.CommercialName || "Proveedor sin nombre",
          rfc: data.rfc || data.RFC || ""
        };
      }));
    });

    // Load locations
    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      })));
    });

    // Load accounts
    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccountingAccounts(allAcc);
      setExpenseAccounts(allAcc.filter((a: any) => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2));
      setVatAccounts(allAcc.filter((a: any) => a.code.startsWith("118") && a.level >= 2));
    });

    // Load bank accounts
    const unsubBank = onSnapshot(query(collection(db, "companies", companyId, "bankAccounts")), (snap) => {
      setBankAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubV();
      unsubLoc();
      unsubAcc();
      unsubBank();
    };
  }, [isOpen, companyId]);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split("T")[0]);
      setVendorId("");
      setVendorSearchQuery("");
      setShowVendorDropdown(false);
      setConcept("");
      setAmount(0);
      setVatRate(0.16);
      setLocationId("");
      setAccountId("");
      setIsPaidImmediately(false);
      setBankAccountId("");
      setMethod("Transferencia");
      setReference("");
    }
  }, [isOpen]);

  const filteredVendors = vendors.filter(v => {
    const q = vendorSearchQuery.toLowerCase();
    return (v.name || "").toLowerCase().includes(q) || (v.rfc || "").toLowerCase().includes(q);
  });

  const handleVendorSelect = (vendor: any) => {
    setVendorId(vendor.id);
    setVendorSearchQuery(vendor.name);
    setShowVendorDropdown(false);
  };

  const handleClearVendor = () => {
    setVendorId("");
    setVendorSearchQuery("");
    setShowVendorDropdown(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!vendorId) {
      alert("Debes seleccionar un proveedor.");
      return;
    }
    if (!accountId) {
      alert("Debes seleccionar una Cuenta de Gasto.");
      return;
    }
    if (!locationId) {
      alert("Debes seleccionar una sucursal.");
      return;
    }
    if (amount <= 0) {
      alert("El monto debe ser mayor a 0.");
      return;
    }

    if (isPaidImmediately && !bankAccountId) {
      alert("Debes seleccionar una Cuenta de Banco (Origen).");
      return;
    }

    setLoading(true);
    try {
      const expenseId = crypto.randomUUID();
      const vendorName = vendors.find(v => v.id === vendorId)?.name || "Proveedor General";
      const locationName = locations.find(l => l.id === locationId)?.name || "";
      const expenseAccount = expenseAccounts.find(a => a.id === accountId);

      // Create Expense Record
      const expenseDoc = {
        id: expenseId,
        date,
        vendorId,
        vendorName,
        concept,
        amount,
        vatRate,
        locationId,
        locationName,
        accountId,
        accountCode: expenseAccount?.code || "",
        accountName: expenseAccount?.name || "",
        paidAmount: isPaidImmediately ? amount : 0,
        status: isPaidImmediately ? "paid" : "pending",
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Unknown"
      };

      await setDoc(doc(db, "companies", companyId, "expenses", expenseId), expenseDoc);

      if (isPaidImmediately) {
        // Register payment outflow
        const paymentData = {
          amount,
          date,
          method,
          reference,
          documentId: expenseId,
          documentType: "gasto_manual",
          documentNumber: `GM-${expenseId.substring(0, 8)}`,
          providerName: vendorName,
          bankAccountId,
          expenseAccountId: accountId,
          createdAt: new Date().toISOString()
        };

        const paymentRef = await addDoc(collection(db, "companies", companyId, "outflows"), paymentData);

        // Create Journal Entry
        const physicalBankAccount = bankAccounts.find(b => b.id === bankAccountId);
        const bankAccountingId = physicalBankAccount?.accountId;
        const bankAccountingAccount = bankAccountingId ? accountingAccounts.find(a => a.id === bankAccountingId) : null;

        if (bankAccountingAccount) {
          let subtotalAmount = amount;
          let vatAmount = 0;
          let vatAccount = null;

          if (vatRate > 0) {
            subtotalAmount = amount / (1 + vatRate);
            vatAmount = amount - subtotalAmount;
            vatAccount = vatAccounts[0];
          }

          const entries = [
            {
              accountId: accountId,
              accountCode: expenseAccount?.code || "",
              accountName: expenseAccount?.name || "",
              debit: subtotalAmount,
              credit: 0
            },
            {
              accountId: bankAccountingId,
              accountCode: bankAccountingAccount.code,
              accountName: bankAccountingAccount.name,
              debit: 0,
              credit: amount
            }
          ];

          if (vatAmount > 0 && vatAccount) {
            entries.push({
              accountId: vatAccount.id,
              accountCode: vatAccount.code,
              accountName: vatAccount.name,
              debit: vatAmount,
              credit: 0
            });
          }

          await addDoc(collection(db, "companies", companyId, "journal_entries"), {
            type: "egreso",
            date,
            description: `Pago de gasto manual GM-${expenseId.substring(0, 8)}`,
            referenceId: paymentRef.id,
            referenceType: "payment_outflow",
            createdAt: new Date().toISOString(),
            status: "activa",
            entries
          });

          // Update balances
          await updateDoc(doc(db, "companies", companyId, "accounts", accountId), {
            balance: increment(subtotalAmount)
          });
          await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
            balance: increment(-amount)
          });
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId), {
            balance: increment(-amount)
          });
          if (vatAmount > 0 && vatAccount) {
            await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
              balance: increment(vatAmount)
            });
          }
        }
      }

      alert("Gasto manual registrado exitosamente.");
      onClose();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (e) {
      console.error("Error creating manual expense:", e);
      alert("Error al registrar el gasto.");
    } finally {
      setLoading(false);
    }
  };

  const methods = ["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 my-auto">
        <div className="px-6 py-4 border-b bg-indigo-50 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2 text-indigo-950">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            Registrar Nuevo Gasto Operativo
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          <div className="grid grid-cols-2 gap-4">
            {/* Fecha */}
            <div className="space-y-1.5 col-span-1">
              <label className="text-xs font-semibold text-slate-700 uppercase">Fecha *</label>
              <Input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                required 
              />
            </div>

            {/* Proveedor */}
            <div className="space-y-1.5 col-span-1 relative" ref={vendorSelectorRef}>
              <label className="text-xs font-semibold text-slate-700 uppercase">Proveedor *</label>
              <div className="relative">
                <Input 
                  placeholder="Buscar proveedor..." 
                  value={vendorSearchQuery}
                  onChange={e => {
                    setVendorSearchQuery(e.target.value);
                    setShowVendorDropdown(true);
                  }}
                  onFocus={() => setShowVendorDropdown(true)}
                  className="pr-8"
                  required={!vendorId}
                />
                {vendorSearchQuery && (
                  <button
                    type="button"
                    onClick={handleClearVendor}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                )}
              </div>
              
              {showVendorDropdown && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {filteredVendors.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500 text-center">
                      No se encontraron proveedores
                    </div>
                  ) : (
                    filteredVendors.map(v => (
                      <div 
                        key={v.id}
                        className={`p-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors text-xs ${vendorId === v.id ? 'bg-indigo-50/50 font-medium' : ''}`}
                        onClick={() => handleVendorSelect(v)}
                      >
                        <div className="font-semibold text-slate-800">
                          {v.name}
                        </div>
                        {v.rfc && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            RFC: {v.rfc}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Concepto */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 uppercase">Concepto / Descripción *</label>
            <Input 
              placeholder="Ej. Compra de insumos de papelería para oficina..." 
              value={concept} 
              onChange={e => setConcept(e.target.value)} 
              required 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Sucursal */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase">Sucursal *</label>
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value="" disabled>Selecciona la sucursal...</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Clasificación Contable */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase">Cuenta de Gasto *</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value="" disabled>Selecciona clasificación...</option>
                {expenseAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border">
            {/* Monto Total */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase">Monto Total ($) *</label>
              <Input 
                type="number" 
                step="0.01" 
                min="0.01"
                value={amount || ""} 
                onChange={e => setAmount(parseFloat(e.target.value) || 0)} 
                className="text-lg font-bold"
                required 
              />
            </div>

            {/* Tasa de IVA */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase">Impuesto Incluido (IVA) *</label>
              <select
                value={vatRate}
                onChange={e => setVatRate(Number(e.target.value))}
                className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value={0.16}>16% (General)</option>
                <option value={0.08}>8% (Fronterizo)</option>
                <option value={0}>0% / Exento</option>
              </select>
            </div>
          </div>

          {/* Pago inmediato Switch */}
          <div className="flex items-center gap-2 py-2">
            <input 
              type="checkbox"
              id="isPaidImmediately"
              checked={isPaidImmediately}
              onChange={e => setIsPaidImmediately(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300"
            />
            <label htmlFor="isPaidImmediately" className="text-sm font-bold text-slate-800 cursor-pointer select-none">
              ¿Registrar pago de inmediato? (Afecta banco y genera egreso)
            </label>
          </div>

          {isPaidImmediately && (
            <div className="space-y-4 p-4 bg-rose-50/50 rounded-xl border border-rose-100 animate-in fade-in duration-300">
              <h3 className="text-xs font-bold uppercase text-rose-900 mb-2 border-b border-rose-100 pb-1 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-rose-600" />
                Detalles del Pago
              </h3>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 uppercase">Cuenta de Banco (Origen) *</label>
                <select
                  value={bankAccountId}
                  onChange={e => setBankAccountId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background"
                  required
                >
                  <option value="" disabled>Selecciona la cuenta origen...</option>
                  {bankAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name || a.Name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase">Método *</label>
                  <select 
                    value={method} 
                    onChange={e => setMethod(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                    required
                  >
                    {methods.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase">Referencia / Notas</label>
                  <Input 
                    placeholder="Ej. SPEI 12345"
                    value={reference} 
                    onChange={e => setReference(e.target.value)} 
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Registrar Gasto
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
