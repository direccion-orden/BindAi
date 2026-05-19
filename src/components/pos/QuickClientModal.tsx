"use client";

import { useState } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Client } from "@/components/pos/ClientSelector";

interface QuickClientModalProps {
  onClose: () => void;
  onClientCreated: (client: Client) => void;
  initialSearch: string;
}

export function QuickClientModal({ onClose, onClientCreated, initialSearch }: QuickClientModalProps) {
  const { companyId } = useAuth();
  const [name, setName] = useState(initialSearch || "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError("Nombre y celular son requeridos.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newClientData = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        rfc: "XAXX010101000", // Default público general para ventas rápidas
        points: 0,
        walletBalance: 0,
        preferences: "",
        createdAt: serverTimestamp(),
        isActive: true
      };

      if (!companyId) throw new Error("No company ID");
      const docRef = await addDoc(collection(db, "companies", companyId, "clients"), newClientData);
      
      onClientCreated({
        id: docRef.id,
        name: newClientData.name,
        phone: newClientData.phone,
        email: newClientData.email,
        rfc: newClientData.rfc,
        points: newClientData.points,
        walletBalance: newClientData.walletBalance,
        preferences: newClientData.preferences
      });

    } catch (err) {
      console.error(err);
      setError("Error al crear el cliente. Intenta de nuevo.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-md rounded-xl shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
          <h2 className="font-semibold flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Alta Rápida de Cliente
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-2 rounded border border-destructive/20">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Nombre Completo *</label>
            <input 
              autoFocus
              type="text" 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ej. Juan Pérez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Celular (WhatsApp) *</label>
            <input 
              type="tel" 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="10 dígitos"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Correo Electrónico (Opcional)</label>
            <input 
              type="email" 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="juan@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="pt-2 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar y Asignar
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
