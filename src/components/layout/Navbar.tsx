"use client";

import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Image from "next/image";

export function Navbar() {
  const { user, logOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Image 
            src="/logo.svg" 
            alt="Logo Orden de las Cosas" 
            width={160} 
            height={40} 
            className="w-auto h-8 dark:invert" 
            priority
          />
        </div>
        
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground hidden md:inline-block">
              {user.email}
            </span>
            <Button variant="outline" size="sm" onClick={logOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline-block">Cerrar Sesión</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

