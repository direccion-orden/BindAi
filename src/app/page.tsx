"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  BarChart3, 
  Boxes, 
  Calculator, 
  Receipt, 
  ShieldCheck, 
  Zap, 
  LogIn, 
  CheckCircle2, 
  Workflow,
  Laptop
} from "lucide-react";

export default function HomePage() {
  const { user, signInWithGoogle, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const handleAuth = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 selection:bg-indigo-500/30 font-sans overflow-x-hidden">
      
      {/* Decorative background gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full mix-blend-screen" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full mix-blend-screen" />
      </div>

      {/* Navbar */}
      <header className="relative z-10 border-b border-white/10 bg-slate-950/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl">
              <Workflow className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              BusinessFlow
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Características</a>
            <a href="#benefits" className="hover:text-white transition-colors">Beneficios</a>
            <a href="#pricing" className="hover:text-white transition-colors">Planes</a>
          </nav>

          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              className="hidden md:flex text-slate-300 hover:text-white hover:bg-white/5"
              onClick={handleAuth}
              disabled={loading}
            >
              Iniciar Sesión
            </Button>
            <Button 
              className="bg-white text-slate-950 hover:bg-slate-200 font-semibold gap-2 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.25)]"
              onClick={handleAuth}
              disabled={loading}
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Comenzar Gratis</span>
              <span className="sm:hidden">Entrar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-24 pb-32 px-6 flex flex-col items-center text-center max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8">
            <Zap className="w-4 h-4" />
            <span>La nueva era del software empresarial</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
            ERP y Finanzas <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              Inteligentemente Integradas.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-3xl mb-12 leading-relaxed">
            Sincroniza directamente con el SAT, controla tus inventarios en múltiples sucursales, 
            gestiona tus ventas en mostrador y automatiza tu contabilidad sin esfuerzo.
            Todo en una sola plataforma rápida y hermosa.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
            <Button 
              size="lg" 
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white h-14 px-8 text-lg font-semibold rounded-full shadow-[0_0_40px_rgba(79,70,229,0.3)] hover:shadow-[0_0_60px_rgba(79,70,229,0.5)] transition-all"
              onClick={handleAuth}
              disabled={loading}
            >
              Crea tu Cuenta Empresa
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>

          {/* Hero Dashboard Preview */}
          <div className="mt-20 w-full max-w-5xl aspect-video rounded-xl bg-slate-900/50 border border-white/10 shadow-2xl overflow-hidden relative backdrop-blur-sm flex items-center justify-center group">
             <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10" />
             <div className="absolute top-4 left-4 flex gap-2 z-20">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
             </div>
             {/* Mockup UI lines */}
             <div className="w-full h-full p-8 pt-16 flex gap-6 opacity-60 group-hover:opacity-100 transition-opacity duration-700">
                <div className="w-64 h-full bg-white/5 rounded-lg border border-white/5 p-4 flex flex-col gap-4">
                   <div className="w-full h-8 bg-white/10 rounded" />
                   <div className="w-3/4 h-4 bg-white/5 rounded" />
                   <div className="w-5/6 h-4 bg-white/5 rounded" />
                   <div className="w-4/6 h-4 bg-white/5 rounded" />
                </div>
                <div className="flex-1 h-full flex flex-col gap-6">
                   <div className="w-full h-32 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl border border-white/5" />
                   <div className="w-full flex-1 bg-white/5 rounded-xl border border-white/5 flex gap-4 p-4">
                      <div className="flex-1 h-full bg-white/5 rounded" />
                      <div className="flex-1 h-full bg-white/5 rounded" />
                   </div>
                </div>
             </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-slate-900/30 border-y border-white/5">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Todo lo que necesitas para operar</h2>
              <p className="text-slate-400 max-w-2xl mx-auto">Reemplaza múltiples herramientas fragmentadas por un ecosistema unificado diseñado para la eficiencia.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mb-6">
                  <Receipt className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Sincronización SAT</h3>
                <p className="text-slate-400 leading-relaxed">
                  Descarga masiva de comprobantes XML, validación de estatus (vigente/cancelado) y lectura automática de metadatos.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center mb-6">
                  <Calculator className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Contabilidad Automática</h3>
                <p className="text-slate-400 leading-relaxed">
                  Catálogo agrupador oficial del SAT. Generación de pólizas de ingresos y egresos al asociar pagos con un clic.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center mb-6">
                  <Boxes className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Inventarios Inteligentes</h3>
                <p className="text-slate-400 leading-relaxed">
                  Control multisucursal, generación de códigos de barras, y sistema avanzado de reposición basado en metodología DDMRP.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-xl flex items-center justify-center mb-6">
                  <Laptop className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Punto de Venta (POS)</h3>
                <p className="text-slate-400 leading-relaxed">
                  Módulo de caja ultra-rápido compatible con lectores de códigos de barras, impresión térmica de tickets e ingresos en efectivo.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center mb-6">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Reportes Financieros</h3>
                <p className="text-slate-400 leading-relaxed">
                  Visualiza el flujo de efectivo, cuentas por cobrar, cuentas por pagar y la salud financiera de tu negocio en tiempo real.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-pink-500/10 text-pink-400 rounded-xl flex items-center justify-center mb-6">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Multi-Empresa & Seguridad</h3>
                <p className="text-slate-400 leading-relaxed">
                  Maneja múltiples empresas desde una sola cuenta con entornos de datos aislados y reglas de seguridad robustas (Firestore).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Benefits List */}
        <section id="benefits" className="py-24">
          <div className="max-w-4xl mx-auto px-6">
            <div className="flex flex-col md:flex-row gap-12 items-center">
              <div className="flex-1">
                <h2 className="text-3xl font-bold mb-6">Despídete del Excel y la captura manual</h2>
                <p className="text-slate-400 mb-8 text-lg">
                  BusinessFlow está diseñado para ahorrar decenas de horas semanales automatizando las tareas repetitivas y evitando los errores humanos.
                </p>
                <ul className="space-y-4">
                  {[
                    "Cero instalación, software 100% en la nube",
                    "Ahorra horas en conciliaciones bancarias",
                    "Evita multas al cruzar tu información con el SAT",
                    "Tu equipo trabajando en simultáneo sin conflictos"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-6 h-6 text-indigo-400 shrink-0" />
                      <span className="text-slate-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 w-full bg-gradient-to-br from-indigo-900/40 to-purple-900/40 p-8 rounded-3xl border border-white/10">
                <div className="space-y-4">
                  <div className="w-full h-12 bg-white/5 rounded-lg flex items-center px-4 gap-4 animate-pulse">
                     <div className="w-6 h-6 rounded-full bg-emerald-500/50" />
                     <div className="flex-1 h-3 bg-white/10 rounded" />
                  </div>
                  <div className="w-full h-12 bg-white/5 rounded-lg flex items-center px-4 gap-4 animate-pulse" style={{ animationDelay: '150ms' }}>
                     <div className="w-6 h-6 rounded-full bg-emerald-500/50" />
                     <div className="w-3/4 h-3 bg-white/10 rounded" />
                  </div>
                  <div className="w-full h-12 bg-white/5 rounded-lg flex items-center px-4 gap-4 animate-pulse" style={{ animationDelay: '300ms' }}>
                     <div className="w-6 h-6 rounded-full bg-emerald-500/50" />
                     <div className="w-5/6 h-3 bg-white/10 rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-indigo-600/10 mix-blend-screen" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-[400px] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Acelera el crecimiento de tu empresa hoy</h2>
            <p className="text-xl text-indigo-200 mb-10 max-w-2xl mx-auto">
              Únete a las empresas que ya simplificaron su operación. Abre tu cuenta en segundos usando tu perfil de Google.
            </p>
            <Button 
              size="lg" 
              className="bg-white text-indigo-950 hover:bg-slate-100 h-14 px-10 text-lg font-bold rounded-full shadow-2xl transition-transform hover:scale-105"
              onClick={handleAuth}
              disabled={loading}
            >
              Comenzar Ahora Mismo
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950 pt-16 pb-8 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Workflow className="w-5 h-5 text-indigo-500" />
            <span className="font-bold text-lg">BusinessFlow</span>
          </div>
          <div className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} BusinessFlow. Todos los derechos reservados.
          </div>
          <div className="flex gap-4 text-sm text-slate-400">
            <a href="#" className="hover:text-white transition-colors">Términos</a>
            <a href="#" className="hover:text-white transition-colors">Privacidad</a>
            <a href="#" className="hover:text-white transition-colors">Contacto</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
