"use client";
 
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Store, Users, ArrowLeft, Building2 } from "lucide-react";

export default function OnboardingPage() {
  const { user, companyId, loading } = useAuth();
  const router = useRouter();
  
  // Onboarding flow: 'select' | 'create' | 'join'
  const [onboardingMode, setOnboardingMode] = useState<"select" | "create" | "join">("select");
  
  // Create mode state
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);

  // Join mode state
  const [inputCompanyId, setInputCompanyId] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
    if (!loading && companyId) {
      router.push("/punto-de-venta");
    }
  }, [user, companyId, loading, router]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !user) return;

    setSaving(true);
    try {
      // 1. Create Company
      const newCompanyId = crypto.randomUUID();
      await setDoc(doc(db, "companies", newCompanyId), {
        name: companyName.trim(),
        createdAt: serverTimestamp(),
        ownerId: user.uid,
        status: "ACTIVE"
      });

      // 2. Assign user to company as OWNER
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        name: user.displayName,
        companyId: newCompanyId,
        role: "OWNER",
        createdAt: serverTimestamp()
      }, { merge: true });

      // Force reload so AuthContext captures the new profile
      window.location.href = "/punto-de-venta";
    } catch (error) {
      console.error("Error creating company:", error);
      alert("Error al crear la empresa");
      setSaving(false);
    }
  };

  const handleJoinCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = inputCompanyId.trim();
    if (!cleanId || !user) return;

    setJoining(true);
    try {
      // 1. Verify if the company exists
      const companyDocSnap = await getDoc(doc(db, "companies", cleanId));
      
      if (!companyDocSnap.exists()) {
        alert("No se encontró ninguna empresa con el ID proporcionado. Por favor, solicita el ID correcto al administrador de tu empresa.");
        setJoining(false);
        return;
      }

      const companyData = companyDocSnap.data();

      // 2. Assign user to company as EMPLOYEE
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        name: user.displayName,
        companyId: cleanId,
        role: "EMPLOYEE",
        createdAt: serverTimestamp()
      }, { merge: true });

      alert(`Te has unido con éxito a la empresa "${companyData.name || "Negocio"}".`);
      // Force reload so AuthContext captures the new profile
      window.location.href = "/punto-de-venta";
    } catch (error) {
      console.error("Error joining company:", error);
      alert("Error al intentar unirse a la empresa");
      setJoining(false);
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
      
      {/* 1. SELECCIÓN DE FLUJO */}
      {onboardingMode === "select" && (
        <div className="w-full max-w-2xl bg-card border rounded-2xl shadow-xl p-8 space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 flex items-center justify-center rounded-full mb-2">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Configura tu espacio de trabajo</h1>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Para comenzar, elige si vas a registrar una nueva empresa o si te vas a unir a una empresa ya registrada.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            
            {/* Opción A: Crear nueva */}
            <div 
              onClick={() => setOnboardingMode("create")}
              className="group border border-border hover:border-indigo-500/80 bg-card/50 hover:bg-indigo-50/10 rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md flex flex-col items-center justify-between space-y-4"
            >
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Store className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Registrar Nueva Empresa</h3>
                <p className="text-xs text-muted-foreground px-2">
                  Crea un espacio de trabajo desde cero para tu negocio. Serás el administrador principal.
                </p>
              </div>
              <Button type="button" variant="secondary" className="w-full group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                Crear Empresa
              </Button>
            </div>

            {/* Opción B: Unirse a existente */}
            <div 
              onClick={() => setOnboardingMode("join")}
              className="group border border-border hover:border-emerald-500/80 bg-card/50 hover:bg-emerald-50/10 rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md flex flex-col items-center justify-between space-y-4"
            >
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Unirse a Empresa Existente</h3>
                <p className="text-xs text-muted-foreground px-2">
                  Ingresa con el ID de invitación de una empresa ya creada para colaborar en su catálogo y ventas.
                </p>
              </div>
              <Button type="button" variant="secondary" className="w-full group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                Unirme a una Empresa
              </Button>
            </div>

          </div>
        </div>
      )}

      {/* 2. REGISTRAR NUEVA EMPRESA */}
      {onboardingMode === "create" && (
        <div className="w-full max-w-md bg-card border rounded-2xl shadow-xl p-8 space-y-6 text-center animate-in fade-in slide-in-from-bottom duration-300">
          <button 
            onClick={() => setOnboardingMode("select")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold transition"
          >
            <ArrowLeft className="w-4 h-4" /> Regresar
          </button>
          
          <div className="space-y-2">
            <div className="mx-auto w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center rounded-full mb-1">
              <Store className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Registra tu empresa</h1>
            <p className="text-muted-foreground text-sm">
              Escribe el nombre de tu negocio para inicializar tus catálogos.
            </p>
          </div>

          <form onSubmit={handleCreateCompany} className="space-y-4 pt-2">
            <div className="space-y-2 text-left">
              <label className="text-sm font-semibold">Nombre del negocio</label>
              <Input 
                placeholder="Ej. Abarrotes La Esperanza"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="h-12 text-base font-medium"
                autoFocus
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={saving || !companyName.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creando espacio...
                </>
              ) : (
                "Comenzar negocio"
              )}
            </Button>
          </form>
        </div>
      )}

      {/* 3. UNIRSE A EMPRESA EXISTENTE */}
      {onboardingMode === "join" && (
        <div className="w-full max-w-md bg-card border rounded-2xl shadow-xl p-8 space-y-6 text-center animate-in fade-in slide-in-from-bottom duration-300">
          <button 
            onClick={() => setOnboardingMode("select")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold transition"
          >
            <ArrowLeft className="w-4 h-4" /> Regresar
          </button>
          
          <div className="space-y-2">
            <div className="mx-auto w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center rounded-full mb-1">
              <Users className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Únete a tu equipo</h1>
            <p className="text-muted-foreground text-sm">
              Escribe el ID único de la empresa a la que deseas ingresar.
            </p>
          </div>

          <form onSubmit={handleJoinCompany} className="space-y-4 pt-2">
            <div className="space-y-2 text-left">
              <label className="text-sm font-semibold">ID de la Empresa *</label>
              <Input 
                placeholder="Pegar el ID aquí..."
                value={inputCompanyId}
                onChange={(e) => setInputCompanyId(e.target.value)}
                className="h-12 text-sm font-mono"
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground">Solicita este ID al dueño o administrador principal de tu empresa (lo puede encontrar en Configuración &rarr; Perfil).</p>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={joining || !inputCompanyId.trim()}
            >
              {joining ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Vinculando cuenta...
                </>
              ) : (
                "Unirse a la Empresa"
              )}
            </Button>
          </form>
        </div>
      )}

    </div>
  );
}
