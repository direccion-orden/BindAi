"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Wallet, 
  Receipt, 
  Battery, 
  Wifi, 
  Signal, 
  ChevronLeft, 
  Settings, 
  MessageCircle,
  HelpCircle,
  Home,
  User,
  Activity,
  LogOut,
  FolderOpen
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function MobileDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      setTime(`${hours}:${minutes} ${ampm}`);
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col justify-between relative bg-gradient-to-br from-indigo-900 via-slate-900 to-purple-950 p-6 select-none overflow-hidden h-full">
      
      {/* Dynamic Background Circles */}
      <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-indigo-500/20 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-[-100px] left-[-100px] w-80 h-80 bg-purple-500/20 blur-3xl rounded-full pointer-events-none" />

      {/* Top Status Bar */}
      <div className="flex items-center justify-between text-xs font-semibold text-slate-300 relative z-20 pt-1">
        <span>{time || "12:00 PM"}</span>
        <div className="flex items-center gap-1.5">
          <Signal className="w-3.5 h-3.5 fill-current" />
          <Wifi className="w-3.5 h-3.5" />
          <div className="flex items-center gap-0.5">
            <Battery className="w-4 h-4 rotate-0" />
            <span className="text-[10px]">88%</span>
          </div>
        </div>
      </div>

      {/* Greeting Header */}
      <div className="mt-8 text-left relative z-20">
        <h2 className="text-2xl font-bold tracking-tight text-white">
          Hola, {user?.displayName?.split(" ")[0] || "Usuario"}
        </h2>
        <p className="text-xs text-indigo-200 mt-1 font-medium">
          Selecciona una app para iniciar flujo rápido.
        </p>
      </div>

      {/* Apps Grid */}
      <div className="flex-1 grid grid-cols-3 gap-y-8 gap-x-6 items-center content-center relative z-20 py-8">
        
        {/* App: Registrar Anticipo */}
        <Link href="/movil/anticipo" className="flex flex-col items-center group">
          <div className="w-16 h-16 rounded-[22%] bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center shadow-lg shadow-amber-500/25 group-hover:scale-105 active:scale-95 transition-all duration-200">
            <Wallet className="w-8 h-8 text-white stroke-[2.2]" />
          </div>
          <span className="mt-2 text-xs font-semibold text-slate-200 group-hover:text-white transition-colors text-center">
            Anticipo
          </span>
        </Link>

        {/* App: Registrar Gasto */}
        <Link href="/movil/gasto" className="flex flex-col items-center group">
          <div className="w-16 h-16 rounded-[22%] bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/25 group-hover:scale-105 active:scale-95 transition-all duration-200">
            <Receipt className="w-8 h-8 text-white stroke-[2.2]" />
          </div>
          <span className="mt-2 text-xs font-semibold text-slate-200 group-hover:text-white transition-colors text-center">
            Gasto
          </span>
        </Link>

        {/* App: Caja */}
        <div className="flex flex-col items-center opacity-60 hover:opacity-100 cursor-pointer group" onClick={() => router.push("/dashboard/caja")}>
          <div className="w-16 h-16 rounded-[22%] bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 group-hover:scale-105 active:scale-95 transition-all duration-200">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <span className="mt-2 text-xs font-semibold text-slate-300 text-center">
            Control Caja
          </span>
        </div>

        {/* App: Archivos */}
        <div className="flex flex-col items-center opacity-40 hover:opacity-100 cursor-not-allowed group">
          <div className="w-16 h-16 rounded-[22%] bg-gradient-to-tr from-blue-500 to-cyan-400 flex items-center justify-center shadow-md">
            <FolderOpen className="w-8 h-8 text-white" />
          </div>
          <span className="mt-2 text-xs font-semibold text-slate-400 text-center">
            Archivos
          </span>
        </div>

        {/* App: Mensajes */}
        <div className="flex flex-col items-center opacity-40 hover:opacity-100 cursor-not-allowed group">
          <div className="w-16 h-16 rounded-[22%] bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center shadow-md">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <span className="mt-2 text-xs font-semibold text-slate-400 text-center">
            Mensajes
          </span>
        </div>

        {/* App: Soporte */}
        <div className="flex flex-col items-center opacity-60 hover:opacity-100 cursor-pointer group" onClick={() => router.push("/dashboard")}>
          <div className="w-16 h-16 rounded-[22%] bg-gradient-to-tr from-slate-600 to-slate-500 flex items-center justify-center shadow-lg shadow-slate-500/10 group-hover:scale-105 active:scale-95 transition-all duration-200">
            <HelpCircle className="w-8 h-8 text-white" />
          </div>
          <span className="mt-2 text-xs font-semibold text-slate-300 text-center">
            Soporte
          </span>
        </div>

      </div>

      {/* Dock (Bottom Flotante) */}
      <div className="bg-slate-900/60 border border-white/5 backdrop-blur-xl rounded-[28px] p-4 flex items-center justify-around shadow-[0_8px_32px_rgba(0,0,0,0.4)] relative z-20">
        
        {/* Dock Item: Escritorio */}
        <Link href="/dashboard" className="p-3 bg-white/5 hover:bg-white/10 active:scale-90 rounded-2xl transition-all" title="Ver versión Escritorio">
          <Home className="w-6 h-6 text-indigo-200 hover:text-white transition-colors" />
        </Link>
        
        {/* Dock Item: Perfil */}
        <div className="p-3 bg-white/5 hover:bg-white/10 active:scale-90 rounded-2xl transition-all cursor-pointer" onClick={() => router.push("/dashboard/configuracion/perfil")}>
          <User className="w-6 h-6 text-indigo-200 hover:text-white transition-colors" />
        </div>

        {/* Dock Item: Ajustes */}
        <div className="p-3 bg-white/5 hover:bg-white/10 active:scale-90 rounded-2xl transition-all cursor-pointer" onClick={() => router.push("/dashboard/configuracion")}>
          <Settings className="w-6 h-6 text-indigo-200 hover:text-white transition-colors" />
        </div>

      </div>

    </div>
  );
}
