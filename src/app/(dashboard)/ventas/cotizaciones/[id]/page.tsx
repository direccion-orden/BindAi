"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, Truck, Upload, X } from "lucide-react";
import { FileText, Package, Trash2, Edit2, Save, Search, Loader2, XCircle, MessageSquare, ArrowLeft, Percent, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, collection, query, getDocs, where, setDoc, increment } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { generateQuoteImage } from "@/actions/generate-image";
import { calculateOrderTotals, EngineDiscount, EngineItem } from "@/lib/utils/discountEngine";
import { getNextSequence } from "@/lib/firebase/counters";


const CRM_STAGES = [
  { id: "nueva", name: "Nueva / Prospecto", color: "#94a3b8" },
  { id: "enviada", name: "Enviada al Cliente", color: "#3b82f6" },
  { id: "negociacion", name: "En Negociación", color: "#f59e0b" },
  { id: "ganada", name: "Ganada", color: "#10b981" },
  { id: "perdida", name: "Perdida", color: "#ef4444" },
  { id: "cancelada", name: "Cancelada", color: "#ef4444" },
];

export default function QuoteDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = React.use(paramsPromise);
  const { companyId, user } = useAuth();
  const router = useRouter();
  
  const [quote, setQuote] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  
  const [products, setProducts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [availableDiscounts, setAvailableDiscounts] = useState<EngineDiscount[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [conversionType, setConversionType] = useState<"order" | "remission" | "invoice" | null>(null);
  const [conversionData, setConversionData] = useState({
    date: "",
    locationId: "",
    warehouseId: "",
    projectId: "",
    notes: ""
  });

  const [registerPayment, setRegisterPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("Transferencia");
  const [paymentDate, setPaymentDate] = useState("");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [paymentVatRate, setPaymentVatRate] = useState(0.16);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [vatAccounts, setVatAccounts] = useState<any[]>([]);

  useEffect(() => {
    if (conversionType && quote) {
      setRegisterPayment(false);
      setPaymentAmount(quote.totalAmount || 0);
      setPaymentDate(getTodayLocalDateString());
      setPaymentMethod("Transferencia");
      setPaymentReference("");
      setSelectedBankAccountId("");
      setPaymentVatRate(0.16);
      setPaymentFile(null);
    }
  }, [conversionType, quote]);


  const getTodayLocalDateString = () => {
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return (new Date(d.getTime() - tzOffset)).toISOString().split("T")[0];
  };

  useEffect(() => {
    if (!companyId || !params.id) return;
    const fetchQuote = async () => {
      try {
        const docSnap = await getDoc(doc(db, "companies", companyId, "quotes", params.id));
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() };
          setQuote(data);
          setEditData(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingQuote(false);
      }
    };
    fetchQuote();
  }, [companyId, params.id]);

  // Load catalogs on mount when companyId is available
  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, "companies", companyId, "projects")).then(snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    getDocs(collection(db, "companies", companyId, "locations")).then(snap => {
      setLocations(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, name: data.name || data.Name || "Sucursal sin nombre" };
      }));
    });
    getDocs(collection(db, "companies", companyId, "warehouses")).then(snap => {
      setWarehouses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    getDocs(collection(db, "companies", companyId, "accounts")).then(snap => {
      const allAcc = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBankAccounts(allAcc.filter((a: any) => a.type === "ACTIVO" && a.level >= 2 && (a.name.toLowerCase().includes("banco") || a.name.toLowerCase().includes("caja"))));
      setVatAccounts(allAcc.filter((a: any) => a.code.startsWith("208") && a.level >= 2));
    });
  }, [companyId]);


  // Load products and discounts when editing
  useEffect(() => {
    if (isEditing && products.length === 0 && companyId) {
      getDocs(collection(db, "companies", companyId, "products")).then(snap => {
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      getDocs(query(collection(db, "companies", companyId, "discounts"), where("status", "==", "active"))).then(snap => {
        setAvailableDiscounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as EngineDiscount)));
      });
    }
  }, [isEditing, companyId, products.length]);

  if (loadingQuote) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!quote || !editData) {
    return <div className="p-10 text-center">Cotización no encontrada.</div>;
  }

  const handleSave = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const sanitizedItems = (editData.items || []).map((i: any) => ({
        ...i,
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
        discountPercentage: Number(i.discountPercentage) || 0
      }));

      const engineItems: EngineItem[] = sanitizedItems.map((i: any) => ({
        id: i.variantId || i.id,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        manualDiscountPercentage: i.discountPercentage || 0,
        categoryIds: i.categoryIds || []
      }));
      
      const calc = calculateOrderTotals(
        engineItems,
        availableDiscounts,
        editData.promoCode || null,
        editData.globalDiscountType || "none",
        editData.globalDiscountValue || 0
      );

      let imageUrl = editData.imageUrl;
      if (editData.imagePrompt !== quote.imagePrompt && editData.imagePrompt) {
        try {
          const resImg = await generateQuoteImage(editData.imagePrompt, companyId);
          if (resImg.startsWith("ERROR:")) {
            alert(resImg.replace("ERROR:", "").trim());
          } else {
            imageUrl = resImg;
          }
        } catch (err) {
          console.error("Image generation failed", err);
        }
      }


      let finalProjectId = editData.projectId;
      let finalProjectName = editData.projectId ? (projects.find(p => p.id === editData.projectId)?.name || null) : null;

      if (isCreatingProject) {
        if (!newProjectName) {
          alert("El nombre del proyecto es obligatorio.");
          setLoading(false);
          return;
        }
        finalProjectId = crypto.randomUUID();
        finalProjectName = newProjectName;

        const projectRef = doc(db, "companies", companyId, "projects", finalProjectId);
        await setDoc(projectRef, {
          id: finalProjectId,
          name: newProjectName,
          clientId: editData.clientId,
          createdAt: new Date().toISOString()
        });
      }

      let finalLocationName = editData.locationName || null;
      if (editData.locationId) {
        finalLocationName = locations.find(l => l.id === editData.locationId)?.name || editData.locationName || null;
      }

      let finalWarehouseName = editData.warehouseName || null;
      if (editData.warehouseId) {
        finalWarehouseName = warehouses.find(w => w.id === editData.warehouseId)?.name || editData.warehouseName || null;
      }

      const updatedQuote = {
        ...editData,
        items: sanitizedItems,
        projectId: finalProjectId || null,
        projectName: finalProjectName,
        locationName: finalLocationName,
        warehouseName: finalWarehouseName,
        subtotal: calc.subtotal,
        totalDiscount: calc.totalDiscount,
        globalDiscountType: editData.globalDiscountType || "none",
        globalDiscountValue: editData.globalDiscountValue || 0,
        globalDiscountAmount: calc.globalDiscountTotal,
        tax: calc.tax,
        totalAmount: calc.total,
        imageUrl
      };

      await updateDoc(doc(db, "companies", companyId, "quotes", quote.id), updatedQuote);
      setQuote(updatedQuote);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      alert("Error al actualizar la cotización");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelQuote = async () => {
    if (!companyId) return;
    if (!window.confirm("¿Estás seguro de cancelar esta cotización?")) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, "companies", companyId, "quotes", quote.id), {
        status: "cancelada"
      });
      router.push("/ventas/cotizaciones");
    } catch (e) {
      console.error(e);
      alert("Error al cancelar la cotización.");
    } finally {
      setLoading(false);
    }
  };

  const processImmediatePayment = async (
    docId: string,
    docNumber: string,
    docType: "pedido" | "remision" | "factura",
    targetAccountId: string,
    targetAccountCode: string,
    targetAccountName: string
  ) => {
    if (!registerPayment) return;
    if (paymentAmount <= 0) return;
    if (!selectedBankAccountId) {
      throw new Error("Debes seleccionar una Cuenta de Banco para el pago.");
    }

    // 1. Subir archivo de evidencia si existe
    let evidenceUrl = "";
    if (paymentFile) {
      const storageRef = ref(storage, `companies/${companyId}/payment_evidence/${Date.now()}_${paymentFile.name}`);
      const uploadResult = await uploadBytes(storageRef, paymentFile);
      evidenceUrl = await getDownloadURL(uploadResult.ref);
    }

    // 2. Crear documento de pago
    const paymentId = doc(collection(db, "companies", companyId!, "payments")).id;
    const selectedLoc = locations.find(l => l.id === conversionData.locationId);

    const paymentData: any = {
      id: paymentId,
      amount: Number(paymentAmount),
      date: paymentDate,
      method: paymentMethod,
      reference: paymentReference,
      documentId: docId,
      documentType: docType,
      documentNumber: docNumber,
      clientId: quote.clientId || "",
      clientName: quote.clientName || "",
      locationId: conversionData.locationId || null,
      locationName: selectedLoc ? selectedLoc.name : "",
      bankAccountId: selectedBankAccountId,
      evidenceUrl,
      createdAt: new Date().toISOString()
    };

    if (docType === "pedido") {
      paymentData.orderId = docId;
    }

    await setDoc(doc(db, "companies", companyId!, "payments", paymentId), paymentData);

    // 3. Crear Asiento de Diario (Póliza de Ingreso) si hay cuenta destino
    if (targetAccountId) {
      const bankAccount = bankAccounts.find(a => a.id === selectedBankAccountId);
      
      let subtotalAmount = Number(paymentAmount);
      let vatAmount = 0;
      let vatAccount = null;

      if (paymentVatRate > 0) {
        subtotalAmount = Number(paymentAmount) / (1 + paymentVatRate);
        vatAmount = Number(paymentAmount) - subtotalAmount;
        vatAccount = vatAccounts[0];
      }

      const entries = [
        {
          accountId: selectedBankAccountId,
          accountCode: bankAccount?.code || "",
          accountName: bankAccount?.name || "",
          debit: Number(paymentAmount),
          credit: 0
        },
        {
          accountId: targetAccountId,
          accountCode: targetAccountCode,
          accountName: targetAccountName,
          debit: 0,
          credit: subtotalAmount
        }
      ];

      if (vatAmount > 0 && vatAccount) {
        entries.push({
          accountId: vatAccount.id,
          accountCode: vatAccount.code,
          accountName: vatAccount.name,
          debit: 0,
          credit: vatAmount
        });
      }

      await setDoc(doc(collection(db, "companies", companyId!, "journal_entries")), {
        type: "ingreso",
        date: paymentDate,
        description: `Cobro de ${docType} ${docNumber}`,
        referenceId: paymentId,
        referenceType: "payment",
        createdAt: new Date().toISOString(),
        status: "activa",
        entries
      });

      // Actualizar balances
      await updateDoc(doc(db, "companies", companyId!, "accounts", selectedBankAccountId), {
        balance: increment(Number(paymentAmount))
      });
      await updateDoc(doc(db, "companies", companyId!, "accounts", targetAccountId), {
        balance: increment(subtotalAmount)
      });
      if (vatAmount > 0 && vatAccount) {
        await updateDoc(doc(db, "companies", companyId!, "accounts", vatAccount.id), {
          balance: increment(vatAmount)
        });
      }
    }
  };

  const handleConfirmConvertToOrder = async () => {
    if (!companyId || !quote) return;
    setLoading(true);
    try {
      const orderId = doc(collection(db, "companies", companyId, "pedidos")).id;
      const orderNumber = await getNextSequence(companyId, "pedidos");
      
      const now = new Date();
      const dateParts = conversionData.date.split("-");
      const finalCreatedAt = new Date(
        Number(dateParts[0]),
        Number(dateParts[1]) - 1,
        Number(dateParts[2]),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
      ).toISOString();

      const selectedLoc = locations.find(l => l.id === conversionData.locationId);
      const selectedWh = warehouses.find(w => w.id === conversionData.warehouseId);
      const selectedProj = projects.find(p => p.id === conversionData.projectId);

      // Fetch default 401.1 account details for payment
      const accountsSnap = await getDocs(query(collection(db, "companies", companyId, "accounts"), where("code", "==", "401.1")));
      let finalAccountId = "";
      let finalAccountCode = "401.1";
      let finalAccountName = "Ventas Nacionales";
      if (!accountsSnap.empty) {
        const accDoc = accountsSnap.docs[0];
        finalAccountId = accDoc.id;
        finalAccountCode = accDoc.data().code || "401.1";
        finalAccountName = accDoc.data().name || "Ventas Nacionales";
      }

      if (registerPayment) {
        await processImmediatePayment(orderId, orderNumber.toString(), "pedido", finalAccountId, finalAccountCode, finalAccountName);
      }

      const pAmount = registerPayment ? Number(paymentAmount) : 0;
      const newOrder = {
        id: orderId,
        orderNumber,
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        clientId: quote.clientId || null,
        clientName: quote.clientName,
        items: quote.items || [],
        subtotal: quote.subtotal || 0,
        totalDiscount: quote.totalDiscount || 0,
        globalDiscountType: quote.globalDiscountType || "none",
        globalDiscountValue: quote.globalDiscountValue || 0,
        globalDiscountAmount: quote.globalDiscountAmount || 0,
        promoCode: quote.promoCode || null,
        tax: quote.tax || 0,
        totalAmount: quote.totalAmount,
        projectId: conversionData.projectId || null,
        projectName: selectedProj ? selectedProj.name : null,
        locationId: conversionData.locationId || null,
        locationName: selectedLoc ? selectedLoc.name : "",
        warehouseId: conversionData.warehouseId || null,
        warehouseName: selectedWh ? (selectedWh.name || selectedWh.Name || "") : "",
        status: (registerPayment && pAmount >= (quote.totalAmount || 0) - 0.01) ? "pagado" : "por_surtir",
        paidAmount: pAmount,
        notes: conversionData.notes || "",
        createdAt: finalCreatedAt,
        createdBy: user?.email || "Unknown",
      };

      await setDoc(doc(db, "companies", companyId, "pedidos", orderId), newOrder);

      await updateDoc(doc(db, "companies", companyId, "quotes", quote.id), {
        status: "ganada",
        orderId: orderId
      });

      setConversionType(null);
      alert(`Pedido ${orderNumber} creado exitosamente.`);
      router.push("/ventas/pedidos");
    } catch (error: any) {
      console.error("Error creating order:", error);
      alert("Hubo un error al generar el pedido: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmConvertToRemission = async () => {
    if (!companyId || !quote) return;
    setLoading(true);
    try {
      const remId = doc(collection(db, "companies", companyId, "remisiones")).id;
      const remNumber = await getNextSequence(companyId, "remisiones");
      
      const now = new Date();
      const dateParts = conversionData.date.split("-");
      const finalCreatedAt = new Date(
        Number(dateParts[0]),
        Number(dateParts[1]) - 1,
        Number(dateParts[2]),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
      ).toISOString();

      const selectedLoc = locations.find(l => l.id === conversionData.locationId);
      const selectedWh = warehouses.find(w => w.id === conversionData.warehouseId);
      const selectedProj = projects.find(p => p.id === conversionData.projectId);

      // Fetch default 401.1 account details
      const accountsSnap = await getDocs(query(collection(db, "companies", companyId, "accounts"), where("code", "==", "401.1")));
      let finalAccountId = "";
      let finalAccountCode = "401.1";
      let finalAccountName = "Ventas Nacionales";
      if (!accountsSnap.empty) {
        const accDoc = accountsSnap.docs[0];
        finalAccountId = accDoc.id;
        finalAccountCode = accDoc.data().code || "401.1";
        finalAccountName = accDoc.data().name || "Ventas Nacionales";
      } else {
        const allAccountsSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
        const targetAcc = allAccountsSnap.docs.find(d => d.data().code === "401.1");
        if (targetAcc) {
          finalAccountId = targetAcc.id;
          finalAccountCode = targetAcc.data().code || "401.1";
          finalAccountName = targetAcc.data().name || "Ventas Nacionales";
        }
      }

      if (registerPayment) {
        await processImmediatePayment(remId, remNumber.toString(), "remision", finalAccountId, finalAccountCode, finalAccountName);
      }

      const pAmount = registerPayment ? Number(paymentAmount) : 0;
      const newRemission = {
        id: remId,
        remissionNumber: remNumber,
        orderId: null,
        orderNumber: null,
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        clientId: quote.clientId || null,
        clientName: quote.clientName,
        items: (quote.items || []).map((i: any) => ({
          ...i,
          unitPrice: Number(i.unitPrice) || 0
        })),
        subtotal: quote.subtotal || 0,
        totalDiscount: quote.totalDiscount || 0,
        promoCode: quote.promoCode || null,
        globalDiscountType: quote.globalDiscountType || "none",
        globalDiscountValue: quote.globalDiscountValue || 0,
        globalDiscountAmount: quote.globalDiscountAmount || 0,
        tax: quote.tax || 0,
        totalAmount: quote.totalAmount,
        projectId: conversionData.projectId || null,
        projectName: selectedProj ? selectedProj.name : null,
        locationId: conversionData.locationId || null,
        locationName: selectedLoc ? selectedLoc.name : "",
        warehouseId: conversionData.warehouseId || null,
        warehouseName: selectedWh ? (selectedWh.name || selectedWh.Name || "") : "",
        accountId: finalAccountId,
        accountCode: finalAccountCode,
        accountName: finalAccountName,
        status: (registerPayment && pAmount >= (quote.totalAmount || 0) - 0.01) ? "pagada" : "activa",
        paidAmount: pAmount,
        notes: conversionData.notes || "",
        createdAt: finalCreatedAt,
        createdBy: user?.email || "Unknown"
      };

      await setDoc(doc(db, "companies", companyId, "remisiones", remId), newRemission);

      // Inventory Deduction Logic
      for (const item of (quote.items || [])) {
        if (item.isService || item.sku?.startsWith("SER-")) continue;

        const productRef = doc(db, "companies", companyId, "products", item.productId);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          const updatedVariants = productData.variants?.map((v: any) => {
            if (v.id === (item.variantId || item.id)) {
              return { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) };
            }
            return v;
          });
          
          await updateDoc(productRef, { variants: updatedVariants });
          
          // Generate Inventory Movement record
          const movId = doc(collection(db, "companies", companyId, "inventory_movements")).id;
          await setDoc(doc(db, "companies", companyId, "inventory_movements", movId), {
            id: movId,
            productId: item.productId,
            variantId: item.variantId || item.id || "",
            type: "OUT",
            quantity: item.quantity,
            reason: `Remisión desde Cotización ${remNumber}`,
            referenceId: remId,
            createdAt: finalCreatedAt
          });
        }
      }

      await updateDoc(doc(db, "companies", companyId, "quotes", quote.id), {
        status: "ganada",
        remissionId: remId
      });

      setConversionType(null);
      alert(`Remisión ${remNumber} generada exitosamente. Inventario descontado.`);
      router.push("/ventas/remisiones");
    } catch (error: any) {
      console.error("Error creating remission:", error);
      alert("Hubo un error al generar la remisión: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmConvertToInvoice = async () => {
    if (!companyId || !quote) return;
    setLoading(true);
    try {
      const invId = doc(collection(db, "companies", companyId, "facturas")).id;
      const invNumber = await getNextSequence(companyId, "facturas");
      
      const now = new Date();
      const dateParts = conversionData.date.split("-");
      const finalCreatedAt = new Date(
        Number(dateParts[0]),
        Number(dateParts[1]) - 1,
        Number(dateParts[2]),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
      ).toISOString();

      const selectedLoc = locations.find(l => l.id === conversionData.locationId);
      const selectedWh = warehouses.find(w => w.id === conversionData.warehouseId);
      const selectedProj = projects.find(p => p.id === conversionData.projectId);

      // Fetch default 401.1 account details
      const accountsSnap = await getDocs(query(collection(db, "companies", companyId, "accounts"), where("code", "==", "401.1")));
      let finalAccountId = "";
      let finalAccountCode = "401.1";
      let finalAccountName = "Ventas Nacionales";
      if (!accountsSnap.empty) {
        const accDoc = accountsSnap.docs[0];
        finalAccountId = accDoc.id;
        finalAccountCode = accDoc.data().code || "401.1";
        finalAccountName = accDoc.data().name || "Ventas Nacionales";
      } else {
        const allAccountsSnap = await getDocs(collection(db, "companies", companyId, "accounts"));
        const targetAcc = allAccountsSnap.docs.find(d => d.data().code === "401.1");
        if (targetAcc) {
          finalAccountId = targetAcc.id;
          finalAccountCode = targetAcc.data().code || "401.1";
          finalAccountName = targetAcc.data().name || "Ventas Nacionales";
        }
      }

      // Fetch client details for receiver info
      let clientData: any = null;
      if (quote.clientId) {
        const clientSnap = await getDoc(doc(db, "companies", companyId, "clients", quote.clientId));
        if (clientSnap.exists()) {
          clientData = clientSnap.data();
        }
      }

      const receiverName = clientData?.razonSocial || quote.clientName || "PUBLICO EN GENERAL";
      const receiverRfc = clientData?.rfc || clientData?.RFC || "XAXX010101000";
      const receiverCfdiUse = (clientData?.taxRegime === "616" || !clientData) ? "S01" : (clientData?.cfdiUse || "G03");
      const receiverZipCode = (receiverRfc === "XAXX010101000" || !clientData) ? "64753" : (clientData?.zipCode || "00000");
      const receiverTaxRegime = clientData?.taxRegime || "616";

      const cfdiPayload = {
        Receiver: {
          Name: receiverName.toUpperCase(),
          CfdiUse: receiverCfdiUse,
          Rfc: receiverRfc.toUpperCase(),
          TaxZipCode: receiverZipCode,
          FiscalRegime: receiverTaxRegime
        },
        CfdiType: "I",
        Exportation: "01",
        PaymentForm: "01",
        PaymentMethod: "PUE",
        Currency: "MXN",
        Date: getTodayLocalDateString(),
        ExpeditionPlace: "64753",
        Items: (quote.items || []).map((item: any) => {
          const round2 = (val: number) => Math.round((val + Number.EPSILON) * 100) / 100;
          const unitPriceRounded = round2(item.unitPrice || 0);
          const subtotalVal = round2(item.quantity * unitPriceRounded);
          const discountVal = round2((item.discountPercentage || 0) * 0.01 * subtotalVal);
          const baseVal = round2(subtotalVal - discountVal);
          const taxTotalVal = round2(baseVal * 0.16);
          const totalVal = round2(baseVal + taxTotalVal);
          
          return {
            ProductCode: item.satProductCode || "01010101",
            IdentificationNumber: item.variantId || "SKU",
            Description: item.isService && item.description ? item.description : item.productName,
            Unit: item.satUnitName || "PIEZA",
            UnitCode: item.satUnitCode || "H87",
            UnitPrice: unitPriceRounded,
            Quantity: item.quantity,
            Subtotal: subtotalVal,
            Discount: discountVal,
            TaxObject: "02",
            Taxes: [
              {
                Total: taxTotalVal,
                Name: "IVA",
                Base: baseVal,
                Rate: 0.16,
                IsRetention: false
              }
            ],
            Total: totalVal
          };
        })
      };

      if (receiverRfc === "XAXX010101000" && receiverName.toUpperCase() === "PUBLICO EN GENERAL") {
        (cfdiPayload as any).GlobalInformation = {
          Periodicity: "01",
          Months: new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`,
          Year: new Date().getFullYear()
        };
      }

      if (registerPayment) {
        await processImmediatePayment(invId, invNumber.toString(), "factura", finalAccountId, finalAccountCode, finalAccountName);
      }

      const pAmount = registerPayment ? Number(paymentAmount) : 0;
      const newInvoice = {
        id: invId,
        invoiceNumber: invNumber,
        orderId: null,
        orderNumber: null,
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        clientId: quote.clientId || null,
        clientName: quote.clientName,
        items: (quote.items || []).map((i: any) => ({
          ...i,
          unitPrice: Number(i.unitPrice) || 0
        })),
        subtotal: quote.subtotal || 0,
        totalDiscount: quote.totalDiscount || 0,
        promoCode: quote.promoCode || null,
        globalDiscountType: quote.globalDiscountType || "none",
        globalDiscountValue: quote.globalDiscountValue || 0,
        globalDiscountAmount: quote.globalDiscountAmount || 0,
        tax: quote.tax || 0,
        totalAmount: quote.totalAmount,
        projectId: conversionData.projectId || null,
        projectName: selectedProj ? selectedProj.name : null,
        locationId: conversionData.locationId || null,
        locationName: selectedLoc ? selectedLoc.name : "",
        warehouseId: conversionData.warehouseId || null,
        warehouseName: selectedWh ? (selectedWh.name || selectedWh.Name || "") : "",
        accountId: finalAccountId,
        accountCode: finalAccountCode,
        accountName: finalAccountName,
        status: "por_timbrar",
        cfdiPayload,
        paidAmount: pAmount,
        notes: conversionData.notes || "",
        createdAt: finalCreatedAt,
        createdBy: user?.email || "Unknown"
      };

      await setDoc(doc(db, "companies", companyId, "facturas", invId), newInvoice);

      // Inventory Deduction Logic
      for (const item of (quote.items || [])) {
        if (item.isService || item.sku?.startsWith("SER-")) continue;

        const productRef = doc(db, "companies", companyId, "products", item.productId);
        const productDoc = await getDoc(productRef);
        if (productDoc.exists()) {
          const productData = productDoc.data();
          const updatedVariants = productData.variants?.map((v: any) => {
            if (v.id === (item.variantId || item.id)) {
              return { ...v, stock: Math.max(0, (v.stock || 0) - item.quantity) };
            }
            return v;
          });
          
          await updateDoc(productRef, { variants: updatedVariants });
          
          // Generate Inventory Movement record
          const movId = doc(collection(db, "companies", companyId, "inventory_movements")).id;
          await setDoc(doc(db, "companies", companyId, "inventory_movements", movId), {
            id: movId,
            productId: item.productId,
            variantId: item.variantId || item.id || "",
            type: "OUT",
            quantity: item.quantity,
            reason: `Factura desde Cotización ${invNumber}`,
            referenceId: invId,
            createdAt: finalCreatedAt
          });
        }
      }

      await updateDoc(doc(db, "companies", companyId, "quotes", quote.id), {
        status: "ganada",
        invoiceId: invId
      });

      setConversionType(null);
      alert(`Factura FAC-${invNumber} generada exitosamente. Inventario descontado.`);
      router.push("/ventas/facturas");
    } catch (error: any) {
      console.error("Error creating invoice:", error);
      alert("Hubo un error al generar la factura: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (lineKeyOrVariantId: string, field: string, value: any) => {
    setEditData((prev: any) => ({
      ...prev,
      items: prev.items.map((item: any) => {
        const matchKey = item.lineKey || item.variantId;
        return matchKey === lineKeyOrVariantId ? { ...item, [field]: value } : item;
      })
    }));
  };

  const removeItem = (lineKeyOrVariantId: string) => {
    setEditData((prev: any) => ({
      ...prev,
      items: prev.items.filter((item: any) => (item.lineKey || item.variantId) !== lineKeyOrVariantId)
    }));
  };

  const handleAddProduct = (product: any, variant: any) => {
    const isService = !!product.isService || variant.sku?.startsWith("SER-");
    
    if (isService) {
      const lineKey = crypto.randomUUID();
      setEditData((prev: any) => ({
        ...prev,
        items: [...(prev.items || []), {
          lineKey,
          productId: product.id,
          variantId: variant.id,
          productName: product.title,
          variantTitle: variant.title !== "Default Title" ? variant.title : "",
          sku: variant.sku || "",
          quantity: 1,
          unitPrice: variant.price || 0,
          discountPercentage: 0,
          imageUrl: product.images?.[0]?.src || "",
          isService: true,
          description: product.bodyHtml || product.title || "",
          comment: "",
          showComment: false
        }]
      }));
    } else {
      const exists = editData.items?.find((i: any) => i.variantId === variant.id);
      if (!exists) {
        setEditData((prev: any) => ({
          ...prev,
          items: [...(prev.items || []), {
            productId: product.id,
            variantId: variant.id,
            productName: product.title,
            variantTitle: variant.title !== "Default Title" ? variant.title : "",
            sku: variant.sku || "",
            quantity: 1,
            unitPrice: variant.price || 0,
            discountPercentage: 0,
            imageUrl: product.images?.[0]?.src || "",
            isService: false,
            description: "",
            comment: "",
            showComment: false
          }]
        }));
      } else {
        setEditData((prev: any) => ({
          ...prev,
          items: prev.items.map((item: any) => item.variantId === variant.id ? { ...item, quantity: item.quantity + 1 } : item)
        }));
      }
    }
    setProductSearch("");
  };

  const getFilteredProducts = () => {
    if (!productSearch) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p => 
      p.title.toLowerCase().includes(term) || 
      p.variants?.some((v:any) => v.sku.toLowerCase().includes(term) || v.barcode?.includes(term))
    );
  };

  const handleGlobalDiscountTypeChange = (val: string) => {
    setEditData((prev: any) => ({
      ...prev,
      globalDiscountType: val,
      globalDiscountValue: 0
    }));
  };

  const handleGlobalDiscountValueChange = (val: number) => {
    setEditData((prev: any) => ({
      ...prev,
      globalDiscountValue: val
    }));
  };

  const engineItems: EngineItem[] = (editData.items || []).map((i: any) => ({
    id: i.variantId || i.id,
    quantity: Number(i.quantity) || 0,
    unitPrice: Number(i.unitPrice) || 0,
    manualDiscountPercentage: Number(i.discountPercentage) || 0,
    categoryIds: i.categoryIds || []
  }));

  const calcTotals = calculateOrderTotals(
    engineItems,
    availableDiscounts,
    editData.promoCode || null,
    editData.globalDiscountType || "none",
    editData.globalDiscountValue || 0
  );

  const displaySubtotal = isEditing ? calcTotals.subtotal : (editData.subtotal || calcTotals.subtotal);
  const displayDiscount = isEditing ? calcTotals.totalDiscount : (editData.totalDiscount || calcTotals.totalDiscount);
  const displayTax = isEditing ? calcTotals.tax : (editData.tax !== undefined ? editData.tax : calcTotals.tax);
  const displayTotal = isEditing ? calcTotals.total : (editData.totalAmount !== undefined ? editData.totalAmount : calcTotals.total);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div className="flex items-center gap-4">
          <Link href="/ventas/cotizaciones">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-3xl font-extrabold tracking-tight whitespace-nowrap">
              {isEditing ? "Editar Cotización" : "Detalles de Cotización"}
            </h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 block w-max mt-1">{quote.quoteNumber}</span>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2 shrink-0">
          {isEditing ? (
            <>
              <Button 
                variant="default" 
                className="gap-2 h-9 px-3 text-xs"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Cambios
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => { setIsEditing(false); setEditData({...quote}); }} 
                className="text-slate-500 h-9 px-3 text-xs"
              >
                Cancelar
              </Button>
            </>
          ) : (
            <div className="relative">
              <Button 
                onClick={() => setShowDropdown(!showDropdown)}
                className="gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold h-9 px-3 text-xs shadow-sm"
              >
                Acciones <ChevronDown className="w-4 h-4" />
              </Button>
              
              {showDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowDropdown(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 divide-y divide-slate-100 focus:outline-none">
                    <div className="py-1">
                      {quote.status !== 'cancelada' && (
                        <button
                          onClick={() => {
                            setShowDropdown(false);
                            setIsEditing(true);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 text-left font-medium"
                          disabled={loading}
                        >
                          <Edit2 className="w-4 h-4 text-slate-500" />
                          Editar Cotización
                        </button>
                      )}
                      
                      <Link 
                        href={`/pdf/cotizacion/${quote.id}`} 
                        target="_blank"
                        onClick={() => setShowDropdown(false)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-xs text-indigo-700 hover:bg-indigo-50 font-medium"
                      >
                        <FileText className="w-4 h-4 text-indigo-500" />
                        Ver PDF
                      </Link>

                      {quote.status !== 'cancelada' && quote.status !== 'ganada' && (
                        <>
                          <button
                            onClick={() => {
                              setShowDropdown(false);
                              setConversionType("order");
                              setConversionData({
                                date: getTodayLocalDateString(),
                                locationId: quote.locationId || "",
                                warehouseId: quote.warehouseId || "",
                                projectId: quote.projectId || "",
                                notes: quote.notes || ""
                              });
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-blue-700 hover:bg-blue-50 text-left font-medium"
                            disabled={loading}
                          >
                            <Package className="w-4 h-4 text-blue-500" />
                            Convertir a Pedido
                          </button>
                          <button
                            onClick={() => {
                              setShowDropdown(false);
                              setConversionType("remission");
                              setConversionData({
                                date: getTodayLocalDateString(),
                                locationId: quote.locationId || "",
                                warehouseId: quote.warehouseId || "",
                                projectId: quote.projectId || "",
                                notes: quote.notes || ""
                              });
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-emerald-700 hover:bg-emerald-50 text-left font-medium"
                            disabled={loading}
                          >
                            <Truck className="w-4 h-4 text-emerald-500" />
                            Convertir a Remisión
                          </button>
                          <button
                            onClick={() => {
                              setShowDropdown(false);
                              setConversionType("invoice");
                              setConversionData({
                                date: getTodayLocalDateString(),
                                locationId: quote.locationId || "",
                                warehouseId: quote.warehouseId || "",
                                projectId: quote.projectId || "",
                                notes: quote.notes || ""
                              });
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-violet-700 hover:bg-violet-50 text-left font-medium"
                            disabled={loading}
                          >
                            <FileText className="w-4 h-4 text-violet-500" />
                            Convertir a Factura
                          </button>
                        </>
                      )}

                      {quote.orderId && (
                        <Link 
                          href={`/ventas/pedidos/${quote.orderId}`}
                          onClick={() => setShowDropdown(false)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-xs text-blue-700 hover:bg-blue-50 font-medium"
                        >
                          <FileText className="w-4 h-4 text-blue-500" />
                          Ver Pedido Relacionado
                        </Link>
                      )}

                      {quote.remissionId && (
                        <Link 
                          href={`/ventas/remisiones/${quote.remissionId}`}
                          onClick={() => setShowDropdown(false)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-xs text-emerald-700 hover:bg-emerald-50 font-medium"
                        >
                          <Truck className="w-4 h-4 text-emerald-500" />
                          Ver Remisión Relacionada
                        </Link>
                      )}

                      {quote.invoiceId && (
                        <Link 
                          href={`/ventas/facturas/${quote.invoiceId}`}
                          onClick={() => setShowDropdown(false)}
                          className="flex w-full items-center gap-2 px-4 py-2 text-xs text-violet-700 hover:bg-violet-50 font-medium"
                        >
                          <FileText className="w-4 h-4 text-violet-500" />
                          Ver Factura Relacionada
                        </Link>
                      )}


                      {quote.status !== 'cancelada' && quote.status !== 'ganada' && (
                        <button
                          onClick={() => {
                            setShowDropdown(false);
                            handleCancelQuote();
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-xs text-red-600 hover:bg-red-50 text-left font-medium"
                          disabled={loading}
                        >
                          <XCircle className="w-4 h-4 text-red-500" />
                          Cancelar Cotización
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase h-5 flex items-center">Cliente</p>
            {isEditing ? (
              <div className="mt-1 flex h-8 items-center text-xs font-bold text-slate-900">{editData.clientName}</div>
            ) : (
              <p className="font-bold text-slate-900 mt-1">{editData.clientName}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase h-5 flex items-center">Sucursal</p>
            {isEditing ? (
              <select 
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm font-semibold"
                value={editData.locationId || ""}
                onChange={e => setEditData({...editData, locationId: e.target.value})}
              >
                <option value="">Seleccionar Sucursal</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            ) : (
              <p className="font-bold text-slate-900 mt-1">{editData.locationName || "N/A"}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase h-5 flex items-center">Almacén</p>
            {isEditing ? (
              <select 
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm font-semibold"
                value={editData.warehouseId || ""}
                onChange={e => setEditData({...editData, warehouseId: e.target.value})}
              >
                <option value="">Seleccionar Almacén</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            ) : (
              <p className="font-bold text-slate-900 mt-1">{editData.warehouseName || "N/A"}</p>
            )}
          </div>
          <div>
            <div className="flex justify-between items-center h-5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Proyecto</p>
              {isEditing && editData.clientId && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-1 text-[10px] text-blue-600 font-semibold hover:bg-blue-50"
                  onClick={() => setIsCreatingProject(true)}
                >
                  + Crear Proyecto
                </Button>
              )}
            </div>
            {isEditing ? (
              isCreatingProject ? (
                <div className="space-y-2 bg-blue-50/30 p-2.5 rounded-lg border border-blue-100 mt-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-blue-900 uppercase">Nuevo Proyecto</label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-4 px-1 text-[9px] text-blue-600 font-semibold hover:bg-blue-50"
                      onClick={() => {
                        setIsCreatingProject(false);
                        setNewProjectName("");
                      }}
                    >
                      Buscar Existente
                    </Button>
                  </div>
                  <Input 
                    placeholder="Nombre del Proyecto *" 
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="bg-white border-blue-200 h-8 text-xs font-semibold"
                  />
                </div>
              ) : (
                <select 
                  className="mt-1 flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm font-semibold"
                  value={editData.projectId || ""}
                  onChange={e => setEditData({...editData, projectId: e.target.value})}
                >
                  <option value="">Ninguno</option>
                  {projects.filter(p => p.clientId === editData.clientId).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )
            ) : (
              <p className="font-bold text-slate-900 mt-1">{editData.projectName || "Ninguno"}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase h-5 flex items-center">Estatus</p>
            {isEditing ? (
              <select 
                className="mt-1 flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs shadow-sm font-semibold"
                value={editData.status || ""}
                onChange={e => setEditData({...editData, status: e.target.value})}
              >
                {CRM_STAGES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <p className="font-bold text-slate-950 mt-1">
                {CRM_STAGES.find(s => s.id === editData.status)?.name || editData.status}
              </p>
            )}
          </div>
        </div>

        {(editData.imageUrl || isEditing) && (
          <div className="rounded-lg overflow-hidden border shadow-sm relative bg-slate-100">
            {editData.imageUrl && !isEditing && (
              <div className="h-48 relative">
                <img src={editData.imageUrl} alt="Concepto" className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 text-xs rounded font-medium shadow">
                  IA: {editData.imagePrompt}
                </div>
              </div>
            )}
            {isEditing && (
              <div className="p-4 bg-indigo-50/50 space-y-2">
                <label className="text-xs font-semibold text-indigo-900 flex items-center gap-1">✨ Concepto Imagen IA</label>
                <Input 
                  value={editData.imagePrompt || ""}
                  onChange={e => setEditData({...editData, imagePrompt: e.target.value})}
                  placeholder="Ej. Cocina minimalista..."
                  className="bg-white"
                />
                <p className="text-[10px] text-indigo-700/70">Al guardar, la IA regenerará la imagen automáticamente.</p>
              </div>
            )}
          </div>
        )}

        <div>
          <h4 className="font-semibold text-sm border-b pb-2 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" /> Partidas Cotizadas
          </h4>
          
          <div className="space-y-3">
            {editData.items?.map((item: any, idx: number) => (
              <div key={item.lineKey || (item.variantId ? `${item.variantId}-${idx}` : idx)} className="flex flex-col bg-white border p-3 rounded-lg text-sm shadow-sm gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 flex items-start gap-3">
                    <div className="w-12 h-12 rounded bg-slate-100 flex-shrink-0 overflow-hidden border">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 m-auto mt-3 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      {isEditing ? (
                        item.isService ? (
                          <div className="space-y-1 w-full">
                            {item.sku && (
                              <div>
                                <span className="inline-block font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                  {item.sku}
                                </span>
                              </div>
                            )}
                            <textarea
                              value={item.description || ""}
                              onChange={(e) => updateItem(item.lineKey || item.variantId, 'description', e.target.value)}
                              placeholder="Descripción del servicio..."
                              className="w-full text-xs font-semibold border rounded p-1.5 bg-background resize-y"
                              rows={2}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold">{item.productName}</p>
                              {item.sku && (
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                  {item.sku}
                                </span>
                              )}
                            </div>
                            {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                          </>
                        )
                      ) : (
                        item.isService ? (
                          <div className="space-y-1">
                            {item.sku && (
                              <div>
                                <span className="inline-block font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                  {item.sku}
                                </span>
                              </div>
                            )}
                            <p className="font-semibold text-sm leading-tight text-foreground/90 whitespace-pre-wrap">{item.description}</p>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold">{item.productName}</p>
                              {item.sku && (
                                <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 text-[10px] uppercase font-bold">
                                  {item.sku}
                                </span>
                              )}
                            </div>
                            {item.variantTitle && <p className="text-xs text-muted-foreground">{item.variantTitle}</p>}
                          </>
                        )
                      )}

                      {!isEditing && item.comment && (
                        <p className="text-xs text-indigo-600 font-medium flex items-start gap-1 mt-1 bg-indigo-50/50 p-1.5 rounded border border-indigo-100/50 whitespace-pre-wrap">
                          <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{item.comment}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-3 justify-end">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Cant.</label>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.lineKey || item.variantId, 'quantity', parseInt(e.target.value)||1)} className="w-16 h-8 text-center" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Precio U.</label>
                        <Input 
                          type="number" 
                          step={0.01} 
                          value={item.unitPrice === 0 ? "" : item.unitPrice} 
                          onFocus={() => {
                            if (item.unitPrice === 0 || item.unitPrice === "0") {
                              updateItem(item.lineKey || item.variantId, 'unitPrice', "");
                            }
                          }}
                          onBlur={() => {
                            if (item.unitPrice === "") {
                              updateItem(item.lineKey || item.variantId, 'unitPrice', 0);
                            }
                          }}
                          onChange={(e) => updateItem(item.lineKey || item.variantId, 'unitPrice', e.target.value)} 
                          className="w-24 h-8 text-right" 
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-emerald-600 font-bold uppercase">Desc %</label>
                        <Input type="number" min={0} max={100} value={item.discountPercentage} onChange={(e) => updateItem(item.lineKey || item.variantId, 'discountPercentage', parseFloat(e.target.value)||0)} className="w-16 h-8 text-center text-emerald-600" />
                      </div>
                      <div className="flex flex-col gap-1 text-right min-w-[90px]">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Subtotal</label>
                        <span className="h-8 flex items-center justify-end font-bold text-slate-900 pr-1">
                          ${(item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-4">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className={`h-8 w-8 ${item.comment || item.showComment ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700' : 'text-muted-foreground hover:text-indigo-600'}`}
                          onClick={() => updateItem(item.lineKey || item.variantId, 'showComment', !item.showComment)}
                          title="Agregar nota/comentario"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(item.lineKey || item.variantId)} className="h-8 w-8 text-red-500"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-right flex items-center gap-6">
                      <div className="text-slate-500 text-xs">
                        <span className="font-semibold text-slate-700">{item.quantity}</span> x ${item.unitPrice.toLocaleString('es-MX', {minimumFractionDigits:2})}
                        {item.discountPercentage > 0 && (
                          <span className="text-emerald-600 font-medium ml-1.5">(-{item.discountPercentage}%)</span>
                        )}
                      </div>
                      <div className="font-bold text-slate-950 min-w-[100px] text-base">
                        ${(item.quantity * item.unitPrice * (1 - item.discountPercentage / 100)).toLocaleString('es-MX', {minimumFractionDigits:2})}
                      </div>
                    </div>
                  )}
                </div>
                {isEditing && (item.showComment || item.comment) && (
                  <div className="pt-2 border-t border-slate-100">
                    <Input
                      placeholder="Escribe una nota o comentario sobre esta partida..."
                      value={item.comment || ""}
                      onChange={(e) => updateItem(item.lineKey || item.variantId, 'comment', e.target.value)}
                      className="text-xs bg-slate-50/50 border-slate-200 h-8"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {isEditing && (
            <div className="mt-4 p-4 border rounded-lg bg-slate-50 relative">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar producto para agregar..." 
                  className="pl-9 bg-white"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
              {productSearch && (
                <div className="absolute top-full left-0 right-0 mt-1 border rounded-md max-h-48 overflow-y-auto bg-white divide-y z-50 shadow-xl">
                  {getFilteredProducts().map(product => (
                    product.variants?.map((variant:any) => (
                      <div 
                        key={variant.id} 
                        className="p-3 hover:bg-slate-50 flex justify-between items-center text-sm cursor-pointer"
                        onClick={() => {
                          const isService = !!product.isService || variant.sku?.startsWith("SER-");
                          if (isService || !editData.items?.some((i:any) => i.variantId === variant.id)) {
                            handleAddProduct(product, variant);
                          }
                        }}
                      >
                        <div>
                          <div className="font-medium text-slate-900">{product.title} {variant.title !== "Default Title" ? `(${variant.title})` : ''}</div>
                          <div className="text-xs text-slate-500">${variant.price}</div>
                        </div>
                        {editData.items?.some((i:any) => i.variantId === variant.id) && !variant.sku?.startsWith("SER-") && !product.isService && (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Agregado</span>
                        )}
                      </div>
                    ))
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <div className="w-64 space-y-1 text-sm">
            {isEditing && (
              <div className="space-y-1 pb-3 border-b border-dashed mb-3">
                <label className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                   <Percent className="w-3 h-3"/> Descuento Global
                </label>
                <div className="flex gap-2">
                  <select
                    className="flex h-8 w-24 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    value={editData.globalDiscountType || "none"}
                    onChange={(e) => handleGlobalDiscountTypeChange(e.target.value)}
                  >
                    <option value="none">Ninguno</option>
                    <option value="percentage">%</option>
                    <option value="fixed_amount">$</option>
                  </select>
                  {(editData.globalDiscountType && editData.globalDiscountType !== "none") && (
                    <Input
                      type="number"
                      min={0}
                      max={editData.globalDiscountType === "percentage" ? 100 : undefined}
                      step={editData.globalDiscountType === "percentage" ? 1 : 0.01}
                      placeholder={editData.globalDiscountType === "percentage" ? "10" : "100.00"}
                      value={editData.globalDiscountValue !== undefined ? editData.globalDiscountValue : ""}
                      onChange={(e) => handleGlobalDiscountValueChange(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="h-8 text-sm"
                    />
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>${displaySubtotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            {displayDiscount > 0 && (
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>Descuento</span>
                <span>-${displayDiscount?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>IVA (16%)</span>
              <span>${displayTax?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
              <span>Total</span>
              <span className="text-indigo-700">${displayTotal?.toLocaleString('es-MX', {minimumFractionDigits:2})}</span>
            </div>
            
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Notas / Condiciones Comerciales</label>
            <Input value={editData.notes || ""} onChange={e => setEditData({...editData, notes: e.target.value})} />
          </div>
        ) : (
          editData.notes && (
            <div className="bg-amber-50 p-3 rounded-md border border-amber-100 text-sm">
              <p className="font-semibold text-amber-800 text-xs uppercase mb-1">Notas / Condiciones</p>
              <p className="text-amber-900">{editData.notes}</p>
            </div>
          )
        )}
      </div>

      {conversionType && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg my-8 overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-lg flex items-center gap-2">
                {conversionType === "order" ? (
                  <>
                    <Package className="w-5 h-5 text-blue-600" />
                    Generar Pedido desde Cotización
                  </>
                ) : conversionType === "remission" ? (
                  <>
                    <Truck className="w-5 h-5 text-emerald-600" />
                    Generar Remisión desde Cotización
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-violet-600" />
                    Generar Factura desde Cotización
                  </>
                )}
              </h3>
              <button
                onClick={() => setConversionType(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-xs text-slate-500">
                Revisa y ajusta los detalles antes de generar el documento final.
              </p>

              {/* Date */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Fecha del Documento
                </label>
                <Input
                  type="date"
                  value={conversionData.date}
                  onChange={(e) =>
                    setConversionData((prev) => ({ ...prev, date: e.target.value }))
                  }
                  className="w-full text-sm"
                />
              </div>

              {/* Location (Sucursal) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Sucursal
                </label>
                <select
                  value={conversionData.locationId}
                  onChange={(e) =>
                    setConversionData((prev) => ({ ...prev, locationId: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Seleccionar Sucursal...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse (Almacén) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Almacén
                </label>
                <select
                  value={conversionData.warehouseId}
                  onChange={(e) =>
                    setConversionData((prev) => ({ ...prev, warehouseId: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Seleccionar Almacén...</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name || wh.Name || "Almacén sin nombre"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Project (Proyecto) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Proyecto
                </label>
                <select
                  value={conversionData.projectId}
                  onChange={(e) =>
                    setConversionData((prev) => ({ ...prev, projectId: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Ningún Proyecto</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes / Comments */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Notas / Observaciones
                </label>
                <textarea
                  value={conversionData.notes}
                  onChange={(e) =>
                    setConversionData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Notas especiales para este documento..."
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                />
              </div>

              <hr className="my-4 border-slate-200" />

              {/* Checkbox for Immediate Payment */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="registerPayment"
                  checked={registerPayment}
                  onChange={(e) => setRegisterPayment(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="registerPayment" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5 select-none">
                  💵 ¿Registrar pago de inmediato?
                </label>
              </div>

              {registerPayment && (
                <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-lg p-4 animate-in fade-in-50 duration-200">
                  {/* Payment Amount */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Monto Recibido *
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={quote.totalAmount}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                      className="w-full text-sm font-semibold bg-white"
                      required
                    />
                    <p className="text-[10px] text-slate-500">Monto total del documento: ${quote.totalAmount?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Payment Method */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Método de Pago *
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none"
                        required
                      >
                        {["Efectivo", "Transferencia", "Tarjeta de Crédito", "Tarjeta de Débito", "Cheque", "Otro"].map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>

                    {/* Payment Date */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Fecha de Pago *
                      </label>
                      <Input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full text-sm bg-white"
                        required
                      />
                    </div>
                  </div>

                  {/* Bank Account */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Cuenta de Banco / Caja Destino *
                    </label>
                    <select
                      value={selectedBankAccountId}
                      onChange={(e) => setSelectedBankAccountId(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none"
                      required
                    >
                      <option value="" disabled>Selecciona la cuenta destino...</option>
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* VAT rate */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Impuesto Incluido en el Pago (IVA) *
                    </label>
                    <select
                      value={paymentVatRate}
                      onChange={(e) => setPaymentVatRate(parseFloat(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm focus:outline-none"
                      required
                    >
                      <option value={0.16}>16% (General)</option>
                      <option value={0.08}>8% (Frontera)</option>
                      <option value={0}>0% / Exento</option>
                    </select>
                  </div>

                  {/* Payment Reference */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Referencia de Pago (Opcional)
                    </label>
                    <Input
                      type="text"
                      placeholder="Ej. SPEI 87432"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      className="w-full text-sm bg-white"
                    />
                  </div>

                  {/* Payment Evidence File (Image or PDF) */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Evidencia de Pago (Imagen o PDF)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        id="paymentEvidenceFile"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setPaymentFile(e.target.files[0]);
                          }
                        }}
                      />
                      <label
                        htmlFor="paymentEvidenceFile"
                        className="flex items-center gap-2 cursor-pointer border border-dashed border-slate-300 rounded-lg px-4 py-2 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition"
                      >
                        <Upload className="w-4 h-4 text-slate-400" />
                        {paymentFile ? "Cambiar Archivo" : "Subir Archivo Evidencia"}
                      </label>
                      {paymentFile && (
                        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 max-w-[200px]">
                          <span className="text-xs font-medium truncate">{paymentFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setPaymentFile(null)}
                            className="text-slate-400 hover:text-red-500 animate-in fade-in"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConversionType(null)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={
                  conversionType === "order"
                    ? handleConfirmConvertToOrder
                    : conversionType === "remission"
                    ? handleConfirmConvertToRemission
                    : handleConfirmConvertToInvoice
                }
                disabled={loading}
                className={
                  conversionType === "order"
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : conversionType === "remission"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-violet-600 hover:bg-violet-700 text-white"
                }
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generar {conversionType === "order" ? "Pedido" : conversionType === "remission" ? "Remisión" : "Factura"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
