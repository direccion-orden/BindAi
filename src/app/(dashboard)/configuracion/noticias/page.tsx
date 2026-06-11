"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { 
  Loader2, Plus, Trash2, Edit2, Pin, PinOff, Newspaper, TrendingUp, DollarSign, Users, ShoppingCart, Target, Award, Eye, Settings2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Define Types
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
  notice: { label: "Aviso Importante", bg: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300" },
  news: { label: "Noticia", bg: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300" },
  metric: { label: "Meta / Logro", bg: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300" },
  general: { label: "General", bg: "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300" }
};

const ICONS_MAP = {
  TrendingUp: TrendingUp,
  DollarSign: DollarSign,
  Users: Users,
  ShoppingCart: ShoppingCart,
  Target: Target,
  Award: Award
};

export default function ConfigNoticiasPage() {
  const { companyId, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"news" | "metrics">("news");
  
  // Data State
  const [news, setNews] = useState<NewsPost[]>([]);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Modals & Forms State
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isMetricModalOpen, setIsMetricModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // News Form
  const [newsId, setNewsId] = useState("");
  const [newsTitle, setNewsTitle] = useState("");
  const [newsContent, setNewsContent] = useState("");
  const [newsCategory, setNewsCategory] = useState<"notice" | "news" | "metric" | "general">("notice");
  const [newsPinned, setNewsPinned] = useState(false);

  // Metric Form
  const [metricId, setMetricId] = useState("");
  const [metricTitle, setMetricTitle] = useState("");
  const [metricValue, setMetricValue] = useState("");
  const [metricChange, setMetricChange] = useState("");
  const [metricChangeType, setMetricChangeType] = useState<"positive" | "negative" | "neutral">("positive");
  const [metricIcon, setMetricIcon] = useState("TrendingUp");
  const [metricOrder, setMetricOrder] = useState(0);

  // Fetch News
  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "news"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsPost));
      setNews(data);
      setLoadingNews(false);
    });
    return () => unsub();
  }, [companyId]);

  // Fetch Metrics
  useEffect(() => {
    if (!companyId) return;
    const q = query(collection(db, "companies", companyId, "metrics"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MetricCard));
      setMetrics(data);
      setLoadingMetrics(false);
    });
    return () => unsub();
  }, [companyId]);

  // Handle News Form Save
  const handleSaveNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !newsTitle.trim() || !newsContent.trim()) return;

    setSaving(true);
    try {
      const docId = newsId || crypto.randomUUID();
      const newsDoc = doc(db, "companies", companyId, "news", docId);
      
      const payload = {
        title: newsTitle.trim(),
        content: newsContent.trim(),
        category: newsCategory,
        pinned: newsPinned,
        updatedAt: new Date().toISOString(),
        createdBy: user?.email || "Admin",
      };

      if (!newsId) {
        // New post
        Object.assign(payload, { createdAt: new Date().toISOString() });
      }

      await setDoc(newsDoc, payload, { merge: true });
      setIsNewsModalOpen(false);
      resetNewsForm();
    } catch (error) {
      console.error("Error saving news:", error);
      alert("Error al guardar comunicado");
    } finally {
      setSaving(false);
    }
  };

  // Handle Metric Form Save
  const handleSaveMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !metricTitle.trim() || !metricValue.trim()) return;

    setSaving(true);
    try {
      const docId = metricId || crypto.randomUUID();
      const metricDoc = doc(db, "companies", companyId, "metrics", docId);

      const payload = {
        title: metricTitle.trim(),
        value: metricValue.trim(),
        change: metricChange.trim(),
        changeType: metricChangeType,
        iconName: metricIcon,
        order: Number(metricOrder) || 0
      };

      await setDoc(metricDoc, payload, { merge: true });
      setIsMetricModalOpen(false);
      resetMetricForm();
    } catch (error) {
      console.error("Error saving metric:", error);
      alert("Error al guardar métrica");
    } finally {
      setSaving(false);
    }
  };

  // Deletions
  const handleDeleteNews = async (id: string) => {
    if (!companyId || !window.confirm("¿Estás seguro de eliminar este comunicado?")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "news", id));
    } catch (error) {
      console.error("Error deleting news:", error);
    }
  };

  const handleDeleteMetric = async (id: string) => {
    if (!companyId || !window.confirm("¿Estás seguro de eliminar esta métrica?")) return;
    try {
      await deleteDoc(doc(db, "companies", companyId, "metrics", id));
    } catch (error) {
      console.error("Error deleting metric:", error);
    }
  };

  // Open Form Helpers
  const handleOpenNewsForm = (post?: NewsPost) => {
    if (post) {
      setNewsId(post.id);
      setNewsTitle(post.title);
      setNewsContent(post.content);
      setNewsCategory(post.category);
      setNewsPinned(post.pinned || false);
    } else {
      resetNewsForm();
    }
    setIsNewsModalOpen(true);
  };

  const handleOpenMetricForm = (met?: MetricCard) => {
    if (met) {
      setMetricId(met.id);
      setMetricTitle(met.title);
      setMetricValue(met.value);
      setMetricChange(met.change || "");
      setMetricChangeType(met.changeType || "positive");
      setMetricIcon(met.iconName || "TrendingUp");
      setMetricOrder(met.order || 0);
    } else {
      resetMetricForm();
      setMetricOrder(metrics.length);
    }
    setIsMetricModalOpen(true);
  };

  // Resets
  const resetNewsForm = () => {
    setNewsId("");
    setNewsTitle("");
    setNewsContent("");
    setNewsCategory("notice");
    setNewsPinned(false);
  };

  const resetMetricForm = () => {
    setMetricId("");
    setMetricTitle("");
    setMetricValue("");
    setMetricChange("");
    setMetricChangeType("positive");
    setMetricIcon("TrendingUp");
    setMetricOrder(0);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurar Noticias y Métricas</h1>
          <p className="text-muted-foreground">
            Administra los comunicados del feed y configura las métricas dinámicas que ven tus empleados.
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === "news" ? (
            <Button onClick={() => handleOpenNewsForm()} className="gap-2">
              <Plus className="w-4 h-4" /> Nuevo Comunicado
            </Button>
          ) : (
            <Button onClick={() => handleOpenMetricForm()} className="gap-2">
              <Plus className="w-4 h-4" /> Nueva Métrica
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="border-b flex gap-4">
        <button
          onClick={() => setActiveTab("news")}
          className={`pb-3 text-sm font-semibold border-b-2 px-1 transition-colors flex items-center gap-2 ${
            activeTab === "news" 
              ? "border-primary text-primary" 
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Newspaper className="w-4 h-4" />
          Noticias y Comunicados
        </button>
        <button
          onClick={() => setActiveTab("metrics")}
          className={`pb-3 text-sm font-semibold border-b-2 px-1 transition-colors flex items-center gap-2 ${
            activeTab === "metrics" 
              ? "border-primary text-primary" 
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings2 className="w-4 h-4" />
          Métricas de la Empresa (KPIs)
        </button>
      </div>

      {/* Content Panels */}
      {activeTab === "news" ? (
        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          {loadingNews ? (
            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : news.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Aún no hay comunicados. Escribe uno nuevo para compartirlo con tu equipo.
            </div>
          ) : (
            <div className="divide-y">
              {news.map(post => (
                <div key={post.id} className="p-5 flex items-start gap-4 justify-between hover:bg-muted/10 transition-colors">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {post.pinned && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <Pin className="w-3 h-3 fill-amber-600" /> FIJADO
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${CATEGORY_MAP[post.category]?.bg || ""}`}>
                        {CATEGORY_MAP[post.category]?.label || post.category}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                    <h3 className="font-bold text-lg">{post.title}</h3>
                    <p className="text-sm text-muted-foreground/90 whitespace-pre-line line-clamp-3 max-w-3xl">{post.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenNewsForm(post)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteNews(post.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border rounded-xl shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2 border-b pb-3">
              <Eye className="w-5 h-5 text-indigo-600" />
              Vista Previa de KPIs
            </h3>
            {loadingMetrics ? (
              <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : metrics.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                No hay métricas configuradas.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {metrics.map(met => {
                  const IconComp = ICONS_MAP[met.iconName as keyof typeof ICONS_MAP] || TrendingUp;
                  return (
                    <div key={met.id} className="p-4 border rounded-xl bg-card shadow-sm flex flex-col justify-between min-h-[110px] relative overflow-hidden group">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-semibold text-muted-foreground line-clamp-1">{met.title}</span>
                        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          <IconComp className="w-4 h-4" />
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        <span className="text-2xl font-bold tracking-tight block">{met.value}</span>
                        {met.change && (
                          <span className={`text-[10px] font-bold ${
                            met.changeType === "positive" ? "text-emerald-600" :
                            met.changeType === "negative" ? "text-rose-600" : "text-slate-500"
                          }`}>
                            {met.change}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-card border rounded-xl shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-lg border-b pb-3 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-indigo-600" />
              Administrar Métricas
            </h3>
            {loadingMetrics ? (
              <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : metrics.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Aún no has creado widgets de métricas. Crea uno nuevo para empezar.
              </div>
            ) : (
              <div className="divide-y">
                {metrics.map(met => (
                  <div key={met.id} className="py-3 flex items-center justify-between hover:bg-muted/5 transition-colors">
                    <div>
                      <p className="font-bold text-sm">{met.title}</p>
                      <p className="text-xs text-muted-foreground">Valor: {met.value} | Orden: {met.order}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenMetricForm(met)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleDeleteMetric(met.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* News Modals */}
      <Dialog open={isNewsModalOpen} onOpenChange={setIsNewsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{newsId ? "Editar Comunicado" : "Redactar Comunicado"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveNews} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-semibold">Título del Comunicado</label>
              <Input 
                required 
                value={newsTitle} 
                onChange={e => setNewsTitle(e.target.value)} 
                placeholder="Ej. Cambio de horarios el fin de semana o Logramos la meta..." 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold">Categoría</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={newsCategory}
                  onChange={e => setNewsCategory(e.target.value as any)}
                >
                  <option value="notice">Aviso Importante</option>
                  <option value="news">Noticia</option>
                  <option value="metric">Meta / Logro</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div className="space-y-1 flex flex-col justify-end">
                <div className="flex items-center justify-between h-10 border rounded-md px-3 bg-muted/20">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Pin className="w-4 h-4" /> Pinned / Fijar al inicio
                  </span>
                  <Switch checked={newsPinned} onCheckedChange={setNewsPinned} />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold">Contenido del Comunicado</label>
              <Textarea 
                required 
                value={newsContent} 
                onChange={e => setNewsContent(e.target.value)} 
                placeholder="Escribe el mensaje completo para tus colaboradores..." 
                className="min-h-[160px]"
              />
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => setIsNewsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Publicar Comunicado
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Metric Modals */}
      <Dialog open={isMetricModalOpen} onOpenChange={setIsMetricModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{metricId ? "Editar Métrica" : "Añadir Métrica KPI"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveMetric} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold">Título de la Métrica</label>
                <Input 
                  required 
                  value={metricTitle} 
                  onChange={e => setMetricTitle(e.target.value)} 
                  placeholder="Ej. Clientes Activos" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold">Valor Destacado</label>
                <Input 
                  required 
                  value={metricValue} 
                  onChange={e => setMetricValue(e.target.value)} 
                  placeholder="Ej. 1,245 o $45,000" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold">Detalle / Tendencia (Opcional)</label>
                <Input 
                  value={metricChange} 
                  onChange={e => setMetricChange(e.target.value)} 
                  placeholder="Ej. +12.5% vs mes anterior" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold">Tipo de Tendencia</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={metricChangeType}
                  onChange={e => setMetricChangeType(e.target.value as any)}
                >
                  <option value="positive">Positivo (Verde)</option>
                  <option value="negative">Negativo (Rojo)</option>
                  <option value="neutral">Neutral (Gris)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold">Icono Lucide</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={metricIcon}
                  onChange={e => setMetricIcon(e.target.value)}
                >
                  <option value="TrendingUp">Tendencia (TrendingUp)</option>
                  <option value="DollarSign">Finanzas (DollarSign)</option>
                  <option value="Users">Usuarios / Clientes (Users)</option>
                  <option value="ShoppingCart">Ventas (ShoppingCart)</option>
                  <option value="Target">Metas (Target)</option>
                  <option value="Award">Premios (Award)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold">Orden de Visualización</label>
                <Input 
                  type="number" 
                  value={metricOrder} 
                  onChange={e => setMetricOrder(Number(e.target.value))} 
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => setIsMetricModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Guardar Métrica
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
