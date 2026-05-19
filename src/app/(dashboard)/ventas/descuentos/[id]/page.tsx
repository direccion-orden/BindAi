"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { collection, doc, getDoc, updateDoc, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ArrowLeft, Tag, Percent, DollarSign, Calendar, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export default function EditarDescuentoPage() {
  const { companyId } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);

  // Form State
  const [method, setMethod] = useState<"code" | "automatic">("code");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  
  const [type, setType] = useState<"percentage" | "fixed_amount">("percentage");
  const [value, setValue] = useState("");
  
  const [targetType, setTargetType] = useState<"order" | "specific_categories">("order");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  
  const [minRequirementType, setMinRequirementType] = useState<"none" | "min_amount">("none");
  const [minAmount, setMinAmount] = useState("");
  
  const [hasUsageLimit, setHasUsageLimit] = useState(false);
  const [totalUsageLimit, setTotalUsageLimit] = useState("");
  
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!companyId || !id) return;

    const loadData = async () => {
      try {
        // Load Categories
        const q = query(collection(db, "companies", companyId, "categories"));
        const snap = await getDocs(q);
        setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Load Discount
        const docRef = doc(db, "companies", companyId, "discounts", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setMethod(data.method);
          if (data.method === "code") {
            setCode(data.code || "");
          } else {
            setTitle(data.title || "");
          }
          setType(data.type);
          setValue(data.value?.toString() || "");
          setTargetType(data.targetType);
          setTargetIds(data.targetIds || []);
          
          if (data.minRequirement) {
            setMinRequirementType(data.minRequirement.type || "none");
            setMinAmount(data.minRequirement.value?.toString() || "");
          }
          
          if (data.usageLimits) {
            setHasUsageLimit(data.usageLimits.totalUsageLimit !== null);
            setTotalUsageLimit(data.usageLimits.totalUsageLimit?.toString() || "");
          }
          
          if (data.startDate) {
            const d = new Date(data.startDate);
            setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
          }
          if (data.endDate) {
            setHasEndDate(true);
            const d = new Date(data.endDate);
            setEndDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
          }
        } else {
          alert("Descuento no encontrado");
          router.push("/ventas/descuentos");
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setInitialLoading(false);
      }
    };
    loadData();
  }, [companyId, id, router]);

  const handleGenerateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(result);
  };

  const toggleCategorySelection = (catId: string) => {
    if (targetIds.includes(catId)) {
      setTargetIds(targetIds.filter(i => i !== catId));
    } else {
      setTargetIds([...targetIds, catId]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !id) return;

    if (method === "code" && !code.trim()) {
      alert("Debes ingresar un código de descuento.");
      return;
    }
    if (method === "automatic" && !title.trim()) {
      alert("Debes ingresar un título para el descuento automático.");
      return;
    }
    if (!value || isNaN(Number(value)) || Number(value) <= 0) {
      alert("Debes ingresar un valor de descuento válido.");
      return;
    }
    if (targetType === "specific_categories" && targetIds.length === 0) {
      alert("Debes seleccionar al menos una categoría.");
      return;
    }

    setLoading(true);
    try {
      const discountData = {
        method,
        code: method === "code" ? code.trim().toUpperCase() : null,
        title: method === "automatic" ? title.trim() : code.trim().toUpperCase(),
        type,
        value: Number(value),
        targetType,
        targetIds: targetType === "specific_categories" ? targetIds : [],
        minRequirement: {
          type: minRequirementType,
          value: minRequirementType === "min_amount" ? Number(minAmount) : null
        },
        usageLimits: {
          totalUsageLimit: hasUsageLimit && totalUsageLimit ? Number(totalUsageLimit) : null,
          oncePerCustomer: false // Placeholder for Phase 2
        },
        startDate: new Date(startDate + "T00:00:00").toISOString(),
        endDate: hasEndDate && endDate ? new Date(endDate + "T23:59:59").toISOString() : null,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, "companies", companyId, "discounts", id), discountData);
      
      alert("Descuento actualizado exitosamente.");
      router.push("/ventas/descuentos");
    } catch (error) {
      console.error(error);
      alert("Error al actualizar el descuento.");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Link href="/ventas/descuentos">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Editar Descuento</h1>
          <p className="text-muted-foreground text-sm">
            Modifica las reglas de tu promoción
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Columna Izquierda (Principal) */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Método */}
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/20 font-semibold text-foreground">
              Tipo de Descuento
            </div>
            <div className="p-4 space-y-4">
              <div className="flex bg-muted p-1 rounded-md">
                <button
                  type="button"
                  onClick={() => setMethod("code")}
                  className={`flex-1 py-2 text-sm font-medium rounded-sm transition-colors ${method === "code" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Código de descuento
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("automatic")}
                  className={`flex-1 py-2 text-sm font-medium rounded-sm transition-colors ${method === "automatic" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Automático
                </button>
              </div>

              {method === "code" ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium">Código de descuento</label>
                    <button type="button" onClick={handleGenerateCode} className="text-xs text-indigo-600 font-medium hover:underline">
                      Generar código aleatorio
                    </button>
                  </div>
                  <Input 
                    placeholder="Ej. VERANO20" 
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    className="font-mono uppercase text-lg"
                  />
                  <p className="text-xs text-muted-foreground">Los clientes deberán ingresar este código en la caja para obtener el descuento.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Título del Descuento Automático</label>
                  <Input 
                    placeholder="Ej. Liquidación de Invierno" 
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Este título es visible para los clientes en el carrito de compras.</p>
                </div>
              )}
            </div>
          </div>

          {/* Valor */}
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/20 font-semibold text-foreground">
              Valor
            </div>
            <div className="p-4 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setType("percentage")}
                  className={`flex flex-col items-center justify-center p-4 border rounded-lg gap-2 transition-colors ${type === "percentage" ? "bg-indigo-50/50 border-indigo-200 text-indigo-700" : "bg-card hover:bg-muted/50"}`}
                >
                  <Percent className={`w-6 h-6 ${type === "percentage" ? "text-indigo-600" : "text-muted-foreground"}`} />
                  <span className="font-medium text-sm">Porcentaje</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType("fixed_amount")}
                  className={`flex flex-col items-center justify-center p-4 border rounded-lg gap-2 transition-colors ${type === "fixed_amount" ? "bg-indigo-50/50 border-indigo-200 text-indigo-700" : "bg-card hover:bg-muted/50"}`}
                >
                  <DollarSign className={`w-6 h-6 ${type === "fixed_amount" ? "text-indigo-600" : "text-muted-foreground"}`} />
                  <span className="font-medium text-sm">Monto Fijo</span>
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {type === "percentage" ? "Porcentaje de descuento (%)" : "Valor del descuento ($)"}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {type === "percentage" ? <Percent className="h-4 w-4 text-muted-foreground" /> : <DollarSign className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <Input 
                    type="number" 
                    step={type === "percentage" ? "1" : "0.01"}
                    className="pl-9"
                    placeholder={type === "percentage" ? "15" : "100.00"}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <label className="text-sm font-medium block">Aplica a</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      checked={targetType === "order"} 
                      onChange={() => setTargetType("order")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm">Todo el pedido</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      checked={targetType === "specific_categories"} 
                      onChange={() => setTargetType("specific_categories")}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm">Categorías específicas</span>
                  </label>
                </div>

                {targetType === "specific_categories" && (
                  <div className="mt-3 p-3 bg-muted/30 border rounded-md max-h-40 overflow-y-auto space-y-2">
                    {categories.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No tienes categorías registradas.</p>
                    ) : (
                      categories.map(cat => (
                        <label key={cat.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 p-1 rounded">
                          <input 
                            type="checkbox" 
                            checked={targetIds.includes(cat.name)}
                            onChange={() => toggleCategorySelection(cat.name)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          {cat.name}
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Requisitos Mínimos */}
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/20 font-semibold text-foreground">
              Requisitos Mínimos
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={minRequirementType === "none"} 
                    onChange={() => setMinRequirementType("none")}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">Sin requisitos mínimos</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={minRequirementType === "min_amount"} 
                    onChange={() => setMinRequirementType("min_amount")}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">Monto mínimo de compra ($)</span>
                </label>
              </div>

              {minRequirementType === "min_amount" && (
                <div className="pt-2">
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="Ej. 500.00" 
                    value={minAmount}
                    onChange={e => setMinAmount(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Columna Derecha */}
        <div className="space-y-6">
          
          {/* Límites de uso */}
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/20 font-semibold text-foreground">
              Límites de Uso
            </div>
            <div className="p-4 space-y-4">
              <label className="flex items-start gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={hasUsageLimit} 
                  onChange={(e) => setHasUsageLimit(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 mt-1"
                />
                <span className="text-sm leading-tight">Limitar el número de veces que este descuento puede usarse en total</span>
              </label>

              {hasUsageLimit && (
                <Input 
                  type="number" 
                  placeholder="Ej. 100" 
                  value={totalUsageLimit}
                  onChange={e => setTotalUsageLimit(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Fechas activas */}
          <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/20 font-semibold text-foreground">
              Fechas Activas
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha de Inicio</label>
                <Input 
                  type="date" 
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={hasEndDate} 
                    onChange={(e) => setHasEndDate(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm">Establecer fecha de fin</span>
                </label>
                {hasEndDate && (
                  <Input 
                    type="date" 
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="mt-2"
                    required={hasEndDate}
                  />
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Footer Fix */}
        <div className="md:col-span-3 fixed bottom-0 left-0 right-0 lg:left-64 bg-background/80 backdrop-blur-md border-t p-4 z-10 flex justify-end px-6 md:px-10 gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
          <Link href="/ventas/descuentos">
            <Button type="button" variant="ghost">Descartar</Button>
          </Link>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar Cambios
          </Button>
        </div>
      </form>
    </div>
  );
}
