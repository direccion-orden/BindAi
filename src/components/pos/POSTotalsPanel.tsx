"use client";

import { Percent, X, Plus, Search } from "lucide-react";
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
      <div className="flex gap-2 overflow-x-auto p-2 border-b shrink-0 custom-scrollbar bg-background">
        {accounts.map((tab) => (
            <div 
                key={tab.id}
                onClick={() => setActiveAccount(tab.id)}
                className={`flex items-center gap-2 px-3 py-1 text-sm cursor-pointer border-r transition-colors ${activeAccountId === tab.id ? 'bg-background font-semibold border-b-2 border-b-primary' : 'hover:bg-muted/50 text-muted-foreground'}`}
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
      <div className="p-3 border-t bg-muted/20 space-y-2 shrink-0">
        <div className="flex flex-col gap-1.5 mb-2 bg-background p-2.5 rounded border border-dashed">
            <span className="text-xs font-semibold flex items-center gap-1.5 text-indigo-700">
              <Percent className="w-3.5 h-3.5"/> Código Promocional
            </span>
            <div className="flex items-center gap-2">
                <Input 
                    type="text" 
                    placeholder="Ej. VERANO20" 
                    className="h-8 uppercase flex-1 font-mono text-xs" 
                    value={activeAccount.enteredPromoCode || ''}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                />
            </div>
            {promoError && activeAccount.enteredPromoCode && (
              <span className="text-[10px] text-red-500 font-medium">{promoError}</span>
            )}
            {appliedPromo && (
              <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                ✓ Aplicado: {appliedPromo.title || appliedPromo.code}
              </span>
            )}
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
