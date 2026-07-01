"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { ErpDocument } from "@/app/actions/erp";
import { doc, updateDoc, collection, query, where, getDocs, addDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

interface AplicarAnticipoModalProps {
  anticipo: any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AplicarAnticipoModal({ anticipo, isOpen, onOpenChange, onSuccess }: AplicarAnticipoModalProps) {
  const { companyId } = useAuth();
  const [documents, setDocuments] = useState<ErpDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  
  // Mapeamos docId -> monto a aplicar
  const [applications, setApplications] = useState<Record<string, number>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [docTypeFilter, setDocTypeFilter] = useState("all");

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = docTypeFilter === "all" || doc.type.toLowerCase() === docTypeFilter;
    return matchesSearch && matchesType;
  });

  useEffect(() => {
    if (isOpen && anticipo) {
      loadDocuments();
      setApplications({});
    }
  }, [isOpen, anticipo]);

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      if (!companyId) return;

      const [pedidosSnap, remisionesSnap, facturasSnap] = await Promise.all([
        getDocs(query(collection(db, "companies", companyId, "pedidos"), where("clientId", "==", anticipo.clientId))),
        getDocs(query(collection(db, "companies", companyId, "remisiones"), where("clientId", "==", anticipo.clientId))),
        getDocs(query(collection(db, "companies", companyId, "facturas"), where("clientId", "==", anticipo.clientId)))
      ]);

      const localDocs: ErpDocument[] = [];

      pedidosSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const status = String(d.status || "").trim().toLowerCase();
        const isCanceled = status === "cancelado" || status === "cancelada" || status === "cancelled" || status === "anulado" || status === "anulada";
        if (!isCanceled && status !== "surtido" && status !== "remisionado" && status !== "facturado" && status !== "pre_facturado" && status !== "completado") {
          const total = Math.round(((parseFloat(d.totalAmount) || d.totalAmount || 0) + Number.EPSILON) * 100) / 100;
          const paid = Math.round(((parseFloat(d.paidAmount) || d.paidAmount || 0) + Number.EPSILON) * 100) / 100;
          const balance = Math.round((total - paid + Number.EPSILON) * 100) / 100;
          if (balance > 0.01) {
            localDocs.push({
              id: docSnap.id,
              type: "Order",
              number: d.orderNumber || d.number || `PED-${docSnap.id.substring(0, 6)}`,
              total,
              balance,
              locationId: d.locationId || null,
              locationName: d.locationName || ""
            });
          }
        }
      });

      remisionesSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const status = String(d.status || "").trim().toLowerCase();
        const isCanceled = status === "cancelado" || status === "cancelada" || status === "cancelled" || status === "anulado" || status === "anulada";
        if (!isCanceled && status !== "facturada" && status !== "pagada") {
          const total = Math.round(((parseFloat(d.totalAmount) || d.totalAmount || 0) + Number.EPSILON) * 100) / 100;
          const paid = Math.round(((parseFloat(d.paidAmount) || d.paidAmount || 0) + Number.EPSILON) * 100) / 100;
          const balance = Math.round((total - paid + Number.EPSILON) * 100) / 100;
          if (balance > 0.01) {
            localDocs.push({
              id: docSnap.id,
              type: "Remission",
              number: d.remissionNumber || d.number || `REM-${docSnap.id.substring(0, 6)}`,
              total,
              balance,
              locationId: d.locationId || null,
              locationName: d.locationName || ""
            });
          }
        }
      });

      facturasSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        const status = String(d.status || "").trim().toLowerCase();
        const isCanceled = status === "cancelado" || status === "cancelada" || status === "cancelled" || status === "anulado" || status === "anulada";
        if (!isCanceled && status !== "pagada") {
          const total = Math.round(((parseFloat(d.totalAmount) || d.totalAmount || 0) + Number.EPSILON) * 100) / 100;
          const paid = Math.round(((parseFloat(d.paidAmount) || d.paidAmount || 0) + Number.EPSILON) * 100) / 100;
          const balance = Math.round((total - paid + Number.EPSILON) * 100) / 100;
          if (balance > 0.01) {
            localDocs.push({
              id: docSnap.id,
              type: "Invoice",
              number: d.invoiceNumber ? `FAC-${d.invoiceNumber}` : `FAC-${docSnap.id.substring(0, 6)}`,
              total,
              balance,
              locationId: d.locationId || null,
              locationName: d.locationName || ""
            });
          }
        }
      });

      setDocuments(localDocs);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleApplyChange = (docId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setApplications(prev => ({
      ...prev,
      [docId]: num
    }));
  };

  const totalApplied = Object.values(applications).reduce((acc, curr) => acc + curr, 0);
  let remainingBalance = (anticipo?.balance || 0) - totalApplied;
  
  // Tolerancia para errores de redondeo de punto flotante y diferencias con ERP (hasta 5 centavos)
  if (Math.abs(remainingBalance) <= 0.05) {
    remainingBalance = 0;
  }

  const canApply = totalApplied > 0 && remainingBalance >= 0;

  const handleSubmit = async () => {
    if (!canApply) return;
    setIsApplying(true);

    try {
      if (!companyId) throw new Error("No company ID");
      
      const docsToApply = Object.entries(applications).filter(([_, amount]) => amount > 0);
      const newApplications = [];
      
      for (const [docId, amount] of docsToApply) {
        const docObj = documents.find(d => d.id === docId);
        
        // 1. Registrar pago localmente en Firestore
        const paymentData = {
          amount: amount,
          date: paymentDate,
          method: "Anticipo",
          reference: `Aplicación de Anticipo - ANT-${anticipo.folio ? String(anticipo.folio).padStart(4, '0') : anticipo.id.substring(0, 5).toUpperCase()}`,
          documentId: docId,
          documentType: docObj?.type === "Invoice" ? "factura" : (docObj?.type === "Remission" ? "remision" : "pedido"),
          documentNumber: docObj?.number || docId,
          clientId: anticipo.clientId || "",
          clientName: anticipo.clientName || "",
          locationId: (docObj as any)?.locationId || null,
          locationName: (docObj as any)?.locationName || "",
          bankAccountId: anticipo.bankAccountId || "CUENTA_MOCK",
          anticipoId: anticipo.id,
          createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, "companies", companyId, "payments"), paymentData);

        // 2. Actualizar el saldo pagado (paidAmount) en el documento de destino
        let collectionName = "";
        if (docObj?.type === "Order") collectionName = "pedidos";
        else if (docObj?.type === "Remission") collectionName = "remisiones";
        else if (docObj?.type === "Invoice") collectionName = "facturas";

        if (collectionName) {
          const docRef = doc(db, "companies", companyId, collectionName, docId);
          
          const totalAmount = docObj?.total || 0;
          const prevPaidAmount = totalAmount - (docObj?.balance || 0);
          const newPaidAmount = prevPaidAmount + amount;

          const updates: any = {
            paidAmount: increment(amount)
          };

          if (newPaidAmount >= totalAmount - 0.01) {
            if (docObj?.type === "Invoice" || docObj?.type === "Remission") {
              updates.status = "pagada";
            }
          }

          await updateDoc(docRef, updates);
        }

        // Tracking paramétrico para el Dashboard y Flujo Ciego
        newApplications.push({
          erpDocumentId: docId,
          erpDocumentNumber: docObj?.number || "Doc Desconocido",
          erpDocumentType: docObj?.type || "Unknown",
          amount: amount,
          appliedAt: paymentDate
        });
      }

      // Actualizar el anticipo en Firestore
      let newBalance = anticipo.balance - totalApplied;
      
      // Aplicar tolerancia de redondeo antes de guardar para evitar que quede abierto por centavos
      if (Math.abs(newBalance) <= 0.05) {
        newBalance = 0;
      }
      
      const newStatus = newBalance <= 0 ? "applied" : "partially_applied";

      const existingApps = anticipo.applications || [];

      const ref = doc(db, "companies", companyId, "anticipos", anticipo.id);
      await updateDoc(ref, {
        balance: newBalance,
        status: newStatus,
        applications: [...existingApps, ...newApplications],
        updatedAt: new Date()
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error al aplicar", error);
      alert("Hubo un error al aplicar el anticipo.");
    } finally {
      setIsApplying(false);
    }
  };

  if (!anticipo) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aplicar Anticipo</DialogTitle>
          <DialogDescription>
            Cliente: <span className="font-semibold text-foreground">{anticipo.clientName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex justify-between items-center bg-muted/30 p-4 rounded-lg border">
            <div className="text-sm">
              <p className="text-muted-foreground">Anticipo Total</p>
              <p className="font-semibold">${anticipo.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Saldo Disponible</p>
              <p className="font-semibold text-primary text-xl">${anticipo.balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className={`text-sm ${remainingBalance < 0 ? 'text-destructive' : 'text-foreground'}`}>
              <p className="text-muted-foreground">Saldo Restante</p>
              <p className="font-semibold">${remainingBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border bg-muted/10 items-center justify-between">
            <div>
              <p className="text-sm font-medium">Fecha de aplicación</p>
              <p className="text-[11px] text-muted-foreground">El pago se registrará en el ERP con esta fecha.</p>
            </div>
            <Input 
              type="date" 
              value={paymentDate} 
              onChange={e => setPaymentDate(e.target.value)}
              className="w-full sm:w-48 h-9"
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <h4 className="text-sm font-medium">Documentos Abiertos</h4>
              
              <div className="flex gap-2 w-full sm:w-auto">
                <Input 
                  placeholder="Buscar documento..." 
                  className="w-full sm:w-40 h-8 text-xs"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <select 
                  className="flex h-8 w-full sm:w-32 rounded-md border border-input bg-background px-3 py-1 text-xs outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={docTypeFilter}
                  onChange={e => setDocTypeFilter(e.target.value)}
                >
                  <option value="all">Todos los tipos</option>
                  <option value="invoice">Facturas</option>
                  <option value="remission">Remisiones</option>
                  <option value="order">Órdenes</option>
                </select>
              </div>
            </div>

            {loadingDocs ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 bg-muted/20 border rounded-md text-center">No hay documentos que coincidan con la búsqueda.</p>
            ) : (
              <div className="border rounded-md divide-y overflow-hidden max-h-60 overflow-y-auto">
                {filteredDocuments.map(doc => (
                 <div key={doc.id} className="p-4 flex items-center justify-between gap-4 bg-card">
                    <div>
                      <p className="font-medium text-sm flex items-center gap-2">
                        {doc.number}
                        <span className="text-[10px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {doc.type}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">Saldo Doc: ${doc.balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Monto a aplicar:</span>
                      <Input 
                        type="number" 
                        min="0"
                        max={Math.min(doc.balance, anticipo.balance)}
                        step="0.01"
                        className="w-32"
                        placeholder="0.00"
                        value={applications[doc.id] || ""}
                        onChange={(e) => handleApplyChange(doc.id, e.target.value)}
                      />
                    </div>
                 </div> 
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isApplying}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canApply || isApplying || loadingDocs}>
            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aplicar Pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
