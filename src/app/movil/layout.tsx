"use client";

import React from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, LogOut, Smartphone } from "lucide-react";
import Link from "next/link";

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
        <p className="mt-4 text-sm text-slate-400 font-medium">Cargando interfaz móvil...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-0 overflow-x-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Dynamic Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[150px] rounded-full" />
      </div>

      {/* Main Container - Simple centered responsive app */}
      <div className="relative z-10 w-full max-w-md h-screen bg-slate-900 md:shadow-2xl overflow-hidden flex flex-col">
        
        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {children}
        </div>

      </div>
    </div>
  );
}
