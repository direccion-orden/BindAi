"use client";

import React, { useState, useEffect, use } from "react";
import { doc, getDoc, collection, query, onSnapshot, addDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Receipt, DollarSign, Calendar, CreditCard, BookOpen, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface ConceptItem {
  claveProdServ: string;
  noIdentificacion: string;
  cantidad: number;
  claveUnidad: string;
  unidad: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
}

export default function GastoDetallePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { companyId } = useAuth();
  const router = useRouter();

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conceptos, setConceptos] = useState<ConceptItem[]>([]);

  // Configurator / Payment States
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState("");
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [vatRate, setVatRate] = useState<number>(0.16);

  // Firestore lists
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [vatAccounts, setVatAccounts] = useState<any[]>([]);
  const [accountingAccounts, setAccountingAccounts] = useState<any[]>([]);

  // Helper for UTF-8 Base64 decoding
  const decodeBase64Utf8 = (str: string) => {
    try {
      return decodeURIComponent(
        atob(str)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
    } catch (e) {
      return atob(str);
    }
  };

  // Helper for parsing CFDI XML
  const parseCFDIXml = (xmlStr: string): ConceptItem[] => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
      const parserError = xmlDoc.getElementsByTagName("parsererror");
      if (parserError.length > 0) {
        console.error("XML parse error:", parserError[0].textContent);
        return [];
      }

      let conceptosNode = xmlDoc.getElementsByTagName("cfdi:Concepto");
      if (conceptosNode.length === 0) {
        conceptosNode = xmlDoc.getElementsByTagName("Concepto");
      }

      const items: ConceptItem[] = [];
      for (let i = 0; i < conceptosNode.length; i++) {
        const node = conceptosNode[i];
        const claveProdServ = node.getAttribute("ClaveProdServ") || "";
        const noIdentificacion = node.getAttribute("NoIdentificacion") || "";
        const cantidad = parseFloat(node.getAttribute("Cantidad") || "0") || 0;
        const claveUnidad = node.getAttribute("ClaveUnidad") || "";
        const unidad = node.getAttribute("Unidad") || "";
        const descripcion = node.getAttribute("Descripcion") || "";
        const valorUnitario = parseFloat(node.getAttribute("ValorUnitario") || "0") || 0;
        const importe = parseFloat(node.getAttribute("Importe") || "0") || 0;

        items.push({
          claveProdServ,
          noIdentificacion,
          cantidad,
          claveUnidad,
          unidad,
          descripcion,
          valorUnitario,
          importe,
        });
      }
      return items;
    } catch (err) {
      console.error("Error parsing CFDI XML:", err);
      return [];
    }
  };

  // Fetch document details
  useEffect(() => {
    if (!companyId || !params.id) return;

    const fetchInvoice = async () => {
      try {
        const docRef = doc(db, "companies", companyId, "expenses_inbox", params.id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const invData = snap.data();
          setInvoice({ id: snap.id, ...invData });

          // Initialize payment configuration
          const totalVal = invData.total || 0;
          const paidVal = invData.paidAmount || 0;
          const outstanding = Math.max(0, totalVal - paidVal);
          setAmount(Number(outstanding.toFixed(2)));
          setDate(new Date().toISOString().split("T")[0]);
          setExpenseAccountId(invData.accountId || "");

          // Parse XML base64 if present
          if (invData.xmlBase64) {
            const xmlText = decodeBase64Utf8(invData.xmlBase64);
            const parsedItems = parseCFDIXml(xmlText);
            setConceptos(parsedItems);
          }
        }
      } catch (err) {
        console.error("Error fetching SAT invoice:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [companyId, params.id]);

  // Fetch bank accounts and classifications
  useEffect(() => {
    if (!companyId) return;

    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAccountingAccounts(allAcc);
      setExpenseAccounts(allAcc.filter((a: any) => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2));
      setVatAccounts(allAcc.filter((a: any) => a.code.startsWith("118") && a.level >= 2));
    });

    const unsubBank = onSnapshot(query(collection(db, "companies", companyId, "bankAccounts")), (snap) => {
      setBankAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubAcc();
      unsubBank();
    };
  }, [companyId]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!invoice) {
    return <div className="p-10 text-center text-muted-foreground">Factura no encontrada.</div>;
  }

  const saldoPendiente = Math.max(0, (invoice.total || 0) - (invoice.paidAmount || 0));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (amount <= 0 || amount > Number((saldoPendiente + 0.01).toFixed(2))) {
      alert("El monto debe ser mayor a 0 y no puede exceder el saldo pendiente.");
      return;
    }

    if (!bankAccountId) {
      alert("Debes seleccionar una Cuenta de Banco (Origen).");
      return;
    }

    const finalExpenseAccountId = invoice.accountId || expenseAccountId;
    if (!finalExpenseAccountId) {
      alert("Debes clasificar este egreso en una Cuenta de Gasto.");
      return;
    }

    setSaving(true);
    try {
      const providerName = invoice.emisorName || "Proveedor";
      const documentNumber = invoice.invoiceNumber || invoice.uuid || invoice.id;

      // 1. Create payment record in outflows
      const paymentData = {
        amount,
        date,
        method,
        reference,
        documentId: invoice.id,
        documentType: "gasto",
        documentNumber,
        providerName,
        bankAccountId,
        expenseAccountId: finalExpenseAccountId,
        createdAt: new Date().toISOString(),
      };

      const paymentRef = await addDoc(collection(db, "companies", companyId, "outflows"), paymentData);

      // 2. Create Journal Entry (Póliza de Egreso)
      const physicalBankAccount = bankAccounts.find((a) => a.id === bankAccountId);
      const expenseAccount = expenseAccounts.find((a) => a.id === finalExpenseAccountId);
      const bankAccountingId = physicalBankAccount?.accountId;
      const bankAccountingAccount = bankAccountingId ? accountingAccounts.find((a) => a.id === bankAccountingId) : null;

      if (!bankAccountingAccount) {
        alert(`La cuenta/caja "${physicalBankAccount?.Name || physicalBankAccount?.name || "seleccionada"}" no está enlazada a una cuenta contable. Por favor configúrala.`);
        setSaving(false);
        return;
      }

      if (physicalBankAccount && expenseAccount && bankAccountingAccount) {
        let subtotalAmount = amount;
        let vatAmount = 0;
        let vatAccount = null;

        if (vatRate > 0) {
          subtotalAmount = amount / (1 + vatRate);
          vatAmount = amount - subtotalAmount;
          vatAccount = vatAccounts[0];
        }

        const entries = [
          {
            accountId: finalExpenseAccountId,
            accountCode: expenseAccount.code,
            accountName: expenseAccount.name,
            debit: subtotalAmount,
            credit: 0,
          },
          {
            accountId: bankAccountingId,
            accountCode: bankAccountingAccount.code,
            accountName: bankAccountingAccount.name,
            debit: 0,
            credit: amount,
          },
        ];

        if (vatAmount > 0 && vatAccount) {
          entries.push({
            accountId: vatAccount.id,
            accountCode: vatAccount.code,
            accountName: vatAccount.name,
            debit: vatAmount,
            credit: 0,
          });
        }

        await addDoc(collection(db, "companies", companyId, "journal_entries"), {
          type: "egreso",
          date,
          description: `Pago de gasto SAT ${paymentData.documentNumber}`,
          referenceId: paymentRef.id,
          referenceType: "payment_outflow",
          createdAt: new Date().toISOString(),
          status: "activa",
          entries,
        });

        // Update Account Balances
        await updateDoc(doc(db, "companies", companyId, "accounts", finalExpenseAccountId), {
          balance: increment(subtotalAmount),
        });
        await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
          balance: increment(-amount),
        });
        await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId), {
          balance: increment(-amount),
        });
        if (vatAmount > 0 && vatAccount) {
          await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
            balance: increment(vatAmount),
          });
        }
      }

      // If document didn't have accountId, update it so it's classified
      const docUpdates: any = {
        paidAmount: increment(amount),
      };

      if (!invoice.accountId && expenseAccountId) {
        docUpdates.accountId = expenseAccountId;
        docUpdates.accountCode = expenseAccount?.code || "";
        docUpdates.accountName = expenseAccount?.name || "";
      }

      const newPaidAmount = (invoice.paidAmount || 0) + amount;
      if (newPaidAmount >= (invoice.total || 0) - 0.01) {
        if (!invoice.status || invoice.status === "pending_review") {
          docUpdates.status = "paid";
        }
      }

      await updateDoc(doc(db, "companies", companyId, "expenses_inbox", invoice.id), docUpdates);

      alert("Egreso registrado exitosamente.");
      router.push("/gastos");
    } catch (err) {
      console.error("Error registering payment:", err);
      alert("Hubo un error al registrar el pago.");
    } finally {
      setSaving(false);
    }
  };

  const methods = ["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"];

  return (
    <div className="flex flex-col space-y-6 max-w-6xl mx-auto pb-10">
      
      {/* Header back link */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <Link href="/gastos">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Detalles de Factura Recibida</h1>
            <p className="text-muted-foreground text-sm mt-1">
              RFC Emisor: <span className="font-bold text-slate-800">{invoice.emisorRfc}</span> | UUID: <span className="font-mono text-slate-500">{invoice.uuid}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {invoice.status === "paid" ? (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-lg flex items-center gap-2 border border-emerald-200 text-sm">
              <CheckCircle2 className="w-5 h-5" /> Gasto Pagado
            </div>
          ) : (
            <div className="px-4 py-2 bg-rose-50 text-rose-700 font-bold rounded-lg flex items-center gap-2 border border-rose-200 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600" /> Saldo Pendiente: ${(saldoPendiente).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {/* Datos Generales y Configuración (Encabezado) */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-6">
        <h3 className="font-semibold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
          <Receipt className="w-4 h-4 text-indigo-600" />
          Datos Generales de la Factura y Asignación de Gasto
        </h3>
        
        {/* Fila Horizontal de Metadatos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 bg-slate-50 p-4 rounded-lg border border-slate-200 overflow-hidden text-sm">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Proveedor (Emisor)</p>
            <p className="font-bold text-slate-900 truncate" title={invoice.emisorName}>{invoice.emisorName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">RFC</p>
            <p className="font-bold text-slate-900">{invoice.emisorRfc}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Fecha Emisión</p>
            <p className="font-bold text-slate-900">{invoice.date}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Total Facturado</p>
            <p className="font-black text-rose-600">${(invoice.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase mb-1">Folio Fiscal (UUID)</p>
            <p className="font-mono text-xs text-slate-500 truncate" title={invoice.uuid}>{invoice.uuid}</p>
          </div>
        </div>

        {/* Campos de Asignación / Registro de Pago */}
        {saldoPendiente > 0.01 ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
              
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  Monto a Pagar *
                </label>
                <Input 
                  type="number" 
                  step="0.01" 
                  min="0.01" 
                  max={saldoPendiente + 0.01}
                  value={amount} 
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)} 
                  className="font-bold text-sm h-9 bg-background"
                  required 
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Fecha *
                </label>
                <Input 
                  type="date" 
                  value={date} 
                  onChange={e => setDate(e.target.value)} 
                  className="text-xs h-9 bg-background"
                  required 
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                  Método *
                </label>
                <select 
                  value={method} 
                  onChange={e => setMethod(e.target.value)} 
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none"
                  required
                >
                  {methods.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                  Cuenta Origen *
                </label>
                <select
                  value={bankAccountId}
                  onChange={e => setBankAccountId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none"
                  required
                >
                  <option value="" disabled>Selecciona la cuenta origen...</option>
                  {bankAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {(a.Name || a.name || 'Cuenta sin nombre')} ({(a.CurrencyCode || a.currency || 'MXN')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  IVA Incluido *
                </label>
                <select
                  value={vatRate}
                  onChange={e => setVatRate(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none"
                  required
                >
                  <option value={0.16}>16% (General)</option>
                  <option value={0.08}>8% (Frontera)</option>
                  <option value={0}>0% / Exento</option>
                </select>
              </div>

              {!invoice.accountId && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                    Clasificación de Gasto *
                  </label>
                  <select
                    value={expenseAccountId}
                    onChange={e => setExpenseAccountId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none"
                    required
                  >
                    <option value="" disabled>Clasifica este egreso...</option>
                    {expenseAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className={invoice.accountId ? "space-y-1 md:col-span-2" : "space-y-1 md:col-span-1"}>
                <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Referencia / Notas
                </label>
                <Input 
                  placeholder="Ej. SPEI 123456"
                  value={reference} 
                  onChange={e => setReference(e.target.value)} 
                  className="h-9 text-xs bg-background"
                />
              </div>

              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={saving} 
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-2 h-9 font-bold text-xs shadow-sm animate-in fade-in"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  Confirmar Egreso
                </Button>
              </div>
            </div>
            {vatRate > 0 && vatAccounts.length === 0 && (
              <p className="text-[10px] text-rose-600 mt-1">Advertencia: No tienes una cuenta de IVA Acreditable Pagado (118) configurada.</p>
            )}
          </form>
        ) : (
          <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-sm text-center font-bold shadow-sm">
            ✓ Esta factura ya está totalmente liquidada.
          </div>
        )}
      </div>

      {/* 3. Concepts Table (Full Width) */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-semibold text-base flex items-center gap-2 text-slate-800">
            <FileText className="w-4 h-4 text-indigo-500" />
            Partidas y Conceptos
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 border text-slate-600 rounded">
            {conceptos.length > 0 ? `${conceptos.length} Conceptos` : "1 Partida General"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-xs font-bold text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Clave SAT</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Cant.</th>
                <th className="px-4 py-3 text-right">Precio U.</th>
                <th className="px-4 py-3 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {conceptos.length > 0 ? (
                conceptos.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-slate-100 border px-1.5 py-0.5 rounded text-slate-600">
                        {item.claveProdServ || "N/A"}
                      </span>
                      {item.noIdentificacion && (
                        <span className="block text-[10px] text-slate-400 font-mono mt-0.5">SKU: {item.noIdentificacion}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate" title={item.descripcion}>
                      {item.descripcion}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{item.cantidad} {item.unidad || "PZA"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">${item.valorUnitario.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">${item.importe.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))
              ) : (
                <tr className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-400">1</td>
                  <td className="px-4 py-3 font-mono text-slate-400">-</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">Gasto General / Concepto Global</div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">No se importaron conceptos individuales (Carga Metadatos)</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">1.00 PZA</td>
                  <td className="px-4 py-3 text-right text-slate-600">${(invoice.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">${(invoice.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Warning if metadata only */}
        {conceptos.length === 0 && (
          <div className="p-4 bg-amber-50 text-amber-800 text-xs border-t border-amber-100 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <p>
              <strong>Detalle de partidas no disponible:</strong> Esta factura fue sincronizada desde los metadatos globales del SAT sin el archivo XML adjunto. Se muestra la partida global por el importe total.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
