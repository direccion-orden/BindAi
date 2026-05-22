"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, Search, Check } from "lucide-react";
import { searchSatProducts, searchSatUnits } from "@/actions/facturama";
import { Input } from "@/components/ui/input";

interface SatCatalogSelectProps {
  type: "product" | "unit";
  value: string; // The satCode
  nameValue: string; // The satName
  onChange: (code: string, name: string) => void;
}

export function SatCatalogSelect({ type, value, nameValue, onChange }: SatCatalogSelectProps) {
  const [query, setQuery] = useState(nameValue || value || "");
  const [results, setResults] = useState<{ Value: string; Name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    if (value && !nameValue) {
      // Auto-lookup the name if we only have the code (e.g. from CSV import)
      const fetchName = async () => {
        setLoading(true);
        try {
          const data = type === "product" ? await searchSatProducts(value) : await searchSatUnits(value);
          if (!mounted) return;
          const match = (data || []).find((r: any) => r.Value === value);
          if (match) {
            setQuery(match.Name);
            onChange(value, match.Name);
          } else {
            setQuery(value);
          }
        } catch (e) {
          if (mounted) setQuery(value);
        } finally {
          if (mounted) setLoading(false);
        }
      };
      fetchName();
    } else {
      setQuery(nameValue || value || "");
    }
    return () => { mounted = false; };
  }, [value, nameValue, type]); // removed onChange to prevent loop if it's not memoized

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (val: string) => {
    setQuery(val);
    if (!val || val.length < 3) {
      setResults([]);
      setOpen(val.length > 0);
      return;
    }
    
    setLoading(true);
    setOpen(true);
    
    try {
      const data = type === "product" ? await searchSatProducts(val) : await searchSatUnits(val);
      setResults(data || []);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (item: { Value: string; Name: string }) => {
    setQuery(item.Name);
    onChange(item.Value, item.Name);
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={type === "product" ? "Buscar por palabra (ej. computadora)..." : "Buscar unidad (ej. pieza)..."}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => { if (query.length >= 3) setOpen(true); }}
          className="pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      
      {open && (query.length > 0) && (
        <div className="absolute z-[100] w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
          {loading ? (
            <div className="p-4 text-sm text-center text-muted-foreground">Buscando en catálogo SAT...</div>
          ) : results.length > 0 ? (
            <ul className="py-1">
              {results.map((item) => (
                <li
                  key={item.Value}
                  className="px-4 py-2 text-sm hover:bg-indigo-50 cursor-pointer flex items-start gap-2"
                  onClick={() => handleSelect(item)}
                >
                  <div className="flex-1">
                    <span className="font-semibold">{item.Value}</span> - {item.Name}
                  </div>
                  {value === item.Value && <Check className="w-4 h-4 text-indigo-600 mt-0.5" />}
                </li>
              ))}
            </ul>
          ) : query.length >= 3 ? (
            <div className="p-4 text-sm text-center text-muted-foreground">No se encontraron resultados</div>
          ) : (
            <div className="p-4 text-sm text-center text-muted-foreground">Escribe al menos 3 caracteres</div>
          )}
        </div>
      )}
    </div>
  );
}
