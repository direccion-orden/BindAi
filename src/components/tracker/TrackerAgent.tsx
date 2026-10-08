"use client"

import { useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { TrackerChat } from "./TrackerChat";

interface TrackerAgentProps {
  companyId: string;
}

export function TrackerAgent({ companyId }: TrackerAgentProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            group relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-300
            ${isOpen 
              ? "bg-white text-blue-600 rotate-90 scale-90" 
              : "bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white hover:scale-110 active:scale-95"
            }
          `}
        >
          <div className="absolute inset-0 rounded-full bg-blue-400 opacity-0 group-hover:opacity-20 animate-ping transition-opacity duration-500" />
          {isOpen ? (
            <Bot size={28} />
          ) : (
            <div className="relative">
              <Bot size={28} />
              <div className="absolute -top-1 -right-1">
                <Sparkles size={12} className="text-yellow-300 animate-pulse" />
              </div>
            </div>
          )}
          
          {/* Label on hover (only when closed) */}
          {!isOpen && (
            <span className="absolute right-full mr-4 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl border border-slate-700">
              Tracker CFO | Asesor Financiero
            </span>
          )}
        </button>
      </div>

      {/* Chat Window Container */}
      <div className={`
        fixed bottom-24 right-4 sm:right-6 z-50 w-[92vw] sm:w-[450px] md:w-[480px] h-[580px] max-h-[84vh] transition-all duration-300 transform
        ${isOpen 
          ? "translate-y-0 opacity-100 scale-100" 
          : "translate-y-6 opacity-0 scale-95 pointer-events-none"
        }
      `}>
        {isOpen && <TrackerChat companyId={companyId} onClose={() => setIsOpen(false)} />}
      </div>
    </>
  );
}
