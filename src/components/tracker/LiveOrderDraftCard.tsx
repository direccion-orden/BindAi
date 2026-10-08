"use client";

import React from "react";
import { 
  Trash2, Plus, Minus, CheckCircle, ArrowRight, ShoppingCart, User, 
  Building2, X, AlertCircle 
} from "lucide-react";
import { OrderDraft, CreateOrderResult } from "@/app/actions/order-agent";
import Link from "next/link";

interface LiveOrderDraftCardProps {
  draft: OrderDraft | null;
  createdOrder: CreateOrderResult | null;
  onUpdateQuantity: (variantOrProductId: string, delta: number) => void;
  onRemoveItem: (variantOrProductId: string) => void;
  onConfirmOrder: () => void;
  onDiscardDraft: () => void;
  onClose: () => void;
  isConfirming: boolean;
}

export function LiveOrderDraftCard({
  draft,
  createdOrder,
  onUpdateQuantity,
  onRemoveItem,
  onConfirmOrder,
  onDiscardDraft,
  onClose,
  isConfirming
}: LiveOrderDraftCardProps) {
  // If an order was just created successfully
  if (createdOrder && createdOrder.success) {
    return (
      <div className="flex flex-col h-full w-full bg-slate-900/95 backdrop-blur-md text-white rounded-2xl border border-emerald-500/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-4 py-3 bg-emerald-950/60 border-b border-emerald-500/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <CheckCircle size={16} />
            </div>
            <div>
              <h4 className="text-xs font-black text-emerald-200 tracking-wide uppercase">
                Pedido Creado
              </h4>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Cerrar panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex items-center justify-center shadow-inner">
            <CheckCircle size={32} />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Registrado en firme
            </span>
            <h3 className="text-lg font-black text-white mt-1">
              {createdOrder.orderNumber}
            </h3>
            <p className="text-xs text-slate-300">
              Cliente: <span className="font-semibold text-white">{createdOrder.clientName || "General"}</span>
            </p>
          </div>

          <div className="w-full bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
            <p className="text-[11px] text-slate-400">Total Facturado (+IVA)</p>
            <p className="text-xl font-black text-emerald-400">
              ${(createdOrder.totalAmount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-white/5 border-t border-white/10 shrink-0">
          <Link
            href="/ventas/pedidos"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-md"
          >
            <span>Ver Pedidos en ERP</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  // If no draft or empty
  if (!draft || (!draft.clientName && (!draft.items || draft.items.length === 0))) {
    return null;
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-900/95 backdrop-blur-md text-white rounded-2xl border border-indigo-700/60 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-indigo-600/50 text-indigo-200 flex items-center justify-center border border-indigo-400/30 shadow-xs">
            <ShoppingCart size={15} />
          </div>
          <div>
            <h4 className="text-xs font-black text-white tracking-wide uppercase flex items-center gap-1.5">
              <span>Borrador de Pedido</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </h4>
            <p className="text-[10px] text-slate-400">
              {draft.items.length} {draft.items.length === 1 ? "partida" : "partidas"} acumuladas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onDiscardDraft}
            disabled={isConfirming}
            className="text-[10px] text-slate-400 hover:text-rose-300 transition-colors font-medium px-2 py-1 rounded hover:bg-white/5"
          >
            Descartar
          </button>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Ocultar panel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Client and Branch Header */}
      <div className="px-4 py-2.5 bg-indigo-500/10 border-b border-white/5 space-y-1.5 shrink-0 text-xs">
        {/* Client */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-300">
            <User size={13} className="text-indigo-400 shrink-0" />
            <span className="text-[11px] text-slate-400">Cliente:</span>
          </div>
          {draft.clientName ? (
            <span className="font-bold text-white text-[11px] bg-indigo-600/40 px-2 py-0.5 rounded-md border border-indigo-400/30 truncate max-w-[200px]">
              {draft.clientName}
            </span>
          ) : (
            <span className="text-amber-300 text-[10px] italic flex items-center gap-1">
              <AlertCircle size={10} /> Pendiente de cliente
            </span>
          )}
        </div>

        {/* Branch / Location */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Building2 size={13} className="text-purple-400 shrink-0" />
            <span className="text-[11px] text-slate-400">Sucursal:</span>
          </div>
          <span className="font-bold text-purple-200 text-[11px] bg-purple-500/20 px-2 py-0.5 rounded-md border border-purple-400/30 truncate max-w-[200px]">
            {draft.locationName || "Matriz (Predeterminada)"}
          </span>
        </div>
      </div>

      {/* Items List with FULL UNLIMITED SCROLL */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
        {draft.items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2 text-slate-400">
            <ShoppingCart size={28} className="text-slate-600" />
            <p className="text-xs">No hay productos en el borrador aún.</p>
            <p className="text-[10px] text-slate-500">Dicta o escribe los productos que deseas agregar.</p>
          </div>
        ) : (
          draft.items.map((item, idx) => {
            const key = item.variantId || item.productId || String(idx);
            return (
              <div
                key={key}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors text-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-100 text-[11px] leading-snug break-words">
                      {item.productName}
                    </p>
                    {item.variantTitle && (
                      <p className="text-[10px] text-indigo-300 truncate mt-0.5">
                        {item.variantTitle}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      ${item.unitPrice.toLocaleString("es-MX", { minimumFractionDigits: 2 })} c/u
                    </p>
                  </div>

                  {/* Subtotal & Delete */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-bold text-[12px] text-emerald-400">
                      ${(item.quantity * item.unitPrice).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </span>
                    <button
                      onClick={() => onRemoveItem(key)}
                      disabled={isConfirming}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors disabled:opacity-30 rounded hover:bg-white/10 ml-1"
                      title="Eliminar partida"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Quantity Controls Bar */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <span className="text-[10px] text-slate-400">Cantidad:</span>
                  <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-white/10">
                    <button
                      onClick={() => onUpdateQuantity(key, -1)}
                      disabled={isConfirming}
                      className="p-0.5 hover:text-amber-400 text-slate-300 transition-colors disabled:opacity-30"
                      title="Disminuir"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="text-[11px] font-bold text-white px-1.5 min-w-[20px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(key, 1)}
                      disabled={isConfirming}
                      className="p-0.5 hover:text-emerald-400 text-slate-300 transition-colors disabled:opacity-30"
                      title="Aumentar"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Totals & Action Buttons Footer */}
      <div className="p-3.5 bg-white/5 border-t border-white/10 space-y-2.5 shrink-0">
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>Subtotal:</span>
            <span className="text-slate-200">${(draft.subtotal || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>IVA (16%):</span>
            <span className="text-slate-200">${(draft.tax || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex items-center justify-between text-[13px] font-black text-white pt-1 border-t border-white/10">
            <span>Total Neto:</span>
            <span className="text-emerald-400">
              ${(draft.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN
            </span>
          </div>
        </div>

        <button
          onClick={onConfirmOrder}
          disabled={isConfirming || !draft.clientId || draft.items.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 transition-all shadow-md active:scale-98 disabled:active:scale-100"
        >
          {isConfirming ? (
            <span>Creando Pedido en ERP...</span>
          ) : (
            <>
              <CheckCircle size={15} />
              <span>Confirmar y Crear Pedido</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
