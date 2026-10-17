"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface TableSearchSelectItem {
  id: string;
  name: string;
  code?: string;
  subtitle?: string;
}

export interface TableSearchSelectProps {
  value: string;
  onChange: (id: string, item?: TableSearchSelectItem) => void;
  items: TableSearchSelectItem[];
  placeholder?: string;
  emptyLabel?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  minWidth?: number;
  highlightChanged?: boolean;
}

export function TableSearchSelect({
  value,
  onChange,
  items,
  placeholder = "Seleccionar...",
  emptyLabel = "(Ninguno)",
  allowClear = true,
  disabled = false,
  className = "",
  minWidth = 260,
  highlightChanged = false
}: TableSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placeUp: boolean }>({
    top: 0,
    left: 0,
    width: minWidth,
    placeUp: false
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(() => {
    return items.find(it => it.id === value);
  }, [items, value]);

  // Recalcular posición del dropdown flotante fixed
  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeUp = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const width = Math.max(rect.width, minWidth);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = window.innerWidth - width - 12;
    }
    if (left < 8) left = 8;

    setCoords({
      top: placeUp ? Math.max(8, rect.top - dropdownHeight - 4) : rect.bottom + 4,
      left,
      width,
      placeUp
    });
  };

  const handleOpen = () => {
    if (disabled) return;
    updatePosition();
    setSearch("");
    setOpen(true);
  };

  useEffect(() => {
    if (open) {
      updatePosition();
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);

      const handleScrollOrResize = () => {
        updatePosition();
      };

      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          buttonRef.current && buttonRef.current.contains(target) ||
          dropdownRef.current && dropdownRef.current.contains(target)
        ) {
          return;
        }
        setOpen(false);
      };

      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);
      document.addEventListener("mousedown", handleClickOutside);

      return () => {
        clearTimeout(timer);
        window.removeEventListener("scroll", handleScrollOrResize, true);
        window.removeEventListener("resize", handleScrollOrResize);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [open]);

  // Filtrado de opciones
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it => {
      const matchName = it.name.toLowerCase().includes(q);
      const matchCode = it.code ? it.code.toLowerCase().includes(q) : false;
      const matchSub = it.subtitle ? it.subtitle.toLowerCase().includes(q) : false;
      return matchName || matchCode || matchSub;
    });
  }, [items, search]);

  const displayName = selectedItem ? selectedItem.name : "";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        title={displayName || placeholder}
        className={`group relative flex items-center justify-between gap-1 h-8 w-full rounded-md border text-xs px-2 py-1 text-left transition-all outline-none focus:ring-1 focus:ring-indigo-500 ${
          disabled ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200" :
          highlightChanged ? "bg-amber-50/70 border-amber-300 text-amber-950 font-semibold shadow-xs" :
          selectedItem ? "bg-white border-slate-200 text-slate-800 hover:border-slate-300" :
          "bg-slate-50/80 border-dashed border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400"
        } ${className}`}
      >
        <span className="truncate block flex-1 font-medium">
          {displayName || placeholder}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            width: coords.width,
            zIndex: 99999
          }}
          className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[300px]"
        >
          {/* Header con buscador */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/80 flex items-center gap-1.5 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-transparent text-xs py-1 px-1.5 outline-none font-medium text-slate-900 placeholder:text-slate-400"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                } else if (e.key === "Enter" && filteredItems.length > 0) {
                  onChange(filteredItems[0].id, filteredItems[0]);
                  setOpen(false);
                }
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="p-0.5 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Lista de resultados */}
          <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
            {allowClear && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-slate-500 hover:bg-slate-100 transition-colors ${
                  !value ? "bg-indigo-50 text-indigo-700 font-bold" : ""
                }`}
              >
                <span className="italic text-[11px]">{emptyLabel}</span>
                {!value && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            )}

            {filteredItems.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-slate-400 italic">
                No se encontraron opciones
              </div>
            ) : (
              filteredItems.map(item => {
                const isSelected = item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onChange(item.id, item);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 hover:bg-indigo-50/70 transition-colors ${
                      isSelected ? "bg-indigo-50 text-indigo-800 font-bold" : "text-slate-700"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">
                        {item.name}
                      </div>
                      {item.subtitle && (
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer contador */}
          <div className="px-2.5 py-1.5 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
            <span>{filteredItems.length} opciones</span>
            <span className="text-[9px] uppercase font-semibold text-slate-400">Esc para cerrar</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
