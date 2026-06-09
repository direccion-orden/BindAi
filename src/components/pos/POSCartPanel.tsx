"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, Trash2, Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { usePOS, CartItem } from "@/context/POSContext";

function CartItemRow({ item }: { item: CartItem }) {
  const { updateItemQuantity, updateItemDiscount, removeItemFromCart, updateItemPrice, updateItemDescription } = usePOS();
  
  const isService = !!item.product.isService || item.product.tags?.includes('Servicios') || item.product.productType === 'Servicios';
  const price = item.customPrice !== undefined ? item.customPrice : (item.product.price || 0);
  const totalItemPrice = price * 1.16 * item.quantity;
  
  const priceWithTax = price * 1.16;
  const [localPriceInput, setLocalPriceInput] = useState<string>("");

  useEffect(() => {
    const parsedLocal = parseFloat(localPriceInput);
    if (isNaN(parsedLocal) || Math.abs(parsedLocal - priceWithTax) > 0.001) {
      setLocalPriceInput(priceWithTax.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceWithTax]);

  const handlePriceChange = (val: string) => {
    setLocalPriceInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0) {
      // Divide by 1.16 to store the pre-tax price in context
      updateItemPrice(item.product.sku, parsed / 1.16);
    }
  };

  const handlePriceBlur = () => {
    setLocalPriceInput(priceWithTax.toFixed(2));
  };

  return (
    <div className="flex flex-col gap-2 p-3 border rounded-md shadow-sm relative group">
      <div className="flex justify-between items-start pr-6">
          <div className="flex-1 pr-2">
              {isService ? (
                <textarea
                  value={item.customDescription !== undefined ? item.customDescription : (item.product.bodyHtml || item.product.title || "")}
                  onChange={(e) => updateItemDescription(item.product.sku, e.target.value)}
                  placeholder="Descripción del servicio..."
                  className="w-full text-xs font-semibold border rounded p-1 bg-white resize-y leading-tight focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={2}
                />
              ) : (
                <h4 className="font-medium text-sm leading-tight">{item.product.title}</h4>
              )}
          </div>
          <span className="font-bold text-nowrap">
            {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalItemPrice)}
          </span>
      </div>
      
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md">
                  <button 
                    onClick={() => updateItemQuantity(item.product.sku, item.quantity - 1)}
                    className="px-2 py-1 hover:bg-muted text-muted-foreground"
                  >
                    <Minus className="w-3 h-3"/>
                  </button>
                  <span className="px-3 text-sm font-medium border-x">{item.quantity}</span>
                  <button 
                    onClick={() => updateItemQuantity(item.product.sku, item.quantity + 1)}
                    className="px-2 py-1 hover:bg-muted text-muted-foreground"
                  >
                    <Plus className="w-3 h-3"/>
                  </button>
              </div>
              <span className="text-xs text-muted-foreground text-nowrap">
                Disp: {item.product.bindCurrentInventory}
              </span>
          </div>

          <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Precio U (c/IVA):</span>
              <Input 
                type="number" 
                placeholder="Precio" 
                step="0.01"
                className="w-24 h-8 text-right text-xs bg-white"
                value={localPriceInput}
                onChange={(e) => handlePriceChange(e.target.value)}
                onBlur={handlePriceBlur}
                min={0}
              />
          </div>

          <div className="flex items-center gap-1">
              <Input 
                type="number" 
                placeholder="0" 
                className={`w-12 h-8 text-right text-xs ${item.discountPercentage > 0 ? 'border-green-500 bg-green-50' : ''}`}
                value={item.discountPercentage || ''}
                onChange={(e) => updateItemDiscount(item.product.sku, parseFloat(e.target.value) || 0)}
                min={0}
                max={100}
              />
              <span className="text-[10px] text-muted-foreground uppercase font-bold">% desc.</span>
          </div>
      </div>
      <button 
        onClick={() => removeItemFromCart(item.product.sku)}
        className="absolute top-2 right-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
      >
          <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export function POSCartPanel() {
  const { activeAccount } = usePOS();

  const totalItems = activeAccount.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex-1 flex flex-col bg-card border rounded-lg shadow-sm overflow-hidden min-w-[300px]">
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
      <div className="flex-1 overflow-y-auto p-4 bg-card space-y-4 custom-scrollbar">
        {activeAccount.items.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-sm opacity-60">
              <ShoppingCart className="w-12 h-12 mb-3 opacity-20" />
              <p>El carrito está vacío</p>
              <p className="text-xs mt-1">Busca o escanea un producto para comenzar</p>
           </div>
        ) : (
          activeAccount.items.map((item) => (
            <CartItemRow key={item.product.sku} item={item} />
          ))
        )}
      </div>
    </div>
  );
}
