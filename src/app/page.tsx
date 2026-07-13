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
  Laptop,
  ShoppingBag,
  MessageSquare,
  Layers,
  Sparkles,
  RefreshCw,
  Building2
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
            <Sparkles className="w-4 h-4" />
            <span>La nueva era del software empresarial</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
            Operación, Inventario y Finanzas <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
              Inteligentemente Conectadas.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-3xl mb-12 leading-relaxed">
            Automatiza tu negocio con **BusinessFlow**. Sincroniza tus facturas del SAT, integra tus pedidos de Shopify,
            notifica a tus clientes vía WhatsApp, y gestiona tu inventario con metodologías avanzadas de DDMRP y producción.
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

          {/* Hero Dashboard Preview with Real Capabilities */}
          <div className="mt-20 w-full max-w-5xl aspect-video rounded-xl bg-slate-900/50 border border-white/10 shadow-2xl overflow-hidden relative backdrop-blur-sm flex flex-col group">
             {/* Window controls */}
             <div className="absolute top-4 left-4 flex gap-2 z-20">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
             </div>
             
             {/* Dashboard Mockup Grid */}
             <div className="w-full h-full p-8 pt-16 flex flex-col md:flex-row gap-6 opacity-80 group-hover:opacity-100 transition-opacity duration-700">
                {/* Sidebar */}
                <div className="w-full md:w-56 h-full bg-white/5 rounded-lg border border-white/5 p-4 flex flex-col gap-3 shrink-0">
                   <div className="w-full h-8 bg-indigo-500/20 rounded flex items-center px-3 gap-2">
                     <div className="w-2 h-2 rounded-full bg-indigo-400" />
                     <div className="w-2/3 h-3 bg-indigo-400/40 rounded" />
                   </div>
                   {[
                     "Ventas & Cotizaciones",
                     "Compras & XML SAT",
                     "Producción (BOM)",
                     "Inventario DDMRP",
                     "Conciliación Bancaria",
                     "Punto de Venta (POS)"
                   ].map((item, idx) => (
                     <div key={idx} className="w-full h-8 hover:bg-white/5 rounded flex items-center px-3 gap-2 transition-colors cursor-pointer">
                       <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                       <span className="text-[10px] font-bold text-slate-400">{item}</span>
                     </div>
                   ))}
                </div>

                {/* Main Content Pane */}
                <div className="flex-1 h-full flex flex-col gap-6">
                   {/* Metrics Cards */}
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     {[
                       { title: "Ventas Totales", val: "$1,842,950", color: "from-emerald-500/10 to-emerald-500/20", border: "border-emerald-500/20" },
                       { title: "Conciliado Bancos", val: "94.5%", color: "from-blue-500/10 to-blue-500/20", border: "border-blue-500/20" },
                       { title: "Pedidos Shopify", val: "384 órdenes", color: "from-indigo-500/10 to-indigo-500/20", border: "border-indigo-500/20" },
                       { title: "Salud Inventario", val: "Óptimo", color: "from-purple-500/10 to-purple-500/20", border: "border-purple-500/20" }
                     ].map((card, i) => (
                       <div key={i} className={`p-3 rounded-lg bg-gradient-to-br ${card.color} border ${card.border} text-left`}>
                         <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">{card.title}</span>
                         <h4 className="text-sm font-extrabold mt-1 text-slate-100">{card.val}</h4>
                       </div>
                     ))}
                   </div>

                   {/* Mockup chart & activity */}
                   <div className="flex-1 bg-white/5 rounded-xl border border-white/5 flex flex-col md:flex-row gap-4 p-4 text-left">
                      <div className="flex-1 h-full bg-white/5 rounded p-3 flex flex-col justify-between">
                         <span className="text-[10px] text-slate-400 font-bold">Proyección de Flujo de Efectivo</span>
                         <div className="w-full flex-1 flex items-end gap-1.5 mt-2">
                           {[20, 45, 30, 60, 40, 75, 55, 90, 65, 80, 50, 95].map((h, i) => (
                             <div key={i} className="flex-1 bg-indigo-500/30 hover:bg-indigo-500/60 rounded-t transition-all cursor-pointer" style={{ height: `${h}%` }} />
                           ))}
                         </div>
                      </div>
                      <div className="w-full md:w-64 h-full bg-white/5 rounded p-3 flex flex-col gap-2 overflow-hidden">
                         <span className="text-[10px] text-slate-400 font-bold">Actividad Reciente</span>
                         {[
                           { text: "XML SAT Procesado - Recibido de IMPRENTO MODO", time: "Hace 5m" },
                           { text: "Venta timbrada con Facturama (CFDI 4.0)", time: "Hace 15m" },
                           { text: "Stock sincronizado con Shopify de forma exitosa", time: "Hace 1h" },
                           { text: "Comprobante de pago cargado a Firebase Storage", time: "Hace 2h" }
                         ].map((act, i) => (
                           <div key={i} className="border-b border-white/5 pb-1.5 last:border-0">
                             <p className="text-[9px] font-bold text-slate-300 truncate">{act.text}</p>
                             <span className="text-[8px] text-slate-500">{act.time}</span>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-slate-900/30 border-y border-white/5">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Módulos avanzados e integrados</h2>
              <p className="text-slate-400 max-w-2xl mx-auto">Reemplaza múltiples sistemas aislados por un ecosistema empresarial cohesivo y de alta velocidad.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1: XML SAT Parser */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mb-6">
                  <Receipt className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Recepción de XML (SAT)</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Desglosa facturas CFDI 4.0 al instante. El sistema realiza auto-match por SKU/Nombre contra tu catálogo, asocia almacenes físicos y muestra visualmente las descripciones originales de conceptos no mapeados.
                </p>
              </div>

              {/* Feature 2: Manufacturing & BOM */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center mb-6">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Fórmulas y Producción (BOM)</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Gestiona recetas complejas de materiales e insumos. Emite órdenes de producción para realizar descuentos automáticos de componentes físicos de inventario y dar de alta de forma exacta producto terminado.
                </p>
              </div>

              {/* Feature 3: DDMRP Planning */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center mb-6">
                  <Boxes className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Metodología DDMRP</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Protege tu inventario con amortiguadores visuales dinámicos. Calcula de forma precisa tus puntos de reorden basándote en la demanda real y evita pérdidas por desabasto o sobre-inventarios.
                </p>
              </div>

              {/* Feature 4: E-Commerce Shopify */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-purple-500/10 text-purple-400 rounded-xl flex items-center justify-center mb-6">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Integración Shopify</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Sincronización bidireccional automática. Importa tus pedidos y clientes en tiempo real a través de Webhooks nativos y mantén alineadas las existencias del almacén físico con tu tienda en línea.
                </p>
              </div>

              {/* Feature 5: WhatsApp Notifications */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center mb-6">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">WhatsApp & Notificaciones</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Envía cotizaciones en PDF, remisiones, tickets térmicos e información de entrega directo al celular del cliente por WhatsApp Business. Atiende dudas con nuestro chatbot inteligente integrado.
                </p>
              </div>

              {/* Feature 6: Treasury & Credit Card */}
              <div className="bg-slate-900/50 border border-white/10 p-8 rounded-2xl hover:bg-slate-800/50 transition-colors">
                <div className="w-12 h-12 bg-pink-500/10 text-pink-400 rounded-xl flex items-center justify-center mb-6">
                  <Calculator className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">Tesorería & Tarjetas de Crédito</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Conciliación rápida de cuentas y tarjetas de crédito (con inversión lógica de cargos y abonos automática). Registro inmediato de pagos en cotizaciones con comprobantes guardados en Firebase Storage.
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
                <p className="text-slate-400 mb-8 text-lg font-medium leading-relaxed">
                  BusinessFlow está diseñado para ahorrar decenas de horas semanales automatizando los flujos contables, financieros e inventarios de tu organización.
                </p>
                <ul className="space-y-4">
                  {[
                    "Cero instalación, software SaaS en la nube rápido y hermoso",
                    "Pólizas contables generadas automáticamente por transacción",
                    "Carga y validación directa con las directrices y catálogos del SAT",
                    "Seguridad multi-empresa con aislamiento de datos en Firebase Storage",
                    "Punto de venta y diseño/emisión de tickets integrado"
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0 mt-1" />
                      <span className="text-slate-300 text-sm font-semibold">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex-1 w-full bg-gradient-to-br from-indigo-900/40 to-purple-900/40 p-8 rounded-3xl border border-white/10">
                <div className="space-y-4 text-left">
                  <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Operación Fluida</span>
                    <p className="text-xs text-slate-300 mt-1 font-semibold">"Sincronizar las facturas del SAT nos ha permitido realizar entradas de mercancía de forma inmediata en nuestros tres almacenes."</p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg border border-white/5" style={{ animationDelay: '150ms' }}>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Integración E-Commerce</span>
                    <p className="text-xs text-slate-300 mt-1 font-semibold">"Nuestra tienda en Shopify está totalmente vinculada al almacén físico del ERP. Ya no hay errores de stock."</p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg border border-white/5" style={{ animationDelay: '300ms' }}>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Contabilidad al Día</span>
                    <p className="text-xs text-slate-300 mt-1 font-semibold">"Las pólizas contables automáticas le ahorran semanas de trabajo a nuestro departamento fiscal."</p>
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
            <p className="text-xl text-indigo-200 mb-10 max-w-2xl mx-auto leading-relaxed">
              Únete a las empresas que ya simplificaron su operación con BusinessFlow. Abre tu cuenta de forma inmediata con Google.
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
