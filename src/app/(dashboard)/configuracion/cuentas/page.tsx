"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, getDocs, where, addDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Edit2, Banknote, CreditCard, Building2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BankAccount {
  id: string;
  name: string;
  type: "cash" | "bank" | "terminal";
  currency: string;
  initialBalance: number;
  accountId?: string;
}

export default function CuentasPage() {
  const { companyId } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"cash" | "bank" | "terminal">("bank");
  const [currency, setCurrency] = useState("MXN");
  const [initialBalance, setInitialBalance] = useState(0);
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "bankAccounts"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BankAccount));
      setAccounts(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [companyId]);

  const handleOpenForm = (acc?: BankAccount) => {
    if (acc) {
      setCurrentId(acc.id);
      setName(acc.name);
      setType(acc.type);
      setCurrency(acc.currency || "MXN");
      setInitialBalance(acc.initialBalance || 0);
    } else {
      setCurrentId("");
      setName("");
      setType("bank");
      setCurrency("MXN");
      setInitialBalance(0);
    }
    setIsEditing(true);
  };

  const handleCloseForm = () => {
    setIsEditing(false);
    setCurrentId("");
    setName("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !name.trim()) return;
    setSaving(true);
    try {
      let finalAccountId = accounts.find(a => a.id === currentId)?.accountId;
      
      if (!currentId || !finalAccountId) {
        const parentCode = type === "cash" ? "101" : "102"; // 101 Caja, 102 Bancos
        
        const accountsRef = collection(db, "companies", companyId, "accounts");
        const qParent = query(accountsRef, where("code", "==", parentCode));
        const parentSnap = await getDocs(qParent);
        
        if (!parentSnap.empty) {
          const parentData = parentSnap.docs[0].data();
          const qChildren = query(accountsRef, where("parentCode", "==", parentCode));
          const childrenSnap = await getDocs(qChildren);
          const count = childrenSnap.size + 1;
          const newCode = `${parentCode}.${count.toString().padStart(2, '0')}`;
          
          const newAccRef = await addDoc(accountsRef, {
             code: newCode,
             name: name.trim(),
             type: parentData.type,
             nature: parentData.nature,
             level: parentData.level + 1,
             parentCode: parentCode,
             balance: initialBalance,
             createdAt: new Date().toISOString()
          });
          finalAccountId = newAccRef.id;
        }
      } else if (currentId && finalAccountId) {
        // Update existing accounting account name
        await updateDoc(doc(db, "companies", companyId, "accounts", finalAccountId), {
          name: name.trim()
        });
      }

      const docId = currentId || crypto.randomUUID();
      const ref = doc(db, "companies", companyId, "bankAccounts", docId);
      await setDoc(ref, {
        name: name.trim(),
        type,
        currency,
        initialBalance,
        accountId: finalAccountId || null
      });
      handleCloseForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar la cuenta");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!companyId || !window.confirm("¿Seguro que deseas eliminar esta cuenta?")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "bankAccounts", id));
    } catch (error) {
      console.error(error);
      alert("Error al eliminar");
    }
  };

  const getTypeIcon = (t: string) => {
    switch (t) {
      case "cash": return <Banknote className="w-4 h-4 text-green-600" />;
      case "terminal": return <CreditCard className="w-4 h-4 text-blue-600" />;
      default: return <Building2 className="w-4 h-4 text-indigo-600" />;
    }
  };

  const getTypeLabel = (t: string) => {
    switch (t) {
      case "cash": return "Caja de Efectivo";
      case "terminal": return "Terminal / Tarjeta";
      default: return "Cuenta Bancaria";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cuentas y Cajas</h1>
          <p className="text-muted-foreground">
            Administra tus cuentas bancarias, cajas de efectivo y terminales punto de venta.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => handleOpenForm()} className="gap-2">
            <Plus className="w-4 h-4" /> Nueva Cuenta
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-card border rounded-lg p-6 max-w-xl animate-in fade-in zoom-in duration-300">
          <h2 className="text-xl font-bold mb-4">{currentId ? "Editar Cuenta" : "Nueva Cuenta"}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de la cuenta/caja</label>
              <Input 
                required 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Ej. Caja Principal, BBVA 1234..." 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="bank">Cuenta Bancaria</option>
                  <option value="cash">Caja de Efectivo</option>
                  <option value="terminal">Terminal POS</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Moneda</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="MXN">MXN - Pesos</option>
                  <option value="USD">USD - Dólares</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Saldo Inicial</label>
              <Input 
                type="number"
                step="0.01"
                required 
                value={initialBalance} 
                onChange={e => setInitialBalance(parseFloat(e.target.value) || 0)} 
                placeholder="0.00" 
              />
              <p className="text-xs text-muted-foreground">
                El saldo de la cuenta antes de registrar movimientos en el sistema.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="ghost" onClick={handleCloseForm}>Cancelar</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          {accounts.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              Aún no tienes cuentas registradas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Saldo Inicial</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(acc => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium font-semibold">{acc.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(acc.type)}
                        <span className="text-sm">{getTypeLabel(acc.type)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{acc.currency}</TableCell>
                    <TableCell className="text-muted-foreground font-medium text-right">
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: acc.currency || 'MXN' }).format(acc.initialBalance || 0)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenForm(acc)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(acc.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}
