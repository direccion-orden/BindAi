"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";

interface DetalleAnticipoModalProps {
  anticipo: any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DetalleAnticipoModal({ anticipo, isOpen, onOpenChange }: DetalleAnticipoModalProps) {
  const { companyId } = useAuth();
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [editingAppIndex, setEditingAppIndex] = useState<number | null>(null);
  const [editingAppAmount, setEditingAppAmount] = useState<string>("");

  useEffect(() => {
    if (anticipo) {
      setReference(anticipo.reference || "");
      setReceivedAt(anticipo.receivedAt || (anticipo.createdAt?.toDate ? anticipo.createdAt.toDate().toISOString().split("T")[0] : ""));
      setEditingAppIndex(null);
    }
  }, [anticipo]);

  const handleSave = async () => {
    if (!anticipo || !companyId) return;
    setIsSaving(true);
    try {
      const ref = doc(db, "companies", companyId, "anticipos", anticipo.id);
      await updateDoc(ref, {
        reference,
        receivedAt,
        updatedAt: new Date()
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating", error);
      alert("Hubo un error al guardar la información.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAnticipo = async () => {
    if (!confirm("¿Estás seguro de que deseas eliminar permanentemente este anticipo? Esta acción no se puede deshacer.")) return;
    if (!companyId) return;
    
    setIsUpdatingStatus(true);
    try {
      if (anticipo.imageUrl) {
        try {
          const imgRef = storageRef(storage, anticipo.imageUrl);
          await deleteObject(imgRef);
        } catch (storageErr) {
          console.error("Error al borrar de Storage (puede que no exista el archivo)", storageErr);
        }
      }
      await deleteDoc(doc(db, "companies", companyId, "anticipos", anticipo.id));
      onOpenChange(false);
    } catch (err) {
      console.error("Error eliminando anticipo", err);
      alert("Hubo un error al eliminar el anticipo.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelApplication = async (appIndex: number) => {
    const appToCancel = anticipo.applications[appIndex];
    if (appToCancel.erpDocumentType !== "Order") {
      if (!confirm("IMPORTANTE: Al cancelar esta aplicación revertiremos el saldo localmente para que puedas reasignarlo, pero deberás cancelarlo manualmente en Bind ERP ya que no hay integración de reversión automática. ¿Deseas continuar?")) {
        return;
      }
    } else {
      if (!confirm("¿Deseas cancelar esta aplicación a Pedido ciego?")) return;
    }
    if (!companyId) return;

    setIsUpdatingStatus(true);
    try {
      const newApps = [...anticipo.applications];
      newApps.splice(appIndex, 1);
      
      const revertedBalance = anticipo.balance + appToCancel.amount;
      const newStatus = revertedBalance === anticipo.amount ? "pending" : "partially_applied";

      await updateDoc(doc(db, "companies", companyId, "anticipos", anticipo.id), {
        applications: newApps,
        balance: revertedBalance,
        status: newStatus,
        updatedAt: new Date()
      });
    } catch(err) {
      console.error(err);
      alert("Ocurrió un error al cancelar la aplicación");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleEditAppSave = async (appIndex: number) => {
    const appToEdit = anticipo.applications[appIndex];
    const newAmount = parseFloat(editingAppAmount);

    if (isNaN(newAmount) || newAmount <= 0) {
      alert("Monto inválido"); return;
    }

    const maxAvailable = anticipo.balance + appToEdit.amount;
    if (newAmount > maxAvailable) {
      alert(`La aplicación no puede exceder el fondo disponible máximo ($${maxAvailable.toFixed(2)}).`);
      return;
    }

    if (appToEdit.erpDocumentType !== "Order") {
      if (!confirm(`IMPORTANTE: Modificaremos el saldo localmente de $${appToEdit.amount.toFixed(2)} a $${newAmount.toFixed(2)}. Deberás cuadrar y ajustar este nuevo monto manualmente en Bind ERP tú mismo. ¿Deseas continuar?`)) {
        return;
      }
    }
    if (!companyId) return;

    setIsUpdatingStatus(true);
    try {
      const delta = newAmount - appToEdit.amount;
      const newBalance = anticipo.balance - delta;
      
      const newApps = [...anticipo.applications];
      newApps[appIndex].amount = newAmount;

      const newStatus = newBalance <= 0 ? "applied" : "partially_applied";

      await updateDoc(doc(db, "companies", companyId, "anticipos", anticipo.id), {
        applications: newApps,
        balance: newBalance,
        status: newStatus,
        updatedAt: new Date()
      });

      setEditingAppIndex(null);
    } catch(err) {
      console.error(err);
      alert("Error al actualizar la aplicación");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  if (!anticipo) return null;

  const canDelete = !anticipo.applications || anticipo.applications.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Administrar Anticipo</DialogTitle>
          <DialogDescription>
            {anticipo.clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[65vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Folio</label>
              <Input className="h-8" disabled value={`ANT-${anticipo.folio ? String(anticipo.folio).padStart(4, '0') : anticipo.id.substring(0, 5).toUpperCase()}`} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Monto Original / Saldo</label>
              <Input className="h-8" disabled value={`$${anticipo.amount?.toFixed(2)} / $${anticipo.balance?.toFixed(2)}`} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Fecha de Recepción</label>
            <Input 
              className="h-8"
              type="date" 
              value={receivedAt} 
              onChange={e => setReceivedAt(e.target.value)} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Referencia</label>
            <Input 
              className="h-8"
              value={reference} 
              onChange={e => setReference(e.target.value)} 
              placeholder="Referencia" 
            />
          </div>

          {anticipo.applications && anticipo.applications.length > 0 && (
            <div className="pt-4 border-t space-y-3">
              <h4 className="text-sm font-semibold">Historial de Aplicaciones</h4>
              <div className="space-y-2">
                {anticipo.applications.map((app: any, idx: number) => (
                  <div key={idx} className="bg-muted p-3 rounded-md text-sm border shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-primary">{app.erpDocumentNumber}</span>
                      <span className="text-[10px] text-muted-foreground uppercase bg-secondary px-2 py-0.5 rounded-full">{app.erpDocumentType}</span>
                    </div>
                    
                    {editingAppIndex === idx ? (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-semibold">$</span>
                        <Input 
                          type="number" 
                          step="0.01" 
                          className="h-8 flex-1" 
                          value={editingAppAmount} 
                          onChange={e => setEditingAppAmount(e.target.value)} 
                        />
                        <Button size="sm" variant="ghost" onClick={() => setEditingAppIndex(null)}>X</Button>
                        <Button size="sm" onClick={() => handleEditAppSave(idx)} disabled={isUpdatingStatus}>OK</Button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center mt-2">
                        <span className="font-semibold text-lg">${app.amount.toFixed(2)}</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => {
                            setEditingAppIndex(idx);
                            setEditingAppAmount(app.amount.toString());
                          }} disabled={isUpdatingStatus}>
                            Editar
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={() => handleCancelApplication(idx)} disabled={isUpdatingStatus}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row justify-between w-full items-center gap-4 border-t pt-4">
          <div className="w-full sm:w-auto">
            {canDelete && (
                <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDeleteAnticipo} disabled={isUpdatingStatus || isSaving}>
                  {isUpdatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Eliminar Anticipo
                </Button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="ghost" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={isSaving || isUpdatingStatus}>
              Cerrar
            </Button>
            <Button className="flex-1 sm:flex-none" onClick={handleSave} disabled={isSaving || isUpdatingStatus}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
