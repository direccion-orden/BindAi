"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, addDoc, doc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, BookOpen, Layers, Check, Trash2, Edit2, ShieldAlert, ChevronDown, ChevronRight, Search, Sparkles, FolderTree, ArrowRight, X, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
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
  const [selectedL1Code, setSelectedL1Code] = useState<string>("");
  const [selectedL2Code, setSelectedL2Code] = useState<string>("");
  const [creationTarget, setCreationTarget] = useState<"L2" | "L3">("L3");
  const [searchL1, setSearchL1] = useState<string>("");
  const [searchL2, setSearchL2] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  // Estados para buscador principal
  const [catalogSearch, setCatalogSearch] = useState("");

  // Estados para modal de edición interactiva
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editMoveLocation, setEditMoveLocation] = useState(false);
  const [editSelectedL1Code, setEditSelectedL1Code] = useState("");
  const [editSelectedL2Code, setEditSelectedL2Code] = useState("");
  const [editTargetLevel, setEditTargetLevel] = useState<2 | 3>(3);
  const [savingEdit, setSavingEdit] = useState(false);

  // Bloquear el scroll del body mientras el modal esté abierto
  useEffect(() => {
    if (isModalOpen || isEditModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isModalOpen, isEditModalOpen]);

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

  // Helper para abrir el modal inicializando en la primera cuenta de mayor
  const openAddModal = () => {
    const l1 = accounts.filter(a => a.level === 1).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const firstL1 = l1[0]?.code || "";
    setSelectedL1Code(firstL1);
    setSearchL1("");
    setSearchL2("");
    setNewName("");

    if (firstL1) {
      const l2 = accounts
        .filter(a => a.level === 2 && (a.parentCode === firstL1 || a.code.startsWith(`${firstL1}-`)))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      if (l2.length > 0) {
        setSelectedL2Code(l2[0].code);
        setCreationTarget("L3");
      } else {
        setSelectedL2Code("");
        setCreationTarget("L2");
      }
    } else {
      setSelectedL2Code("");
      setCreationTarget("L2");
    }

    setIsModalOpen(true);
  };

  const handleSelectL1 = (code: string) => {
    setSelectedL1Code(code);
    const l2 = accounts
      .filter(a => a.level === 2 && (a.parentCode === code || a.code.startsWith(`${code}-`)))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    if (l2.length > 0) {
      setSelectedL2Code(l2[0].code);
      setCreationTarget("L3");
    } else {
      setSelectedL2Code("");
      setCreationTarget("L2");
    }
  };

  const handleSelectL2 = (code: string) => {
    setSelectedL2Code(code);
    setCreationTarget("L3");
  };

  const handleChooseCreateL2 = () => {
    setSelectedL2Code("");
    setCreationTarget("L2");
  };

  // Cuentas de Nivel 1 (Mayor)
  const l1List = useMemo(() => {
    return accounts
      .filter(a => a.level === 1)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts]);

  const filteredL1 = useMemo(() => {
    const q = searchL1.trim().toLowerCase();
    if (!q) return l1List;
    return l1List.filter(a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [l1List, searchL1]);

  const selectedL1 = useMemo(() => {
    return accounts.find(a => a.code === selectedL1Code) || null;
  }, [accounts, selectedL1Code]);

  // Subcuentas Nivel 2 bajo la cuenta de mayor seleccionada
  const l2List = useMemo(() => {
    if (!selectedL1Code) return [];
    return accounts
      .filter(a => a.level === 2 && (a.parentCode === selectedL1Code || a.code.startsWith(`${selectedL1Code}-`)))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, selectedL1Code]);

  const filteredL2 = useMemo(() => {
    const q = searchL2.trim().toLowerCase();
    if (!q) return l2List;
    return l2List.filter(a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  }, [l2List, searchL2]);

  const selectedL2 = useMemo(() => {
    return accounts.find(a => a.code === selectedL2Code) || null;
  }, [accounts, selectedL2Code]);

  // Cuentas Nivel 3 bajo la subcuenta seleccionada
  const l3List = useMemo(() => {
    if (!selectedL2Code) return [];
    return accounts
      .filter(a => a.level === 3 && (a.parentCode === selectedL2Code || a.code.startsWith(`${selectedL2Code}-`)))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, selectedL2Code]);

  // Código autogenerado según la jerarquía y el consecutivo disponible
  const autogeneratedCode = useMemo(() => {
    if (creationTarget === "L2") {
      if (!selectedL1Code) return "";
      const siblings = accounts.filter(
        a => a.level === 2 && (a.parentCode === selectedL1Code || a.code.startsWith(`${selectedL1Code}-`))
      );
      let maxNum = 0;
      siblings.forEach(s => {
        const parts = s.code.split("-");
        if (parts.length >= 2) {
          const n = parseInt(parts[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      });
      const nextNum = maxNum + 1;
      return `${selectedL1Code}-${String(nextNum).padStart(2, "0")}`;
    } else {
      if (!selectedL2Code) return "";
      const siblings = accounts.filter(
        a => a.level === 3 && (a.parentCode === selectedL2Code || a.code.startsWith(`${selectedL2Code}-`))
      );
      let maxNum = 0;
      siblings.forEach(s => {
        const parts = s.code.split("-");
        if (parts.length >= 3) {
          const n = parseInt(parts[2], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      });
      const nextNum = maxNum + 1;
      return `${selectedL2Code}-${String(nextNum).padStart(3, "0")}`;
    }
  }, [creationTarget, selectedL1Code, selectedL2Code, accounts]);

  const activeParent = useMemo(() => {
    if (creationTarget === "L3") return selectedL2;
    return selectedL1;
  }, [creationTarget, selectedL1, selectedL2]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!autogeneratedCode) {
      alert("No se pudo calcular el código de la cuenta. Selecciona una ubicación válida.");
      return;
    }

    if (!newName.trim()) {
      alert("Por favor ingresa el nombre de la nueva cuenta.");
      return;
    }

    if (!activeParent) {
      alert("No se encontró la cuenta padre correspondiente.");
      return;
    }

    if (accounts.some(a => a.code === autogeneratedCode)) {
      alert(`El código ${autogeneratedCode} ya existe en el catálogo.`);
      return;
    }

    setSavingAccount(true);
    try {
      await addDoc(collection(db, "companies", companyId, "accounts"), {
        code: autogeneratedCode,
        name: newName.trim(),
        type: activeParent.type,
        nature: activeParent.nature,
        level: creationTarget === "L3" ? 3 : 2,
        parentCode: activeParent.code,
        balance: 0,
        createdAt: new Date().toISOString()
      });
      setIsModalOpen(false);
      setNewName("");
      alert(`¡Cuenta ${autogeneratedCode} - ${newName.trim()} creada exitosamente!`);
    } catch (error: any) {
      console.error(error);
      alert(`Error al añadir la cuenta: ${error.message || "Error desconocido"}`);
    } finally {
      setSavingAccount(false);
    }
  };

  if (loading) {
    return <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  // Helper para abrir el modal de edición
  const openEditModal = (acc: Account) => {
    setAccountToEdit(acc);
    setEditName(acc.name);
    setEditMoveLocation(false);

    if (acc.level === 3) {
      const parentL2 = accounts.find(a => a.code === acc.parentCode);
      const parentL1Code = parentL2?.parentCode || (parentL2?.code ? parentL2.code.split("-")[0] : "");
      setEditSelectedL1Code(parentL1Code);
      setEditSelectedL2Code(parentL2?.code || "");
      setEditTargetLevel(3);
    } else if (acc.level === 2) {
      const parentL1 = accounts.find(a => a.code === acc.parentCode);
      setEditSelectedL1Code(parentL1?.code || (acc.code ? acc.code.split("-")[0] : ""));
      setEditSelectedL2Code("");
      setEditTargetLevel(2);
    } else {
      setEditSelectedL1Code("");
      setEditSelectedL2Code("");
      setEditTargetLevel(2);
    }

    setIsEditModalOpen(true);
  };

  // Subcuentas L2 bajo la L1 seleccionada en edición
  const editL2List = useMemo(() => {
    if (!editSelectedL1Code) return [];
    return accounts
      .filter(a => a.level === 2 && (a.parentCode === editSelectedL1Code || a.code.startsWith(`${editSelectedL1Code}-`)))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accounts, editSelectedL1Code]);

  // Cálculo del nuevo código autogenerado al reubicar
  const calculatedNewEditCode = useMemo(() => {
    if (!accountToEdit || !editMoveLocation) return accountToEdit?.code || "";

    if (editTargetLevel === 2) {
      if (!editSelectedL1Code) return "";
      if (accountToEdit.level === 2 && accountToEdit.parentCode === editSelectedL1Code) {
        return accountToEdit.code;
      }
      const siblings = accounts.filter(
        a => a.id !== accountToEdit.id && a.level === 2 && (a.parentCode === editSelectedL1Code || a.code.startsWith(`${editSelectedL1Code}-`))
      );
      let maxNum = 0;
      siblings.forEach(s => {
        const parts = s.code.split("-");
        if (parts.length >= 2) {
          const n = parseInt(parts[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      });
      return `${editSelectedL1Code}-${String(maxNum + 1).padStart(2, "0")}`;
    } else {
      if (!editSelectedL2Code) return "";
      if (accountToEdit.level === 3 && accountToEdit.parentCode === editSelectedL2Code) {
        return accountToEdit.code;
      }
      const siblings = accounts.filter(
        a => a.id !== accountToEdit.id && a.level === 3 && (a.parentCode === editSelectedL2Code || a.code.startsWith(`${editSelectedL2Code}-`))
      );
      let maxNum = 0;
      siblings.forEach(s => {
        const parts = s.code.split("-");
        if (parts.length >= 3) {
          const n = parseInt(parts[2], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      });
      return `${editSelectedL2Code}-${String(maxNum + 1).padStart(3, "0")}`;
    }
  }, [accountToEdit, editMoveLocation, editTargetLevel, editSelectedL1Code, editSelectedL2Code, accounts]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !accountToEdit) return;
    if (!editName.trim()) {
      alert("El nombre de la cuenta no puede estar vacío.");
      return;
    }

    setSavingEdit(true);
    try {
      const isMoving = editMoveLocation && calculatedNewEditCode && calculatedNewEditCode !== accountToEdit.code;
      const oldCode = accountToEdit.code;
      const newCode = isMoving ? calculatedNewEditCode : oldCode;

      let newParentCode = accountToEdit.parentCode;
      let newLevel = accountToEdit.level;
      let newType = accountToEdit.type;
      let newNature = accountToEdit.nature;

      if (isMoving) {
        const parent = editTargetLevel === 3 
          ? accounts.find(a => a.code === editSelectedL2Code)
          : accounts.find(a => a.code === editSelectedL1Code);
        if (parent) {
          newParentCode = parent.code;
          newLevel = editTargetLevel;
          newType = parent.type;
          newNature = parent.nature;
        }
      }

      const batch = writeBatch(db);
      // 1. Actualizar cuenta
      batch.update(doc(db, "companies", companyId, "accounts", accountToEdit.id), {
        name: editName.trim(),
        code: newCode,
        parentCode: newParentCode,
        level: newLevel,
        type: newType,
        nature: newNature,
        updatedAt: new Date().toISOString()
      });

      // 2. Cascada en hijos si el código cambió
      if (isMoving && oldCode !== newCode) {
        const children = accounts.filter(a => a.parentCode === oldCode);
        for (const child of children) {
          const childNewCode = child.code.startsWith(oldCode)
            ? `${newCode}${child.code.substring(oldCode.length)}`
            : child.code;
          batch.update(doc(db, "companies", companyId, "accounts", child.id), {
            parentCode: newCode,
            code: childNewCode,
            type: newType,
            nature: newNature,
            updatedAt: new Date().toISOString()
          });
        }
      }

      await batch.commit();
      setIsEditModalOpen(false);
      alert(`Cuenta ${newCode} - ${editName.trim()} actualizada exitosamente.`);
    } catch (err: any) {
      console.error(err);
      alert(`Error al actualizar la cuenta: ${err.message || "Error desconocido"}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // Lógica de búsqueda jerárquica
  const searchMatchInfo = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return null;

    const directMatches = accounts.filter(
      a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
    );

    const visibleCodes = new Set<string>();
    directMatches.forEach(m => {
      visibleCodes.add(m.code);
      let currentParentCode = m.parentCode;
      while (currentParentCode) {
        visibleCodes.add(currentParentCode);
        const parentAcc = accounts.find(a => a.code === currentParentCode);
        currentParentCode = parentAcc?.parentCode || null;
      }
    });

    return {
      visibleCodes,
      directCodes: new Set(directMatches.map(m => m.code)),
      count: directMatches.length
    };
  }, [accounts, catalogSearch]);

  // Agrupar jerárquicamente para renderizar
  const rootAccounts = accounts.filter(a => a.level === 1);
  const getChildren = (parentCode: string) => accounts.filter(a => a.parentCode === parentCode);

  const renderAccountTree = (acc: Account, indent: number = 0) => {
    // Si hay búsqueda activa y esta cuenta (ni sus descendientes) coincide, no renderizar
    if (searchMatchInfo && !searchMatchInfo.visibleCodes.has(acc.code)) {
      return null;
    }

    const children = getChildren(acc.code);
    const hasChildren = children.length > 0;
    // Si hay búsqueda activa, mantener desplegado para ver las coincidencias
    const isCollapsed = searchMatchInfo ? false : collapsed.has(acc.code);
    const isDirectMatch = searchMatchInfo?.directCodes.has(acc.code);

    return (
      <React.Fragment key={acc.id}>
        <tr
          onClick={() => openEditModal(acc)}
          className={`border-b last:border-0 transition-colors cursor-pointer group ${
            isDirectMatch
              ? "bg-amber-50/70 hover:bg-amber-100/70"
              : "hover:bg-indigo-50/50 bg-white"
          }`}
          title="Haz clic para editar el nombre o reubicar esta cuenta"
        >
          <td className="px-4 py-3" style={{ paddingLeft: `${indent * 1.5 + 1}rem` }}>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center w-5 h-5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {hasChildren ? (
                  <button
                    onClick={() => toggleCollapse(acc.code)}
                    className="p-0.5 hover:bg-slate-200 rounded-sm text-slate-500 transition-colors"
                    title={isCollapsed ? "Expandir" : "Contraer"}
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                ) : (
                  indent === 0 ? <Layers className="w-3.5 h-3.5 text-indigo-400" /> : <div className="w-3 h-3 border-l-2 border-b-2 border-slate-300 rounded-bl mb-1 ml-1"></div>
                )}
              </div>
              <span className={`font-mono text-sm ${
                indent === 0 ? 'font-bold text-slate-900' : 'text-slate-600'
              } ${isDirectMatch ? 'text-amber-900 font-extrabold' : ''}`}>
                {acc.code}
              </span>
              <span className={`text-sm ${
                indent === 0 ? 'font-bold text-slate-900 uppercase' : 'font-medium text-slate-700'
              } ${isDirectMatch ? 'text-amber-950 font-extrabold' : ''}`}>
                {acc.name}
              </span>
              {isDirectMatch && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 ml-2">
                  Coincidencia
                </span>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-xs text-slate-500 font-medium">{acc.type}</td>
          <td className="px-4 py-3 text-xs text-slate-500">{acc.nature}</td>
          <td className="px-4 py-3 text-right font-semibold text-slate-700">
            ${(acc.balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </td>
          <td className="px-4 py-3 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openEditModal(acc)}
              className="h-8 px-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/60 rounded-lg group-hover:opacity-100 transition-all gap-1.5 text-xs font-semibold"
              title="Editar cuenta"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Editar</span>
            </Button>
          </td>
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
          <Button onClick={openAddModal} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm" disabled={accounts.length === 0}>
            <Plus className="w-4 h-4" />
            Nueva Cuenta
          </Button>
        </div>
      </div>

      {/* Barra de Búsqueda del Catálogo */}
      {accounts.length > 0 && (
        <div className="bg-white p-3.5 rounded-xl border shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar cuenta por código o nombre (ej. 251, Préstamo, BBVA, etc.)..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="pl-9 pr-9 h-10 text-sm bg-slate-50/60 border-slate-200 focus:bg-white"
            />
            {catalogSearch && (
              <button
                type="button"
                onClick={() => setCatalogSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title="Limpiar búsqueda"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchMatchInfo && (
            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap shadow-sm">
                {searchMatchInfo.count} {searchMatchInfo.count === 1 ? "cuenta encontrada" : "cuentas encontradas"}
              </span>
            </div>
          )}
        </div>
      )}

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
                  <th className="px-4 py-3 font-semibold text-slate-600 text-sm text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rootAccounts.map(root => renderAccountTree(root))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Interactivo de Edición y Reubicación de Cuentas */}
      {isEditModalOpen && accountToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overscroll-contain animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-indigo-50/40 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Editar Cuenta Contable</h2>
                  <p className="text-xs text-slate-500">
                    Modifica el nombre o reubica la cuenta <span className="font-mono font-bold text-indigo-700">{accountToEdit.code}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
              {/* Tarjeta Informativa de la Cuenta */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Código actual:</span>
                  <span className="font-mono text-sm font-bold bg-white px-2.5 py-0.5 rounded border border-slate-200 text-slate-900">
                    {accountToEdit.code}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Tipo y Naturaleza:</span>
                  <span className="font-bold text-slate-800">
                    {accountToEdit.type} ({accountToEdit.nature}) • Nivel {accountToEdit.level}
                  </span>
                </div>
              </div>

              {/* Edición de Nombre */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Nombre de la Cuenta *
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nombre de la cuenta contable..."
                  className="h-10 text-sm bg-white"
                  required
                />
              </div>

              {/* Reubicación de Cuentas (Nivel 2 y 3) */}
              {accountToEdit.level >= 2 && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800">Reubicar cuenta</span>
                      <p className="text-[11px] text-slate-500">
                        Cambia la cuenta padre para moverla a otra categoría o nivel.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editMoveLocation}
                        onChange={(e) => setEditMoveLocation(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {editMoveLocation && (
                    <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-3 animate-in fade-in duration-200">
                      {/* Destino de nivel */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-indigo-950 uppercase">
                          Nivel de destino
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setEditTargetLevel(2)}
                            className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                              editTargetLevel === 2
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            Nivel 2 (Subcuenta)
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditTargetLevel(3)}
                            className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                              editTargetLevel === 3
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            Nivel 3 (Detalle)
                          </button>
                        </div>
                      </div>

                      {/* Selector Cuenta de Mayor (Nivel 1) */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-indigo-950 uppercase">
                          1. Cuenta de Mayor (Nivel 1)
                        </label>
                        <select
                          value={editSelectedL1Code}
                          onChange={(e) => {
                            setEditSelectedL1Code(e.target.value);
                            const l2 = accounts.filter(
                              a => a.level === 2 && (a.parentCode === e.target.value || a.code.startsWith(`${e.target.value}-`))
                            );
                            setEditSelectedL2Code(l2[0]?.code || "");
                          }}
                          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                          required
                        >
                          <option value="">Selecciona cuenta de mayor...</option>
                          {l1List.map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.code} - {m.name} ({m.type})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Selector Subcuenta (Nivel 2) si destino es Nivel 3 */}
                      {editTargetLevel === 3 && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-indigo-950 uppercase">
                            2. Subcuenta Padre (Nivel 2)
                          </label>
                          <select
                            value={editSelectedL2Code}
                            onChange={(e) => setEditSelectedL2Code(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                            required
                            disabled={!editSelectedL1Code || editL2List.length === 0}
                          >
                            <option value="">
                              {editL2List.length === 0
                                ? "Esta cuenta de mayor no tiene subcuentas nivel 2"
                                : "Selecciona subcuenta..."}
                            </option>
                            {editL2List.map((s) => (
                              <option key={s.code} value={s.code}>
                                {s.code} - {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Vista previa de reubicación y código calculado */}
                      <div className="p-3 bg-white rounded-lg border border-indigo-200 text-xs space-y-1">
                        <span className="text-[11px] font-semibold text-slate-500">Nuevo código calculado:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-black text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200">
                            {calculatedNewEditCode || "---"}
                          </span>
                          {calculatedNewEditCode !== accountToEdit.code && (
                            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Reubicación lista
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Si esta cuenta tiene subcuentas hijas, sus prefijos y cuentas padre se actualizarán automáticamente en cascada.
                        </p>
                      </div>

                    </div>
                  )}
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  className="h-10 text-xs font-semibold"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingEdit || !editName.trim() || (editMoveLocation && !calculatedNewEditCode)}
                  className="h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-100"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Guardar Cambios
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overscroll-contain animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-indigo-50/40 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Añadir Cuenta Contable</h2>
                  <p className="text-xs text-slate-500">
                    Selección progresiva en 3 niveles con asignación automática de código y consecutivo.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: 3 Progressive Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-slate-50/40 flex-1 min-h-0 h-[480px] max-h-[60vh] overflow-hidden">
              
              {/* Columna 1: Cuentas de Mayor (Nivel 1) */}
              <div className="flex flex-col bg-white overflow-hidden min-h-0 h-full">
                <div className="p-3 border-b bg-slate-50/80 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      1. Mayor (Nivel 1)
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">{filteredL1.length} cuentas</span>
                  </div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <Input
                      placeholder="Buscar por código o nombre..."
                      value={searchL1}
                      onChange={e => setSearchL1(e.target.value)}
                      className="h-8 text-xs pl-8 bg-white"
                    />
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 min-h-0 p-2 space-y-1 overscroll-contain">
                  {filteredL1.map(mayor => {
                    const isSelected = selectedL1Code === mayor.code;
                    return (
                      <button
                        key={mayor.code}
                        type="button"
                        onClick={() => handleSelectL1(mayor.code)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all flex items-center justify-between ${
                          isSelected
                            ? "bg-indigo-50/90 border-indigo-500 text-indigo-950 shadow-sm font-semibold ring-1 ring-indigo-500/30"
                            : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden mr-2">
                          <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                            isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                          }`}>
                            {mayor.code}
                          </span>
                          <span className="truncate">{mayor.name}</span>
                        </div>
                        <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-indigo-600" : "text-slate-300"}`} />
                      </button>
                    );
                  })}
                  {filteredL1.length === 0 && (
                    <p className="p-4 text-center text-xs text-muted-foreground">No se encontraron cuentas de mayor.</p>
                  )}
                </div>
              </div>

              {/* Columna 2: Subcuentas (Nivel 2) */}
              <div className="flex flex-col bg-white overflow-hidden min-h-0 h-full">
                <div className="p-3 border-b bg-slate-50/80 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                      2. Subcuenta (Nivel 2)
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">{filteredL2.length} subcuentas</span>
                  </div>
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <Input
                      placeholder="Filtrar subcuentas..."
                      value={searchL2}
                      onChange={e => setSearchL2(e.target.value)}
                      className="h-8 text-xs pl-8 bg-white"
                      disabled={!selectedL1Code}
                    />
                  </div>
                  {selectedL1Code && (
                    <button
                      type="button"
                      onClick={handleChooseCreateL2}
                      className={`w-full text-xs font-bold py-1.5 px-3 rounded-lg border flex items-center justify-center gap-1.5 transition-all ${
                        creationTarget === "L2"
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                          : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Crear como nueva Subcuenta (Nivel 2)
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1 min-h-0 p-2 space-y-1 overscroll-contain">
                  {!selectedL1Code ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Selecciona una cuenta de mayor en la columna 1.
                    </div>
                  ) : filteredL2.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Esta cuenta de mayor no tiene subcuentas de nivel 2.
                      <div className="mt-2 text-indigo-600 font-semibold">
                        Haz clic arriba en "Crear como nueva Subcuenta (Nivel 2)".
                      </div>
                    </div>
                  ) : (
                    filteredL2.map(sub => {
                      const isSelected = selectedL2Code === sub.code && creationTarget === "L3";
                      return (
                        <button
                          key={sub.code}
                          type="button"
                          onClick={() => handleSelectL2(sub.code)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all flex items-center justify-between ${
                            isSelected
                              ? "bg-emerald-50/90 border-emerald-500 text-emerald-950 shadow-sm font-semibold ring-1 ring-emerald-500/30"
                              : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden mr-2">
                            <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                              isSelected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                            }`}>
                              {sub.code}
                            </span>
                            <span className="truncate">{sub.name}</span>
                          </div>
                          <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-emerald-600" : "text-slate-300"}`} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Columna 3: Detalle y Ranura Consecutiva (Nivel 3) */}
              <div className="flex flex-col bg-slate-50/60 overflow-hidden min-h-0 h-full">
                <div className="p-3 border-b bg-slate-50/80 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-violet-600"></span>
                      3. Destino y Consecutivo
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {creationTarget === "L3" ? `${l3List.length} existentes` : "Creación N2"}
                    </span>
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 min-h-0 p-2 space-y-1.5 overscroll-contain">
                  {creationTarget === "L2" ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                        <Sparkles className="w-4 h-4 text-emerald-600" />
                        Nueva Subcuenta de Mayor (Nivel 2)
                      </div>
                      <p className="text-xs text-slate-600">
                        La nueva cuenta se creará directamente como agrupación de segundo nivel bajo:
                      </p>
                      <div className="p-2 bg-white rounded-lg border border-emerald-200 font-mono text-xs font-bold text-slate-800">
                        {selectedL1?.code} - {selectedL1?.name}
                      </div>
                    </div>
                  ) : !selectedL2Code ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Selecciona una subcuenta en la columna 2.
                    </div>
                  ) : (
                    <>
                      {l3List.length > 0 && (
                        <div className="space-y-1 mb-2">
                          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                            Cuentas existentes en este nivel:
                          </p>
                          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                            {l3List.map(a => (
                              <div
                                key={a.code}
                                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs flex items-center justify-between text-slate-600"
                              >
                                <span className="font-mono text-[11px] font-semibold text-slate-500">{a.code}</span>
                                <span className="truncate ml-2 text-right">{a.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tarjeta Destino Autogenerada */}
                      <div className="p-3.5 bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl shadow-sm">
                        <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs mb-1">
                          <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                          Siguiente Consecutivo Disponible
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-mono text-base font-black text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 shadow-inner">
                            {autogeneratedCode}
                          </span>
                          <span className="text-[11px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                            Nivel 3 Afectable
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                          {l3List.length === 0
                            ? "Primera subcuenta asignada a esta categoría."
                            : `Calculada tras la cuenta más alta (${l3List[l3List.length - 1]?.code}).`}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer / Definition Form */}
            <form onSubmit={handleAddAccount} className="p-5 border-t bg-slate-50 flex flex-col gap-3 shrink-0">
              {/* Breadcrumb path */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Ubicación contable:</span>
                <span className="font-bold text-indigo-950 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  {selectedL1?.code} {selectedL1?.name || "Sin mayor"}
                </span>
                {creationTarget === "L3" && selectedL2 && (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                      {selectedL2.code} {selectedL2.name}
                    </span>
                  </>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono font-black text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200 shadow-sm">
                  {autogeneratedCode || "---"}
                </span>
                {activeParent && (
                  <span className="text-[11px] font-medium text-slate-500 ml-auto">
                    Hereda: <strong className="text-slate-700">{activeParent.type}</strong> ({activeParent.nature})
                  </span>
                )}
              </div>

              {/* Name Input & Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                <div className="relative flex-1 w-full">
                  <Input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Escribe el nombre de la nueva cuenta (Ej. BBVA Tarjeta Corporativa, Torno CNC, etc.)..."
                    className="h-10 text-sm bg-white border-slate-300 focus-visible:ring-indigo-500 font-medium"
                    autoFocus
                    required
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="w-full sm:w-auto h-10 text-xs font-semibold"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={savingAccount || !autogeneratedCode || !newName.trim()}
                    className="w-full sm:w-auto h-10 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-100"
                  >
                    {savingAccount ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Guardar Cuenta ({autogeneratedCode})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
