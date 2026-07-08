"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Receipt, FileText, Calculator, ShoppingCart, Banknote, LineChart, ChevronLeft, ChevronRight, ChevronDown, Vault, Package, Users, Tags, Truck, Barcode, ArrowRightLeft, ClipboardList, Boxes, Factory, Building2, DollarSign, BookOpen, Tag, Cpu, Printer, Newspaper, Target, PlusCircle, Layers, Warehouse, Smartphone, MessageCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Sidebar({ isMobileOpen, onCloseMobile }: { isMobileOpen?: boolean; onCloseMobile?: () => void }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [openCategories, setOpenCategories] = useState<string[]>([]);

  const effectiveCollapsed = isCollapsed && !isHovered;

  const toggleCategory = (title: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      if (!openCategories.includes(title)) {
         setOpenCategories([...openCategories, title]);
      }
      return;
    }
    if (openCategories.includes(title)) {
      setOpenCategories(openCategories.filter(t => t !== title));
    } else {
      setOpenCategories([...openCategories, title]);
    }
  };

  const categories = [
    {
      title: "Reportes (BI)",
      icon: LineChart,
      items: [
        { href: "/reportes/comercial", label: "Desempeño Comercial", icon: ShoppingCart },
        { href: "/reportes/financiero", label: "Salud Financiera", icon: Banknote },
      ]
    },
    {
      title: "Estrategia",
      icon: Target,
      items: [
        { href: "/planeacion-estrategica", label: "Planeación Estratégica", icon: TrendingUp },
        { href: "/ventas/metas", label: "Metas", icon: Target },
      ]
    },
    {
      title: "Compras y Gastos",
      icon: ShoppingCart,
      items: [
        { href: "/productos", label: "Productos", icon: Package },
        { href: "/proveedores", label: "Proveedores", icon: Truck },
        { href: "/compras/ordenes", label: "Órdenes de Compra", icon: FileText },
        { href: "/compras/recepciones", label: "Recepción de Mercancía", icon: Truck },
        { href: "/gastos", label: "Gastos (SAT)", icon: Receipt },
        { href: "/compras/gastos", label: "Crear Gastos", icon: PlusCircle },
        { href: "/gastos/pendientes", label: "Gastos Pendientes", icon: ClipboardList },
      ]
    },
    {
      title: "Ventas",
      icon: ShoppingCart,
      items: [
        { href: "/clientes", label: "Clientes", icon: Users },
        { href: "/ventas/proyectos", label: "Proyectos", icon: FileText },
        { href: "/ventas/cotizaciones", label: "Cotizaciones (CRM)", icon: FileText },
        { href: "/ventas/pedidos", label: "Pedidos", icon: Package },
        { href: "/ventas/remisiones", label: "Remisiones (Entregas)", icon: Truck },
        { href: "/ventas/facturas", label: "Facturación (CFDI)", icon: Receipt },
        { href: "/ventas/descuentos", label: "Descuentos", icon: Tag },
        { href: "/ventas/importar", label: "Importar Historial (Bind)", icon: ArrowRightLeft },
        { href: "/punto-de-venta", label: "Punto de Venta (POS)", icon: ShoppingCart },
      ]
    },
    {
      title: "Finanzas",
      icon: Calculator,
      items: [
        { href: "/bancos", label: "Bancos y Conciliación", icon: Building2 },
        { href: "/ingresos", label: "Ingresos", icon: DollarSign },
        { href: "/egresos", label: "Egresos", icon: Banknote },
        { href: "/anticipos", label: "Anticipos", icon: DollarSign },
        { href: "/estado-cuenta", label: "Estados de Cuenta", icon: FileText },
        { href: "/cuentas-cobrar", label: "Cuentas por Cobrar", icon: Receipt },
        { href: "/caja", label: "Control de Caja", icon: Banknote },
        { href: "/tesoreria", label: "Tesorería", icon: Vault },
        { href: "/flujo-efectivo", label: "Flujo de Efectivo", icon: LineChart },
      ]
    },
    {
      title: "Contabilidad",
      icon: BookOpen,
      items: [
        { href: "/contabilidad/catalogo", label: "Catálogo de Cuentas", icon: BookOpen },
        { href: "/contabilidad/polizas", label: "Pólizas", icon: FileText },
        { href: "/contabilidad/centros-costos", label: "Centros de Costos", icon: Layers },
      ]
    },
    {
      title: "Inventario",
      icon: Boxes,
      items: [
        { href: "/inventarios", label: "Dashboard", icon: LineChart, exact: true },
        { href: "/inventarios/existencias", label: "Existencias", icon: Warehouse },
        { href: "/inventarios/etiquetas", label: "Etiquetas", icon: Barcode },
        { href: "/inventarios/transferencias", label: "Transferencias", icon: Truck },
        { href: "/inventarios/movimientos", label: "Kárdex", icon: ClipboardList },
        { href: "/inventarios/ajustes", label: "Ajustes (Mermas)", icon: FileText },
        { href: "/inventarios/auditorias", label: "Auditorías (Conteos)", icon: Calculator },
        { href: "/inventarios/ddmrp", label: "Buffer DDMRP", icon: LineChart },
        { href: "/inventarios/produccion", label: "Producción", icon: Factory },
      ]
    },
    {
      title: "Estructura Organizacional",
      icon: Building2,
      items: [
        { href: "/configuracion/sucursales", label: "Sucursales", icon: Building2 },
        { href: "/configuracion/almacenes", label: "Almacenes", icon: Warehouse },
        { href: "/categorias", label: "Categorías", icon: Tags },
        { href: "/configuracion/lineas-negocio", label: "Líneas de Negocio", icon: Layers },
      ]
    },
    {
      title: "Configuración",
      icon: Receipt,
      items: [
        { href: "/configuracion/perfil", label: "Perfil de la Empresa", icon: FileText },
        { href: "/configuracion/cuentas", label: "Cuentas Bancarias", icon: Banknote },
        { href: "/catalogos/etapas-produccion", label: "Etapas Producción", icon: ClipboardList },
        { href: "/configuracion/dispositivos", label: "Dispositivos y Hardware", icon: Cpu },
        { href: "/configuracion/disenador-ticket", label: "Diseñador de Tickets", icon: Printer },
        { href: "/inventarios/etiquetas/formatos", label: "Diseñador de Etiquetas", icon: Tag },
        { href: "/configuracion/noticias", label: "Configurar Noticias", icon: Newspaper },
        { href: "/configuracion/shopify", label: "Integración Shopify", icon: ArrowRightLeft },
        { href: "/configuracion/whatsapp", label: "Bot de WhatsApp", icon: MessageCircle },
      ]
    }
  ];

  // Automatically open the category that matches the current path on mount
  useEffect(() => {
    const activeCategory = categories.find(cat => 
      cat.items.some((item: any) => 
        item.exact ? pathname === item.href : pathname === item.href || pathname?.startsWith(item.href + "/")
      )
    );
    if (activeCategory && !openCategories.includes(activeCategory.title)) {
      setOpenCategories(prev => [...prev, activeCategory.title]);
    }
  }, [pathname]);

  return (
    <>
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden" 
          onClick={onCloseMobile}
        />
      )}
      <aside 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed top-16 z-[60] md:z-[100] border-r bg-card/70 backdrop-blur-lg shadow-xl h-[calc(100vh-4rem)] md:translate-x-0 md:flex flex-col overflow-y-auto no-scrollbar transition-all duration-300 ease-in-out ${
        isMobileOpen ? "translate-x-0 w-64" : (effectiveCollapsed ? "w-16 -translate-x-full md:translate-x-0" : "w-64 -translate-x-full md:translate-x-0")
      }`}>
        
        {/* Toggle Buttons */}
        <div className="hidden md:flex items-center justify-between p-2 border-b">
          {!isCollapsed && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground hover:text-foreground h-8 px-2"
              onClick={() => {
                if (openCategories.length > 0) {
                  setOpenCategories([]);
                } else {
                  setOpenCategories(categories.map(c => c.title));
                }
              }}
              title={openCategories.length > 0 ? "Contraer todas las secciones" : "Expandir todas las secciones"}
            >
              {openCategories.length > 0 ? "Contraer Todo" : "Expandir Todo"}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex-1 py-6 px-3 space-y-8">
          {/* Top-Level Noticias Link */}
          <div className="space-y-1">
            <Link href="/dashboard" onClick={onCloseMobile}>
              <div className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                (pathname === "/dashboard" || pathname === "/")
                  ? "bg-accent/15 text-accent font-medium shadow-sm"
                  : "text-foreground hover:bg-muted"
              } ${effectiveCollapsed ? 'justify-center px-0' : 'gap-3'}`} title={effectiveCollapsed ? "Noticias" : undefined}>
                <Newspaper className={`h-5 w-5 ${(pathname === "/dashboard" || pathname === "/") ? 'text-accent' : 'text-muted-foreground'}`} />
                {!effectiveCollapsed && <span>Noticias</span>}
              </div>
            </Link>
          </div>

          {/* Top-Level Vista Móvil Link */}
          <div className="space-y-1">
            <Link href="/movil" onClick={onCloseMobile}>
              <div className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                pathname?.startsWith("/movil")
                  ? "bg-accent/15 text-accent font-medium shadow-sm"
                  : "text-foreground hover:bg-muted"
              } ${effectiveCollapsed ? 'justify-center px-0' : 'gap-3'}`} title={effectiveCollapsed ? "Vista Móvil" : undefined}>
                <Smartphone className={`h-5 w-5 ${pathname?.startsWith("/movil") ? 'text-accent' : 'text-muted-foreground'}`} />
                {!effectiveCollapsed && <span>Vista Móvil</span>}
              </div>
            </Link>
          </div>

          {categories.map((cat, idx) => {
          const isOpen = openCategories.includes(cat.title);
          const isCategoryActive = cat.items.some((item: any) => 
            item.exact ? pathname === item.href : pathname === item.href || pathname?.startsWith(item.href + "/")
          );
          return (
            <div key={idx} className="space-y-3">
              <div 
                className={`flex items-center gap-2 py-2 px-3 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors rounded-md ${
                  isCategoryActive
                    ? "bg-accent/15 text-accent shadow-sm font-bold"
                    : "text-foreground hover:bg-muted/50"
                } ${effectiveCollapsed ? 'justify-center px-0' : 'justify-between'}`}
                onClick={() => toggleCategory(cat.title)}
                title={effectiveCollapsed ? cat.title : undefined}
              >
                <div className="flex items-center gap-2">
                  {effectiveCollapsed ? <cat.icon className="w-4 h-4" /> : (
                    <>
                      <cat.icon className="w-4 h-4" />
                      <span>{cat.title}</span>
                    </>
                  )}
                </div>
                {!effectiveCollapsed && (
                  isOpen ? <ChevronDown className="w-4 h-4 opacity-50" /> : <ChevronRight className="w-4 h-4 opacity-50" />
                )}
              </div>
              
              {(isOpen || (isHovered && isCollapsed)) && (
                cat.items.length > 0 ? (
                  <nav className={`space-y-1 ${effectiveCollapsed ? "" : "pl-3"}`}>
                    {cat.items.map((item: any) => {
                      const isActive = item.exact 
                        ? pathname === item.href 
                        : pathname === item.href || pathname?.startsWith(item.href + "/");
                      return (
                        <Link key={item.href} href={item.href} onClick={() => {
                          onCloseMobile?.();
                          setIsCollapsed(true);
                          setIsHovered(false);
                        }}>
                          <div className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                            isActive 
                              ? "bg-accent/15 text-accent font-medium shadow-sm" 
                              : "text-foreground hover:bg-muted"
                          } ${effectiveCollapsed ? 'justify-center px-0' : 'gap-3'}`} title={effectiveCollapsed ? item.label : undefined}>
                            <item.icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-accent' : 'text-foreground/70'}`} />
                            {!effectiveCollapsed && <span>{item.label}</span>}
                          </div>
                        </Link>
                      );
                    })}
                  </nav>
                ) : (
                  !isCollapsed && (
                    <div className="px-4 py-2 text-xs text-muted-foreground/60 italic border border-dashed rounded-md bg-muted/20">
                      Pronto habrá nuevas funciones...
                    </div>
                  )
                )
              )}
            </div>
          );
        })}
      </div>
      </aside>
    </>
  );
}
