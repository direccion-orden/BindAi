"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, X } from "lucide-react";

export interface SearchableSelectItem {
  id: string;
  name: string;
  subtitle?: string;
}

export interface SearchableSelectProps {
  label?: string;
  placeholder?: string;
  items: SearchableSelectItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  required?: boolean;
  className?: string;
  dropdownPosition?: "down" | "up" | "auto";
  maxHeightClass?: string;
}

export function SearchableSelect({
  label,
  placeholder = "Buscar...",
  items,
  selectedId,
  onSelect,
  required = false,
  className = "",
  dropdownPosition = "auto",
  maxHeightClass = "max-h-[390px]"
}: SearchableSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [actualPosition, setActualPosition] = useState<"down" | "up">("down");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedItem = useMemo(() => items.find(item => item.id === selectedId), [items, selectedId]);

  useEffect(() => {
    if (!open) {
      setSearch(selectedItem ? selectedItem.name : "");
    } else if (containerRef.current) {
      if (dropdownPosition === "up") {
        setActualPosition("up");
      } else if (dropdownPosition === "down") {
        setActualPosition("down");
      } else {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 300 && rect.top > 200) {
          setActualPosition("up");
        } else {
          setActualPosition("down");
        }
      }
    }
  }, [selectedId, selectedItem, open, dropdownPosition]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q || (selectedItem && q === selectedItem.name.toLowerCase().trim())) {
      return items;
    }
    return items.filter(item => 
      item.name.toLowerCase().includes(q) || 
      (item.subtitle && item.subtitle.toLowerCase().includes(q))
    );
  }, [items, search, selectedItem]);

  return (
    <div className={`space-y-1.5 relative w-full ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold text-slate-700 uppercase flex justify-between items-center">
          <span>{label} {required && <span className="text-red-500">*</span>}</span>
          {selectedItem && selectedId !== "manual" && (
            <button 
              type="button" 
              onClick={() => {
                onSelect("manual");
                setSearch("");
              }} 
              className="text-[10px] text-slate-400 hover:text-slate-600 font-semibold lowercase"
            >
              (Limpiar selección)
            </button>
          )}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            if (!e.target.value) {
              onSelect("manual");
            }
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-xs shadow-sm focus:ring-2 focus:ring-primary outline-none font-semibold text-slate-800"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className={`absolute z-[100] left-0 right-0 ${
          actualPosition === "up" ? "bottom-full mb-1" : "top-full mt-1"
        } bg-white border border-slate-200 rounded-md shadow-lg ${maxHeightClass} overflow-y-auto custom-scrollbar animate-in fade-in duration-100`}>
          {filteredItems.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 text-center">
              No se encontraron resultados
            </div>
          ) : (
            filteredItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  setSearch(item.name);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 flex flex-col border-b last:border-b-0 transition-colors whitespace-normal break-words ${
                  item.id === selectedId ? "bg-indigo-50/50 font-bold" : ""
                }`}
              >
                <span className="text-slate-800 font-bold whitespace-normal break-words">{item.name}</span>
                {item.subtitle && (
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 whitespace-normal break-words">{item.subtitle}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
