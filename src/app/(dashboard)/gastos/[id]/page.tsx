"use client";

import React, { useState, useEffect, use, useRef } from "react";
import { doc, getDoc, collection, query, onSnapshot, addDoc, updateDoc, increment, orderBy, where, deleteDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Receipt, DollarSign, Calendar, CreditCard, BookOpen, FileText, CheckCircle2, AlertCircle, Landmark, User, Building2, Save, X, Trash2 } from "lucide-react";
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
  descuento?: number;
}

export default function GastoDetallePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { companyId } = useAuth();
  const router = useRouter();

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conceptos, setConceptos] = useState<ConceptItem[]>([]);
  const [isManual, setIsManual] = useState(false);

  // Configurator / Payment States
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState("");
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [vatRate, setVatRate] = useState<number>(0.16);
  const [unreconciledTransactions, setUnreconciledTransactions] = useState<any[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>("manual");

  // Firestore lists
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [vatAccounts, setVatAccounts] = useState<any[]>([]);
  const [accountingAccounts, setAccountingAccounts] = useState<any[]>([]);
  const [associatedPayments, setAssociatedPayments] = useState<any[]>([]);

  // Catalogs for manual expenses
  const [vendors, setVendors] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);

  // States for manual expense editing
  const [editDate, setEditDate] = useState("");
  const [editVendorId, setEditVendorId] = useState("");
  const [editVendorSearchQuery, setEditVendorSearchQuery] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [editConcept, setEditConcept] = useState("");
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editVatRate, setEditVatRate] = useState<number>(0.16);
  const [editLocationId, setEditLocationId] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editCostCenterId, setEditCostCenterId] = useState("");

  const vendorSelectorRef = useRef<HTMLDivElement>(null);

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
        const descuento = parseFloat(node.getAttribute("Descuento") || "0") || 0;

        items.push({
          claveProdServ,
          noIdentificacion,
          cantidad,
          claveUnidad,
          unidad,
          descripcion,
          valorUnitario,
          importe,
          descuento,
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
        let docRef = doc(db, "companies", companyId, "expenses_inbox", params.id);
        let snap = await getDoc(docRef);
        let manual = false;

        if (!snap.exists()) {
          docRef = doc(db, "companies", companyId, "expenses", params.id);
          snap = await getDoc(docRef);
          manual = true;
        }

        if (snap.exists()) {
          setIsManual(manual);
          const invData = snap.data();

          const normalizedInvoice = {
            id: snap.id,
            emisorName: invData.emisorName || invData.vendorName || "Proveedor",
            emisorRfc: invData.emisorRfc || "",
            uuid: invData.uuid || invData.satInvoiceId || "Sin UUID",
            date: invData.date || "",
            total: invData.total !== undefined ? invData.total : invData.amount || 0,
            paidAmount: invData.paidAmount || 0,
            status: invData.status || "pending",
            invoiceNumber: invData.invoiceNumber || invData.documentNumber || "",
            xmlBase64: invData.xmlBase64 || null,
            accountId: invData.accountId || "",
            costCenterId: invData.costCenterId || "",
            locationId: invData.locationId || "",
            vatRate: invData.vatRate !== undefined ? invData.vatRate : 0.16,
            concept: invData.concept || "",
            vendorId: invData.vendorId || "",
            isRecurring: invData.isRecurring || false,
            recurrenceFrequency: invData.recurrenceFrequency || "",
            recurrenceEndDate: invData.recurrenceEndDate || "",
            estimatedAmount: invData.estimatedAmount || 0,
            items: invData.items || []
          };

          setInvoice(normalizedInvoice);

          // Initialize payment configuration
          const totalVal = normalizedInvoice.total;
          const paidVal = normalizedInvoice.paidAmount;
          const outstanding = Math.max(0, totalVal - paidVal);
          setAmount(Number(outstanding.toFixed(2)));
          setDate(new Date().toISOString().split("T")[0]);
          setExpenseAccountId(normalizedInvoice.accountId || "");

          // Pre-fill edit fields if manual
          if (manual) {
            setEditDate(normalizedInvoice.date);
            setEditVendorId(normalizedInvoice.vendorId || "");
            setEditVendorSearchQuery(normalizedInvoice.emisorName);
            setEditConcept(normalizedInvoice.concept);
            setEditAmount(normalizedInvoice.total);
            setEditVatRate(normalizedInvoice.vatRate);
            setEditLocationId(normalizedInvoice.locationId);
            setEditAccountId(normalizedInvoice.accountId);
            setEditCostCenterId(normalizedInvoice.costCenterId);
          }

          // Parse XML base64 if present, else map manual items
          if (invData.xmlBase64) {
            const xmlText = decodeBase64Utf8(invData.xmlBase64);
            const parsedItems = parseCFDIXml(xmlText);
            setConceptos(parsedItems);
          } else if (invData.items && invData.items.length > 0) {
            const mappedConceptos = invData.items.map((item: any) => ({
              claveProdServ: item.accountId || "",
              noIdentificacion: item.variantTitle || "",
              cantidad: item.quantity || 1,
              claveUnidad: "",
              unidad: "PZA",
              descripcion: item.productName || "Gasto",
              valorUnitario: item.unitCost || item.amount || 0,
              importe: (item.quantity || 1) * (item.unitCost || item.amount || 0),
            }));
            setConceptos(mappedConceptos);
          }
        }
      } catch (err) {
        console.error("Error fetching invoice:", err);
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

    const unsubV = onSnapshot(query(collection(db, "companies", companyId, "vendors")), (snap) => {
      setVendors(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.LegalName || data.name || data.CommercialName || "Proveedor sin nombre",
          rfc: data.rfc || data.RFC || ""
        };
      }));
    });

    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      })));
    });

    const unsubCC = onSnapshot(query(collection(db, "companies", companyId, "cost_centers"), orderBy("code", "asc")), (snap) => {
      setCostCenters(snap.docs.map(d => ({
        id: d.id,
        code: d.data().code || "",
        name: d.data().name || "",
        isActive: d.data().isActive ?? true
      })));
    });

    return () => {
      unsubAcc();
      unsubBank();
      unsubV();
      unsubLoc();
      unsubCC();
    };
  }, [companyId]);

  // Fetch associated payments/outflows
  useEffect(() => {
    if (!companyId || !params.id) return;

    const q = query(
      collection(db, "companies", companyId, "outflows"),
      where("documentId", "==", params.id)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setAssociatedPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      console.error("Error loading associated payments:", error);
    });

    return () => unsubscribe();
  }, [companyId, params.id]);

  // Load unreconciled transactions for the selected bank account
  useEffect(() => {
    setSelectedTransactionId("manual");
    if (!companyId || !bankAccountId) {
      setUnreconciledTransactions([]);
      return;
    }

    const q = query(
      collection(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions"),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const txs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const filtered = txs.filter(t => t.amount < 0 && !t.reconciled);
      setUnreconciledTransactions(filtered);
    }, (error) => {
      console.error("Error loading transactions:", error);
    });

    return () => unsubscribe();
  }, [companyId, bankAccountId]);

  // Auto-fill when a transaction is selected
  useEffect(() => {
    if (selectedTransactionId && selectedTransactionId !== "manual") {
      const matchedTx = unreconciledTransactions.find(t => t.id === selectedTransactionId);
      if (matchedTx) {
        if (matchedTx.reference) setReference(matchedTx.reference);
        if (matchedTx.date) setDate(matchedTx.date);
      }
    }
  }, [selectedTransactionId, unreconciledTransactions]);

  // Click outside for vendor dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (vendorSelectorRef.current && !vendorSelectorRef.current.contains(event.target as Node)) {
        setShowVendorDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleUpdateManualExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !invoice) return;

    if (!editVendorId) {
      alert("Debes seleccionar un proveedor.");
      return;
    }
    if (!editAccountId) {
      alert("Debes seleccionar una cuenta contable.");
      return;
    }
    if (!editLocationId) {
      alert("Debes seleccionar una sucursal.");
      return;
    }
    if (editAmount <= 0) {
      alert("El monto debe ser mayor a 0.");
      return;
    }
    if (editAmount < (invoice.paidAmount || 0)) {
      alert(`El monto total no puede ser menor al monto ya pagado ($${(invoice.paidAmount || 0).toLocaleString("es-MX")}).`);
      return;
    }

    setSaving(true);
    try {
      const selectedVendor = vendors.find(v => v.id === editVendorId);
      const vendorName = selectedVendor?.name || editVendorSearchQuery || "Proveedor";

      const selectedAccount = expenseAccounts.find(a => a.id === editAccountId);
      const selectedLocation = locations.find(l => l.id === editLocationId);
      const locationName = selectedLocation?.name || "";

      const subtotal = editAmount / (1 + editVatRate);
      
      const lineKey = invoice.items?.[0]?.lineKey || invoice.items?.[0]?.variantId || crypto.randomUUID();
      const items = [{
        productId: "custom",
        variantId: lineKey,
        productName: editConcept || "Gasto",
        variantTitle: "SAT-XML",
        quantity: 1,
        unitCost: subtotal,
        lineKey,
        costCenterId: editCostCenterId || null,
        accountId: editAccountId,
        locationId: editLocationId
      }];

      let newStatus = invoice.status || "pending";
      if (newStatus !== "cancelado") {
        if (editAmount <= (invoice.paidAmount || 0) + 0.01) {
          newStatus = "paid";
        } else {
          newStatus = "pending";
        }
      }

      const expenseUpdates = {
        date: editDate,
        vendorId: editVendorId,
        vendorName,
        concept: editConcept,
        amount: editAmount,
        vatRate: editVatRate,
        locationId: editLocationId,
        locationName,
        accountId: editAccountId,
        accountCode: selectedAccount?.code || "",
        accountName: selectedAccount?.name || "",
        costCenterId: editCostCenterId || null,
        status: newStatus,
        items
      };

      await updateDoc(doc(db, "companies", companyId, "expenses", invoice.id), expenseUpdates);

      alert("Gasto operativo actualizado exitosamente.");
      window.location.reload();
    } catch (error) {
      console.error("Error updating manual expense:", error);
      alert("Hubo un error al actualizar el gasto operativo.");
    } finally {
      setSaving(false);
    }
  };

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

      let finalBankTransactionId = "";
      if (selectedTransactionId && selectedTransactionId !== "manual") {
        finalBankTransactionId = selectedTransactionId;
        await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions", selectedTransactionId), {
          reconciled: true,
          matchedAt: new Date().toISOString(),
          reconcileType: "match",
          matchedDocumentId: invoice.id
        });
      } else {
        // Register manually: create a transaction in the bank subcollection
        const txData = {
          amount: -amount,
          date,
          concept: `Pago CFDI: ${providerName} - Ref: ${reference || "Sin Ref"}`,
          reference: reference || "",
          reconciled: true,
          matchedAt: new Date().toISOString(),
          reconcileType: "direct",
          matchedDocumentId: invoice.id,
          createdAt: new Date().toISOString(),
        };
        const txRef = await addDoc(collection(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions"), txData);
        finalBankTransactionId = txRef.id;
      }

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
        bankTransactionId: finalBankTransactionId
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

      await updateDoc(doc(db, "companies", companyId, isManual ? "expenses" : "expenses_inbox", invoice.id), docUpdates);

      alert("Egreso registrado exitosamente.");
      router.push(isManual ? "/compras/gastos" : "/gastos");
    } catch (err) {
      console.error("Error registering payment:", err);
      alert("Hubo un error al registrar el pago.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (payment: any) => {
    if (!companyId) return;

    const confirmCancel = window.confirm(
      "¿Estás seguro de que deseas eliminar este egreso? Esta acción es irreversible y revertirá los saldos contables, el estatus de la factura y desvinculará el movimiento bancario."
    );

    if (!confirmCancel) return;

    setSaving(true);
    try {
      // 1. Revert Bank Transaction reconciliation if exists
      if (payment.bankTransactionId && payment.bankAccountId) {
        try {
          const txRef = doc(db, "companies", companyId, "bankAccounts", payment.bankAccountId, "transactions", payment.bankTransactionId);
          await updateDoc(txRef, {
            reconciled: false,
            matchedAt: null,
            reconcileType: null,
            matchedDocumentId: null
          });

          // Add amount back to bank physical balance
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", payment.bankAccountId), {
            balance: increment(payment.amount)
          });

          // Add amount back to bank accounting account balance
          const bankAccount = bankAccounts.find(a => a.id === payment.bankAccountId);
          const bankAccountingId = bankAccount?.accountId;
          if (bankAccountingId) {
            await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
              balance: increment(payment.amount)
            });
          }
        } catch (err) {
          console.warn("Failed to revert bank transaction:", err);
        }
      }

      // 2. Revert Journal Entries
      try {
        const jeSnap = await getDocs(
          query(
            collection(db, "companies", companyId, "journal_entries"),
            where("referenceId", "==", payment.id),
            where("referenceType", "==", "payment_outflow")
          )
        );

        for (const jeDoc of jeSnap.docs) {
          const jeData = jeDoc.data();
          if (jeData.entries && jeData.entries.length > 0) {
            for (const entry of jeData.entries) {
              const debitAmt = entry.debit || 0;
              const creditAmt = entry.credit || 0;
              // Revert balance change: subtract debit, add credit
              const diff = creditAmt - debitAmt;
              if (diff !== 0) {
                await updateDoc(doc(db, "companies", companyId, "accounts", entry.accountId), {
                  balance: increment(diff)
                });
              }
            }
          }
          // Delete journal entry document
          await deleteDoc(doc(db, "companies", companyId, "journal_entries", jeDoc.id));
        }
      } catch (err) {
        console.warn("Failed to revert journal entries:", err);
      }

      // 3. Revert Manual Expense status and paidAmount
      const diffPaidAmount = -payment.amount;
      if (isManual) {
        await updateDoc(doc(db, "companies", companyId, "expenses", invoice.id), {
          paidAmount: increment(diffPaidAmount),
          status: "pending"
        });

        // Also update linked SAT XML if exists
        if (invoice.satInvoiceId) {
          try {
            await updateDoc(doc(db, "companies", companyId, "expenses_inbox", invoice.satInvoiceId), {
              paidAmount: increment(diffPaidAmount),
              status: "processed"
            });
          } catch (err) {
            console.warn("Failed to update related SAT invoice:", err);
          }
        }
      } else {
        // XML directly
        await updateDoc(doc(db, "companies", companyId, "expenses_inbox", invoice.id), {
          paidAmount: increment(diffPaidAmount),
          status: invoice.expenseId ? "processed" : null
        });

        // Also update linked manual expense if it exists
        if (invoice.expenseId) {
          try {
            await updateDoc(doc(db, "companies", companyId, "expenses", invoice.expenseId), {
              paidAmount: increment(diffPaidAmount),
              status: "pending"
            });
          } catch (err) {
            console.warn("Failed to update related manual expense:", err);
          }
        }
      }

      // 4. Delete the outflow document
      await deleteDoc(doc(db, "companies", companyId, "outflows", payment.id));

      alert("Pago revertido exitosamente.");
      window.location.reload();
    } catch (error) {
      console.error("Error deleting payment:", error);
      alert("Hubo un error al eliminar el egreso.");
    } finally {
      setSaving(false);
    }
  };

  const renderPaymentsList = () => {
    if (associatedPayments.length === 0) return null;

    return (
      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4 bg-white mt-6">
        <h3 className="font-semibold text-base text-slate-800 flex items-center gap-2 border-b pb-2">
          <Landmark className="w-5 h-5 text-indigo-600" />
          Historial de Pagos y Egresos
        </h3>
        <div className="space-y-3">
          {associatedPayments.map((payment) => (
            <div key={payment.id} className="flex justify-between items-center p-3 bg-slate-50 border rounded-lg hover:bg-slate-100/70 transition-colors">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">{payment.date}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-slate-200 border rounded-full font-medium text-slate-600 uppercase">{payment.method}</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate max-w-xs" title={payment.reference}>
                  {payment.reference ? `Ref: ${payment.reference}` : "Sin referencia"}
                </p>
                {payment.bankTransactionId && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 rounded mt-0.5">
                    Conciliado con Banco
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-rose-600">
                  -${(payment.amount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleDeletePayment(payment)}
                  disabled={saving}
                  className="h-8 w-8 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 shrink-0"
                  title="Eliminar y Revertir Pago"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const methods = ["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"];

  return (
    <div className="flex flex-col space-y-6 max-w-6xl mx-auto pb-10">
      
      {/* Header back link */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <Link href={isManual ? "/compras/gastos" : "/gastos"}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isManual ? "Detalle de Gasto Operativo" : "Detalles de Factura Recibida"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isManual ? (
                <>Número de Gasto: <span className="font-bold text-slate-800">{invoice.invoiceNumber || invoice.id}</span></>
              ) : (
                <>RFC Emisor: <span className="font-bold text-slate-800">{invoice.emisorRfc}</span> | UUID: <span className="font-mono text-slate-500">{invoice.uuid}</span></>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {invoice.status === "paid" ? (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 font-bold rounded-lg flex items-center gap-2 border border-emerald-200 text-sm">
              <CheckCircle2 className="w-5 h-5" /> Gasto Pagado
            </div>
          ) : invoice.status === "cancelado" ? (
            <div className="px-4 py-2 bg-rose-50 text-rose-700 font-bold rounded-lg flex items-center gap-2 border border-rose-200 text-sm">
              <X className="w-5 h-5 text-rose-600 font-bold" /> Gasto Cancelado
            </div>
          ) : (
            <div className="px-4 py-2 bg-rose-50 text-rose-700 font-bold rounded-lg flex items-center gap-2 border border-rose-200 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-600" /> Saldo Pendiente: ${(saldoPendiente).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {isManual ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Columna Izquierda: Formulario de Edición (Col 7) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6 bg-white">
              <h3 className="font-semibold text-base text-slate-800 flex items-center gap-2 border-b pb-2">
                <Receipt className="w-5 h-5 text-indigo-600" />
                Editar Datos del Gasto Operativo
              </h3>
              
              <form onSubmit={handleUpdateManualExpense} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Fecha */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Fecha del Gasto *
                    </label>
                    <Input 
                      type="date" 
                      value={editDate} 
                      onChange={e => setEditDate(e.target.value)} 
                      className="text-sm h-10 bg-background"
                      required 
                    />
                  </div>

                  {/* Proveedor */}
                  <div className="space-y-1 relative" ref={vendorSelectorRef}>
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      Proveedor *
                    </label>
                    <div className="relative">
                      <Input
                        placeholder="Buscar o escribir proveedor..."
                        value={editVendorSearchQuery}
                        onChange={e => {
                          setEditVendorSearchQuery(e.target.value);
                          setEditVendorId("");
                          setShowVendorDropdown(true);
                        }}
                        onFocus={() => setShowVendorDropdown(true)}
                        className="text-sm h-10 bg-background pr-8 font-semibold text-slate-900"
                        required
                      />
                      {editVendorSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditVendorId("");
                            setEditVendorSearchQuery("");
                            setShowVendorDropdown(true);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {showVendorDropdown && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {vendors.filter(v => {
                          const q = editVendorSearchQuery.toLowerCase();
                          return v.name.toLowerCase().includes(q) || (v.rfc || "").toLowerCase().includes(q);
                        }).length === 0 ? (
                          <div className="p-3 text-xs text-slate-500 text-center">
                            No se encontraron proveedores
                          </div>
                        ) : (
                          vendors.filter(v => {
                            const q = editVendorSearchQuery.toLowerCase();
                            return v.name.toLowerCase().includes(q) || (v.rfc || "").toLowerCase().includes(q);
                          }).map(vendor => (
                            <button
                              key={vendor.id}
                              type="button"
                              onClick={() => {
                                setEditVendorId(vendor.id);
                                setEditVendorSearchQuery(vendor.name);
                                setShowVendorDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex flex-col border-b last:border-b-0"
                            >
                              <span className="font-semibold text-slate-800">{vendor.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{vendor.rfc}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Concepto */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Concepto General / Descripción *
                  </label>
                  <Input 
                    placeholder="Ej. Papelería oficina, compra de insumos..."
                    value={editConcept} 
                    onChange={e => setEditConcept(e.target.value)} 
                    className="text-sm h-10 bg-background font-medium"
                    required 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Sucursal */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      Sucursal *
                    </label>
                    <select
                      value={editLocationId}
                      onChange={e => setEditLocationId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none"
                      required
                    >
                      <option value="" disabled>Selecciona sucursal...</option>
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Cuenta Contable */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      Cuenta Contable *
                    </label>
                    <select
                      value={editAccountId}
                      onChange={e => setEditAccountId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none"
                      required
                    >
                      <option value="" disabled>Selecciona cuenta...</option>
                      {expenseAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Centro de Costos */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      Centro de Costos
                    </label>
                    <select
                      value={editCostCenterId}
                      onChange={e => setEditCostCenterId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none"
                    >
                      <option value="">Ninguno</option>
                      {costCenters.map(cc => (
                        <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Monto Total */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                      Monto Total ($ MXN) *
                    </label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0.01"
                      value={editAmount} 
                      onChange={e => setEditAmount(parseFloat(e.target.value) || 0)} 
                      className="font-bold text-sm h-10 bg-background text-indigo-950"
                      required 
                    />
                  </div>

                  {/* Tasa de IVA */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                      Tasa de IVA *
                    </label>
                    <select
                      value={editVatRate}
                      onChange={e => setEditVatRate(Number(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none"
                      required
                    >
                      <option value={0.16}>16% (General)</option>
                      <option value={0.08}>8% (Frontera)</option>
                      <option value={0}>0% / Exento</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={saving} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 px-6 h-10 shadow-sm"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar Cambios
                  </Button>
                </div>
              </form>
            </div>
          </div>

          {/* Columna Derecha: Saldo y Egresos (Col 5) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Saldo de Pago y Formulario de Egreso */}
            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6 bg-white">
              <h3 className="font-semibold text-base text-slate-800 flex items-center gap-2 border-b pb-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Estatus de Liquidación y Pagos
              </h3>

              {/* Métricas rápidas */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-center border-r border-slate-200 last:border-none">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Total</p>
                  <p className="font-bold text-sm text-slate-900">${(invoice.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="text-center border-r border-slate-200 last:border-none">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Pagado</p>
                  <p className="font-bold text-sm text-emerald-600">${(invoice.paidAmount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="text-center last:border-none">
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Saldo</p>
                  <p className="font-bold text-sm text-rose-600">${(saldoPendiente).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {invoice.isRecurring ? (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-xs font-semibold text-purple-900 space-y-2 leading-relaxed">
                  <p>📢 Este gasto está configurado como una plantilla de gasto recurrente para la proyección del flujo de efectivo.</p>
                  <p className="font-normal text-purple-700">No representa una cuenta por pagar directa y no es posible registrarle abonos aquí. Los pagos reales deben conciliarse en el módulo de Bancos, lo cual creará de forma automática el gasto hijo correspondiente.</p>
                </div>
              ) : saldoPendiente > 0.01 && invoice.status !== "cancelado" ? (
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-3">
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
                        className="font-bold text-sm h-9 bg-background text-indigo-950"
                        required 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Fecha de Pago *
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
                        Método de Pago *
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
                        Cuenta de Banco (Origen) *
                      </label>
                      <select
                        value={bankAccountId}
                        onChange={e => setBankAccountId(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none font-semibold text-slate-800"
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

                    {bankAccountId && (
                      <div className="space-y-1 animate-in fade-in duration-200">
                        <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                          <Landmark className="w-3.5 h-3.5 text-slate-400" />
                          Vincular a Egreso Bancario Existente
                        </label>
                        <select
                          value={selectedTransactionId}
                          onChange={e => setSelectedTransactionId(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[11px] shadow-sm focus-visible:outline-none font-semibold text-indigo-700"
                        >
                          <option value="manual">-- Registrar nuevo egreso manualmente --</option>
                          {unreconciledTransactions.map(tx => (
                            <option key={tx.id} value={tx.id}>
                              {tx.date} - {tx.concept} (${Math.abs(tx.amount).toLocaleString('es-MX', {minimumFractionDigits:2})} {tx.reference ? `| Ref: ${tx.reference}` : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        Referencia / Notas de Pago
                      </label>
                      <Input 
                        placeholder="Ej. SPEI 123456"
                        value={reference} 
                        onChange={e => setReference(e.target.value)} 
                        className="h-9 text-xs bg-background"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button 
                      type="submit" 
                      disabled={saving} 
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-2 h-10 font-bold text-xs shadow-sm animate-in fade-in"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                      Confirmar Pago / Egreso
                    </Button>
                  </div>
                </form>
              ) : invoice.status === "cancelado" ? (
                <div className="p-4 bg-rose-50 text-rose-800 border border-rose-100 rounded-lg text-sm text-center font-bold shadow-sm">
                  ✕ Este gasto operativo está cancelado.
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-sm text-center font-bold shadow-sm">
                  ✓ Este gasto operativo ya está totalmente liquidado.
                </div>
              )}
            </div>
            {renderPaymentsList()}
          </div>
        </div>
      ) : (
        <>
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
            {saldoPendiente > 0.01 && invoice.status !== "cancelado" ? (
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
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none font-semibold text-slate-800"
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

                  {bankAccountId && (
                    <div className="space-y-1 sm:col-span-2 md:col-span-2 animate-in fade-in duration-200">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <Landmark className="w-3.5 h-3.5 text-slate-400" />
                        Vincular a Egreso Bancario Existente
                      </label>
                      <select
                        value={selectedTransactionId}
                        onChange={e => setSelectedTransactionId(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-[11px] shadow-sm focus-visible:outline-none font-semibold text-indigo-700"
                      >
                        <option value="manual">-- Registrar nuevo egreso manualmente --</option>
                        {unreconciledTransactions.map(tx => (
                          <option key={tx.id} value={tx.id}>
                            {tx.date} - {tx.concept} (${Math.abs(tx.amount).toLocaleString('es-MX', {minimumFractionDigits:2})} {tx.reference ? `| Ref: ${tx.reference}` : ''})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

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
            ) : invoice.status === "cancelado" ? (
              <div className="p-4 bg-rose-50 text-rose-800 border border-rose-100 rounded-lg text-sm text-center font-bold shadow-sm">
                ✕ Este gasto operativo está cancelado y no admite nuevos egresos.
              </div>
            ) : (
              <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-sm text-center font-bold shadow-sm">
                ✓ Esta factura ya está totalmente liquidada.
              </div>
            )}
          </div>

          {renderPaymentsList()}

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

            {/* Totales al pie de la tabla */}
            {(() => {
              const totalGral = invoice.total || 0;
              const subtotalGral = conceptos.length > 0 
                ? conceptos.reduce((acc, item) => acc + item.importe, 0)
                : totalGral / (1 + (invoice.vatRate || 0.16));
              const impuestoGral = totalGral - subtotalGral;

              return (
                <div className="p-4 border-t bg-slate-50/30 flex justify-end">
                  <div className="w-full max-w-[300px] space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Subtotal</span>
                      <span className="font-semibold text-slate-700">${subtotalGral.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-medium">Impuestos (IVA)</span>
                      <span className="font-semibold text-slate-700">${impuestoGral.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-base border-t pt-2 mt-1">
                      <span className="text-slate-900 font-bold uppercase tracking-wider">Total</span>
                      <span className="font-black text-rose-600 text-lg tracking-tight">${totalGral.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

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
        </>
      )}

    </div>
  );
}
