"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Receipt, FileText, Calculator, ShoppingCart, Banknote, LineChart } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const categories = [
    {
      title: "Finanzas",
      icon: Calculator,
      items: [
        { href: "/dashboard", label: "Anticipos", icon: Receipt },
        { href: "/estado-cuenta", label: "Estados de Cuenta", icon: FileText },
        { href: "/flujo-efectivo", label: "Flujo de Efectivo", icon: LineChart },
      ]
    },
    {
      title: "Ventas",
      icon: ShoppingCart,
      items: [
        { href: "/caja", label: "Control de Caja", icon: Banknote },
      ]
    }
  ];

  return (
    <aside className="w-64 border-r bg-card min-h-[calc(100vh-4rem)] sticky top-16 hidden md:flex flex-col overflow-y-auto">
      <div className="flex-1 py-6 px-4 space-y-8">
        {categories.map((cat, idx) => (
          <div key={idx} className="space-y-3">
            <div className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <cat.icon className="w-4 h-4" />
              <span>{cat.title}</span>
            </div>
            {cat.items.length > 0 ? (
              <nav className="space-y-1">
                {cat.items.map((item) => {
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                  return (
                    <Link key={item.href} href={item.href}>
                      <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        isActive 
                          ? "bg-accent/15 text-accent font-medium shadow-sm" 
                          : "text-foreground hover:bg-muted"
                      }`}>
                        <item.icon className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-muted-foreground'}`} />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </nav>
            ) : (
              <div className="px-4 py-2 text-xs text-muted-foreground/60 italic border border-dashed rounded-md bg-muted/20">
                Pronto habrá nuevas funciones...
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
