"use client";

import { Percent, X, Plus, Search, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePOS } from "@/context/POSContext";
import { ClientSelector } from "@/components/pos/ClientSelector";
import { CheckoutModal } from "@/components/pos/CheckoutModal";
import { ClientInsightsPanel } from "@/components/pos/ClientInsightsPanel";
import { useState } from "react";

export function POSTotalsPanel() {
  const { 
    accounts, 
    activeAccountId, 
    activeAccount, 
    addAccount, 
    removeAccount, 
    setActiveAccount,
    setGlobalDiscount,
    setPromoCode,
    subtotal,
    totalDiscount,
    tax,
    total,
    promoError,
    appliedPromo
  } = usePOS();

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  return (
    <div className="w-[340px] h-full bg-card border rounded-lg flex flex-col shadow-sm overflow-hidden shrink-0">


      {/* Selector de Cuentas (Tabs) */}
      <div className="flex gap-2 overflow-x-auto p-2 border-b shrink-0 custom-scrollbar bg-card">
        {accounts.map((tab) => (
            <div 
                key={tab.id}
                onClick={() => setActiveAccount(tab.id)}
                className={`flex items-center gap-2 px-3 py-1 text-sm cursor-pointer border-r transition-colors ${activeAccountId === tab.id ? 'bg-card font-semibold border-b-2 border-b-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
            >
                {tab.name}
                {accounts.length > 1 && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeAccount(tab.id); }}
                      className="hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="w-3 h-3"/>
                    </button>
                )}
            </div>
        ))}
        <button 
          onClick={addAccount}
          className="px-3 py-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors" title="Nueva Cuenta"
        >
            <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Cliente */}
      <ClientSelector />

      {/* Panel de Insights y Espacio flexible */}
      {activeAccount.selectedClient && activeAccount.selectedClient.id !== "public" ? (
        <ClientInsightsPanel client={activeAccount.selectedClient} />
      ) : (
        <div className="flex-1 bg-muted/5"></div>
      )}

      {/* Totales y Cobro */}
      <div className="p-3 border-t bg-card space-y-2 shrink-0">
        <div className="grid grid-cols-2 gap-2 mb-2 shrink-0">
          {/* Cupón */}
          <div className="flex flex-col gap-1.5 bg-background p-2 rounded border border-dashed relative">
              <span className="text-xs font-semibold flex items-center gap-1 text-indigo-700">
                <Percent className="w-3 h-3 shrink-0"/> Cupón
              </span>
              <div className="flex items-center gap-2">
                  <Input 
                      type="text" 
                      placeholder="Ej. VERANO" 
                      className="h-8 uppercase flex-1 font-mono text-[11px] px-2" 
                      value={activeAccount.enteredPromoCode || ''}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  />
              </div>
              {promoError && activeAccount.enteredPromoCode && (
                <span className="text-[9px] text-red-500 font-medium truncate mt-0.5" title={promoError}>{promoError}</span>
              )}
              {appliedPromo && (
                <span className="text-[9px] text-emerald-600 font-medium flex items-center gap-0.5 mt-0.5 truncate" title={appliedPromo.title || appliedPromo.code || undefined}>
                  ✓ {appliedPromo.title || appliedPromo.code}
                </span>
              )}
          </div>

          {/* Descuento */}
          <div className="flex flex-col gap-1.5 bg-background p-2 rounded border border-dashed">
              <span className="text-xs font-semibold flex items-center gap-1 text-amber-700">
                <Tag className="w-3 h-3 shrink-0"/> Descuento
              </span>
              <div className="flex items-center gap-1">
                  <Input 
                      type="number" 
                      placeholder="0" 
                      className="h-8 flex-1 text-[11px] px-2" 
                      value={activeAccount.globalDiscountValue || ''}
                      onChange={(e) => {
                        const rawVal = e.target.value;
                        if (rawVal === '') {
                          setGlobalDiscount(0, activeAccount.globalDiscountType || 'percentage');
                        } else {
                          const val = parseFloat(rawVal) || 0;
                          setGlobalDiscount(val, activeAccount.globalDiscountType || 'percentage');
                        }
                      }}
                      min={0}
                  />
                  <div className="flex border rounded h-8 overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => setGlobalDiscount(activeAccount.globalDiscountValue || 0, 'percentage')}
                      className={`px-1 text-[10px] font-bold transition-colors ${
                        (activeAccount.globalDiscountType || 'percentage') === 'percentage'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-background hover:bg-muted text-muted-foreground'
                      }`}
                      title="Porcentaje"
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setGlobalDiscount(activeAccount.globalDiscountValue || 0, 'fixed')}
                      className={`px-1 text-[10px] font-bold border-l transition-colors ${
                        activeAccount.globalDiscountType === 'fixed'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-background hover:bg-muted text-muted-foreground'
                      }`}
                      title="Monto Fijo"
                    >
                      $
                    </button>
                  </div>
              </div>
          </div>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatMoney(subtotal)}</span>
        </div>
        {totalDiscount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Descuentos</span>
              <span className="font-medium text-emerald-600">-{formatMoney(totalDiscount)}</span>
            </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">IVA (16%)</span>
          <span className="font-medium">{formatMoney(tax)}</span>
        </div>
        <div className="flex justify-between text-xl font-bold pt-2 border-t border-foreground/10">
          <span>Total</span>
          <span className="text-primary">{formatMoney(total)}</span>
        </div>
        <button 
          disabled={activeAccount.items.length === 0}
          onClick={() => setIsCheckoutOpen(true)}
          className="w-full mt-2 bg-primary text-primary-foreground font-bold text-base h-10 rounded-md shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cobrar Ticket
        </button>
      </div>

      {isCheckoutOpen && (
          <CheckoutModal onClose={() => setIsCheckoutOpen(false)} />
      )}
    </div>
  );
}
