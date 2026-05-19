"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, BookOpen, Layers, Check, Trash2, Edit2, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FULL_SEED_ACCOUNTS } from "@/lib/constants/satCatalog";

// Estructura básica recomendada SAT
const SEED_ACCOUNTS = [
  { code: "100", name: "Activo", type: "ACTIVO", nature: "DEUDORA", level: 1, parentCode: null },
  { code: "101", name: "Caja", type: "ACTIVO", nature: "DEUDORA", level: 2, parentCode: "100" },
  { code: "102", name: "Bancos", type: "ACTIVO", nature: "DEUDORA", level: 2, parentCode: "100" },
  { code: "105", name: "Clientes", type: "ACTIVO", nature: "DEUDORA", level: 2, parentCode: "100" },
  { code: "115", name: "Inventario", type: "ACTIVO", nature: "DEUDORA", level: 2, parentCode: "100" },
  { code: "118", name: "Impuestos acreditables pagados (IVA)", type: "ACTIVO", nature: "DEUDORA", level: 2, parentCode: "100" },

  { code: "200", name: "Pasivo", type: "PASIVO", nature: "ACREEDORA", level: 1, parentCode: null },
  { code: "201", name: "Proveedores", type: "PASIVO", nature: "ACREEDORA", level: 2, parentCode: "200" },
  { code: "208", name: "Impuestos trasladados cobrados (IVA)", type: "PASIVO", nature: "ACREEDORA", level: 2, parentCode: "200" },

  { code: "300", name: "Capital Contable", type: "CAPITAL", nature: "ACREEDORA", level: 1, parentCode: null },
  { code: "301", name: "Capital Social", type: "CAPITAL", nature: "ACREEDORA", level: 2, parentCode: "300" },
  { code: "304", name: "Resultado del Ejercicio", type: "CAPITAL", nature: "ACREEDORA", level: 2, parentCode: "300" },

  { code: "400", name: "Ingresos", type: "INGRESOS", nature: "ACREEDORA", level: 1, parentCode: null },
  { code: "401", name: "Ventas y/o Servicios", type: "INGRESOS", nature: "ACREEDORA", level: 2, parentCode: "400" },
  { code: "403", name: "Otros Ingresos", type: "INGRESOS", nature: "ACREEDORA", level: 2, parentCode: "400" },

  { code: "500", name: "Costos", type: "COSTOS", nature: "DEUDORA", level: 1, parentCode: null },
  { code: "501", name: "Costo de Ventas", type: "COSTOS", nature: "DEUDORA", level: 2, parentCode: "500" },

  { code: "600", name: "Gastos", type: "GASTOS", nature: "DEUDORA", level: 1, parentCode: null },
  { code: "601", name: "Gastos Generales", type: "GASTOS", nature: "DEUDORA", level: 2, parentCode: "600" },
  { code: "603", name: "Gastos de Venta", type: "GASTOS", nature: "DEUDORA", level: 2, parentCode: "600" },
  { code: "604", name: "Gastos de Administración", type: "GASTOS", nature: "DEUDORA", level: 2, parentCode: "600" },
];

export interface Account {
  id: string;
  code: string;
  name: string;
  type: "ACTIVO" | "PASIVO" | "CAPITAL" | "INGRESOS" | "COSTOS" | "GASTOS";
  nature: "DEUDORA" | "ACREEDORA";
  level: number;
  parentCode: string | null;
  balance: number;
}

export default function CatalogoCuentasPage() {
  const { companyId } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (code: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedParentCode, setSelectedParentCode] = useState("");

  useEffect(() => {
    if (!companyId) return;

    const q = query(collection(db, "companies", companyId, "accounts"), orderBy("code", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Account));
      setAccounts(data);
      setLoading(false);
    });

    return () => unsub();
  }, [companyId]);

  const handleSeed = async () => {
    if (!companyId) return;
    if (!window.confirm("¿Deseas poblar el catálogo de cuentas con la estructura básica recomendada por el SAT?")) return;
    
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      SEED_ACCOUNTS.forEach((acc) => {
        const docRef = doc(collection(db, "companies", companyId, "accounts"));
        batch.set(docRef, {
          ...acc,
          balance: 0,
          createdAt: new Date().toISOString()
        });
      });
      await batch.commit();
      alert("Catálogo poblado exitosamente.");
    } catch (e) {
      console.error(e);
      alert("Error al poblar el catálogo.");
    } finally {
      setSeeding(false);
    }
  };

  const handleSeedFull = async () => {
    if (!companyId) return;
    if (!window.confirm("¿Deseas completar tu catálogo con todas las cuentas del Nivel 1 y 2 recomendadas por el SAT? (Las cuentas que ya existen no se sobreescribirán).")) return;
    
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      const existingCodes = new Set(accounts.map(a => a.code));
      let addedCount = 0;

      FULL_SEED_ACCOUNTS.forEach((acc) => {
        if (!existingCodes.has(acc.code)) {
          const docRef = doc(collection(db, "companies", companyId, "accounts"));
          batch.set(docRef, {
            ...acc,
            balance: 0,
            createdAt: new Date().toISOString()
          });
          addedCount++;
        }
      });
      
      if (addedCount > 0) {
        await batch.commit();
        alert(`Se añadieron ${addedCount} cuentas nuevas al catálogo.`);
      } else {
        alert("Tu catálogo ya cuenta con todas las cuentas principales de esta estructura.");
      }
    } catch (e) {
      console.error(e);
      alert("Error al poblar el catálogo.");
    } finally {
      setSeeding(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!newCode || !newName || !selectedParentCode) {
      alert("Todos los campos son obligatorios.");
      return;
    }

    const parent = accounts.find(a => a.code === selectedParentCode);
    if (!parent) {
      alert("Cuenta padre no válida.");
      return;
    }

    if (!newCode.startsWith(parent.code)) {
      alert(`El código debe empezar con el código del padre (${parent.code}). Ej. ${parent.code}.01`);
      return;
    }

    if (accounts.some(a => a.code === newCode)) {
      alert("Ya existe una cuenta con este código.");
      return;
    }

    try {
      await addDoc(collection(db, "companies", companyId, "accounts"), {
        code: newCode,
        name: newName,
        type: parent.type,
        nature: parent.nature,
        level: parent.level + 1,
        parentCode: parent.code,
        balance: 0,
        createdAt: new Date().toISOString()
      });
      setIsModalOpen(false);
      setNewCode("");
      setNewName("");
      setSelectedParentCode("");
      alert("Cuenta añadida exitosamente.");
    } catch (error) {
      console.error(error);
      alert("Error al añadir la cuenta.");
    }
  };

  if (loading) {
    return <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  // Agrupar jerárquicamente para renderizar
  const rootAccounts = accounts.filter(a => a.level === 1);
  const getChildren = (parentCode: string) => accounts.filter(a => a.parentCode === parentCode);

  const renderAccountTree = (acc: Account, indent: number = 0) => {
    const children = getChildren(acc.code);
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(acc.code);

    return (
      <React.Fragment key={acc.id}>
        <tr className="hover:bg-slate-50 border-b last:border-0 transition-colors">
          <td className="px-4 py-3" style={{ paddingLeft: `${indent * 1.5 + 1}rem` }}>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-5 h-5 shrink-0">
                {hasChildren ? (
                  <button onClick={() => toggleCollapse(acc.code)} className="p-0.5 hover:bg-slate-200 rounded-sm text-slate-500 transition-colors" title={isCollapsed ? "Expandir" : "Contraer"}>
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                ) : (
                  indent === 0 ? <Layers className="w-3.5 h-3.5 text-indigo-400" /> : <div className="w-3 h-3 border-l-2 border-b-2 border-slate-300 rounded-bl mb-1 ml-1"></div>
                )}
              </div>
              <span className={`font-mono text-sm ${indent === 0 ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{acc.code}</span>
              <span className={`text-sm ${indent === 0 ? 'font-bold text-slate-900 uppercase' : 'font-medium text-slate-700'}`}>{acc.name}</span>
            </div>
          </td>
          <td className="px-4 py-3 text-xs text-slate-500">{acc.type}</td>
          <td className="px-4 py-3 text-xs text-slate-500">{acc.nature}</td>
          <td className="px-4 py-3 text-right font-semibold text-slate-700">${(acc.balance || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</td>
        </tr>
        {!isCollapsed && children.map(child => renderAccountTree(child, indent + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-indigo-600" />
            Catálogo de Cuentas
          </h1>
          <p className="text-muted-foreground mt-1">Estructura contable basada en el Código Agrupador del SAT.</p>
        </div>
        
        <div className="flex gap-3">
          {accounts.length === 0 ? (
            <>
              <Button onClick={handleSeed} disabled={seeding} variant="outline" className="gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                Catálogo Básico
              </Button>
              <Button onClick={handleSeedFull} disabled={seeding} variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                Catálogo Completo
              </Button>
            </>
          ) : (
            <Button onClick={handleSeedFull} disabled={seeding} variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50" title="Añade las cuentas faltantes del nivel 1 y 2 del SAT">
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Completar Catálogo SAT
            </Button>
          )}
          <Button onClick={() => setIsModalOpen(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white" disabled={accounts.length === 0}>
            <Plus className="w-4 h-4" />
            Nueva Cuenta
          </Button>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        {accounts.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <BookOpen className="w-16 h-16 text-slate-200 mb-4" />
            <h3 className="text-xl font-bold text-slate-700 mb-2">Tu catálogo está vacío</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">
              El catálogo de cuentas es la base para registrar ingresos, egresos y generar la balanza de comprobación. Te recomendamos poblar la estructura básica del SAT.
            </p>
            <div className="flex gap-4">
              <Button onClick={handleSeed} disabled={seeding} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Poblar Estructura Básica (20 cuentas)
              </Button>
              <Button onClick={handleSeedFull} disabled={seeding} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                Poblar Estructura Completa (Nivel 1 y 2)
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-6 py-3 font-semibold text-slate-600 text-sm">Código y Nombre de Cuenta</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-sm">Tipo</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-sm">Naturaleza</th>
                  <th className="px-4 py-3 font-semibold text-slate-600 text-sm text-right">Saldo Actual</th>
                </tr>
              </thead>
              <tbody>
                {rootAccounts.map(root => renderAccountTree(root))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center">
              <h2 className="text-xl font-bold">Añadir Subcuenta</h2>
            </div>
            <form onSubmit={handleAddAccount} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Cuenta Padre (Nivel Superior)</label>
                <select
                  value={selectedParentCode}
                  onChange={e => {
                    setSelectedParentCode(e.target.value);
                    setNewCode(e.target.value ? `${e.target.value}.` : "");
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                >
                  <option value="">Seleccione una cuenta padre...</option>
                  {accounts.map(a => (
                    <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">La nueva cuenta heredará el tipo y naturaleza de esta cuenta padre.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Código de la Nueva Cuenta</label>
                <Input
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  placeholder="Ej. 102.01.01"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Nombre de la Cuenta</label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ej. Banorte MN"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">Guardar Cuenta</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
