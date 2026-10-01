"use client";

import React, { useState, useEffect, use, useRef, useMemo } from "react";
import { doc, getDoc, collection, query, onSnapshot, addDoc, updateDoc, increment, orderBy, where, deleteDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { 
  Loader2, ArrowLeft, Receipt, DollarSign, Calendar, CreditCard, BookOpen, 
  FileText, CheckCircle2, AlertCircle, Landmark, User, Building2, Save, X, 
  Trash2, ShieldCheck, FileCheck, UploadCloud, Sparkles, Check, Search 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, SearchableSelectItem } from "@/components/ui/searchable-select";
import { findOrCreateOfficialVendor } from "@/lib/services/vendorSyncService";
import { findBankAccountingAccount } from "@/lib/services/autoReconcileClientService";
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

// Helper para parsear CFDI XML en navegador
const parseXmlInvoice = (xmlText: string): any => {
  try {
    const cleanXml = xmlText.trim().replace(/^\uFEFF/, "");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(cleanXml, "text/xml");
    
    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) return null;

    let uuid = "";
    const timbreNode = xmlDoc.getElementsByTagName("tfd:TimbreFiscalDigital")[0] 
                   || xmlDoc.getElementsByTagName("TimbreFiscalDigital")[0];
    if (timbreNode) {
      uuid = timbreNode.getAttribute("UUID") || "";
    } else {
      const uuidMatch = cleanXml.match(/UUID="([^"]{36})"/i);
      if (uuidMatch) uuid = uuidMatch[1];
    }

    if (!uuid || uuid.length !== 36) return null;

    const comprobanteNode = xmlDoc.getElementsByTagName("cfdi:Comprobante")[0]
                        || xmlDoc.getElementsByTagName("Comprobante")[0];
    let total = 0;
    let subtotal = 0;
    let date = "";
    let folio = "";
    let serie = "";
    if (comprobanteNode) {
      total = parseFloat(comprobanteNode.getAttribute("Total") || "0") || 0;
      subtotal = parseFloat(comprobanteNode.getAttribute("SubTotal") || "0") || 0;
      date = comprobanteNode.getAttribute("Fecha") || "";
      folio = comprobanteNode.getAttribute("Folio") || "";
      serie = comprobanteNode.getAttribute("Serie") || "";
    } else {
      const totalMatch = cleanXml.match(/\bTotal="([^"]+)"/i);
      const subtotalMatch = cleanXml.match(/\bSubTotal="([^"]+)"/i);
      const fechaMatch = cleanXml.match(/\bFecha="([^"]+)"/i);
      const folioMatch = cleanXml.match(/\bFolio="([^"]+)"/i);
      const serieMatch = cleanXml.match(/\bSerie="([^"]+)"/i);
      if (totalMatch) total = parseFloat(totalMatch[1]) || 0;
      if (subtotalMatch) subtotal = parseFloat(subtotalMatch[1]) || 0;
      if (fechaMatch) date = fechaMatch[1];
      if (folioMatch) folio = folioMatch[1];
      if (serieMatch) serie = serieMatch[1];
    }
    const combinedFolio = (serie ? `${serie}-${folio}` : folio) || "";

    const emisorNode = xmlDoc.getElementsByTagName("cfdi:Emisor")[0]
                   || xmlDoc.getElementsByTagName("Emisor")[0];
    let emisorRfc = "Desconocido";
    let emisorName = "Desconocido";
    if (emisorNode) {
      emisorRfc = emisorNode.getAttribute("Rfc") || "Desconocido";
      emisorName = emisorNode.getAttribute("Nombre") || "Desconocido";
    }

    const xmlBase64 = btoa(unescape(encodeURIComponent(cleanXml)));

    return {
      id: uuid,
      uuid,
      total,
      subtotal: subtotal || (total / 1.16),
      tax: total - (subtotal || (total / 1.16)),
      date: date ? date.split("T")[0] : new Date().toISOString().split("T")[0],
      emisorRfc,
      emisorName,
      vendorName: emisorName,
      vendorRfc: emisorRfc,
      folio: combinedFolio,
      invoiceNumber: combinedFolio,
      xmlBase64,
      status: "pending_review",
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    console.error("Error parsing XML:", err);
    return null;
  }
};

export default function GastoDetallePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const { companyId, user } = useAuth();
  const router = useRouter();

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conceptos, setConceptos] = useState<ConceptItem[]>([]);
  const [isManual, setIsManual] = useState(false);

  // Fiscal / Formalization States
  const [inboxInvoices, setInboxInvoices] = useState<any[]>([]);
  const [selectedInboxId, setSelectedInboxId] = useState<string>("");
  const [inboxSearch, setInboxSearch] = useState("");
  const [uploadingXml, setUploadingXml] = useState(false);
  const [activeFormalizeTab, setActiveFormalizeTab] = useState<"fiscal" | "nondeductible">("fiscal");
  const [formalizeNotes, setFormalizeNotes] = useState("");
  const [formalizing, setFormalizing] = useState(false);
  const [formalizeSuccess, setFormalizeSuccess] = useState("");
  const [formalizeError, setFormalizeError] = useState("");
  const xmlFileInputRef = useRef<HTMLInputElement>(null);

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
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedCostCenterId, setSelectedCostCenterId] = useState("");

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

  const [creatingQuickVendor, setCreatingQuickVendor] = useState(false);
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

  const parseCFDIXml = (xmlStr: string): ConceptItem[] => {
    try {
      const cleanXml = xmlStr.trim().replace(/^\uFEFF/, "");
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(cleanXml, "text/xml");
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

          let xmlBase64 = invData.xmlBase64 || null;
          if (!xmlBase64 && invData.satInvoiceId) {
            try {
              const inboxSnap = await getDoc(doc(db, "companies", companyId, "expenses_inbox", invData.satInvoiceId));
              if (inboxSnap.exists() && inboxSnap.data()?.xmlBase64) {
                xmlBase64 = inboxSnap.data().xmlBase64;
              }
            } catch (e) {
              console.warn("Could not fetch fallback xmlBase64 from inbox:", e);
            }
          }

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
            xmlBase64: xmlBase64,
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
            items: invData.items || [],
            isProvisional: Boolean(
              invData.isProvisional ||
              invData.isPendingFiscalInvoice ||
              (invData.documentNumber && invData.documentNumber.startsWith("PROV-"))
            ),
            isNonDeductible: Boolean(invData.isNonDeductible),
            formalizedWithSat: Boolean(invData.formalizedWithSat || invData.satInvoiceId || (invData.uuid && invData.uuid.length === 36)),
            satInvoiceId: invData.satInvoiceId || null,
            reviewNotes: invData.reviewNotes || ""
          };

          setInvoice(normalizedInvoice);

          // Initialize payment configuration
          const totalVal = normalizedInvoice.total;
          const paidVal = Math.max(0, normalizedInvoice.paidAmount);
          const outstanding = Math.max(0, totalVal - paidVal);
          setAmount(Number(outstanding.toFixed(2)));
          setDate(new Date().toISOString().split("T")[0]);
          setExpenseAccountId(normalizedInvoice.accountId || "");
          setSelectedLocationId(normalizedInvoice.locationId || "");
          setSelectedCostCenterId(normalizedInvoice.costCenterId || "");

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
      const locList = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      }));
      setLocations(locList);
      if (locList.length === 1) {
        setSelectedLocationId(prev => prev || locList[0].id);
      }
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

  const expenseAccountItems = useMemo<SearchableSelectItem[]>(() => {
    return expenseAccounts.map((a: any) => ({
      id: a.id,
      name: `${a.code ? `${a.code} - ` : ""}${a.name || a.Name || a.id}`,
      subtitle: a.type || a.description || undefined
    }));
  }, [expenseAccounts]);

  const costCenterItems = useMemo<SearchableSelectItem[]>(() => {
    return [
      { id: "none", name: "Ninguno", subtitle: "Sin centro de costos" },
      ...costCenters
        .filter((cc: any) => cc.isActive !== false)
        .map((cc: any) => ({
          id: cc.id,
          name: `${cc.code ? `${cc.code} - ` : ""}${cc.name || cc.Name || cc.id}`,
          subtitle: cc.description || undefined
        }))
    ];
  }, [costCenters]);

  const locationItems = useMemo<SearchableSelectItem[]>(() => {
    return locations.map((l: any) => ({
      id: l.id,
      name: l.name || l.Name || l.id
    }));
  }, [locations]);

  // Candidate invoices from expenses_inbox for formalizing
  useEffect(() => {
    if (!companyId || !invoice?.isProvisional) return;

    const unsubInbox = onSnapshot(collection(db, "companies", companyId, "expenses_inbox"), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(inv => inv.status !== "paid" && !inv.reconciled);

      setInboxInvoices(list);

      // Auto-preselect exact match if available
      if (invoice?.total) {
        const exactMatch = list.find(inv => {
          const invTotal = Number(inv.total || inv.amount || 0);
          return Math.abs(invTotal - Number(invoice.total)) < 0.05;
        });
        if (exactMatch) {
          setSelectedInboxId(prev => prev || exactMatch.id || exactMatch.uuid);
        }
      }
    });

    return () => unsubInbox();
  }, [companyId, invoice?.isProvisional, invoice?.total]);

  const candidateInvoices = useMemo(() => {
    if (!invoice?.isProvisional) return [];
    const expAmount = Number(invoice.total || invoice.amount || 0);
    const expVendor = (invoice.emisorName || invoice.vendorName || "").toLowerCase();
    const q = inboxSearch.toLowerCase().trim();

    return [...inboxInvoices]
      .filter(inv => {
        if (!q) return true;
        const folio = (inv.invoiceNumber || inv.folio || "").toLowerCase();
        const emisor = (inv.emisorName || inv.vendorName || "").toLowerCase();
        const rfc = (inv.emisorRfc || inv.vendorRfc || "").toLowerCase();
        const uuid = (inv.uuid || inv.id || "").toLowerCase();
        return folio.includes(q) || emisor.includes(q) || rfc.includes(q) || uuid.includes(q);
      })
      .sort((a, b) => {
        const aTotal = Number(a.total || a.amount || 0);
        const bTotal = Number(b.total || b.amount || 0);
        const aExact = Math.abs(aTotal - expAmount) < 0.05;
        const bExact = Math.abs(bTotal - expAmount) < 0.05;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aVendor = (a.emisorName || a.vendorName || "").toLowerCase().includes(expVendor);
        const bVendor = (b.emisorName || b.vendorName || "").toLowerCase().includes(expVendor);
        if (aVendor && !bVendor) return -1;
        if (!aVendor && bVendor) return 1;

        return (b.date || "").localeCompare(a.date || "");
      });
  }, [inboxInvoices, inboxSearch, invoice]);

  const selectedInvoiceObject = useMemo(() => {
    if (!selectedInboxId) return null;
    return inboxInvoices.find(inv => inv.id === selectedInboxId || inv.uuid === selectedInboxId) || null;
  }, [selectedInboxId, inboxInvoices]);

  const handleUploadXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;

    setUploadingXml(true);
    setFormalizeError("");
    setFormalizeSuccess("");

    try {
      const text = await file.text();
      const parsed = parseXmlInvoice(text);
      if (!parsed) {
        throw new Error("El archivo no es un XML CFDI válido o no contiene Timbre Fiscal Digital (UUID).");
      }

      const existingInboxRef = doc(db, "companies", companyId, "expenses_inbox", parsed.id);
      await setDoc(existingInboxRef, parsed, { merge: true });

      setInboxInvoices(prev => {
        const filtered = prev.filter(i => i.id !== parsed.id);
        return [parsed, ...filtered];
      });
      setSelectedInboxId(parsed.id);
      setFormalizeSuccess(`XML "${parsed.folio || parsed.uuid.substring(0, 8)}" cargado correctamente.`);
    } catch (err: any) {
      console.error("Error al subir XML:", err);
      setFormalizeError(err.message || "Error al procesar el archivo XML.");
    } finally {
      setUploadingXml(false);
      if (xmlFileInputRef.current) xmlFileInputRef.current.value = "";
    }
  };

  const handleFormalizeWithSat = async () => {
    if (!companyId || !invoice) return;

    const selectedInvoice = selectedInvoiceObject;
    if (!selectedInvoice) {
      setFormalizeError("Por favor selecciona o sube una Factura Fiscal (CFDI) para vincular.");
      return;
    }
    if (!editAccountId) {
      setFormalizeError("Por favor selecciona la Cuenta Contable de gasto en los datos del gasto.");
      return;
    }

    setFormalizing(true);
    setFormalizeError("");

    try {
      const selectedLoc = locations.find(l => l.id === editLocationId);
      const selectedCC = costCenters.find(c => c.id === editCostCenterId);
      const selectedAcc = expenseAccounts.find(a => a.id === editAccountId);

      const batch = writeBatch(db);
      const now = new Date().toISOString();

      const expRef = doc(db, "companies", companyId, "expenses", invoice.id);
      const satId = selectedInvoice.id || selectedInvoice.uuid;
      const satDocNumber = selectedInvoice.folio || selectedInvoice.invoiceNumber || selectedInvoice.uuid.substring(0, 8);
      const satTotal = Number(selectedInvoice.total || invoice.total);
      const satVat = selectedInvoice.tax !== undefined ? Number(selectedInvoice.tax) : (satTotal - (satTotal / 1.16));
      const satSubtotal = selectedInvoice.subtotal !== undefined ? Number(selectedInvoice.subtotal) : (satTotal - satVat);

      // Parse items from XML if available
      let satItems: any[] = [];
      if (selectedInvoice.xmlBase64) {
        try {
          const xmlText = decodeBase64Utf8(selectedInvoice.xmlBase64);
          const rawItems = parseCFDIXml(xmlText);
          if (rawItems.length > 0) {
            satItems = rawItems.map(p => ({
              lineKey: crypto.randomUUID(),
              productId: "custom",
              variantId: p.noIdentificacion || crypto.randomUUID(),
              productName: p.descripcion || "Concepto SAT",
              variantTitle: "CFDI-XML",
              quantity: p.cantidad || 1,
              unitCost: p.valorUnitario || 0,
              amount: p.importe || 0,
              claveProdServ: p.claveProdServ || "",
              claveUnidad: p.claveUnidad || "",
              unidad: p.unidad || "PZA",
              accountId: editAccountId,
              costCenterId: editCostCenterId || null,
              locationId: editLocationId || null
            }));
          }
        } catch (e) {
          console.warn("Could not parse items from XML:", e);
        }
      }

      // Encontrar o dar de alta al proveedor oficial por RFC o Nombre
      const candidateVendorName = selectedInvoice.emisorName || selectedInvoice.vendorName || invoice.emisorName || "Proveedor";
      const candidateVendorRfc = selectedInvoice.emisorRfc || selectedInvoice.vendorRfc || "";
      const officialVendor = await findOrCreateOfficialVendor(companyId, {
        rfc: candidateVendorRfc,
        name: candidateVendorName,
        createIfMissing: true
      });

      const finalVendorId = officialVendor?.id || editVendorId || invoice.vendorId || "";
      const finalVendorName = officialVendor?.name || candidateVendorName;
      const finalVendorRfc = officialVendor?.rfc || candidateVendorRfc;

      const updatePayload: any = {
        isProvisional: false,
        isPendingFiscalInvoice: false,
        isNonDeductible: false,
        formalizedWithSat: true,
        status: "paid",
        satInvoiceId: satId,
        uuid: selectedInvoice.uuid || "",
        documentNumber: satDocNumber,
        vendorId: finalVendorId,
        vendorName: finalVendorName,
        vendorRfc: finalVendorRfc,
        concept: editConcept || selectedInvoice.concept || `Gasto amparado por CFDI ${satDocNumber}`,
        subtotal: satSubtotal,
        tax: satVat,
        vatRate: 0.16,
        locationId: editLocationId || "",
        locationName: selectedLoc?.name || selectedLoc?.Name || "",
        costCenterId: editCostCenterId || null,
        costCenterName: selectedCC?.name || selectedCC?.Name || "",
        accountId: editAccountId,
        accountCode: selectedAcc?.code || "",
        accountName: selectedAcc?.name || "",
        reviewedBy: user?.email || "Detalle Formalización Fiscal",
        reviewedAt: now,
        reviewNotes: formalizeNotes || `Formalizado y vinculado a CFDI ${satDocNumber}${officialVendor?.number ? ` (Proveedor oficial: ${officialVendor.number})` : ''}`,
        xmlBase64: selectedInvoice.xmlBase64 || null
      };

      if (satItems.length > 0) {
        updatePayload.items = satItems;
      }

      batch.update(expRef, updatePayload);

      // Actualizar factura en expenses_inbox como pagada y enlazada
      const satRef = doc(db, "companies", companyId, "expenses_inbox", satId);
      batch.update(satRef, {
        status: "paid",
        reconciled: true,
        reconciledAt: now,
        linkedExpenseId: invoice.id,
        paidAmount: satTotal
      });

      // Actualizar la Póliza Contable si existe
      try {
        const qJournal = query(
          collection(db, "companies", companyId, "journal_entries"),
          where("documentId", "==", invoice.id)
        );
        const snapJournal = await getDocs(qJournal);
        snapJournal.forEach(jDoc => {
          const jData = jDoc.data();
          const entries = Array.isArray(jData.entries) ? [...jData.entries] : [];
          
          const creditEntry = entries.find(e => e.credit > 0) || {
            accountCode: "102.01",
            accountName: "Banco",
            debit: 0,
            credit: satTotal
          };

          const targetExpenseCode = selectedAcc?.code || "601.01";
          const targetExpenseName = selectedAcc?.name || "Gastos Generales";

          const updatedEntries = [
            {
              accountCode: targetExpenseCode,
              accountName: targetExpenseName,
              debit: satSubtotal,
              credit: 0
            },
            {
              accountCode: "118.01",
              accountName: "IVA Acreditable Pagado",
              debit: satVat,
              credit: 0
            },
            {
              accountCode: creditEntry.accountCode,
              accountName: creditEntry.accountName,
              debit: 0,
              credit: satTotal
            }
          ];

          batch.update(jDoc.ref, {
            entries: updatedEntries,
            updatedAt: now,
            reference: satDocNumber,
            concept: `Formalización Fiscal CFDI: ${selectedInvoice.emisorName || invoice.emisorName} - ${editConcept || ''}`
          });
        });
      } catch (jErr) {
        console.warn("No se pudo actualizar la póliza del gasto formalizado:", jErr);
      }

      await batch.commit();
      alert(`¡Gasto formalizado con éxito! Se vinculó el CFDI ${satDocNumber}.`);
      window.location.reload();
    } catch (err: any) {
      console.error("Error al formalizar gasto con SAT:", err);
      setFormalizeError(`Error: ${err.message || "No se pudo vincular la factura."}`);
    } finally {
      setFormalizing(false);
    }
  };

  const handleDeclareNonDeductible = async () => {
    if (!companyId || !invoice) return;

    if (!editAccountId) {
      setFormalizeError("Por favor selecciona la Cuenta Contable en los datos del gasto.");
      return;
    }

    setFormalizing(true);
    setFormalizeError("");

    try {
      const selectedLoc = locations.find(l => l.id === editLocationId);
      const selectedCC = costCenters.find(c => c.id === editCostCenterId);
      const selectedAcc = expenseAccounts.find(a => a.id === editAccountId);

      const batch = writeBatch(db);
      const now = new Date().toISOString();

      const expRef = doc(db, "companies", companyId, "expenses", invoice.id);
      // Resolver o crear proveedor oficial si se tiene proveedor asignado
      let nonDeductibleVendorId = editVendorId || invoice.vendorId || "";
      let nonDeductibleVendorName = editVendorSearchQuery || invoice.emisorName || invoice.vendorName || "Proveedor";
      if (!nonDeductibleVendorId && nonDeductibleVendorName && nonDeductibleVendorName !== "Proveedor") {
        try {
          const resolved = await findOrCreateOfficialVendor(companyId, {
            name: nonDeductibleVendorName,
            createIfMissing: true
          });
          if (resolved) {
            nonDeductibleVendorId = resolved.id;
            nonDeductibleVendorName = resolved.name;
          }
        } catch (vErr) {
          console.warn("Could not auto create vendor for non-deductible:", vErr);
        }
      }

      const updatePayload: any = {
        isProvisional: false,
        isPendingFiscalInvoice: false,
        isNonDeductible: true,
        status: invoice.status || "paid",
        vendorId: nonDeductibleVendorId || "",
        vendorName: nonDeductibleVendorName,
        locationId: editLocationId || "",
        locationName: selectedLoc?.name || selectedLoc?.Name || "",
        costCenterId: editCostCenterId || null,
        costCenterName: selectedCC?.name || selectedCC?.Name || "",
        accountId: editAccountId,
        accountCode: selectedAcc?.code || "",
        accountName: selectedAcc?.name || "",
        reviewedBy: user?.email || "Detalle No Deducible",
        reviewedAt: now,
        reviewNotes: formalizeNotes || "Declarado como gasto no deducible oficial"
      };

      if (editConcept.trim()) updatePayload.concept = editConcept.trim();

      batch.update(expRef, updatePayload);

      // Actualizar póliza contable si existe
      try {
        const qJournal = query(
          collection(db, "companies", companyId, "journal_entries"),
          where("documentId", "==", invoice.id)
        );
        const snapJournal = await getDocs(qJournal);
        snapJournal.forEach(jDoc => {
          const jData = jDoc.data();
          const entries = Array.isArray(jData.entries) ? [...jData.entries] : [];
          let changed = false;

          entries.forEach(entry => {
            if (entry.debit > 0) {
              entry.accountCode = selectedAcc?.code || entry.accountCode;
              entry.accountName = selectedAcc?.name || entry.accountName;
              changed = true;
            }
          });

          if (changed) {
            batch.update(jDoc.ref, {
              entries,
              updatedAt: now,
              concept: `Gasto Oficial No Deducible: ${invoice.emisorName || ''} - ${editConcept || ''}`
            });
          }
        });
      } catch (jErr) {
        console.warn("Could not update journal entry for non deductible:", jErr);
      }

      await batch.commit();
      alert("¡Gasto confirmado como Oficial No Deducible!");
      window.location.reload();
    } catch (err: any) {
      console.error("Error al declarar gasto no deducible:", err);
      setFormalizeError(`Error: ${err.message || "No se pudo oficializar."}`);
    } finally {
      setFormalizing(false);
    }
  };

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

  const handleQuickCreateVendor = async (vendorNameToCreate: string) => {
    if (!companyId || !vendorNameToCreate.trim()) return;
    setCreatingQuickVendor(true);
    try {
      const created = await findOrCreateOfficialVendor(companyId, {
        name: vendorNameToCreate.trim(),
        createIfMissing: true
      });
      if (created) {
        setEditVendorId(created.id);
        setEditVendorSearchQuery(created.name);
        setShowVendorDropdown(false);
        alert(`¡Proveedor oficial registrado exitosamente! ${created.name} (${created.number || 'Sin número'})`);
      }
    } catch (err: any) {
      console.error("Error creating quick vendor:", err);
      alert(`No se pudo crear el proveedor: ${err.message || 'Error desconocido'}`);
    } finally {
      setCreatingQuickVendor(false);
    }
  };

  const handleUpdateManualExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !invoice) return;

    setSaving(true);
    try {
      let finalVendorId = editVendorId;
      let vendorName = editVendorSearchQuery.trim() || "Proveedor";
      let vendorRfc = "";

      const selectedVendor = vendors.find(v => v.id === editVendorId);
      if (selectedVendor) {
        vendorName = selectedVendor.name;
        vendorRfc = selectedVendor.rfc || "";
      } else if (vendorName && vendorName !== "Proveedor") {
        // Si el usuario escribió un proveedor pero no lo seleccionó del listado, crearlo/resolverlo automáticamente
        try {
          const resolved = await findOrCreateOfficialVendor(companyId, {
            name: vendorName,
            createIfMissing: true
          });
          if (resolved) {
            finalVendorId = resolved.id;
            vendorName = resolved.name;
            vendorRfc = resolved.rfc || "";
          }
        } catch (vErr) {
          console.warn("Could not auto-create vendor in manual save:", vErr);
        }
      }

      if (!finalVendorId) {
        alert("Debes seleccionar o crear un proveedor oficial para este gasto.");
        setSaving(false);
        return;
      }

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
        vendorId: finalVendorId,
        vendorName,
        vendorRfc: vendorRfc || "",
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

  const safePaidAmount = Math.max(0, invoice.paidAmount || 0);
  const saldoPendiente = Math.max(0, (invoice.total || 0) - safePaidAmount);

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

    const finalLocationId = !isManual ? selectedLocationId : (invoice.locationId || editLocationId);
    if (!isManual && !finalLocationId) {
      alert("Debes seleccionar una Sucursal para registrar este egreso.");
      return;
    }
    const finalCostCenterId = !isManual 
      ? (selectedCostCenterId === "none" ? "" : selectedCostCenterId)
      : (editCostCenterId === "none" ? "" : editCostCenterId);

    const selectedLocation = locations.find((l) => l.id === finalLocationId);
    const selectedCostCenter = costCenters.find((c) => c.id === finalCostCenterId);

    const physicalBankAccount = bankAccounts.find((a) => a.id === bankAccountId);
    if (!physicalBankAccount) {
      alert("No se encontró la cuenta bancaria seleccionada.");
      return;
    }

    const bankAccountingAccount = findBankAccountingAccount(physicalBankAccount, accountingAccounts);
    if (!bankAccountingAccount) {
      alert(`La cuenta/caja "${physicalBankAccount?.Name || physicalBankAccount?.name || "seleccionada"}" no está enlazada a una cuenta contable. Por favor configúrala en el catálogo de cuentas.`);
      return;
    }
    const bankAccountingId = bankAccountingAccount.id;

    const expenseAccount = expenseAccounts.find((a) => a.id === finalExpenseAccountId);
    if (!expenseAccount) {
      alert("No se encontró la cuenta contable de gasto especificada.");
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
        locationId: finalLocationId || null,
        locationName: selectedLocation?.name || null,
        costCenterId: finalCostCenterId || null,
        costCenterName: selectedCostCenter?.name || null,
        createdAt: new Date().toISOString(),
        bankTransactionId: finalBankTransactionId
      };

      const paymentRef = await addDoc(collection(db, "companies", companyId, "outflows"), paymentData);

      // 2. Create Journal Entry (Póliza de Egreso)
      if (physicalBankAccount && expenseAccount && bankAccountingAccount) {
        let subtotalAmount = amount;
        let vatAmount = 0;
        let vatAccount = null;

        if (vatRate > 0) {
          subtotalAmount = amount / (1 + vatRate);
          vatAmount = amount - subtotalAmount;
          vatAccount = vatAccounts[0];
        }

        const entries: any[] = [
          {
            accountId: finalExpenseAccountId,
            accountCode: expenseAccount.code,
            accountName: expenseAccount.name,
            debit: subtotalAmount,
            credit: 0,
            costCenterId: finalCostCenterId || null,
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

      if (finalLocationId) {
        docUpdates.locationId = finalLocationId;
        docUpdates.locationName = selectedLocation?.name || "";
      }

      if (finalCostCenterId) {
        docUpdates.costCenterId = finalCostCenterId;
        docUpdates.costCenterName = selectedCostCenter?.name || "";
      }

      if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
        docUpdates.items = invoice.items.map((it: any) => ({
          ...it,
          locationId: finalLocationId || it.locationId || null,
          costCenterId: finalCostCenterId || it.costCenterId || null,
          accountId: finalExpenseAccountId || it.accountId || null
        }));
      }

      const newPaidAmount = Math.max(0, invoice.paidAmount || 0) + amount;
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

      // 3. Revert Manual Expense status and paidAmount based on actual remaining payments
      const remainingPayments = associatedPayments.filter((p) => p.id !== payment.id);
      const newPaidAmount = Math.max(
        0,
        remainingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      );
      const invoiceTotal = Number(invoice.total || invoice.amount || 0);
      const newStatus = newPaidAmount >= invoiceTotal - 0.01 && invoiceTotal > 0 ? "paid" : "pending";

      if (isManual) {
        await updateDoc(doc(db, "companies", companyId, "expenses", invoice.id), {
          paidAmount: newPaidAmount,
          status: newStatus
        });

        // Also update linked SAT XML if exists
        if (invoice.satInvoiceId) {
          try {
            await updateDoc(doc(db, "companies", companyId, "expenses_inbox", invoice.satInvoiceId), {
              paidAmount: newPaidAmount,
              status: newPaidAmount >= invoiceTotal - 0.01 ? "paid" : "processed"
            });
          } catch (err) {
            console.warn("Failed to update related SAT invoice:", err);
          }
        }
      } else {
        // XML directly
        await updateDoc(doc(db, "companies", companyId, "expenses_inbox", invoice.id), {
          paidAmount: newPaidAmount,
          status: newPaidAmount >= invoiceTotal - 0.01 ? "paid" : (invoice.expenseId ? "processed" : "pending_review")
        });

        // Also update linked manual expense if it exists
        if (invoice.expenseId) {
          try {
            await updateDoc(doc(db, "companies", companyId, "expenses", invoice.expenseId), {
              paidAmount: newPaidAmount,
              status: newStatus
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
          {associatedPayments.map((payment) => {
            const bank = bankAccounts.find((b) => b.id === payment.bankAccountId);
            const bankName = bank?.Name || bank?.name || payment.bankAccountName || "";

            return (
              <div key={payment.id} className="flex justify-between items-center p-3 bg-slate-50 border rounded-lg hover:bg-slate-100/70 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-700">{payment.date}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-200 border rounded-full font-medium text-slate-600 uppercase">{payment.method}</span>
                    {bankName && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded-full font-bold text-indigo-700" title={`Cuenta bancaria: ${bankName}`}>
                        <Landmark className="w-3 h-3 text-indigo-600" />
                        {bankName}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium truncate max-w-xs" title={payment.reference}>
                    {payment.reference ? `Ref: ${payment.reference}` : "Sin referencia"}
                  </p>
                  {payment.bankTransactionId && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
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
            );
          })}
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Fiscal Status Badge */}
          {invoice.isNonDeductible ? (
            <div className="px-3 py-1.5 bg-slate-100 text-slate-800 font-bold rounded-lg flex items-center gap-1.5 border border-slate-300 text-xs">
              <ShieldCheck className="w-4 h-4 text-slate-600" /> Oficial No Deducible
            </div>
          ) : invoice.isProvisional ? (
            <div className="px-3 py-1.5 bg-amber-50 text-amber-900 font-bold rounded-lg flex items-center gap-1.5 border border-amber-300 text-xs animate-pulse">
              <Sparkles className="w-4 h-4 text-amber-600" /> Gasto Provisional
            </div>
          ) : (invoice.formalizedWithSat || invoice.satInvoiceId) ? (
            <div className="px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold rounded-lg flex items-center gap-1.5 border border-indigo-200 text-xs">
              <ShieldCheck className="w-4 h-4 text-indigo-600" /> Deducible CFDI
            </div>
          ) : null}

          {/* Payment Status Badge */}
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
        <div className="space-y-6">
          {/* Panel para Oficializar si es Provisional */}
          {invoice.isProvisional && (
            <div className="bg-card border-2 border-indigo-200 rounded-xl p-6 shadow-sm space-y-5 bg-white animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl shrink-0">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                      <span>Oficializar Gasto Provisional</span>
                      <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-full border border-amber-300">
                        PROVISIONAL
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Este gasto está registrado de manera provisional. Puedes vincularlo a una factura fiscal SAT (CFDI) o declararlo como no deducible.
                    </p>
                  </div>
                </div>

                {/* Selector de Pestaña */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => { setActiveFormalizeTab("fiscal"); setFormalizeError(""); }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      activeFormalizeTab === "fiscal"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Vincular Factura SAT (CFDI)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveFormalizeTab("nondeductible"); setFormalizeError(""); }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      activeFormalizeTab === "nondeductible"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Declarar No Deducible
                  </button>
                </div>
              </div>

              {/* Mensajes de error / éxito */}
              {formalizeError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formalizeError}</span>
                </div>
              )}
              {formalizeSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{formalizeSuccess}</span>
                </div>
              )}

              {activeFormalizeTab === "fiscal" ? (
                <div className="space-y-4">
                  {/* Header de búsqueda y subida XML */}
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Buscar factura en buzón SAT por folio, proveedor, RFC o UUID..."
                        value={inboxSearch}
                        onChange={e => setInboxSearch(e.target.value)}
                        className="pl-9 h-9 text-xs"
                      />
                    </div>
                    <div>
                      <input
                        ref={xmlFileInputRef}
                        type="file"
                        accept=".xml"
                        onChange={handleUploadXml}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingXml}
                        onClick={() => xmlFileInputRef.current?.click()}
                        className="gap-1.5 text-xs font-bold text-indigo-700 border-indigo-200 hover:bg-indigo-50 w-full sm:w-auto h-9"
                      >
                        {uploadingXml ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                        Subir XML CFDI
                      </Button>
                    </div>
                  </div>

                  {/* Lista de Facturas Candidatas */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto divide-y bg-slate-50/60 custom-scrollbar">
                    {candidateInvoices.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        No se encontraron facturas SAT pendientes en el buzón con este criterio. Puedes subir el archivo XML directamente con el botón "Subir XML CFDI".
                      </div>
                    ) : (
                      candidateInvoices.map(inv => {
                        const invTotal = Number(inv.total || inv.amount || 0);
                        const isExact = Math.abs(invTotal - Number(invoice.total || 0)) < 0.05;
                        const isSelected = selectedInboxId === inv.id || selectedInboxId === inv.uuid;

                        return (
                          <div
                            key={inv.id}
                            onClick={() => setSelectedInboxId(inv.id || inv.uuid)}
                            className={`p-3 text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                              isSelected ? "bg-indigo-50/90 font-semibold" : "hover:bg-slate-100/70"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="radio"
                                name="selectedInvoice"
                                checked={isSelected}
                                onChange={() => setSelectedInboxId(inv.id || inv.uuid)}
                                className="text-indigo-600 focus:ring-indigo-500 h-4 w-4 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-slate-900">{inv.folio || inv.invoiceNumber || "Sin Folio"}</span>
                                  <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 rounded font-medium text-slate-700">{inv.date?.split("T")[0] || "-"}</span>
                                  {isExact && (
                                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold border border-emerald-300 flex items-center gap-1">
                                      <Sparkles className="w-2.5 h-2.5" /> Monto Exacto
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-600 truncate mt-0.5 font-medium" title={inv.emisorName || inv.vendorName}>
                                  {inv.emisorName || inv.vendorName || "Proveedor"}
                                </p>
                                <p className="text-[10px] font-mono text-slate-400 truncate">{inv.uuid}</p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-extrabold text-slate-900 text-sm">
                                ${invTotal.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-slate-500 block">IVA: ${Number(inv.tax || (invTotal - invTotal/1.16)).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Previsualización de Factura Seleccionada & Botón de Oficialización */}
                  {selectedInvoiceObject && (
                    <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                          <Check className="w-4 h-4 text-emerald-600" />
                          Factura seleccionada: <span className="font-mono">{selectedInvoiceObject.folio || selectedInvoiceObject.uuid?.substring(0, 8)}</span>
                        </p>
                        <p className="text-[11px] text-slate-600">
                          {selectedInvoiceObject.emisorName || selectedInvoiceObject.vendorName} ({selectedInvoiceObject.emisorRfc || selectedInvoiceObject.vendorRfc}) | Total: ${(Number(selectedInvoiceObject.total || selectedInvoiceObject.amount || 0)).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        disabled={formalizing}
                        onClick={handleFormalizeWithSat}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-2 shrink-0 h-10 px-5 shadow-sm"
                      >
                        {formalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Vincular CFDI y Oficializar
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-2 text-xs text-amber-900 leading-relaxed">
                    <p className="font-bold flex items-center gap-1.5 text-amber-950">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      Declaración Oficial de Gasto No Deducible
                    </p>
                    <p>
                      Al confirmar, este gasto dejará de ser considerado provisional y se reclasificará de forma oficial como <strong>Gasto No Deducible</strong> (por ejemplo: comisiones bancarias sin CFDI, retiros de cajero, recibos simples o gastos operativos sin factura fiscal).
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Notas de Justificación Administrativa (Opcional):</label>
                    <Input
                      placeholder="Ej. Comisión por terminal bancaria sin factura fiscal..."
                      value={formalizeNotes}
                      onChange={e => setFormalizeNotes(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="button"
                      disabled={formalizing}
                      onClick={handleDeclareNonDeductible}
                      className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs gap-2 h-10 px-5 shadow-sm"
                    >
                      {formalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      Confirmar como No Deducible Oficial
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Banner si el gasto ya está oficializado con CFDI */}
          {invoice.formalizedWithSat && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-emerald-950 flex items-center gap-2">
                    <span>Gasto Oficial amparado con Factura SAT</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full border border-emerald-300">
                      CFDI DEDUCIBLE
                    </span>
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Folio Fiscal (UUID): <span className="font-mono font-semibold">{invoice.uuid}</span>
                  </p>
                </div>
              </div>
              {invoice.xmlBase64 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const xmlText = decodeBase64Utf8(invoice.xmlBase64);
                    const blob = new Blob([xmlText], { type: "text/xml" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${invoice.invoiceNumber || invoice.uuid}.xml`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="text-xs font-bold border-emerald-300 text-emerald-800 hover:bg-emerald-100 gap-1.5 shrink-0"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Descargar XML
                </Button>
              )}
            </div>
          )}

          {/* Banner si el gasto es Oficial No Deducible */}
          {invoice.isNonDeductible && (
            <div className="bg-slate-100 border border-slate-300 rounded-xl p-4 shadow-sm flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-700 text-white shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>Gasto Oficial No Deducible</span>
                  <span className="text-[10px] bg-slate-200 text-slate-800 font-extrabold px-2 py-0.5 rounded-full border border-slate-400">
                    NO DEDUCIBLE
                  </span>
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  {invoice.reviewNotes || "Este gasto ha sido clasificado formalmente sin comprobante fiscal CFDI."}
                </p>
              </div>
            </div>
          )}

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
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                        {/* Botón para dar de alta nuevo proveedor rápidamente si hay texto escrito */}
                        {editVendorSearchQuery.trim() && (
                          <div className="p-2 border-b bg-indigo-50/60 sticky top-0 z-10">
                            <button
                              type="button"
                              disabled={creatingQuickVendor}
                              onClick={() => handleQuickCreateVendor(editVendorSearchQuery)}
                              className="w-full text-left px-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-between gap-1 shadow-sm transition-colors"
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                {creatingQuickVendor ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-300" />}
                                <span className="truncate">Crear "{editVendorSearchQuery.trim()}" en Catálogo</span>
                              </span>
                              <span className="text-[10px] bg-indigo-700 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">
                                Nuevo
                              </span>
                            </button>
                          </div>
                        )}

                        {vendors.filter(v => {
                          const q = editVendorSearchQuery.toLowerCase();
                          return v.name.toLowerCase().includes(q) || (v.rfc || "").toLowerCase().includes(q);
                        }).length === 0 ? (
                          <div className="p-4 text-xs text-slate-500 text-center space-y-1">
                            <p className="font-semibold text-slate-700">No se encontró ningún proveedor registrado</p>
                            <p className="text-[11px] text-slate-400">Puedes crearlo usando el botón superior azul.</p>
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
                              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex flex-col border-b last:border-b-0 ${
                                vendor.id === editVendorId ? "bg-indigo-50/70" : ""
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800">{vendor.name}</span>
                                {vendor.id === editVendorId && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">
                                    Seleccionado
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">{vendor.rfc || "Sin RFC"}</span>
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
                    <SearchableSelect
                      placeholder="Selecciona sucursal..."
                      items={locationItems}
                      selectedId={editLocationId}
                      onSelect={(id) => setEditLocationId(id === "manual" ? "" : id)}
                      required
                    />
                  </div>

                  {/* Cuenta Contable */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      Cuenta Contable *
                    </label>
                    <SearchableSelect
                      placeholder="Busca cuenta contable..."
                      items={expenseAccountItems}
                      selectedId={editAccountId}
                      onSelect={(id) => setEditAccountId(id === "manual" ? "" : id)}
                      required
                    />
                  </div>

                  {/* Centro de Costos */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      Centro de Costos
                    </label>
                    <SearchableSelect
                      placeholder="Busca centro de costos..."
                      items={costCenterItems}
                      selectedId={editCostCenterId || "none"}
                      onSelect={(id) => setEditCostCenterId(id === "none" || id === "manual" ? "" : id)}
                    />
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
                  <p className="font-bold text-sm text-emerald-600">${Math.max(0, invoice.paidAmount || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
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

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      Clasificación de Gasto *
                    </label>
                    <SearchableSelect
                      placeholder="Busca cuenta contable..."
                      items={expenseAccountItems}
                      selectedId={expenseAccountId || invoice.accountId || ""}
                      onSelect={(id) => setExpenseAccountId(id === "manual" ? "" : id)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      Sucursal *
                    </label>
                    <SearchableSelect
                      placeholder="Selecciona sucursal..."
                      items={locationItems}
                      selectedId={selectedLocationId}
                      onSelect={(id) => setSelectedLocationId(id === "manual" ? "" : id)}
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                      Centro de Costos
                    </label>
                    <SearchableSelect
                      placeholder="Busca centro de costos..."
                      items={costCenterItems}
                      selectedId={selectedCostCenterId || "none"}
                      onSelect={(id) => setSelectedCostCenterId(id === "none" || id === "manual" ? "" : id)}
                    />
                  </div>

                  <div className="space-y-1">
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

                  <div className="sm:col-span-2 md:col-span-4 flex justify-end pt-2">
                    <Button 
                      type="submit" 
                      disabled={saving} 
                      className="w-full sm:w-auto px-8 bg-rose-600 hover:bg-rose-700 text-white gap-2 h-10 font-bold text-xs shadow-sm animate-in fade-in"
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
