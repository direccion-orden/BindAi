"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Store } from "lucide-react";

export default function OnboardingPage() {
  const { user, companyId, loading } = useAuth();
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
    if (!loading && companyId) {
      router.push("/punto-de-venta");
    }
  }, [user, companyId, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !user) return;

    setSaving(true);
    try {
      // 1. Create Company
      const newCompanyId = crypto.randomUUID();
      await setDoc(doc(db, "companies", newCompanyId), {
        name: companyName,
        createdAt: serverTimestamp(),
        ownerId: user.uid,
        status: "ACTIVE"
      });

      // 2. Assign user to company
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        name: user.displayName,
        companyId: newCompanyId,
        role: "OWNER",
        createdAt: serverTimestamp()
      }, { merge: true });

      // Force a full page reload so AuthContext refetches the user profile and companyId
      window.location.href = "/punto-de-venta";
    } catch (error) {
      console.error("Error creating company:", error);
      alert("Error al crear la empresa");
      setSaving(false);
    }
  };

  if (loading || !user || companyId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card border rounded-2xl shadow-xl p-8 space-y-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="mx-auto w-16 h-16 bg-primary/10 flex items-center justify-center rounded-full mb-2">
          <Store className="w-8 h-8 text-primary" />
        </div>
        
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bienvenido a la plataforma</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Para comenzar a usar el sistema, por favor registra el nombre de tu empresa o negocio.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2 text-left">
            <label className="text-sm font-semibold">Nombre del negocio</label>
            <Input 
              placeholder="Ej. Abarrotes La Esperanza"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="h-12 text-lg"
              autoFocus
              required
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-lg font-bold"
            disabled={saving || !companyName.trim()}
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Creando tu espacio...
              </>
            ) : (
              "Comenzar a vender"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
