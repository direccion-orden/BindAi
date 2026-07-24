"use client";

import { useState, useEffect } from "react";
import { X, UserPlus, Loader2 } from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
interface Client {
  id: string;
  name?: string;
  LegalName?: string;
  CommercialName?: string;
  ClientName?: string;
  rfc?: string;
  RFC?: string;
  email?: string;
  Email?: string;
  phone?: string;
  Phone?: string;
  points?: number;
  walletBalance?: number;
  preferences?: string;
}

interface QuickClientModalProps {
  onClose: () => void;
  onClientCreated: (client: any) => void;
  initialSearch: string;
  existingClients?: any[];
}


const normalizeString = (str: string) => 
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function QuickClientModal({ onClose, onClientCreated, initialSearch, existingClients = [] }: QuickClientModalProps) {
  const { companyId } = useAuth();
  
  const [type, setType] = useState<'general' | 'fiscal'>('general');
  const [firstName, setFirstName] = useState(initialSearch || "");
  const [paternalLastName, setPaternalLastName] = useState("");
  const [maternalLastName, setMaternalLastName] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [commercialName, setCommercialName] = useState("");
  
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [creditDays, setCreditDays] = useState<number | "">(0);
  const [creditLimit, setCreditLimit] = useState<number | "">(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [similarClients, setSimilarClients] = useState<Client[]>([]);

  // Similarity Check
  useEffect(() => {
    const searchStr = type === 'general' 
      ? `${firstName} ${paternalLastName}`.trim()
      : razonSocial.trim();

    if (searchStr.length < 3 || existingClients.length === 0) {
      setSimilarClients([]);
      return;
    }

    const normalizedSearch = normalizeString(searchStr);
    const matches = existingClients.filter(c => {
      const displayName = c.name || c.LegalName || c.CommercialName || c.ClientName || "";
      const normalizedName = normalizeString(displayName);
      return normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName);
    }).slice(0, 3);


    setSimilarClients(matches);
  }, [firstName, paternalLastName, razonSocial, type, existingClients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalName = "";
    if (type === 'general') {
      if (!firstName.trim() || !paternalLastName.trim()) {
        setError("Nombre y Apellido Paterno son obligatorios.");
        return;
      }
      finalName = `${firstName.trim()} ${paternalLastName.trim()} ${maternalLastName.trim()}`.trim().toUpperCase();
    } else {
      if (!razonSocial.trim()) {
        setError("La Razón Social es obligatoria.");
        return;
      }
      finalName = razonSocial.trim().toUpperCase();
    }

    if (!phone.trim()) {
      setError("El teléfono es requerido.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newClientData = {
        type,
        firstName: type === 'general' ? firstName.trim().toUpperCase() : "",
        paternalLastName: type === 'general' ? paternalLastName.trim().toUpperCase() : "",
        maternalLastName: type === 'general' ? maternalLastName.trim().toUpperCase() : "",
        razonSocial: type === 'fiscal' ? razonSocial.trim().toUpperCase() : "",
        commercialName: commercialName.trim().toUpperCase(),
        name: finalName,
        phone: phone.trim(),
        email: email.trim(),
        rfc: type === 'fiscal' ? "" : "XAXX010101000",
        hasCreditLine: Boolean(Number(creditLimit) > 0 || Number(creditDays) > 0),
        creditDays: Number(creditDays || 0),
        creditLimit: Number(creditLimit || 0),
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
        hasCreditLine: newClientData.hasCreditLine,
        creditDays: newClientData.creditDays,
        creditLimit: newClientData.creditLimit,
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
        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-2 rounded border border-destructive/20">
              {error}
            </div>
          )}

          {/* TIPO SELECTOR */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
            <button
              type="button"
              onClick={() => setType('general')}
              className={`py-1.5 text-xs font-bold rounded-md transition-all ${type === 'general' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setType('fiscal')}
              className={`py-1.5 text-xs font-bold rounded-md transition-all ${type === 'fiscal' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Fiscal
            </button>
          </div>

          {type === 'general' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Nombre(s) *</label>
                <input 
                  autoFocus
                  type="text" 
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Ej. Juan"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Apellido Paterno *</label>
                <input 
                  type="text" 
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Ej. Pérez"
                  value={paternalLastName}
                  onChange={(e) => setPaternalLastName(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Apellido Materno</label>
                <input 
                  type="text" 
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Ej. García"
                  value={maternalLastName}
                  onChange={(e) => setMaternalLastName(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Razón Social *</label>
              <input 
                autoFocus
                type="text" 
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Ej. Empresa S.A. de C.V."
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                disabled={loading}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Nombre Comercial (Opcional)</label>
            <input 
              type="text" 
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ej. Mi Tiendita"
              value={commercialName}
              onChange={(e) => setCommercialName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* SIMILAR CLIENTS ALERT */}
          {similarClients.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 space-y-2 animate-in slide-in-from-top-2">
              <p className="text-[10px] font-bold text-orange-800 flex items-center gap-1.5">
                ⚠️ POSIBLES DUPLICADOS DETECTADOS:
              </p>
              <div className="space-y-1.5">
                {similarClients.map(c => (
                  <div 
                    key={c.id} 
                    className="text-[10px] text-orange-700 flex items-center justify-between bg-white/60 p-2 rounded border border-orange-100 cursor-pointer hover:bg-orange-200/50 hover:border-orange-300 transition-all group"
                    onClick={() => {
                      onClientCreated({
                        id: c.id,
                        name: c.name || c.LegalName || c.CommercialName || c.ClientName || "Sin nombre",
                        phone: c.phone || c.Phone || "",
                        email: c.email || c.Email || "",
                        rfc: c.rfc || c.RFC || "XAXX010101000",
                        points: c.points || 0,
                        walletBalance: c.walletBalance || 0,
                        preferences: c.preferences || ""
                      });
                    }}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold truncate max-w-[200px]">
                        {c.name || c.LegalName || c.CommercialName || c.ClientName || "Sin nombre"}
                      </span>
                      <span className="text-[8px] font-medium opacity-0 group-hover:opacity-100 transition-opacity text-orange-600">
                        Hacer clic para usar este cliente
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-medium">{c.phone || c.Phone || ""}</div>
                      <div className="opacity-70">{c.rfc || c.RFC || ""}</div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Celular *</label>
              <input 
                type="tel" 
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="10 dígitos"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-muted-foreground">Correo (Opcional)</label>
              <input 
                type="email" 
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="email@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-lg space-y-2">
            <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider block">Línea de Crédito (Opcional)</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="text-[9px] font-bold text-indigo-700">Días Crédito</label>
                <input
                  type="number"
                  min="0"
                  className="flex h-8 w-full rounded border border-indigo-200 bg-white px-2 py-1 text-xs"
                  placeholder="0"
                  value={creditDays}
                  onChange={(e) => setCreditDays(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
                  disabled={loading}
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-[9px] font-bold text-indigo-700">Límite Máximo ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="flex h-8 w-full rounded border border-indigo-200 bg-white px-2 py-1 text-xs"
                  placeholder="0.00"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value === "" ? "" : Math.max(0, parseFloat(e.target.value) || 0))}
                  disabled={loading}
                />
              </div>
            </div>
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
