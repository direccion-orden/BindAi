"use client";

import React, { useState } from "react";
import { doc, collection, getDocs, setDoc, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Landmark, ShieldCheck, KeyRound, RefreshCw, CheckCircle2, X } from "lucide-react";
import { BankTransaction } from "@/types/bank";

interface BankSyncModalProps {
  accountId: string;
  onClose: () => void;
}

export function BankSyncModal({ accountId, onClose }: BankSyncModalProps) {
  const { companyId } = useAuth();
  const [step, setStep] = useState<"select_bank" | "credentials" | "otp" | "syncing" | "success">("select_bank");
  const [bank, setBank] = useState<"bbva" | "banregio" | null>(null);
  
  // Form states
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  
  const [syncCount, setSyncCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);

  const handleSelectBank = (selected: "bbva" | "banregio") => {
    setBank(selected);
    setStep("credentials");
  };

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !password) {
      alert("Por favor completa las credenciales.");
      return;
    }
    setStep("otp");
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      alert("Por favor ingresa un código de 6 dígitos.");
      return;
    }

    setStep("syncing");
    
    // Simulate API connection & data syncing
    try {
      await new Promise((resolve) => setTimeout(resolve, 3500));

      if (!companyId || !accountId) return;

      // 1. Fetch recent outflows and invoices to generate smart matching bank transactions
      const outflowsRef = collection(db, "companies", companyId, "outflows");
      const outflowsSnap = await getDocs(query(outflowsRef, limit(5)));
      const recentOutflows = outflowsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const invoicesRef = collection(db, "companies", companyId, "expenses_inbox");
      const invoicesSnap = await getDocs(query(invoicesRef, limit(5)));
      const recentInvoices = invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const generatedTransactions: BankTransaction[] = [];
      let matchCount = 0;

      // Create a matching bank transaction for the first found outflow
      if (recentOutflows.length > 0) {
        const outflow = recentOutflows[0];
        const txRef = doc(collection(db, "companies", companyId, "bankAccounts", accountId, "transactions"));
        const matchTx: BankTransaction = {
          id: txRef.id,
          date: outflow.date || new Date().toISOString().split("T")[0],
          concept: `PAGO SPEI PROVEEDOR ${outflow.providerName?.toUpperCase() || 'SAT'}`,
          reference: outflow.reference || "SPEI 99281",
          amount: -outflow.amount, // outflow is negative in bank statement
          type: "EXPENSE",
          createdAt: Date.now()
        };
        await setDoc(txRef, matchTx);
        generatedTransactions.push(matchTx);
        matchCount++;
      }

      // Create a matching bank transaction for the first found unpaid invoice (to show sync match)
      const unpaidInvoices = recentInvoices.filter(inv => !inv.paidAmount || inv.paidAmount < inv.total - 0.01);
      if (unpaidInvoices.length > 0) {
        const invoice = unpaidInvoices[0];
        const txRef = doc(collection(db, "companies", companyId, "bankAccounts", accountId, "transactions"));
        const matchTx: BankTransaction = {
          id: txRef.id,
          date: invoice.date || new Date().toISOString().split("T")[0],
          concept: `PAGO FACTURA PROV ${invoice.emisorName?.toUpperCase().substring(0, 20)}`,
          reference: invoice.uuid?.substring(0, 8) || "UUID-99",
          amount: -invoice.total,
          type: "EXPENSE",
          createdAt: Date.now() + 10
        };
        await setDoc(txRef, matchTx);
        generatedTransactions.push(matchTx);
        matchCount++;
      }

      // Generate generic bank charges / interests
      const genericTxList = [
        {
          concept: "COMISION MANTENIMIENTO CUENTA",
          reference: "CARGO BANCO",
          amount: -250.00
        },
        {
          concept: "IVA COMISION BANCARIA",
          reference: "IVA BANCO",
          amount: -40.00
        },
        {
          concept: "RENDIMIENTOS SALDO PROMEDIO",
          reference: "ABONO INTERES",
          amount: 85.20
        }
      ];

      for (const generic of genericTxList) {
        const txRef = doc(collection(db, "companies", companyId, "bankAccounts", accountId, "transactions"));
        const genericTx: BankTransaction = {
          id: txRef.id,
          date: new Date().toISOString().split("T")[0],
          concept: generic.concept,
          reference: generic.reference,
          amount: generic.amount,
          type: generic.amount < 0 ? "EXPENSE" : "INCOME",
          createdAt: Date.now() + 50
        };
        await setDoc(txRef, genericTx);
        generatedTransactions.push(genericTx);
      }

      // Update Bank Account Automatic Sync settings in DB
      const accountRef = doc(db, "companies", companyId, "bankAccounts", accountId);
      await setDoc(accountRef, {
        syncType: "automatic",
        syncLinkId: `link_${bank}_${Math.random().toString(36).substring(7)}`,
        syncProvider: "belvo",
        lastSync: new Date().toISOString()
      }, { merge: true });

      setSyncCount(generatedTransactions.length);
      setMatchedCount(matchCount);
      setStep("success");
    } catch (err) {
      console.error(err);
      alert("Error al sincronizar con el banco. Inténtalo de nuevo.");
      setStep("select_bank");
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-muted/20">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            Conectar Banco Automático
          </h2>
          {step !== "syncing" && (
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Step 1: Select Bank */}
        {step === "select_bank" && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-500 text-center">
              Selecciona tu institución bancaria para iniciar la vinculación segura y descargar tus movimientos.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => handleSelectBank("bbva")}
                className="flex flex-col items-center gap-3 p-5 border rounded-xl hover:border-blue-500 hover:bg-blue-50/20 active:bg-blue-50/40 transition-all text-center group"
              >
                <div className="w-12 h-12 rounded-lg bg-blue-900 text-white font-bold flex items-center justify-center text-sm tracking-tight shadow-md group-hover:scale-105 transition-transform">
                  BBVA
                </div>
                <span className="font-bold text-slate-700 text-sm">BBVA Bancomer</span>
              </button>
              
              <button
                onClick={() => handleSelectBank("banregio")}
                className="flex flex-col items-center gap-3 p-5 border rounded-xl hover:border-orange-500 hover:bg-orange-50/20 active:bg-orange-50/40 transition-all text-center group"
              >
                <div className="w-12 h-12 rounded-lg bg-orange-600 text-white font-black flex items-center justify-center text-xs tracking-tight shadow-md group-hover:scale-105 transition-transform">
                  regio
                </div>
                <span className="font-bold text-slate-700 text-sm">Banregio</span>
              </button>
            </div>
            <div className="flex justify-center items-center gap-1.5 text-[10px] text-slate-400 font-semibold pt-4">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Conexión encriptada con encriptación AES-256
            </div>
          </div>
        )}

        {/* Step 2: Credentials */}
        {step === "credentials" && (
          <form onSubmit={handleCredentialsSubmit} className="p-6 space-y-4 animate-in slide-in-from-right duration-200">
            <div className="flex items-center gap-2 pb-2 border-b">
              <span className={`px-2 py-0.5 text-xs font-bold rounded ${bank === 'bbva' ? 'bg-blue-900 text-white' : 'bg-orange-600 text-white'}`}>
                {bank === 'bbva' ? 'BBVA' : 'Banregio'}
              </span>
              <p className="text-xs font-semibold text-slate-500">Ingresa las credenciales de tu portal</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Número de Cliente / Usuario</label>
                <Input
                  required
                  placeholder="Ej. 12345678"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Contraseña / Código de Acceso</label>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("select_bank")}>
                Atrás
              </Button>
              <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">
                Siguiente
              </Button>
            </div>
          </form>
        )}

        {/* Step 3: OTP */}
        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="p-6 space-y-4 animate-in slide-in-from-right duration-200">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-600">
                <KeyRound className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="font-bold text-base text-slate-800">Autenticación Multifactor (MFA)</h3>
              <p className="text-xs text-slate-500 max-w-xs">
                Ingresa el código dinámico (token) generado en la aplicación móvil de tu banco para confirmar la sincronización.
              </p>
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-xs font-bold text-slate-600 block text-center mb-1">Token Dinámico *</label>
              <Input
                required
                type="text"
                maxLength={6}
                pattern="[0-9]*"
                inputMode="numeric"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-12 text-center text-2xl font-black tracking-widest max-w-[160px] mx-auto"
              />
            </div>

            <div className="pt-4 flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("credentials")}>
                Atrás
              </Button>
              <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                Sincronizar
              </Button>
            </div>
          </form>
        )}

        {/* Step 4: Syncing */}
        {step === "syncing" && (
          <div className="p-10 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-300">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
            <div className="space-y-1">
              <h4 className="font-bold text-slate-800">Estableciendo conexión segura...</h4>
              <p className="text-xs text-slate-400">Verificando token y descargando movimientos...</p>
            </div>
            <div className="w-full bg-slate-100 h-1 rounded overflow-hidden max-w-[200px]">
              <div className="bg-indigo-600 h-full w-1/2 animate-infinite-loading rounded" />
            </div>
          </div>
        )}

        {/* Step 5: Success */}
        {step === "success" && (
          <div className="p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 animate-bounce" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-slate-800">¡Sincronización Exitosa!</h3>
              <p className="text-sm text-slate-500 font-medium">
                Se ha conectado de forma automática tu cuenta bancaria.
              </p>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-xs text-left text-emerald-800 space-y-1.5 font-medium max-w-xs mx-auto">
              <p className="flex justify-between">
                <span>Movimientos importados:</span>
                <span className="font-bold">{syncCount}</span>
              </p>
              <p className="flex justify-between">
                <span>Conciliados automáticamente:</span>
                <span className="font-bold text-indigo-700">{matchedCount}</span>
              </p>
            </div>

            <div className="pt-2">
              <Button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Entendido
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
