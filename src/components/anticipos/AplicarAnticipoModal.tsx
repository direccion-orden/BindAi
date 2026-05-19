"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { ErpDocument } from "@/app/actions/erp";
import { doc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
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
      // 1. Obtener directo de Bind ERP vía API interna
      const resDocs = await fetch(`/api/erp/documents?clientId=${anticipo.clientId}`);
      let docs: ErpDocument[] = await resDocs.json();

      // 2. Localizar aplicaciones "Ciegas" en la base de datos de los Anticipos existentes
      if (!companyId) return;
      const q = query(collection(db, "companies", companyId, "anticipos"), where("clientId", "==", anticipo.clientId));
      const snaps = await getDocs(q);
      
      const blindDeductions: Record<string, number> = {};
      snaps.forEach(snap => {
        const aData = snap.data();
        if (aData.applications) {
          aData.applications.forEach((app: any) => {
            // SÓLO descontamos Órdenes ciegas. (Bind ERP descuenta las Facturas/Remisiones nativamente en vivo)
            if (app.erpDocumentType === "Order") {
               blindDeductions[app.erpDocumentId] = (blindDeductions[app.erpDocumentId] || 0) + app.amount;
            }
          });
        }
      });

      // 3. Ajustar los saldos de los documentos tipo "Order" y filtrar los ya pagados
      docs = docs.map(d => {
        if (d.type === "Order" && blindDeductions[d.id]) {
           d.balance -= blindDeductions[d.id];
        }
        return d;
      }).filter(d => d.balance > 0.01);

      setDocuments(docs);
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
      // Por cada documento donde hay un monto, enviarlo al ERP (o al Flujo Ciego)
      const docsToApply = Object.entries(applications).filter(([_, amount]) => amount > 0);
      const newApplications = [];
      
      for (const [docId, amount] of docsToApply) {
        const docObj = documents.find(d => d.id === docId);
        const payload = {
          documentId: docId,
          docType: docObj?.type || "Unknown",
          amount: amount,
          bankAccountId: anticipo.bankAccountId || "CUENTA_MOCK",
          paymentTerm: anticipo.paymentTermId || 3,
          reference: `Anticipo de ${anticipo.clientName}`,
          date: paymentDate
        };

        const resApply = await fetch('/api/erp/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        const result = await resApply.json();

        if (result && result.success === false) {
          throw new Error(result.error || "Falla al aplicar pago en ERP");
        }

        // Tracking paramétrico para el Dashboard y Flujo Ciego
        newApplications.push({
          erpDocumentId: docId,
          erpDocumentNumber: docObj?.number || "Doc Desconocido",
          erpDocumentType: docObj?.type || "Unknown",
          amount: amount,
          appliedAt: new Date().toISOString()
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

      if (!companyId) throw new Error("No company ID");
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
      alert("Hubo un error al aplicar el anticipo al ERP.");
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
              <p className="font-semibold">${anticipo.amount.toFixed(2)}</p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Saldo Disponible</p>
              <p className="font-semibold text-primary text-xl">${anticipo.balance.toFixed(2)}</p>
            </div>
            <div className={`text-sm ${remainingBalance < 0 ? 'text-destructive' : 'text-foreground'}`}>
              <p className="text-muted-foreground">Saldo Restante</p>
              <p className="font-semibold">${remainingBalance.toFixed(2)}</p>
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
              <h4 className="text-sm font-medium">Documentos Abiertos (ERP)</h4>
              
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
                      <p className="text-sm text-muted-foreground">Saldo Doc: ${doc.balance.toFixed(2)}</p>
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
