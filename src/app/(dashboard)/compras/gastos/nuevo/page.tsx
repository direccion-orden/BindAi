"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { collection, query, onSnapshot, doc, setDoc, addDoc, getDocs, updateDoc, increment, getDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getNextSequence } from "@/lib/firebase/counters";
import { useAuth } from "@/context/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalDateString } from "@/lib/utils";
import { Loader2, ArrowLeft, Search, Trash2, FileText, DollarSign, Calendar, Building2, BookOpen, User, Save, Upload, Receipt, X, AlertCircle } from "lucide-react";
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
  costCenterId?: string;
  accountId?: string;
  locationId?: string;
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

function NuevoGastoForm() {
  const { companyId, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const satId = searchParams.get("satId");
  const receiptUrl = searchParams.get("receiptUrl");
  const pendingGastoId = searchParams.get("pendingGastoId");

  // Catalogs
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsLoaded, setVendorsLoaded] = useState(false);
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [satInvoices, setSatInvoices] = useState<SatInvoice[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);

  // Form Fields
  const [date, setDate] = useState(getLocalDateString());
  const [vendorId, setVendorId] = useState("");
  const [vendorSearchQuery, setVendorSearchQuery] = useState("");
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const vendorSelectorRef = useRef<HTMLDivElement>(null);

  const [notes, setNotes] = useState("");
  const [concept, setConcept] = useState("");

  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [vatRate, setVatRate] = useState<number>(0.16); // Default 16%

  // Bulk Actions Fields
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [bulkAccountId, setBulkAccountId] = useState("");
  const [bulkCostCenterId, setBulkCostCenterId] = useState("");
  const [bulkLocationId, setBulkLocationId] = useState("");

  // Immediate Payment Fields
  const [isPaidImmediately, setIsPaidImmediately] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  const [method, setMethod] = useState("Transferencia");
  const [reference, setReference] = useState("");
  const [unreconciledTransactions, setUnreconciledTransactions] = useState<any[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>("manual");

  const [xmlFileName, setXmlFileName] = useState("");
  const [linkedSatInvoiceId, setLinkedSatInvoiceId] = useState("");
  const [linkedInvoiceHasXml, setLinkedInvoiceHasXml] = useState<boolean | null>(null);
  const [satSearchQuery, setSatSearchQuery] = useState("");
  const [showSatDropdown, setShowSatDropdown] = useState(false);
  const satSelectorRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load unreconciled transactions for the selected bank account
  useEffect(() => {
    setSelectedTransactionId("manual"); // Reset when account changes
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
        if (matchedTx.concept && !notes) {
          setNotes(matchedTx.concept);
        }
      }
    }
  }, [selectedTransactionId, unreconciledTransactions]);

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
      setVendorsLoaded(true);
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
    });

    // Load bankAccounts (physical)
    const unsubBank = onSnapshot(query(collection(db, "companies", companyId, "bankAccounts")), (snap) => {
      setBankAccounts(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Cuenta sin nombre",
        type: d.data().type || "bank",
        accountId: d.data().accountId || ""
      })));
    });

    // Load SAT invoices (unpaid only)
    const unsubSat = onSnapshot(query(collection(db, "companies", companyId, "expenses_inbox")), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SatInvoice));
      // filter out paid ones in memory
      const unpaid = list.filter(inv => !inv.paidAmount || inv.paidAmount < inv.total - 0.01);
      
      // Deduplicate by UUID case-insensitive, prioritizing the version that has xmlBase64
      const dedupMap = new Map<string, SatInvoice>();
      for (const inv of unpaid) {
        const key = (inv.uuid || inv.id).toLowerCase();
        const existing = dedupMap.get(key);
        if (!existing || (!existing.xmlBase64 && inv.xmlBase64)) {
          dedupMap.set(key, inv);
        }
      }
      setSatInvoices(Array.from(dedupMap.values()));
    });

    // Load cost centers
    const unsubCC = onSnapshot(query(collection(db, "companies", companyId, "cost_centers"), orderBy("code", "asc")), (snap) => {
      setCostCenters(snap.docs.map(d => ({
        id: d.id,
        code: d.data().code || "",
        name: d.data().name || "",
        isActive: d.data().isActive ?? true
      })));
    });

    return () => {
      unsubV();
      unsubP();
      unsubLoc();
      unsubAcc();
      unsubBank();
      unsubSat();
      unsubCC();
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

      // Case-insensitive attribute retriever
      const getAttr = (el: Element | null, name: string): string => {
        if (!el || !el.attributes) return "";
        const lowerName = name.toLowerCase();
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          if (attr.name.toLowerCase() === lowerName) {
            return attr.value;
          }
        }
        return "";
      };

      // 1. Traverse all nodes once to extract nodes case-insensitively and prefix-independently
      const allElements = xmlDoc.getElementsByTagName("*");
      let timbreNode: Element | null = null;
      let comprobanteNode: Element | null = null;
      let emisorNode: Element | null = null;
      const conceptosNode: Element[] = [];

      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const localNameLower = el.localName?.toLowerCase();
        if (localNameLower === "timbrefiscaldigital") {
          timbreNode = el;
        } else if (localNameLower === "comprobante") {
          comprobanteNode = el;
        } else if (localNameLower === "emisor") {
          emisorNode = el;
        } else if (localNameLower === "concepto") {
          conceptosNode.push(el);
        }
      }

      // Extract values
      const uuid = getAttr(timbreNode, "UUID");
      const total = parseFloat(getAttr(comprobanteNode, "Total") || "0") || 0;
      let dateStr = getAttr(comprobanteNode, "Fecha") || "";
      if (dateStr) {
        dateStr = dateStr.split("T")[0]; // YYYY-MM-DD
      }

      const emisorRfc = getAttr(emisorNode, "Rfc");
      const emisorName = getAttr(emisorNode, "Nombre");

      // Extract concepts / items
      const items: OrderItem[] = [];
      for (let i = 0; i < conceptosNode.length; i++) {
        const node = conceptosNode[i];
        const cantidad = parseFloat(getAttr(node, "Cantidad") || "0") || 1;
        const noIdentificacion = getAttr(node, "NoIdentificacion") || getAttr(node, "ClaveProdServ") || `SAT-${i+1}`;
        const descripcion = getAttr(node, "Descripcion") || "Concepto sin descripción";
        const valorUnitario = parseFloat(getAttr(node, "ValorUnitario") || "0") || 0;
        const lineKey = crypto.randomUUID();

        items.push({
          lineKey,
          productId: "custom",
          variantId: lineKey,
          productName: descripcion,
          variantTitle: noIdentificacion,
          quantity: cantidad,
          unitCost: valorUnitario,
          accountId: "",
          costCenterId: "",
          locationId: ""
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
        setLinkedInvoiceHasXml(true);
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
    if (!companyId) return;
    setLinkedSatInvoiceId(invoice.id);
    setSatSearchQuery(`${invoice.emisorName} - $${invoice.total.toLocaleString()}`);
    setShowSatDropdown(false);

    let xmlBase64 = invoice.xmlBase64;
    let finalInvoiceId = invoice.id;

    // 1. If xmlBase64 is not present in the selected invoice object, attempt to load it from Firestore
    // by checking the document ID variations (original, lowercase, uppercase).
    if (!xmlBase64) {
      try {
        const idToCheck = [invoice.id, invoice.id.toLowerCase(), invoice.id.toUpperCase()];
        for (const testId of idToCheck) {
          const docRef = doc(db, "companies", companyId, "expenses_inbox", testId);
          const snap = await getDoc(docRef);
          if (snap.exists() && snap.data().xmlBase64) {
            xmlBase64 = snap.data().xmlBase64;
            finalInvoiceId = testId;
            setLinkedSatInvoiceId(testId);
            break;
          }
        }
      } catch (err) {
        console.error("Error fetching full SAT invoice to check for xmlBase64:", err);
      }
    }

    // 2. If we found or have xmlBase64, parse and apply the items
    if (xmlBase64) {
      try {
        const xmlText = decodeBase64Utf8(xmlBase64);
        const parsed = parseCFDIXml(xmlText);
        if (parsed) {
          applyParsedData(parsed);
          setLinkedInvoiceHasXml(true);
          return;
        }
      } catch (err) {
        console.error("Error parsing CFDI XML:", err);
      }
    }

    // 3. Fallback: single global concept if no XML could be found/parsed
    setLinkedInvoiceHasXml(false);
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
        unitCost: invoice.total / 1.16, // Subtotal estimativo
        accountId: "",
        costCenterId: "",
        locationId: ""
      }]
    });
  };

  const handleClearSatInvoice = () => {
    setLinkedSatInvoiceId("");
    setSatSearchQuery("");
    setShowSatDropdown(true);
    setLinkedInvoiceHasXml(null);
  };

  // Load initial SAT invoice if satId is provided in URL
  useEffect(() => {
    if (!companyId || !satId || !vendorsLoaded) return;

    const loadInitialSatInvoice = async () => {
      try {
        const docRef = doc(db, "companies", companyId, "expenses_inbox", satId);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const invData = { id: snap.id, ...snap.data() } as SatInvoice;
          await handleSelectSatInvoice(invData);
        } else {
          console.error("SAT Invoice not found:", satId);
        }
      } catch (err) {
        console.error("Error loading initial SAT invoice:", err);
      }
    };

    loadInitialSatInvoice();
  }, [companyId, satId, vendorsLoaded]);

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
        unitCost: variant.price || 0,
        accountId: "",
        costCenterId: "",
        locationId: ""
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
      unitCost: 0,
      accountId: "",
      costCenterId: "",
      locationId: ""
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

  const handleApplyBulk = () => {
    if (!bulkAccountId && !bulkCostCenterId && !bulkLocationId) {
      alert("Selecciona al menos un valor para aplicar en lote.");
      return;
    }
    
    setSelectedItems(prev => prev.map(item => {
      const key = item.lineKey || item.variantId;
      if (selectedItemKeys.includes(key)) {
        return {
          ...item,
          ...(bulkAccountId ? { accountId: bulkAccountId } : {}),
          ...(bulkCostCenterId ? { costCenterId: bulkCostCenterId } : {}),
          ...(bulkLocationId ? { locationId: bulkLocationId } : {})
        };
      }
      return item;
    }));
    
    // Reset inputs
    setBulkAccountId("");
    setBulkCostCenterId("");
    setBulkLocationId("");
    setSelectedItemKeys([]);
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
    // Check if every item has an accountId and locationId
    const missingFields = selectedItems.some(i => !i.accountId || !i.locationId);
    if (missingFields) {
      alert("Todas las partidas deben tener una cuenta contable y una sucursal asignadas.");
      return;
    }

    if (isPaidImmediately && !bankAccountId) {
      alert("Debes seleccionar una cuenta bancaria origen.");
      return;
    }

    setSaving(true);
    try {
      const expenseId = crypto.randomUUID();
      const sequenceNum = await getNextSequence(companyId, 'gastos');
      const numericVal = parseInt(sequenceNum.split("-")[1]) || 0;
      const vendorName = vendors.find(v => v.id === vendorId)?.name || "Proveedor General";
      
      const firstItem = selectedItems[0];
      const mainAccountId = firstItem.accountId || "";
      const mainExpenseAccount = accounts.find(a => a.id === mainAccountId);
      const mainLocationId = firstItem.locationId || "";
      const mainLocationName = locations.find(l => l.id === mainLocationId)?.name || "";

      // Create Expense Record
      const expenseDoc = {
        id: expenseId,
        number: numericVal,
        documentNumber: sequenceNum,
        date,
        vendorId,
        vendorName,
        concept: concept || selectedItems.map(i => i.productName).join(", ").substring(0, 150),
        amount: totalCost,
        vatRate,
        locationId: mainLocationId,
        locationName: mainLocationName,
        accountId: mainAccountId,
        accountCode: mainExpenseAccount?.code || "",
        accountName: mainExpenseAccount?.name || "",
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
          lineKey: i.lineKey || "",
          costCenterId: i.costCenterId || null,
          accountId: i.accountId || null,
          locationId: i.locationId || null
        })),
        createdAt: new Date().toISOString(),
        createdBy: user?.email || "Unknown"
      };

      await setDoc(doc(db, "companies", companyId, "expenses", expenseId), expenseDoc);

      // If linked to a SAT Invoice, update it to fully paid/reconciled so it gets processed
      if (linkedSatInvoiceId) {
        const idToCheck = [linkedSatInvoiceId, linkedSatInvoiceId.toLowerCase(), linkedSatInvoiceId.toUpperCase()];
        for (const testId of idToCheck) {
          try {
            const satRef = doc(db, "companies", companyId, "expenses_inbox", testId);
            const snap = await getDoc(satRef);
            if (snap.exists()) {
              await updateDoc(satRef, {
                status: "paid",
                paidAmount: totalCost
              });
            }
          } catch (e) {
            console.error(`Error updating SAT invoice ${testId}:`, e);
          }
        }
      }

      if (isPaidImmediately) {
        let finalBankTransactionId = null;

        if (selectedTransactionId === "manual") {
          // Create new transaction in bank account transactions subcollection
          const txData = {
            amount: -totalCost,
            date,
            concept: `${vendorName} - ${concept || notes || "Gasto manual"}`,
            reference: reference || "",
            reconciled: true,
            matchedAt: new Date().toISOString(),
            reconcileType: "direct",
            matchedDocumentId: expenseId,
            createdAt: new Date().toISOString(),
            createdBy: user?.email || "Unknown"
          };
          const txRef = await addDoc(collection(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions"), txData);
          finalBankTransactionId = txRef.id;
        } else {
          finalBankTransactionId = selectedTransactionId;
          // Update existing transaction to reconciled
          await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId, "transactions", selectedTransactionId), {
            reconciled: true,
            matchedAt: new Date().toISOString(),
            reconcileType: "match",
            matchedDocumentId: expenseId
          });
        }

        // Create outflow record
        const paymentData = {
          amount: totalCost,
          date,
          method,
          reference,
          documentId: expenseId,
          documentType: "gasto_manual",
          documentNumber: sequenceNum,
          providerName: vendorName,
          bankAccountId,
          expenseAccountId: mainAccountId,
          createdAt: new Date().toISOString(),
          bankTransactionId: finalBankTransactionId
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
          let vatAmount = 0;
          let vatAccount = null;

          if (vatRate > 0) {
            const subtotalAmount = totalCost / (1 + vatRate);
            vatAmount = totalCost - subtotalAmount;
            vatAccount = vatAccounts.length > 0 ? vatAccounts[0] : null;
          }

          // Group item debits by accountId
          const accountGroups: { [accId: string]: { debit: number; code: string; name: string } } = {};
          
          for (const item of selectedItems) {
            const itemAccId = item.accountId;
            if (!itemAccId) continue;
            const itemAcc = allAccs.find((a: any) => a.id === itemAccId) || mainExpenseAccount;
            if (!itemAcc) continue;
            
            const itemSubtotal = item.quantity * item.unitCost;
            if (!accountGroups[itemAcc.id]) {
              accountGroups[itemAcc.id] = {
                debit: 0,
                code: itemAcc.code || "",
                name: itemAcc.name || ""
              };
            }
            accountGroups[itemAcc.id].debit += itemSubtotal;
          }

          const entries: any[] = [];
          
          // Add debits for each account group
          for (const accId of Object.keys(accountGroups)) {
            entries.push({
              accountId: accId,
              accountCode: accountGroups[accId].code,
              accountName: accountGroups[accId].name,
              debit: accountGroups[accId].debit,
              credit: 0
            });
          }

          // Add bank credit entry
          entries.push({
            accountId: bankAccountingId,
            accountCode: bankAccountingAccount.code,
            accountName: bankAccountingAccount.name,
            debit: 0,
            credit: totalCost
          });

          // Add VAT entry if exists
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
            description: `Pago de gasto manual ${sequenceNum}`,
            referenceId: paymentRef.id,
            referenceType: "payment_outflow",
            createdAt: new Date().toISOString(),
            status: "activa",
            entries
          });

          // Update Balances for each used account
          for (const accId of Object.keys(accountGroups)) {
            await updateDoc(doc(db, "companies", companyId, "accounts", accId), {
              balance: increment(accountGroups[accId].debit)
            });
          }
          await updateDoc(doc(db, "companies", companyId, "accounts", bankAccountingId), {
            balance: increment(-totalCost)
          });
          if (selectedTransactionId === "manual") {
            await updateDoc(doc(db, "companies", companyId, "bankAccounts", bankAccountId), {
              balance: increment(-totalCost)
            });
          }
          if (vatAmount > 0 && vatAccount) {
            await updateDoc(doc(db, "companies", companyId, "accounts", vatAccount.id), {
              balance: increment(vatAmount)
            });
          }
        }
      }

      if (pendingGastoId) {
        try {
          await updateDoc(doc(db, "companies", companyId, "gastosPendientes", pendingGastoId), {
            status: "completed",
            completedAt: new Date().toISOString(),
            expenseId: expenseId
          });
        } catch (e) {
          console.error("Error updating pending WhatsApp expense status:", e);
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
    <div className={`mx-auto p-4 md:p-6 ${receiptUrl ? "max-w-[1600px] grid grid-cols-1 xl:grid-cols-2 gap-6" : "max-w-7xl space-y-6"}`}>
      {receiptUrl && (
        <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-8rem)] flex flex-col">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-semibold text-base text-indigo-950 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              Comprobante de WhatsApp
            </h3>
            <a 
              href={receiptUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs text-indigo-600 hover:underline font-semibold"
            >
              Abrir en nueva pestaña
            </a>
          </div>
          <div className="flex-1 overflow-auto rounded-lg bg-slate-50 flex items-center justify-center min-h-[300px] border border-slate-100 p-2">
            <img 
              src={receiptUrl} 
              alt="Comprobante de WhatsApp" 
              className="max-w-full max-h-[500px] xl:max-h-[650px] object-contain rounded-md shadow-sm"
            />
          </div>
        </div>
      )}

      <div className="space-y-6">
      
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

      {linkedSatInvoiceId && linkedInvoiceHasXml === false && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 text-xs font-semibold flex items-start gap-2 shadow-sm animate-in fade-in duration-200">
          <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-950">Factura cargada sin archivo XML (Sólo Metadatos)</p>
            <p className="font-medium text-amber-800 mt-0.5">Esta factura fue sincronizada desde el SAT únicamente con sus datos generales y total. Para desglosar todos sus conceptos individuales y partidas en la tabla, haz clic en <strong>"Seleccionar XML"</strong> en el panel de la izquierda y sube el archivo XML correspondiente.</p>
          </div>
        </div>
      )}

      {/* Top Header Card: Datos Generales */}
      <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-sm text-indigo-950 flex items-center gap-2 border-b pb-2">
          <User className="w-4 h-4 text-indigo-600" />
          Datos Generales del Gasto
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
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

          {/* Column 2: Fecha */}
          <div className="space-y-2 col-span-1">
            <label className="text-xs font-medium text-slate-500 uppercase">Fecha *</label>
            <Input 
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-8 text-xs font-semibold"
              required
            />
          </div>

          {/* Column 3: Concepto / Notas */}
          <div className="space-y-2 col-span-1">
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

          {/* Bulk Actions Panel */}
          {selectedItemKeys.length > 0 && (
            <div className="p-3 bg-indigo-50 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-3 text-xs animate-in slide-in-from-top duration-200">
              <div className="flex items-center gap-2 font-bold text-indigo-950">
                <span>{selectedItemKeys.length} partidas seleccionadas</span>
                <button 
                  type="button" 
                  onClick={() => setSelectedItemKeys([])}
                  className="text-[10px] text-indigo-600 hover:underline"
                >
                  (Limpiar selección)
                </button>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {/* Bulk Account selector */}
                <select
                  value={bulkAccountId}
                  onChange={(e) => setBulkAccountId(e.target.value)}
                  className="h-8 rounded border border-indigo-200 text-xs px-2 bg-white font-semibold"
                >
                  <option value="">-- Cuenta Contable --</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </select>

                {/* Bulk Cost Center selector */}
                <select
                  value={bulkCostCenterId}
                  onChange={(e) => setBulkCostCenterId(e.target.value)}
                  className="h-8 rounded border border-indigo-200 text-xs px-2 bg-white font-semibold"
                >
                  <option value="">-- Centro de Costos --</option>
                  {costCenters.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>[{c.code}] {c.name}</option>
                  ))}
                </select>

                {/* Bulk Location selector */}
                <select
                  value={bulkLocationId}
                  onChange={(e) => setBulkLocationId(e.target.value)}
                  className="h-8 rounded border border-indigo-200 text-xs px-2 bg-white font-semibold"
                >
                  <option value="">-- Sucursal --</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyBulk}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-8"
                >
                  Aplicar en lote
                </Button>
              </div>
            </div>
          )}
          
          <div className="flex-1 p-5 overflow-y-auto space-y-3 lg:space-y-0">
            {selectedItems.length > 0 && (
              <div className="hidden lg:grid lg:grid-cols-[auto_1.5fr_1.2fr_1.2fr_2fr_0.5fr_1.2fr_0.8fr_auto] gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-t-lg text-[10px] font-bold text-slate-500 uppercase tracking-wider items-center">
                <div className="flex items-center">
                  <input 
                    type="checkbox"
                    checked={selectedItems.length > 0 && selectedItemKeys.length === selectedItems.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemKeys(selectedItems.map(item => item.lineKey || item.variantId));
                      } else {
                        setSelectedItemKeys([]);
                      }
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 cursor-pointer"
                  />
                </div>
                <div>Cuenta Contable *</div>
                <div>Centro Costos</div>
                <div>Sucursal *</div>
                <div>Descripción / Nombre</div>
                <div className="text-center">Cant.</div>
                <div className="text-right">Costo Unitario</div>
                <div className="text-right">Subtotal</div>
                <div className="w-8"></div>
              </div>
            )}
            {selectedItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-10">
                <FileText className="w-12 h-12 mb-3 opacity-20" />
                <p>Añade los artículos, servicios o conceptos de este gasto.</p>
              </div>
            ) : (
              selectedItems.map((item, idx) => {
                const key = item.lineKey || item.variantId;
                return (
                  <div 
                    key={key} 
                    className="grid grid-cols-1 lg:grid-cols-[auto_1.5fr_1.2fr_1.2fr_2fr_0.5fr_1.2fr_0.8fr_auto] gap-2 p-4 lg:px-4 lg:py-2 bg-background border lg:border-t-0 lg:border-x lg:border-b border-slate-200 rounded-lg lg:rounded-none last:lg:rounded-b-lg shadow-sm lg:shadow-none items-center hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Checkbox */}
                    <div className="flex items-center lg:h-8">
                      <input 
                        type="checkbox"
                        checked={selectedItemKeys.includes(key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItemKeys(prev => [...prev, key]);
                          } else {
                            setSelectedItemKeys(prev => prev.filter(k => k !== key));
                          }
                        }}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 cursor-pointer"
                      />
                    </div>

                    {/* 1. Cuenta Contable */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider lg:hidden">Cuenta Contable *</label>
                      <select
                        value={item.accountId || ""}
                        onChange={(e) => updateItem(key, 'accountId', e.target.value || "")}
                        className="h-8 rounded border border-input text-xs px-2 bg-white font-semibold w-full"
                        required
                      >
                        <option value="" disabled>-- Selecciona cuenta --</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.code} - {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 2. Centro de Costos */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider lg:hidden">Centro Costos</label>
                      <select
                        value={item.costCenterId || ""}
                        onChange={(e) => updateItem(key, 'costCenterId', e.target.value || null)}
                        className="h-8 rounded border border-input text-xs px-2 bg-white font-semibold w-full"
                      >
                        <option value="">-- Sin asignar --</option>
                        {costCenters.filter(c => c.isActive).map(c => (
                          <option key={c.id} value={c.id}>
                            [{c.code}] {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 2b. Sucursal */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider lg:hidden">Sucursal *</label>
                      <select
                        value={item.locationId || ""}
                        onChange={(e) => updateItem(key, 'locationId', e.target.value || "")}
                        className="h-8 rounded border border-input text-xs px-2 bg-white font-semibold w-full"
                        required
                      >
                        <option value="" disabled>-- Selecciona sucursal --</option>
                        {locations.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 4. Descripción / Nombre */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider lg:hidden">Descripción / Nombre</label>
                      <Input
                        placeholder="Descripción..."
                        value={item.productName}
                        onChange={(e) => updateItem(key, 'productName', e.target.value)}
                        disabled={item.productId !== "custom"}
                        className="h-8 text-xs font-bold bg-background"
                      />
                    </div>

                    {/* 5. Cantidad */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider lg:hidden">Cant.</label>
                      <Input 
                        type="number" 
                        min={1} 
                        value={item.quantity}
                        onChange={(e) => updateItem(key, 'quantity', parseInt(e.target.value) || 1)}
                        className="h-8 text-xs text-center font-bold"
                      />
                    </div>

                    {/* 6. Costo Unitario */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider lg:hidden">Costo Unitario</label>
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                        <Input 
                          type="number" 
                          min={0}
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) => updateItem(key, 'unitCost', parseFloat(e.target.value) || 0)}
                          className="h-8 w-full pl-6 text-right text-xs font-semibold"
                        />
                      </div>
                    </div>

                    {/* 7. Subtotal */}
                    <div className="flex flex-col gap-1 text-right lg:pr-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider lg:hidden">Subtotal</label>
                      <p className="font-bold text-indigo-700 text-xs py-1.5">${(item.quantity * item.unitCost).toLocaleString('es-MX', {minimumFractionDigits:2})}</p>
                    </div>

                    {/* 8. Acciones */}
                    <div className="flex justify-end pt-2 lg:pt-0">
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => removeItem(key)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-5 border-t bg-muted/30 relative flex gap-2">
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
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.type === "cash" ? "Efectivo" : a.type === "terminal" ? "Terminal" : "Banco"})
                      </option>
                    ))}
                  </select>
                </div>

                {bankAccountId && (
                  <div className="space-y-1.5 col-span-2 animate-in fade-in duration-200">
                    <label className="text-xs font-semibold text-slate-700 uppercase">Vincular a Egreso Bancario Existente</label>
                    <select
                      value={selectedTransactionId}
                      onChange={e => setSelectedTransactionId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background font-semibold"
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
                disabled={saving || selectedItems.length === 0 || !vendorId}
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
    </div>
  );
}

export default function NuevoGastoPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>}>
      <NuevoGastoForm />
    </Suspense>
  );
}
