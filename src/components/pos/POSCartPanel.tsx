"use client";

import { ShoppingCart, Trash2, Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePOS } from "@/context/POSContext";

export function POSCartPanel() {
  const { activeAccount, updateItemQuantity, updateItemDiscount, removeItemFromCart } = usePOS();

  const totalItems = activeAccount.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="w-[420px] flex flex-col bg-card border rounded-lg shadow-sm overflow-hidden shrink-0">
      {/* Cabecera Carrito */}
      <div className="p-3 border-b bg-primary/5 flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" /> Artículos ({activeAccount.name})
        </h2>
        <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full">
          {totalItems} arts
        </span>
      </div>

      {/* Lista de Artículos */}
      <div className="flex-1 overflow-y-auto p-4 bg-background space-y-4 custom-scrollbar">
        {activeAccount.items.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm opacity-60">
              <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
              <p>El carrito está vacío</p>
              <p className="text-xs mt-1">Busca o escanea un producto para comenzar</p>
           </div>
        ) : (
          activeAccount.items.map((item) => (
            <div key={item.product.id} className="flex flex-col gap-2 p-3 border rounded-md shadow-sm relative group">
              <div className="flex justify-between items-start pr-6">
                  <div>
                      <h4 className="font-medium text-sm leading-tight">{item.product.title}</h4>
                      <span className="text-xs text-muted-foreground mt-1 block">
                        {item.product.unit === 'pz' ? 'Pza' : item.product.unit} • Disp: {item.product.bindCurrentInventory}
                      </span>
                  </div>
                  <span className="font-bold text-nowrap">
                    {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((item.product.price || 0) * 1.16 * item.quantity)}
                  </span>
              </div>
              
              <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center border rounded-md">
                      <button 
                        onClick={() => updateItemQuantity(item.product.id, item.quantity - 1)}
                        className="px-2 py-1 hover:bg-muted text-muted-foreground"
                      >
                        <Minus className="w-3 h-3"/>
                      </button>
                      <span className="px-3 text-sm font-medium border-x">{item.quantity}</span>
                      <button 
                        onClick={() => updateItemQuantity(item.product.id, item.quantity + 1)}
                        className="px-2 py-1 hover:bg-muted text-muted-foreground"
                      >
                        <Plus className="w-3 h-3"/>
                      </button>
                  </div>

                  <div className="flex items-center gap-1">
                      <Input 
                        type="number" 
                        placeholder="0" 
                        className={`w-14 h-8 text-right text-xs ${item.discountPercentage > 0 ? 'border-green-500 bg-green-50' : ''}`}
                        value={item.discountPercentage || ''}
                        onChange={(e) => updateItemDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                        min={0}
                        max={100}
                      />
                      <span className="text-xs text-muted-foreground">% desc.</span>
                  </div>
              </div>
              <button 
                onClick={() => removeItemFromCart(item.product.id)}
                className="absolute top-2 right-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                  <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
