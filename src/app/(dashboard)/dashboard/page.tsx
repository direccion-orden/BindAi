"use client";

import React, { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { 
  Loader2, Newspaper, Pin, TrendingUp, DollarSign, Users, ShoppingCart, Target, Award, BellRing
} from "lucide-react";

interface NewsPost {
  id: string;
  title: string;
  content: string;
  category: "notice" | "news" | "metric" | "general";
  pinned: boolean;
  createdAt: any;
  createdBy: string;
}

interface MetricCard {
  id: string;
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  iconName?: string;
  order: number;
}

const CATEGORY_MAP = {
  notice: { label: "Aviso Importante", bg: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  news: { label: "Noticia", bg: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  metric: { label: "Meta / Logro", bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  general: { label: "General", bg: "bg-slate-500/10 text-slate-400 border-slate-500/10" }
};

const ICONS_MAP = {
  TrendingUp: TrendingUp,
  DollarSign: DollarSign,
  Users: Users,
  ShoppingCart: ShoppingCart,
  Target: Target,
  Award: Award
};

export default function DashboardPage() {
  const { companyId, user } = useAuth();
  const [news, setNews] = useState<NewsPost[]>([]);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch News and Metrics
  useEffect(() => {
    if (!companyId) return;

    const qNews = query(collection(db, "companies", companyId, "news"), orderBy("createdAt", "desc"));
    const unsubNews = onSnapshot(qNews, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsPost));
      
      // Sort pinned posts first, keeping chronological order within each group
      const sorted = data.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });

      setNews(sorted);
    });

    const qMetrics = query(collection(db, "companies", companyId, "metrics"), orderBy("order", "asc"));
    const unsubMetrics = onSnapshot(qMetrics, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MetricCard));
      setMetrics(data);
      setLoading(false);
    });

    return () => {
      unsubNews();
      unsubMetrics();
    };
  }, [companyId]);

  const getUserGreeting = () => {
    const hours = new Date().getHours();
    const displayName = user?.displayName || user?.email?.split("@")[0] || "Colaborador";
    
    // Capitalize name
    const formattedName = displayName.split(" ")[0].charAt(0).toUpperCase() + displayName.split(" ")[0].slice(1);

    if (hours < 12) return `¡Buenos días, ${formattedName}!`;
    if (hours < 19) return `¡Buenas tardes, ${formattedName}!`;
    return `¡Buenas noches, ${formattedName}!`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-300">
      
      {/* Dynamic Header */}
      <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/15 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden backdrop-blur-sm">
        <div className="space-y-1 relative z-10">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground">
            {getUserGreeting()}
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Bienvenido al portal corporativo de tu empresa. Aquí tienes los últimos anuncios e indicadores.
          </p>
        </div>
        <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
          <BellRing className="w-6 h-6 animate-bounce" style={{ animationDuration: '3s' }} />
        </div>
      </div>

      {/* KPI Metrics Dashboard Grid */}
      {metrics.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            Indicadores Clave
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((met) => {
              const IconComp = ICONS_MAP[met.iconName as keyof typeof ICONS_MAP] || TrendingUp;
              return (
                <div key={met.id} className="p-5 border rounded-xl bg-card/60 shadow-sm flex flex-col justify-between min-h-[120px] relative overflow-hidden group hover:border-primary/30 transition-all duration-300 backdrop-blur-sm">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider line-clamp-1">{met.title}</span>
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <IconComp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <span className="text-3xl font-extrabold tracking-tight block">{met.value}</span>
                    {met.change && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-block ${
                        met.changeType === "positive" 
                          ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/10" 
                          : met.changeType === "negative" 
                            ? "bg-rose-500/5 text-rose-600 border-rose-500/10" 
                            : "bg-slate-500/5 text-slate-500 border-slate-500/10"
                      }`}>
                        {met.change}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feed de Noticias / Comunicados */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-indigo-500" />
          Anuncios y Noticias
        </h2>

        {news.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground border border-dashed rounded-2xl bg-card/30">
            No hay comunicados publicados en este momento. ¡Vuelve más tarde!
          </div>
        ) : (
          <div className="space-y-4">
            {news.map((post) => (
              <div 
                key={post.id} 
                className={`p-6 border rounded-2xl shadow-sm space-y-4 transition-all duration-300 hover:border-primary/20 ${
                  post.pinned 
                    ? "bg-gradient-to-r from-amber-500/5 via-card/80 to-card border-amber-500/20" 
                    : "bg-card/40 backdrop-blur-sm"
                }`}
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {post.pinned && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          <Pin className="w-3 h-3 fill-amber-600" /> Fijado
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${CATEGORY_MAP[post.category]?.bg || ""}`}>
                        {CATEGORY_MAP[post.category]?.label || post.category}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Publicado el {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-xl">{post.title}</h3>
                  </div>
                </div>

                <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed max-w-4xl">
                  {post.content}
                </p>

                <div className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
                  <span>Autor: {post.createdBy}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
