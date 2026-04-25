"use client";

import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type TransactionCategory = "INGRESO_FONDO" | "RETIRO_FONDO" | "RETIRO_GASTO" | "RETIRO_CANCELACION";

interface TransaccionCajaModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  onSuccess: () => void;
}

export function TransaccionCajaModal({ isOpen, onClose, sessionId, onSuccess }: TransaccionCajaModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<TransactionCategory>("RETIRO_GASTO");
  const [amount, setAmount] = useState("");
  const [person, setPerson] = useState("");
  const [reference, setReference] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) return alert("Ingresa un monto válido");
    if (!person.trim()) return alert("Ingresa la persona que entrega/recibe");

    setLoading(true);
    try {
      const type = category === "INGRESO_FONDO" ? "INCOME" : "EXPENSE";
      
      const payload = {
        sessionId,
        type,
        category,
        amount: parseFloat(amount),
        person: person.trim(),
        reference: reference.trim(),
        paymentMethod: "CASH", // These are physical drawer movements
        createdAt: serverTimestamp(),
        createdBy: user?.email,
      };

      await addDoc(collection(db, "cash_transactions"), payload);
      onSuccess(); // Triggers a re-fetch of the session transactions
      onClose();   // Close modal
      
      // Reset form
      setAmount("");
      setPerson("");
      setReference("");
      setCategory("RETIRO_GASTO");
    } catch (error) {
      console.error(error);
      alert("Error al guardar el movimiento");
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (category) {
      case "INGRESO_FONDO": return "Ingreso de Moneda/Cambio";
      case "RETIRO_FONDO": return "Retiro de Valores (Depósito/Bóveda)";
      case "RETIRO_GASTO": return "Retiro por Gasto/Comisión";
      case "RETIRO_CANCELACION": return "Retiro por Cancelación de Venta";
      default: return "Movimiento de Caja";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Registrar Movimiento Físico</DialogTitle>
            <DialogDescription>
              Captura una entrada o salida de efectivo manual que no provenga de una venta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col space-y-1.5">
              <label className="text-sm font-medium">Tipo de Movimiento</label>
              <select 
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={category}
                onChange={(e) => setCategory(e.target.value as TransactionCategory)}
              >
                <option value="RETIRO_GASTO">Retiro por Gasto (Sueldos, Insumos)</option>
                <option value="RETIRO_FONDO">Retiro de Valores (Bóveda/Depósito)</option>
                <option value="RETIRO_CANCELACION">Retiro por Cancelación de Venta (Efectivo)</option>
                <option value="INGRESO_FONDO">Añadir Fondo (Morralla extra)</option>
              </select>
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <label className="text-sm font-medium">Monto ($)</label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <label className="text-sm font-medium">Entregó / Recibió (Persona)</label>
              <Input
                placeholder="Ej. Esmeralda, Humberto..."
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                required
              />
            </div>
            
            <div className="flex flex-col space-y-1.5">
              <label className="text-sm font-medium">Motivo / Referencia</label>
              <Input
                placeholder="Ej. Pago de comisiones, Compra de agua..."
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
