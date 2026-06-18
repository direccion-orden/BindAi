"use client";

import React, { useState, useEffect, useRef } from "react";
import { collection, query, onSnapshot, doc, setDoc, addDoc, getDocs, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Search, Trash2, FileText, DollarSign, Calendar, Building2, BookOpen, User, Save, Upload, Receipt, X } from "lucide-react";
import Link from "next/link";
import { ShopifyProduct } from "@/types/product";

interface OrderItem {
  lineKey?: string;
  productId: string;
  variantId: string;
  productName: string;
  variantTitle: string; // SKU / Code
  quantity: number;
  unitCost: number;
  description?: string;
}

interface Vendor {
  id: string;
  name: string;
  rfc?: string;
}

interface SatInvoice {
  id: string;
  uuid: string;
  emisorRfc: string;
  emisorName: string;
  date: string;
  total: number;
  xmlBase64?: string;
  paidAmount?: number;
}

export default function NuevoGastoPage() {
  const { companyId, user } = useAuth();
  const router = useRouter();

  // Catalogs
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [satInvoices, setSatInvoices] = useState<SatInvoice[]>([]);

  // Form Fields
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [vendorId, setVendorId] = useState("");
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorSelectorRef = useRef<HTMLDivElement>(null);

  const [locationId, setLocationId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [concept, setConcept] = useState("");

  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [vatRate, setVatRate] = useState<number>(0.16); // Default 16%

  // Immediate Payment Fields
  const [isPaidImmediately, setIsPaidImmediately] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");

  // XML / SAT Linking State
  const [xmlFileName, setXmlFileName] = useState("");
  const [linkedSatInvoiceId, setLinkedSatInvoiceId] = useState("");
  const [satSearchQuery, setSatSearchQuery] = useState("");
  const [showSatDropdown, setShowSatDropdown] = useState(false);
  const satSelectorRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (vendorSelectorRef.current && !vendorSelectorRef.current.contains(event.target as Node)) {
        setShowVendorDropdown(false);
      }
      if (satSelectorRef.current && !satSelectorRef.current.contains(event.target as Node)) {
        setShowSatDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch Catalogs on mount
  useEffect(() => {
    if (!companyId) return;

    // Load vendors
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

    // Load products
    const unsubP = onSnapshot(query(collection(db, "companies", companyId, "products")), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShopifyProduct)));
      setLoading(false);
    });

    // Load locations
    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      })));
    });

    // Load accounts
    const unsubAcc = onSnapshot(query(collection(db, "companies", companyId, "accounts")), (snap) => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAccounts(allAcc.filter((a: any) => (a.type === "GASTOS" || a.type === "COSTOS") && a.level >= 2));
      setBankAccounts(allAcc.filter((a: any) => a.type === "ACTIVO" && a.level >= 2));
    });

    // Load bankAccounts (physical)
    const unsubBank = onSnapshot(query(collection(db, "companies", companyId, "bankAccounts")), (snap) => {
      // Keep it here for immediate payments physical accounts list
    });

    // Load SAT invoices (unpaid only)
    const unsubSat = onSnapshot(query(collection(db, "companies", companyId, "expenses_inbox")), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SatInvoice));
      // filter out paid ones in memory
      setSatInvoices(list.filter(inv => !inv.paidAmount || inv.paidAmount < inv.total - 0.01));
    });

    return () => {
      unsubV();
      unsubP();
      unsubLoc();
      unsubAcc();
      unsubBank();
      unsubSat();
    };
  }, [companyId]);

  // Decode UTF-8 Base64 XML helper
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

  // XML Parser Helper
  const parseCFDIXml = (xmlStr: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
      const parserError = xmlDoc.getElementsByTagName("parsererror");
      if (parserError.length > 0) {
        console.error("XML parse error:", parserError[0].textContent);
        return null;
      }

      // 1. UUID
      let uuid = "";
      const timbreNode = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] 
                     || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
      if (timbreNode) {
        uuid = timbreNode.getAttribute("UUID") || "";
      }

      // 2. Date & Total
      const comprobanteNode = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0]
                          || xmlDoc.getElementsByTagName("Comprobante")[0];
      let total = 0;
      let dateStr = "";
      if (comprobanteNode) {
        total = parseFloat(comprobanteNode.getAttribute("Total") || "0") || 0;
        dateStr = comprobanteNode.getAttribute("Fecha") || "";
        if (dateStr) {
          dateStr = dateStr.split("T")[0]; // YYYY-MM-DD
        }
      }

      // 3. Emisor RFC & Name
      const emisorNode = xmlDoc.getElementsByTagName("cfdi:Emisor")[0]
                     || xmlDoc.getElementsByTagName("Emisor")[0];
      let emisorRfc = "";
      let emisorName = "";
      if (emisorNode) {
        emisorRfc = emisorNode.getAttribute("Rfc") || "";
        emisorName = emisorNode.getAttribute("Nombre") || "";
      }

      // 4. Concepts (Items)
      let conceptosNode = xmlDoc.getElementsByTagName("cfdi:Concepto");
      if (conceptosNode.length === 0) {
        conceptosNode = xmlDoc.getElementsByTagName("Concepto");
      }

      const items: OrderItem[] = [];
      for (let i = 0; i < conceptosNode.length; i++) {
        const node = conceptosNode[i];
        const cantidad = parseFloat(node.getAttribute("Cantidad") || "0") || 1;
        const noIdentificacion = node.getAttribute("NoIdentificacion") || `SAT-${i+1}`;
        const descripcion = node.getAttribute("Descripcion") || "Concepto sin descripción";
        const valorUnitario = parseFloat(node.getAttribute("ValorUnitario") || "0") || 0;
        const lineKey = crypto.randomUUID();

        items.push({
          lineKey,
          productId: "custom",
          variantId: lineKey,
          productName: descripcion,
          variantTitle: noIdentificacion,
          quantity: cantidad,
          unitCost: valorUnitario
        });
      }

      return {
        uuid,
        total,
        date: dateStr,
        emisorRfc,
        emisorName,
        items
      };
    } catch (err) {
      console.error("Error parsing CFDI XML:", err);
      return null;
    }
  };

  // Apply parsed data to form
  const applyParsedData = (data: any) => {
    if (!data) return;

    if (data.date) setDate(data.date);
    if (data.concept) setConcept(data.concept);

    // Try to find matching vendor by RFC
    if (data.emisorRfc) {
      const match = vendors.find(v => (v.rfc || "").toLowerCase() === data.emisorRfc.toLowerCase());
      if (match) {
        setVendorId(match.id);
        setVendorSearchQuery(match.name);
      } else {
        setVendorId("");
        setVendorSearchQuery(data.emisorName || data.emisorRfc);
        alert(`Proveedor con RFC ${data.emisorRfc} (${data.emisorName || 'Desconocido'}) no encontrado en tu catálogo. Puedes buscar otro manualmente.`);
      }
    } else if (data.emisorName) {
      const match = vendors.find(v => v.name.toLowerCase().includes(data.emisorName.toLowerCase()));
      if (match) {
        setVendorId(match.id);
        setVendorSearchQuery(match.name);
      } else {
        setVendorId("");
        setVendorSearchQuery(data.emisorName);
      }
    }

    if (data.items && data.items.length > 0) {
      setSelectedItems(data.items);
    }
  };

  // Upload Manual XML File
  const handleXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setXmlFileName(file.name);
    try {
      const xmlText = await file.text();
      const parsed = parseCFDIXml(xmlText);
      if (parsed) {
        applyParsedData(parsed);
      } else {
        alert("El archivo XML no tiene un formato CFDI 3.3/4.0 válido o carece de UUID.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al leer archivo XML.");
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  // Link SAT Invoice from search selection
  const handleSelectSatInvoice = async (invoice: SatInvoice) => {
    setLinkedSatInvoiceId(invoice.id);
    setSatSearchQuery(`${invoice.emisorName} - $${invoice.total.toLocaleString()}`);
    setShowSatDropdown(false);

    // If it has XML, parse concepts
    if (invoice.xmlBase64) {
      try {
        const xmlText = decodeBase64Utf8(invoice.xmlBase64);
        const parsed = parseCFDIXml(xmlText);
        if (parsed) {
          applyParsedData(parsed);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      // Fallback single line item if metadata only
      const lineKey = crypto.randomUUID();
      applyParsedData({
        date: invoice.date ? invoice.date.split("T")[0] : "",
        emisorName: invoice.emisorName,
        emisorRfc: invoice.emisorRfc,
        items: [{
          lineKey,
          productId: "custom",
          variantId: lineKey,
          productName: `Gasto SAT: ${invoice.emisorName} (${invoice.uuid.substring(0,8)})`,
          variantTitle: "SAT-XML",
          quantity: 1,
          unitCost: invoice.total / 1.16 // Subtotal estimativo
        }]
      });
    }
  };

  const handleClearSatInvoice = () => {
    setLinkedSatInvoiceId("");
    setSatSearchQuery("");
    setShowSatDropdown(true);
  };

  // Vendor selection handlers
  const filteredVendors = vendors.filter(v => {
    const q = vendorSearchQuery.toLowerCase();
    return v.name.toLowerCase().includes(q) || (v.rfc || "").toLowerCase().includes(q);
  });

  const handleVendorSelect = (vendor: Vendor) => {
    setVendorId(vendor.id);
    setVendorSearchQuery(vendor.name);
    setShowVendorDropdown(false);
  };

  const handleClearVendor = () => {
    setVendorId("");
    setVendorSearchQuery("");
    setShowVendorDropdown(true);
  };

  // SAT Invoice selection filter
  const filteredSatInvoices = satInvoices.filter(inv => {
    const q = satSearchQuery.toLowerCase();
    return inv.emisorName.toLowerCase().includes(q) || inv.uuid.toLowerCase().includes(q) || (inv.emisorRfc || "").toLowerCase().includes(q);
  });

  // Catalog products filter
  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.variants.some(v => v.sku.toLowerCase().includes(searchTerm.toLowerCase()) || v.barcode.includes(searchTerm))
  );

  // Add Product from Catalog
  const handleAddCatalogItem = (product: ShopifyProduct, variant: any) => {
    const exists = selectedItems.find(i => i.variantId === variant.id);
    if (!exists) {
      setSelectedItems(prev => [...prev, {
        productId: product.id,
        variantId: variant.id,
        productName: product.title,
        variantTitle: variant.title !== "Default Title" ? variant.title : (variant.sku || ""),
        quantity: 1,
        unitCost: variant.price || 0
      }]);
    } else {
      setSelectedItems(prev => prev.map(item => 
        item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    }
    setSearchTerm("");
  };

  // Add Blank Item
  const handleAddBlankItem = () => {
    const lineKey = crypto.randomUUID();
    setSelectedItems(prev => [...prev, {
      lineKey,
      productId: "custom",
      variantId: lineKey,
      productName: "",
      variantTitle: "",
      quantity: 1,
      unitCost: 0
    }]);
  };

  const updateItem = (key: string, field: keyof OrderItem, value: any) => {
    setSelectedItems(prev => prev.map(i => {
      const matchKey = i.lineKey || i.variantId;
      if (matchKey === key) {
        return { ...i, [field]: value };
      }
      return i;
    }));
  };

  const removeItem = (key: string) => {
    setSelectedItems(prev => prev.filter(i => (i.lineKey || i.variantId) !== key));
  };

  // Sums
  const subtotal = selectedItems.reduce((acc, item) => acc + (item.quantity * item.unitCost), 0);
  const totalCost = subtotal * (1 + vatRate);

  // Save Expense Form
  const handleSave = async () => {
    if (!companyId) return;

    if (!vendorId) {
      alert("Debes seleccionar un proveedor.");
      return;
    }
    if (selectedItems.length === 0) {
      alert("Debes agregar al menos una partida al gasto.");
      return;
    }
    if (!locationId || !accountId) {
      alert("Debes seleccionar una sucursal y una clasificación contable.");
      return;
    }

    if (isPaidImmediately && !bankAccountId) {
      alert("Debes seleccionar una cuenta bancaria origen.");
      return;
    }

    setSaving(true);
    try {
      const expenseId = crypto.randomUUID();
      const vendorName = vendors.find(v => v.id === vendorId)?.name || "Proveedor General";
      const locationName = locations.find(l => l.id === locationId)?.name || "";
      const expenseAccount = accounts.find(a => a.id === accountId);

      // Create Expense Record
      const expenseDoc = {
        id: expenseId,
        date,
        vendorId,
        vendorName,
        concept: concept || selectedItems.map(i => i.productName).join(", ").substring(0, 150),
        amount: totalCost,
        vatRate,
        locationId,
        locationName,
        accountId,
        accountCode: expenseAccount?.code || "",
        accountName: expenseAccount?.name || "",
        paidAmount: isPaidImmediately ? totalCost : 0,
        status: isPaidImmediately ? "paid" : "pending",
        satInvoiceId: linkedSatInvoiceId || null,
        items: selectedItems.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          productName: i.productName,
          variantTitle: i.variantTitle,
          quantity: i.quantity,
          unitCost: i.unitCost,
          lineKey: i.lineKey || ""
        })),
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Unknown"
      };

      await setDoc(doc(db, "companies", companyId, "expenses", expenseId), expenseDoc);

      // If linked to a SAT Invoice, update it to fully paid/reconciled so it gets processed
      if (linkedSatInvoiceId) {
        const satRef = doc(db, "companies", companyId, "expenses_inbox", linkedSatInvoiceId);
        await updateDoc(satRef, {
          status: "paid",
          paidAmount: totalCost
        });
      }

      if (isPaidImmediately) {
        // Create outflow record
        const paymentData = {
          amount: totalCost,
          date,
          method,
          reference,
          documentId: expenseId,
          documentType: "gasto_manual",
          documentNumber: `GM-${expenseId.substring(0, 8)}`,
          providerName: vendorName,
          bankAccountId,
          expenseAccountId: accountId,
          createdAt: new Date().toISOString()
        };

        const paymentRef = await addDoc(collection(db, "companies", companyId, "outflows"), paymentData);

        // Accounting Poliza / Journal Entry
        // Fetch physical bank account to get linked accountId
        const bankAccountsSnap = await getDocs(collection(db, "companies", companyId, "bankAccounts"));
        const physicalAccounts = bankAccountsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const physicalBankAccount = physicalAccounts.find(b => b.id === bankAccountId);
        
        const bankAccountingId = physicalBankAccount?.accountId;
        // Search accounts list
        const allAccSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
        const allAccs = allAccSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const bankAccountingAccount = bankAccountingId ? allAccs.find(a => a.id === bankAccountingId) : null;
        const vatAccounts = allAccs.filter(a => a.code.startsWith("118") && a.level >= 2);

        if (bankAccountingAccount) {
          let subtotalAmount = totalCost;
          let vatAmount = 0;
          let vatAccount = null;

          if (vatRate > 0) {
            subtotalAmount = totalCost / (1 + vatRate);
            vatAmount = totalCost - subtotalAmount;
            vatAccount = vatAccounts.length > 0 ? vatAccounts[0] : null;
          }

          const entries = [
            {
              accountId: accountId,
              accountCode: expenseAccount?.code || "",
              accountName: expenseAccount?.name || "",
              debit: subtotalAmount,
              credit: 0
            },
            {
              accountId: bankAccountingId,
              accountCode: bankAccountingAccount.code,
              accountName: bankAccountingAccount.name,
              debit: 0,
              credit: totalCost
            }
          ];

          if (vatAmount > 0 && vatAccount) {
            entries.push({
              accountId: vatAccount.id,
              accountCode: vatAccount.code,
              accountName: vatAccount.name,
              debit: vatAmount,
              credit: 0
            });
          }

          await addDoc(collection(db, "companies", companyId, "journal_entries"), {
            type: "egreso",
            date,
            description: `Pago de gasto manual GM-${expenseId.substring(0, 8)}`,
            referenceId: paymentRef.id,
            referenceType: "payment_outflow",
            createdAt: new Date().toISOString(),
            status: "activa",
            entries
          });

          // Update Balances
          await updateDoc(doc(db, "companies", companyId, "accounts", accountId), {
            balance: increment(subtotalAmount)
          });
          await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
            balance: increment(-totalCost)
          });
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId), {
            balance: increment(-totalCost)
          });
          if (vatAmount > 0 && vatAccount) {
            await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
              balance: increment(vatAmount)
            });
          }
        }
      }

      alert("Gasto operativo registrado exitosamente.");
      router.push("/compras/gastos");
    } catch (err) {
      console.error(err);
      alert("Error al registrar el gasto.");
    } finally {
      setSaving(false);
    }
  };

  const methods = ["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"];

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/compras/gastos">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-indigo-950">Nuevo Gasto Operativo</h1>
          <p className="text-muted-foreground text-sm">Registra una compra o egreso directo e intégralo a tu contabilidad.</p>
        </div>
      </div>

      {/* Helper SAT & XML Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upload XML Card */}
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm text-indigo-950 flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-600" />
            Cargar XML de Factura (CFDI)
          </h3>
          <p className="text-xs text-muted-foreground">Sube el XML de tu proveedor para llenar automáticamente todos los datos del formulario y las partidas.</p>
          
          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md border cursor-pointer select-none transition-colors">
              <Upload className="w-3.5 h-3.5" />
              Seleccionar XML
              <input 
                type="file" 
                accept=".xml" 
                onChange={handleXmlUpload} 
                className="hidden" 
              />
            </label>
            {xmlFileName && (
              <span className="text-xs text-indigo-600 font-medium truncate max-w-[200px]" title={xmlFileName}>
                {xmlFileName}
              </span>
            )}
          </div>
        </div>

        {/* Link SAT Invoice Card */}
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3 relative" ref={satSelectorRef}>
          <h3 className="font-semibold text-sm text-indigo-950 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-indigo-600" />
            Buscar Facturas SAT (expenses_inbox)
          </h3>
          <p className="text-xs text-muted-foreground">Si ya sincronizaste tus facturas del SAT, selecciónala aquí para pre-llenar los datos.</p>
          
          <div className="relative">
            <Input 
              placeholder="Buscar por emisor o UUID..." 
              value={satSearchQuery}
              onChange={e => {
                setSatSearchQuery(e.target.value);
                setShowSatDropdown(true);
              }}
              onFocus={() => setShowSatDropdown(true)}
              className="h-8 text-xs font-semibold bg-background pr-8"
            />
            {satSearchQuery && (
              <button
                type="button"
                onClick={handleClearSatInvoice}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          
          {showSatDropdown && (
            <div className="absolute z-50 left-5 right-5 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filteredSatInvoices.length === 0 ? (
                <div className="p-3 text-xs text-slate-500 text-center">
                  No se encontraron facturas SAT pendientes
                </div>
              ) : (
                filteredSatInvoices.map(inv => (
                  <div 
                    key={inv.id}
                    className={`p-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors text-xs ${linkedSatInvoiceId === inv.id ? 'bg-indigo-50/50 font-medium' : ''}`}
                    onClick={() => handleSelectSatInvoice(inv)}
                  >
                    <div className="font-semibold text-slate-800">
                      {inv.emisorName}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                      <span>RFC: {inv.emisorRfc}</span>
                      <span className="font-bold text-indigo-600">${inv.total.toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Top Header Card: Datos Generales */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-sm text-indigo-950 flex items-center gap-2 border-b pb-2">
          <User className="w-4 h-4 text-indigo-600" />
          Datos Generales del Gasto
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          {/* Column 1: Proveedor */}
          <div className="space-y-2 col-span-1 relative" ref={vendorSelectorRef}>
            <label className="text-xs font-medium text-slate-500 uppercase">Proveedor *</label>
            <div className="relative">
              <Input 
                placeholder="Buscar proveedor..." 
                value={vendorSearchQuery}
                onChange={e => {
                  setVendorSearchQuery(e.target.value);
                  setShowVendorDropdown(true);
                }}
                onFocus={() => setShowVendorDropdown(true)}
                className="h-8 text-xs font-semibold bg-background pr-8"
              />
              {vendorSearchQuery && (
                <button
                  type="button"
                  onClick={handleClearVendor}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            
            {showVendorDropdown && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredVendors.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500 text-center">
                    No se encontraron proveedores
                  </div>
                ) : (
                  filteredVendors.map(v => (
                    <div 
                      key={v.id}
                      className={`p-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors text-xs ${vendorId === v.id ? 'bg-indigo-50/50 font-medium' : ''}`}
                      onClick={() => handleVendorSelect(v)}
                    >
                      <div className="font-semibold text-slate-800">
                        {v.name}
                      </div>
                      {v.rfc && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          RFC: {v.rfc}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Column 2: Sucursal Destino */}
          <div className="space-y-2 col-span-1">
            <label className="text-xs font-medium text-slate-500 uppercase">Sucursal (Destino) *</label>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona sucursal...</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Column 3: Cuenta Contable Gasto */}
          <div className="space-y-2 col-span-1">
            <label className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              Clasificación de Gasto *
            </label>
            <select 
              className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-semibold"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              required
            >
              <option value="" disabled>Selecciona cuenta...</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
          </div>

          {/* Column 4: Date and Notes */}
          <div className="space-y-2 col-span-1">
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase">Fecha *</label>
              <Input 
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-8 text-xs font-semibold"
                required
              />
            </div>
            <div className="mt-1">
              <label className="text-xs font-medium text-slate-500 uppercase">Concepto / Notas</label>
              <Input 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej. Gastos de viaje, comida..."
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Left Column: Items list & Product search */}
        <div className="bg-card border rounded-xl shadow-sm flex flex-col min-h-[400px]">
          <div className="p-5 border-b flex justify-between items-center bg-blue-50/30">
            <h3 className="font-semibold text-lg flex items-center gap-2 text-blue-900">
              <FileText className="w-5 h-5 text-blue-600" />
              Detalle de Conceptos / Partidas
            </h3>
            <span className="text-sm text-blue-700 font-medium">{selectedItems.length} partidas</span>
          </div>
          
          <div className="p-5 border-b bg-muted/30 relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar producto en catálogo (SKU, nombre, código)..." 
                className="pl-9 bg-background"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleAddBlankItem}
              className="shrink-0 bg-background border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold"
            >
              + Partida en blanco
            </Button>
            {searchTerm && (
              <div className="mt-1 border rounded-md max-h-48 overflow-y-auto bg-background divide-y absolute z-50 left-5 right-5 shadow-xl">
                {filteredProducts.map(product => (
                  product.variants.map(variant => (
                    <div 
                      key={variant.id} 
                      className="p-3 hover:bg-muted/50 flex justify-between items-center text-sm cursor-pointer"
                      onClick={() => handleAddCatalogItem(product, variant)}
                    >
                      <div>
                        <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                        <div className="text-xs text-slate-500">SKU: {variant.sku}</div>
                      </div>
                      {selectedItems.some(i => i.variantId === variant.id) && (
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Agregado</span>
                      )}
                    </div>
                  ))
                ))}
                {filteredProducts.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground text-center">No se encontraron productos</div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-3">
            {selectedItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-10">
                <FileText className="w-12 h-12 mb-3 opacity-20" />
                <p>Añade los artículos, servicios o conceptos de este gasto.</p>
              </div>
            ) : (
              selectedItems.map(item => {
                const key = item.lineKey || item.variantId;
                return (
                  <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg bg-background gap-4 shadow-sm animate-in fade-in duration-150">
                    <div className="flex-1">
                      {item.productId === "custom" ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mr-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Código / SKU</label>
                            <Input
                              placeholder="Ej. GASTO-01"
                              value={item.variantTitle}
                              onChange={(e) => updateItem(key, 'variantTitle', e.target.value)}
                              className="h-8 text-xs font-semibold bg-background"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción / Nombre</label>
                            <Input
                              placeholder="Descripción del concepto..."
                              value={item.productName}
                              onChange={(e) => updateItem(key, 'productName', e.target.value)}
                              className="h-8 text-xs font-bold bg-background"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="font-bold text-slate-800">{item.productName}</p>
                          {item.variantTitle && <p className="text-xs text-muted-foreground">SKU: {item.variantTitle}</p>}
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Costo U. (Estimado)</label>
                        <div className="relative">
                          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                          <Input 
                            type="number" 
                            min={0}
                            step="0.01"
                            value={item.unitCost}
                            onChange={(e) => updateItem(key, 'unitCost', parseFloat(e.target.value) || 0)}
                            className="w-24 pl-6 text-right font-medium"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cant.</label>
                        <Input 
                          type="number" 
                          min={1} 
                          value={item.quantity}
                          onChange={(e) => updateItem(key, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-16 text-center font-bold"
                        />
                      </div>
                      <div className="flex flex-col gap-1 min-w-[70px] text-right">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Subtotal</label>
                        <p className="font-bold text-indigo-700">${(item.quantity * item.unitCost).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive mt-4 sm:mt-0" onClick={() => removeItem(key)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Totals & Immediate Payment Form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: Immediate Payment Details */}
          <div className="md:col-span-2 bg-card border rounded-xl shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 py-1">
              <input 
                type="checkbox"
                id="isPaidImmediately"
                checked={isPaidImmediately}
                onChange={e => setIsPaidImmediately(e.target.checked)}
                className="w-4.5 h-4.5 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 cursor-pointer"
              />
              <label htmlFor="isPaidImmediately" className="text-sm font-bold text-slate-800 cursor-pointer select-none">
                ¿Registrar pago de inmediato? (Genera póliza de egreso contable)
              </label>
            </div>

            {isPaidImmediately && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t animate-in fade-in duration-300">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-semibold text-slate-700 uppercase">Cuenta Bancaria (Origen) *</label>
                  <select
                    value={bankAccountId}
                    onChange={e => setBankAccountId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background font-semibold"
                    required
                  >
                    <option value="" disabled>Selecciona la cuenta origen...</option>
                    {bankAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name || a.Name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase">Método de Pago *</label>
                  <select 
                    value={method} 
                    onChange={e => setMethod(e.target.value)} 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    {methods.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 uppercase">Referencia / Notas</label>
                  <Input 
                    placeholder="Ej. SPEI 99882"
                    value={reference} 
                    onChange={e => setReference(e.target.value)} 
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: Summary Box */}
          <div className="md:col-span-1 bg-card border rounded-xl shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-base border-b pb-2 flex items-center gap-2 text-slate-800">
              Resumen de Gasto
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-500 font-medium">
                <span>Subtotal</span>
                <span>${subtotal.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
              
              <div className="flex items-center justify-between text-slate-500">
                <span className="font-medium">Impuesto (IVA)</span>
                <select
                  value={vatRate}
                  onChange={e => setVatRate(Number(e.target.value))}
                  className="h-8 rounded border text-xs px-1 bg-white font-semibold"
                >
                  <option value={0.16}>16% (General)</option>
                  <option value={0.08}>8% (Frontera)</option>
                  <option value={0}>0% / Exento</option>
                </select>
              </div>

              <div className="pt-4 space-y-2 border-t mt-2">
                <div className="flex justify-between text-lg font-bold text-slate-800">
                  <span>Total Gasto</span>
                  <span className="font-black text-indigo-700">${totalCost.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
                </div>
              </div>
              
              <Button 
                size="lg" 
                onClick={handleSave} 
                disabled={saving || selectedItems.length === 0 || !vendorId || !locationId || !accountId}
                className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 mt-6 text-white font-bold"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Generar Gasto Operativo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
