"use client";

import { useState } from "react";
import { collection, doc, getDoc, updateDoc, increment, addDoc, serverTimestamp, query, getDocs, where, orderBy, limit, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { X, Search, Loader2, RotateCcw, CheckCircle2, Banknote, CreditCard, Wallet, User, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DenominationCapture, DenominationCounts } from "@/components/pos/DenominationCapture";
import { usePOS } from "@/context/POSContext";

interface ReturnsModalProps {
  onClose: () => void;
}

function sanitizeFirestoreData<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeFirestoreData(item)) as any;
  }
  if (typeof data === "object") {
    const proto = Object.getPrototypeOf(data);
    const isPlain = proto === null || proto === Object.prototype;
    if (!isPlain) {
      return data;
    }
    const cleanObj: any = {};
    for (const [key, value] of Object.entries(data)) {
      cleanObj[key] = sanitizeFirestoreData(value);
    }
    return cleanObj;
  }
  return data;
}

const mapRemissionToSale = (r: any) => {
  if (!r) return null;
  return {
    ...r,
    folio: r.orderNumber?.replace("POS-", "") || r.remissionNumber,
    client: { 
      id: r.clientId || "public",
      name: r.clientName || "Público en General"
    },
    financials: {
      subtotal: r.subtotal || 0,
      tax: r.tax || 0,
      total: r.totalAmount || 0,
      refundedAmount: r.refundedAmount || 0
    },
    items: r.items?.map((item: any) => {
      let rawTitle = item.productName || item.title || "";
      try {
        if (rawTitle.includes("Ã") || rawTitle.includes("Â")) {
          rawTitle = decodeURIComponent(escape(rawTitle));
        }
      } catch (e) {}
      
      return {
        id: item.variantId || item.productId || "",
        title: rawTitle,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercentage: item.discountPercentage || 0,
        returnedQuantity: item.returnedQuantity || 0
      };
    }) || []
  };
};

const parseSafeDate = (createdAt: any): Date => {
  if (!createdAt) return new Date();
  if (typeof createdAt.toDate === "function") {
    return createdAt.toDate();
  }
  if (createdAt.seconds) {
    return new Date(createdAt.seconds * 1000);
  }
  if (typeof createdAt === "string" || typeof createdAt === "number") {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

export function ReturnsModal({ onClose }: ReturnsModalProps) {
  const { user, companyId } = useAuth();
  const { branchId } = usePOS();
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [sale, setSale] = useState<any>(null);
  const [error, setError] = useState("");

  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [selectedMethods, setSelectedMethods] = useState<string[]>([]);
  const [refundAmounts, setRefundAmounts] = useState<Record<string, number>>({
    efectivo: 0,
    retiroReciclador: 0,
    tarjeta: 0,
    saldoFavor: 0
  });
  const [denominationsOut, setDenominationsOut] = useState<DenominationCounts>({});
  
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);

  // Estados para asociar clientes a la venta si es Público en General
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [clientResults, setClientResults] = useState<any[]>([]);
  const [searchingClient, setSearchingClient] = useState(false);
  const [showCreateClientForm, setShowCreateClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  };

  const handleClientSearch = async (val: string) => {
    setClientSearchTerm(val);
    if (val.trim().length < 2) {
      setClientResults([]);
      return;
    }
    setSearchingClient(true);
    try {
      if (!companyId) return;
      const lowerVal = val.toLowerCase();
      const clientsRef = collection(db, "companies", companyId, "clients");
      const snap = await getDocs(clientsRef);
      const list = snap.docs.map(doc => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          name: data.name || data.ClientName || data.LegalName || data.CommercialName || "",
          phone: data.phone || data.Phone || "",
          email: data.email || data.Email || "",
          rfc: data.rfc || data.RFC || ""
        };
      });
      const filtered = list.filter((c: any) => {
        return (c.name || "").toLowerCase().includes(lowerVal) ||
               (c.phone || "").includes(lowerVal) ||
               (c.email || "").toLowerCase().includes(lowerVal) ||
               (c.rfc || "").toLowerCase().includes(lowerVal);
      });
      setClientResults(filtered.slice(0, 5));
    } catch (e) {
      console.error("Error searching clients:", e);
    } finally {
      setSearchingClient(false);
    }
  };

  const handleAssociateClient = async (client: any) => {
    if (!sale || !companyId) return;
    setProcessing(true);
    try {
      const remissionRef = doc(db, "companies", companyId, "remisiones", sale.id);
      await updateDoc(remissionRef, {
        clientId: client.id,
        clientName: client.name
      });
      
      setSale((prev: any) => ({
        ...prev,
        client: {
          id: client.id,
          name: client.name
        },
        clientId: client.id,
        clientName: client.name
      }));
      
      setSearchResults(prev => prev.map(s => {
        if (s.id === sale.id) {
          return {
            ...s,
            client: { id: client.id, name: client.name },
            clientId: client.id,
            clientName: client.name
          };
        }
        return s;
      }));
      
      setClientSearchTerm("");
      setClientResults([]);
      alert(`Cliente "${client.name}" asociado exitosamente a esta venta.`);
    } catch (e) {
      console.error("Error associating client:", e);
      alert("Error al asociar el cliente.");
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateAndAssociateClient = async () => {
    if (!newClientName.trim() || !newClientPhone.trim() || !companyId) {
      alert("Nombre y celular son requeridos.");
      return;
    }
    setProcessing(true);
    try {
      const newClientData = {
        name: newClientName.trim().toUpperCase(),
        phone: newClientPhone.trim(),
        email: newClientEmail.trim(),
        rfc: "XAXX010101000",
        points: 0,
        walletBalance: 0,
        preferences: "",
        createdAt: serverTimestamp(),
        isActive: true
      };
      
      const docRef = await addDoc(collection(db, "companies", companyId, "clients"), newClientData);
      
      const client = {
        id: docRef.id,
        name: newClientData.name,
        phone: newClientData.phone,
        email: newClientData.email
      };
      
      await handleAssociateClient(client);
      
      setNewClientName("");
      setNewClientPhone("");
      setNewClientEmail("");
      setShowCreateClientForm(false);
    } catch (e) {
      console.error("Error creating and associating client:", e);
      alert("Error al crear y asociar el cliente.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    setError("");
    setSale(null);
    setSearchResults([]);
    setReturnQuantities({});
    setSelectedMethods([]);
    setRefundAmounts({
      efectivo: 0,
      retiroReciclador: 0,
      tarjeta: 0,
      saldoFavor: 0
    });

    try {
      const originalTerm = searchTerm.trim().toLowerCase();
      const term = originalTerm.replace(/'/g, "-");
      
      if (!companyId) throw new Error("No company ID");
      
      // Intentar búsqueda directa por ID de Remisión
      if (term.length > 15 && !term.includes(" ")) {
        const remissionRef = doc(db, "companies", companyId, "remisiones", term);
        const remissionSnap = await getDoc(remissionRef);
        
        if (remissionSnap.exists()) {
          setSale(mapRemissionToSale({ id: remissionSnap.id, ...remissionSnap.data() }));
          setLoading(false);
          return;
        }
      }

      // 1. Buscar clientes por teléfono o email exacto
      const cleanPhone = term.replace(/\D/g, "");
      const clientQueries = [
        getDocs(query(collection(db, "companies", companyId, "clients"), where("phone", "==", searchTerm.trim()))),
        getDocs(query(collection(db, "companies", companyId, "clients"), where("email", "==", searchTerm.trim().toLowerCase())))
      ];
      if (cleanPhone && cleanPhone !== originalTerm && cleanPhone.length >= 8) {
        clientQueries.push(
          getDocs(query(collection(db, "companies", companyId, "clients"), where("phone", "==", cleanPhone)))
        );
      }

      const clientSnaps = await Promise.all(clientQueries);
      const clientIds: string[] = [];
      clientSnaps.forEach(snap => {
        snap.docs.forEach(d => {
          if (!clientIds.includes(d.id)) {
            clientIds.push(d.id);
          }
        });
      });

      // Buscar en las últimas remisiones del POS
      const formattedTerm = term.startsWith("rem-") ? term.toUpperCase() : term;
      const formattedPosTerm = term.startsWith("pos-") ? term.toUpperCase() : `POS-${term.toUpperCase()}`;
      
      const promises = [];

      // Consulta 1: Coincidencia exacta en orderNumber (ej: POS-1002)
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("orderNumber", "==", formattedPosTerm)
        ))
      );

      // Consulta 2: Coincidencia exacta en remissionNumber (ej: 1002)
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("remissionNumber", "==", formattedTerm)
        ))
      );

      // Consulta 3: Coincidencia exacta en clientName
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("clientName", "==", searchTerm.trim())
        ))
      );

      // Consulta 4: Por clientIds encontrados (por teléfono o email)
      clientIds.forEach(cId => {
        promises.push(
          getDocs(query(
            collection(db, "companies", companyId, "remisiones"),
            where("clientId", "==", cId)
          ))
        );
      });

      // Consulta 5: Obtener ventas generales del POS recientes para filtrado en memoria
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("isPosSale", "==", true),
          limit(200)
        ))
      );

      const snaps = await Promise.all(promises);
      const docMap = new Map<string, any>();

      snaps.forEach(snap => {
        snap.docs.forEach(d => {
          const data = d.data();
          docMap.set(d.id, { id: d.id, ...data });
        });
      });

      const matches = Array.from(docMap.values())
        .map(mapRemissionToSale)
        .filter((s: any) => {
          const folio = (s.folio || "").toUpperCase();
          const remNum = (s.remissionNumber || "").toUpperCase();
          const orderNum = (s.orderNumber || "").toUpperCase();
          const name = (s.client?.name || "").toLowerCase();
          
          return folio === term.toUpperCase() || 
                 folio === originalTerm.toUpperCase() ||
                 remNum === formattedTerm || 
                 remNum === originalTerm.toUpperCase() ||
                 orderNum === formattedPosTerm ||
                 orderNum === `POS-${originalTerm.toUpperCase()}` ||
                 s.id.toLowerCase() === term || 
                 s.id.toLowerCase() === originalTerm ||
                 name.includes(originalTerm) ||
                 name.includes(term) ||
                 clientIds.includes(s.clientId);
        });

      // Ordenar por fecha de creación desc
      matches.sort((a, b) => {
        const timeA = parseSafeDate(a.createdAt).getTime();
        const timeB = parseSafeDate(b.createdAt).getTime();
        return timeB - timeA;
      });

      if (matches.length === 0) {
        setError("No se encontraron remisiones de POS recientes para esta búsqueda.");
      } else if (matches.length === 1) {
        setSale(matches[0]);
      } else {
        setSearchResults(matches);
      }
    } catch (err) {
      console.error(err);
      setError("Error al buscar las ventas.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResult = (selectedSale: any) => {
    setSearchResults([]);
    setSale(selectedSale);
  };

  const handleQtyChange = (itemId: string, maxQty: number, val: string) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 0) return;
    if (qty > maxQty) return;

    setReturnQuantities(prev => ({
      ...prev,
      [itemId]: qty
    }));
  };

  // Calculate refund amount
  let totalRefund = 0;
  if (sale) {
    let subtotalRefund = 0;
    sale.items.forEach((item: any) => {
      const returning = returnQuantities[item.id] || 0;
      const finalPrice = item.unitPrice * (1 - (item.discountPercentage || 0) / 100);
      subtotalRefund += returning * finalPrice;
    });
    totalRefund = Math.round(subtotalRefund * 1.16 * 100) / 100;
  }

  const totalAssigned = selectedMethods.reduce((acc, m) => acc + (refundAmounts[m] || 0), 0);
  const remainingRefund = Math.round((totalRefund - totalAssigned) * 100) / 100;
  const isFullyAssigned = Math.abs(remainingRefund) < 0.01;

  const toggleRefundMethod = (method: string) => {
    if (selectedMethods.includes(method)) {
      setSelectedMethods(prev => prev.filter(m => m !== method));
      setRefundAmounts(prev => ({ ...prev, [method]: 0 }));
    } else {
      setSelectedMethods(prev => [...prev, method]);
      const currentAssigned = selectedMethods.reduce((acc, m) => acc + (refundAmounts[m] || 0), 0);
      const remaining = Math.max(0, Math.round((totalRefund - currentAssigned) * 100) / 100);
      setRefundAmounts(prev => ({ ...prev, [method]: remaining }));
    }
  };

  const handleAmountChange = (method: string, val: string) => {
    const parsed = parseFloat(val);
    const amount = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setRefundAmounts(prev => ({ ...prev, [method]: amount }));
  };

  const handleProcessReturn = async () => {
    if (totalRefund <= 0) {
      alert("Debes seleccionar al menos un artículo para devolver.");
      return;
    }
    if (selectedMethods.length === 0) {
      alert("Selecciona al menos un método de reembolso.");
      return;
    }
    if (!isFullyAssigned) {
      alert("El monto asignado debe coincidir exactamente con el total a reembolsar.");
      return;
    }

    if (selectedMethods.includes('efectivo') && refundAmounts.efectivo > 0) {
      const denomSum = Object.entries(denominationsOut).reduce((acc, [k, v]) => acc + parseFloat(k) * (v || 0), 0);
      if (Math.abs(denomSum - refundAmounts.efectivo) > 0.01) {
        alert(`Las denominaciones ($${denomSum}) no coinciden con el monto en efectivo a devolver ($${refundAmounts.efectivo}).`);
        return;
      }
    }

    setProcessing(true);
    try {
      if (!companyId) throw new Error("No company ID");
      
      // 1. Obtener Remisión Original y Actualizarla
      const remissionRef = doc(db, "companies", companyId, "remisiones", sale.id);
      const remissionSnap = await getDoc(remissionRef);
      if (!remissionSnap.exists()) throw new Error("Remisión no encontrada en la base de datos");
      
      const remissionData = remissionSnap.data();
      const updatedRemissionItems = remissionData.items.map((item: any) => {
        const itemId = item.variantId || item.productId || "";
        const returning = returnQuantities[itemId] || 0;
        return {
          ...item,
          returnedQuantity: (item.returnedQuantity || 0) + returning
        };
      });

      const isFullyRefunded = (remissionData.refundedAmount || 0) + totalRefund >= remissionData.totalAmount - 0.01;

      await updateDoc(remissionRef, sanitizeFirestoreData({
        items: updatedRemissionItems,
        refundedAmount: increment(totalRefund),
        status: isFullyRefunded ? 'cancelada' : 'activa'
      }));

      // 2. Afectar Inventario Físico (Sumar Stock Devuelto en la Variante Correcta)
      for (const item of sale.items) {
        const returning = returnQuantities[item.id] || 0;
        if (returning > 0) {
          const origItem = remissionData.items.find((oi: any) => (oi.variantId || oi.productId) === item.id);
          if (origItem) {
            const productRef = doc(db, "companies", companyId, "products", origItem.productId);
            const pSnap = await getDoc(productRef);
            if (pSnap.exists()) {
              const productData = pSnap.data();
              const updatedVariants = productData.variants?.map((v: any) => {
                if (v.id === (origItem.variantId || origItem.id)) {
                  return { ...v, stock: (v.stock || 0) + returning };
                }
                return v;
              });
              await updateDoc(productRef, { variants: updatedVariants });
              
              // Registrar movimiento de Entrada (IN) al Kárdex
              const movId = crypto.randomUUID();
              await setDoc(doc(db, "companies", companyId, "inventory_movements", movId), sanitizeFirestoreData({
                id: movId,
                productId: origItem.productId,
                variantId: origItem.variantId || origItem.id || "",
                type: "IN",
                quantity: returning,
                reason: `Devolución POS (Remisión ${sale.remissionNumber})`,
                referenceId: sale.id,
                createdAt: new Date().toISOString()
              }));
            }
          }
        }
      }

      // 3. Método de Reembolso
      if (selectedMethods.includes('efectivo') && refundAmounts.efectivo > 0) {
        let sessionId = null;
        
        // Buscar turno de caja abierto en la sucursal de la remisión
        const sessionQuery = query(
          collection(db, "companies", companyId, "cash_sessions"),
          where("status", "==", "open"),
          where("locationId", "==", sale.locationId || "")
        );
        const sessionSnap = await getDocs(sessionQuery);
        
        if (!sessionSnap.empty) {
          sessionId = sessionSnap.docs[0].id;
        } else {
          // Fallback
          const fallbackQuery = query(collection(db, "companies", companyId, "cash_sessions"), where("status", "==", "open"));
          const fallbackSnap = await getDocs(fallbackQuery);
          if (!fallbackSnap.empty) {
              sessionId = fallbackSnap.docs[0].id;
          }
        }

        if (sessionId) {
          await addDoc(collection(db, "companies", companyId, "cash_transactions"), sanitizeFirestoreData({
            sessionId,
            type: "EXPENSE",
            category: "RETIRO_CANCELACION",
            amount: refundAmounts.efectivo,
            reference: `Devolución Ticket ${sale.remissionNumber}`,
            paymentMethod: "CASH",
            denominations: denominationsOut,
            createdAt: serverTimestamp(),
            createdBy: user?.email || null,
          }));
        } else {
           throw new Error("No hay un turno de caja abierto para registrar la salida de efectivo.");
        }
      }

      if (selectedMethods.includes('retiroReciclador') && refundAmounts.retiroReciclador > 0) {
        await addDoc(collection(db, "companies", companyId, "cash_withdrawals"), sanitizeFirestoreData({
          amount: refundAmounts.retiroReciclador,
          locationId: sale.locationId || branchId || "",
          locationName: sale.locationName || "Sucursal",
          status: "requested",
          type: "devolucion",
          reference: `Devolución Ticket ${sale.remissionNumber || sale.id}`,
          createdAt: serverTimestamp(),
          createdBy: user?.email || "Cajero",
          code: null
        }));
      }

      if (selectedMethods.includes('saldoFavor') && refundAmounts.saldoFavor > 0 && sale.client?.id) {
        const clientRef = doc(db, "companies", companyId, "clients", sale.client.id);
        await updateDoc(clientRef, {
          walletBalance: increment(refundAmounts.saldoFavor)
        });
      }

      setSuccess(true);

    } catch (err) {
      console.error(err);
      alert("Error al procesar la devolución.");
    } finally {
      setProcessing(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-card border rounded-xl shadow-xl w-full max-w-md p-8 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Devolución Exitosa</h2>
            <p className="text-muted-foreground">
              Se ha procesado el reembolso por un total de {formatMoney(totalRefund)}:
            </p>
            <div className="text-sm space-y-1 text-muted-foreground w-full text-left bg-muted/30 p-3 rounded border">
              {refundAmounts.efectivo > 0 && <p className="flex justify-between"><span>Efectivo (Caja):</span> <span className="font-semibold">{formatMoney(refundAmounts.efectivo)}</span></p>}
              {refundAmounts.retiroReciclador > 0 && <p className="flex justify-between"><span>Retiro Reciclador:</span> <span className="font-semibold">{formatMoney(refundAmounts.retiroReciclador)}</span></p>}
              {refundAmounts.tarjeta > 0 && <p className="flex justify-between"><span>Tarjeta:</span> <span className="font-semibold">{formatMoney(refundAmounts.tarjeta)}</span></p>}
              {refundAmounts.saldoFavor > 0 && <p className="flex justify-between"><span>Monedero:</span> <span className="font-semibold">{formatMoney(refundAmounts.saldoFavor)}</span></p>}
            </div>
            {refundAmounts.retiroReciclador > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium text-center">
                Se envió la solicitud de retiro por código al tesorero por el monto asignado al reciclador.
              </p>
            )}
            <Button className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white hover:text-white" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-2 md:p-4">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row animate-in fade-in zoom-in duration-200 max-h-screen">
        
        {/* Panel Izquierdo: Búsqueda y Detalles */}
        <div className="w-full md:w-1/2 bg-muted/30 p-6 border-b md:border-b-0 md:border-r flex flex-col overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2"><RotateCcw className="w-5 h-5"/> Devoluciones</h2>
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-full md:hidden"><X className="w-5 h-5"/></button>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2 mb-6 shrink-0">
            <Input 
              placeholder="ID de Ticket, Nombre, Teléfono o Correo..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
              className="bg-background"
              autoFocus
            />
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white hover:text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </form>

          {error && <p className="text-destructive text-sm bg-destructive/10 p-3 rounded mb-4 shrink-0">{error}</p>}

          {searchResults.length > 0 && (
            <div className="space-y-2 flex-1 overflow-y-auto">
              <p className="font-semibold text-sm mb-2">Ventas Recientes Encontradas</p>
              {searchResults.map(res => (
                <div 
                  key={res.id} 
                  onClick={() => handleSelectResult(res)}
                  className="bg-background border rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors group"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-primary">{formatMoney(res.financials.total)}</span>
                    <span className="text-xs text-muted-foreground">{parseSafeDate(res.createdAt).toLocaleDateString('es-MX')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span className="truncate">{res.client?.name || "Público en General"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 uppercase">ID: {res.id}</p>
                </div>
              ))}
            </div>
          )}

          {sale && (
            <div className="space-y-4 flex-1">
              <div className="bg-background p-4 rounded-lg border">
                <p className="text-sm font-semibold mb-1">Detalles de Venta</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Cliente: {sale.client?.name || "Público en General"}</p>
                  <p>Fecha: {parseSafeDate(sale.createdAt).toLocaleString('es-MX')}</p>
                  <p>Total Original: {formatMoney(sale.financials.total)}</p>
                </div>
              </div>

              {sale.client?.id === 'public' && (
                 <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg space-y-3">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                      Asociar Cliente
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Esta venta se realizó a Público en General. Para reembolsar en Monedero Electrónico, primero debe asociar un cliente.
                    </p>
                    
                    {!showCreateClientForm ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input 
                            placeholder="Buscar cliente por nombre, tel..." 
                            value={clientSearchTerm} 
                            onChange={(e) => handleClientSearch(e.target.value)} 
                            className="bg-background text-xs h-9"
                          />
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="outline"
                            onClick={() => setShowCreateClientForm(true)}
                            className="text-xs font-semibold shrink-0"
                          >
                            Crear Cliente
                          </Button>
                        </div>
                        
                        {searchingClient && (
                          <p className="text-xs text-muted-foreground animate-pulse">Buscando...</p>
                        )}
                        
                        {clientResults.length > 0 && (
                          <div className="border rounded bg-background max-h-40 overflow-y-auto divide-y z-50">
                            {clientResults.map(c => (
                              <div 
                                key={c.id} 
                                onClick={() => handleAssociateClient(c)}
                                className="p-2 text-xs hover:bg-muted cursor-pointer flex justify-between items-center"
                              >
                                <div>
                                  <p className="font-semibold">{c.name}</p>
                                  {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                                </div>
                                <span className="text-[10px] text-indigo-600 hover:underline font-bold">Asociar</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3 border-t border-amber-500/10 pt-3">
                        <p className="text-[11px] font-bold text-amber-800">Nuevo Cliente</p>
                        <div className="space-y-2">
                          <Input 
                            placeholder="Nombre Completo *" 
                            value={newClientName} 
                            onChange={(e) => setNewClientName(e.target.value)} 
                            className="bg-background text-xs h-8"
                          />
                          <Input 
                            placeholder="Celular (WhatsApp) *" 
                            value={newClientPhone} 
                            onChange={(e) => setNewClientPhone(e.target.value)} 
                            className="bg-background text-xs h-8"
                          />
                          <Input 
                            placeholder="Correo (Opcional)" 
                            value={newClientEmail} 
                            onChange={(e) => setNewClientEmail(e.target.value)} 
                            className="bg-background text-xs h-8"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button 
                            type="button" 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => setShowCreateClientForm(false)}
                            className="text-xs h-7"
                          >
                            Cancelar
                          </Button>
                          <Button 
                            type="button" 
                            size="sm" 
                            onClick={handleCreateAndAssociateClient}
                            className="text-xs h-7 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                            disabled={!newClientName.trim() || !newClientPhone.trim()}
                          >
                            Crear y Asociar
                          </Button>
                        </div>
                      </div>
                    )}
                 </div>
              )}

              <div className="space-y-2">
                <p className="font-semibold text-sm">Artículos para Devolver</p>
                {sale.items.map((item: any) => {
                  const alreadyReturned = item.returnedQuantity || 0;
                  const availableToReturn = item.quantity - alreadyReturned;
                  const returning = returnQuantities[item.id] || 0;

                  return (
                    <div key={item.id} className="bg-background border rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium leading-tight">{item.title}</span>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">{formatMoney(item.unitPrice)} c/u</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-muted-foreground">Disponibles: {availableToReturn}</span>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold">Devolver:</label>
                          <Input 
                            type="number" 
                            min="0" 
                            max={availableToReturn} 
                            value={returning === 0 ? "" : returning}
                            onChange={(e) => handleQtyChange(item.id, availableToReturn, e.target.value)}
                            className="w-16 h-7 text-xs text-center"
                            disabled={availableToReturn === 0}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Panel Derecho: Reembolso */}
        <div className="w-full md:w-1/2 p-6 flex flex-col relative overflow-y-auto custom-scrollbar bg-background">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full hidden md:block text-muted-foreground">
              <X className="w-5 h-5"/>
          </button>

          {!sale ? (
            <div className="flex-1 flex items-center justify-center text-center p-6 text-muted-foreground">
              Busca un ticket para comenzar.
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 rounded-lg p-6 text-center mb-6">
                <p className="text-sm font-semibold uppercase text-muted-foreground mb-1">Monto a Reembolsar</p>
                <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400">{formatMoney(totalRefund)}</p>
              </div>

              {totalRefund > 0 && (
                <>
                  <h3 className="font-semibold mb-4 text-muted-foreground">Método de Reembolso</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {/* Efectivo */}
                      <div className="flex flex-col gap-1.5">
                        <button 
                          type="button"
                          onClick={() => toggleRefundMethod('efectivo')}
                          className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all w-full min-h-[92px] ${
                            selectedMethods.includes('efectivo') 
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                              : 'border-border text-muted-foreground hover:border-indigo-600/30'
                          }`}
                        >
                            <Banknote className="w-6 h-6 mb-2" />
                            <span className="text-xs font-semibold text-center">Efectivo (Caja)</span>
                        </button>
                        {selectedMethods.includes('efectivo') && (
                          <Input 
                            type="number"
                            min="0"
                            step="0.01"
                            value={refundAmounts.efectivo || ""}
                            onChange={(e) => handleAmountChange('efectivo', e.target.value)}
                            placeholder="Monto"
                            className="h-8 text-xs text-center border-indigo-600 focus-visible:ring-indigo-600 bg-background"
                          />
                        )}
                      </div>

                      {/* Retiro Reciclador */}
                      <div className="flex flex-col gap-1.5">
                        <button 
                          type="button"
                          onClick={() => toggleRefundMethod('retiroReciclador')}
                          className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all w-full min-h-[92px] ${
                            selectedMethods.includes('retiroReciclador') 
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                              : 'border-border text-muted-foreground hover:border-indigo-600/30'
                          }`}
                        >
                            <Lock className="w-6 h-6 mb-2" />
                            <span className="text-xs font-semibold text-center leading-tight">Retiro Reciclador</span>
                        </button>
                        {selectedMethods.includes('retiroReciclador') && (
                          <Input 
                            type="number"
                            min="0"
                            step="0.01"
                            value={refundAmounts.retiroReciclador || ""}
                            onChange={(e) => handleAmountChange('retiroReciclador', e.target.value)}
                            placeholder="Monto"
                            className="h-8 text-xs text-center border-indigo-600 focus-visible:ring-indigo-600 bg-background"
                          />
                        )}
                      </div>

                      {/* Tarjeta */}
                      <div className="flex flex-col gap-1.5">
                        <button 
                          type="button"
                          onClick={() => toggleRefundMethod('tarjeta')}
                          className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all w-full min-h-[92px] ${
                            selectedMethods.includes('tarjeta') 
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                              : 'border-border text-muted-foreground hover:border-indigo-600/30'
                          }`}
                        >
                            <CreditCard className="w-6 h-6 mb-2" />
                            <span className="text-xs font-semibold text-center">Tarjeta</span>
                        </button>
                        {selectedMethods.includes('tarjeta') && (
                          <Input 
                            type="number"
                            min="0"
                            step="0.01"
                            value={refundAmounts.tarjeta || ""}
                            onChange={(e) => handleAmountChange('tarjeta', e.target.value)}
                            placeholder="Monto"
                            className="h-8 text-xs text-center border-indigo-600 focus-visible:ring-indigo-600 bg-background"
                          />
                        )}
                      </div>

                      {/* Monedero */}
                      <div className="flex flex-col gap-1.5">
                        <button 
                          type="button"
                          disabled={sale.client?.id === 'public'}
                          onClick={() => toggleRefundMethod('saldoFavor')}
                          className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all w-full min-h-[92px] ${
                            selectedMethods.includes('saldoFavor') 
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                              : 'border-border text-muted-foreground hover:border-indigo-600/30'
                          } ${sale.client?.id === 'public' ? 'opacity-40 cursor-not-allowed' : ''}`}
                          title={sale.client?.id === 'public' ? "Asocie un cliente para habilitar Monedero" : ""}
                        >
                            <Wallet className="w-6 h-6 mb-2" />
                            <span className="text-xs font-semibold text-center leading-tight font-medium">Monedero</span>
                        </button>
                        {selectedMethods.includes('saldoFavor') && (
                          <Input 
                            type="number"
                            min="0"
                            step="0.01"
                            value={refundAmounts.saldoFavor || ""}
                            onChange={(e) => handleAmountChange('saldoFavor', e.target.value)}
                            placeholder="Monto"
                            className="h-8 text-xs text-center border-indigo-600 focus-visible:ring-indigo-600 bg-background"
                          />
                        )}
                      </div>
                  </div>

                  {/* Banner de Estado de Asignación */}
                  <div className="mb-6 rounded-lg flex items-center justify-between text-xs font-semibold">
                    {remainingRefund > 0.01 ? (
                      <span className="text-amber-600 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 p-2.5 rounded w-full text-center border border-amber-200 dark:border-amber-900/50">
                        Pendiente de asignar: {formatMoney(remainingRefund)}
                      </span>
                    ) : remainingRefund < -0.01 ? (
                      <span className="text-destructive bg-destructive/10 p-2.5 rounded w-full text-center border border-destructive/20">
                        Monto excedido por: {formatMoney(Math.abs(remainingRefund))}
                      </span>
                    ) : (
                      <span className="text-green-600 bg-green-50 dark:bg-green-950/20 dark:text-green-400 p-2.5 rounded w-full text-center flex items-center justify-center gap-1 border border-green-200 dark:border-green-900/50">
                        <CheckCircle2 className="w-4 h-4" /> Monto totalmente asignado
                      </span>
                    )}
                  </div>

                  {selectedMethods.includes('efectivo') && refundAmounts.efectivo > 0 && (
                    <div className="mb-6 animate-in fade-in zoom-in">
                      <p className="text-xs text-muted-foreground mb-2">
                        Captura los billetes/monedas que vas a retirar de la caja por {formatMoney(refundAmounts.efectivo)}.
                      </p>
                      <DenominationCapture 
                        title="Billetes a Entregar"
                        onChange={(sum, denoms) => setDenominationsOut(denoms)}
                      />
                    </div>
                  )}

                  {selectedMethods.includes('retiroReciclador') && refundAmounts.retiroReciclador > 0 && (
                    <p className="text-sm text-amber-700 dark:text-amber-400 mb-6 text-center border border-amber-200 dark:border-amber-900/50 p-4 rounded bg-amber-50 dark:bg-amber-950/20 font-medium">
                      Se solicitará una autorización de retiro de efectivo por código al tesorero por {formatMoney(refundAmounts.retiroReciclador)}.
                    </p>
                  )}

                  {selectedMethods.includes('tarjeta') && refundAmounts.tarjeta > 0 && (
                    <p className="text-sm text-muted-foreground mb-6 text-center border p-4 rounded bg-muted/20">
                      Debes procesar la devolución de {formatMoney(refundAmounts.tarjeta)} manualmente en tu Terminal Bancaria.
                    </p>
                  )}

                  {selectedMethods.includes('saldoFavor') && refundAmounts.saldoFavor > 0 && (
                    <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-6 text-center border border-indigo-200 dark:border-indigo-900/50 p-4 rounded bg-indigo-50 dark:bg-indigo-950/20 font-medium">
                      El monto de {formatMoney(refundAmounts.saldoFavor)} se añadirá como Saldo a Favor al cliente {sale.client?.name || ""}.
                    </p>
                  )}

                  <div className="mt-auto pt-4">
                    <Button 
                      size="lg" 
                      className="w-full h-14 text-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white hover:text-white"
                      disabled={selectedMethods.length === 0 || !isFullyAssigned || processing}
                      onClick={handleProcessReturn}
                    >
                        {processing && <Loader2 className="w-5 h-5 animate-spin mr-2"/>}
                        Procesar Devolución
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
