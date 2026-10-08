"use client"

import { useState, useRef, useEffect } from "react";
import { 
  Send, User, Bot, X, Loader2, Sparkles, TrendingUp, DollarSign, 
  Briefcase, HelpCircle, History, Plus, Trash2, ArrowLeft, MessageSquare,
  ShoppingCart
} from "lucide-react";
import { 
  listTrackerConversations, 
  getTrackerConversation, 
  deleteTrackerConversation, 
  TrackerConversation 
} from "@/app/actions/tracker-conversations";
import { OrderDraft, CreateOrderResult } from "@/app/actions/order-agent";
import { LiveOrderDraftCard } from "./LiveOrderDraftCard";
import { VoiceListener, speakAssistantText } from "./VoiceListener";
import { useAuth } from "@/context/AuthContext";

interface Message {
  role: "user" | "model";
  text: string;
}

interface TrackerChatProps {
  onClose: () => void;
  companyId: string;
}

function FormattedMessageContent({ text }: { text?: string }) {
  const safeText = typeof text === "string" ? text : "";
  if (!safeText.trim()) {
    return null;
  }

  // Parse paragraphs and lines for clean executive markdown appearance
  const lines = safeText.split("\n");

  return (
    <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed text-slate-800 break-words [overflow-wrap:anywhere]">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Headers
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-slate-900 text-sm mt-2 mb-1 text-indigo-950 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 inline-block"></span>
              {renderFormattedInline(trimmed.replace(/^###\s+/, ""))}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="font-extrabold text-slate-900 text-sm mt-3 mb-1.5 pb-0.5 border-b border-indigo-100 flex items-center gap-2">
              <TrendingUp size={15} className="text-indigo-600" />
              {renderFormattedInline(trimmed.replace(/^##\s+/, ""))}
            </h3>
          );
        }

        // Bullet points
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const content = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2 ml-1 text-slate-700">
              <span className="text-indigo-500 font-bold leading-5">•</span>
              <span className="flex-1">{renderFormattedInline(content)}</span>
            </div>
          );
        }

        // Numbered list (e.g. "1. ")
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 ml-1 text-slate-700">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[10px] shrink-0 mt-0.5 border border-indigo-200">
                {numMatch[1]}
              </span>
              <span className="flex-1">{renderFormattedInline(numMatch[2])}</span>
            </div>
          );
        }

        // Normal paragraph
        return (
          <p key={idx} className="text-slate-800">
            {renderFormattedInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderFormattedInline(content?: string) {
  if (!content || typeof content !== "string") {
    return null;
  }

  // Bold parser (**text**)
  const parts = content.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const boldText = part.slice(2, -2);
      let extraClass = "font-bold text-slate-950";
      if (boldText.includes("🟢") || boldText.toLowerCase().includes("viable")) {
        extraClass = "font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded";
      } else if (boldText.includes("🟡") || boldText.toLowerCase().includes("condiciones")) {
        extraClass = "font-bold text-amber-700 bg-amber-50 px-1 py-0.5 rounded";
      } else if (boldText.includes("🔴") || boldText.toLowerCase().includes("alto riesgo")) {
        extraClass = "font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded";
      }
      return <strong key={i} className={extraClass}>{boldText}</strong>;
    }
    return part;
  });
}

export function TrackerChat({ onClose, companyId }: TrackerChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<TrackerConversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Order Draft State & Side Modal Visibility
  const [draftOrder, setDraftOrder] = useState<OrderDraft | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreateOrderResult | null>(null);
  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);

  const isConfirmingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, view]);

  // Auto-open side modal when draft has items or client, or order was created
  useEffect(() => {
    if ((draftOrder && (draftOrder.items.length > 0 || draftOrder.clientName)) || (createdOrder && createdOrder.success)) {
      setIsDraftModalOpen(true);
    }
  }, [draftOrder, createdOrder]);

  const loadHistory = async () => {
    if (!companyId) return;
    setIsLoadingHistory(true);
    try {
      const convs = await listTrackerConversations(companyId);
      setHistoryList(convs);
    } catch (err) {
      console.error("Error loading history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleOpenHistory = async () => {
    setView("history");
    await loadHistory();
  };

  const handleSelectConversation = async (convId: string) => {
    setIsLoading(true);
    try {
      const conv = await getTrackerConversation(companyId, convId);
      if (conv) {
        setConversationId(conv.id);
        setConversationTitle(conv.title);
        const mappedMessages: Message[] = (conv.messages || []).map(m => ({
          role: m.role,
          text: m.text || ""
        }));
        setMessages(mappedMessages);
        setView("chat");
      }
    } catch (err) {
      console.error("Error selecting conversation:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewConversation = () => {
    setConversationId(null);
    setConversationTitle(null);
    setMessages([]);
    setInput("");
    setDraftOrder(null);
    setCreatedOrder(null);
    setIsDraftModalOpen(false);
    setView("chat");
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Deseas eliminar esta conversación de tu historial?")) return;
    try {
      await deleteTrackerConversation(companyId, convId);
      setHistoryList(prev => prev.filter(c => c.id !== convId));
      if (conversationId === convId) {
        handleNewConversation();
      }
    } catch (err) {
      console.error("Error deleting conversation:", err);
    }
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = (messageText ?? input).trim();
    if (!textToSend || isLoading) return;

    // Si ya se confirmó el pedido y no hay borrador activo, evitar duplicación
    if (
      !draftOrder && 
      createdOrder && 
      (textToSend.toLowerCase().includes("confirma") || textToSend.toLowerCase().includes("crear pedido"))
    ) {
      setMessages(prev => [
        ...prev, 
        { role: "user", text: textToSend },
        { role: "model", text: `El pedido **${createdOrder.orderNumber}** ya fue registrado y confirmado con éxito. Si deseas registrar otro pedido, por favor indícame el cliente y los productos.` }
      ]);
      setInput("");
      return;
    }

    setInput("");
    setMessages(prev => [...prev, { role: "user", text: textToSend }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          history: messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
          })),
          companyId,
          conversationId,
          userId: user?.email || user?.uid || "",
          currentDraftOrder: draftOrder
        })
      });

      const data = await response.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: "model", text: `⚠️ ${data.error}` }]);
      } else {
        const responseText = data.text || (
          data.createdOrder?.success 
            ? `¡Pedido **${data.createdOrder.orderNumber}** creado exitosamente!` 
            : (data.draftOrder ? "Borrador de pedido actualizado." : "Operación procesada con éxito.")
        );

        setMessages(prev => [...prev, { role: "model", text: responseText }]);
        if (data.conversationId) {
          setConversationId(data.conversationId);
        }
        if (data.title && !conversationTitle) {
          setConversationTitle(data.title);
        }
        if (data.draftOrder !== undefined) {
          setDraftOrder(data.draftOrder);
        }
        if (data.createdOrder) {
          setCreatedOrder(data.createdOrder);
          setDraftOrder(null);
        }

        // Si el usuario habló por voz, sintetizar respuesta hablada
        if (isVoiceListening || messageText) {
          speakAssistantText(responseText);
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: "model", text: "Hubo un problema al conectar con el asistente." }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Live Draft Manual Handlers
  const handleUpdateQuantity = (variantOrProductId: string, delta: number) => {
    setDraftOrder(prev => {
      if (!prev) return null;
      const updated = prev.items.map(it => {
        const key = it.variantId || it.productId;
        if (key === variantOrProductId) {
          const newQ = Math.max(1, it.quantity + delta);
          return { ...it, quantity: newQ, total: newQ * it.unitPrice };
        }
        return it;
      });
      const subtotal = updated.reduce((s, it) => s + it.total, 0);
      const tax = Math.round(subtotal * 0.16 * 100) / 100;
      return { ...prev, items: updated, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
    });
  };

  const handleRemoveItem = (variantOrProductId: string) => {
    setDraftOrder(prev => {
      if (!prev) return null;
      const updated = prev.items.filter(it => (it.variantId || it.productId) !== variantOrProductId);
      const subtotal = updated.reduce((s, it) => s + it.total, 0);
      const tax = Math.round(subtotal * 0.16 * 100) / 100;
      return { ...prev, items: updated, subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
    });
  };

  const handleConfirmOrder = async () => {
    if (isConfirmingRef.current || isConfirmingOrder || isLoading) return;
    isConfirmingRef.current = true;
    setIsConfirmingOrder(true);
    try {
      await handleSend("Confirma y crea el pedido ahora por favor");
    } finally {
      setIsConfirmingOrder(false);
      isConfirmingRef.current = false;
    }
  };

  const handleDiscardDraft = () => {
    setDraftOrder(null);
    setCreatedOrder(null);
    setIsDraftModalOpen(false);
  };

  const starterQuestions = [
    {
      icon: ShoppingCart,
      text: "Agente, crea un nuevo pedido para el cliente Maria Perez y agrega 5 organizadores de zapatos",
      label: "Crear pedido por voz"
    },
    {
      icon: Briefcase,
      text: "¿Es viable contratar un empleado por $12,000/mes? ¿Cuál sería el impacto?",
      label: "Viabilidad contratación ($12k)"
    },
    {
      icon: TrendingUp,
      text: "¿Cuál es mi punto de equilibrio y margen EBITDA según mi Estado de Resultados?",
      label: "Punto de equilibrio & EBITDA"
    },
    {
      icon: DollarSign,
      text: "¿Cuáles han sido mis principales partidas de gasto en los últimos meses y cómo optimizarlas?",
      label: "Análisis de Gastos & Fugas"
    }
  ];

  const hasDraftOrCreated = Boolean((draftOrder && (draftOrder.items.length > 0 || draftOrder.clientName)) || createdOrder);

  return (
    <div className="relative h-full flex items-stretch">
      {/* 1. SIDE MODAL (DESKTOP: ACOPLADO A LA IZQUIERDA DEL CHAT) */}
      {isDraftModalOpen && hasDraftOrCreated && (
        <div className="hidden lg:flex absolute right-[calc(100%+12px)] top-0 bottom-0 w-[360px] xl:w-[380px] z-50">
          <LiveOrderDraftCard
            draft={draftOrder}
            createdOrder={createdOrder}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onConfirmOrder={handleConfirmOrder}
            onDiscardDraft={handleDiscardDraft}
            onClose={() => setIsDraftModalOpen(false)}
            isConfirming={isConfirmingOrder}
          />
        </div>
      )}

      {/* 2. MOBILE / TABLET MODAL (SUPERPUESTO CON BACKDROP) */}
      {isDraftModalOpen && hasDraftOrCreated && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="w-full max-w-sm h-[82vh]">
            <LiveOrderDraftCard
              draft={draftOrder}
              createdOrder={createdOrder}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveItem}
              onConfirmOrder={handleConfirmOrder}
              onDiscardDraft={handleDiscardDraft}
              onClose={() => setIsDraftModalOpen(false)}
              isConfirming={isConfirmingOrder}
            />
          </div>
        </div>
      )}

      {/* 3. MAIN CHAT CONTAINER */}
      <div className="flex flex-col h-full w-full bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0 border-b border-indigo-950/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-inner border border-indigo-400/30">
                <Bot size={18} className="text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-slate-900 shadow-xs"></span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5 truncate">
                  Tracker AI
                  <span className="text-[10px] bg-gradient-to-r from-indigo-500/40 to-purple-500/40 text-indigo-200 font-semibold px-2 py-0.5 rounded-full border border-indigo-400/20">
                    CFO & Operativo
                  </span>
                </h3>
              </div>
              <p className="text-[11px] text-indigo-200/80 truncate">
                {view === "history" 
                  ? "Historial de conversaciones" 
                  : (conversationTitle || "Decisiones financieras y pedidos por voz")
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle Order Draft Modal Button */}
            {hasDraftOrCreated && (
              <button
                onClick={() => setIsDraftModalOpen(!isDraftModalOpen)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isDraftModalOpen
                    ? "bg-emerald-500 text-white shadow-xs"
                    : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-400/30 animate-pulse"
                }`}
                title="Ver panel del pedido"
              >
                <ShoppingCart size={13} />
                <span className="hidden sm:inline">
                  {createdOrder ? "Pedido Creado" : `Borrador (${draftOrder?.items.length || 0})`}
                </span>
                <span className="sm:hidden">
                  {draftOrder?.items.length || 0}
                </span>
              </button>
            )}

            {view === "chat" ? (
              <>
                <button
                  onClick={handleOpenHistory}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1 text-xs"
                  title="Historial de conversaciones"
                >
                  <History size={16} />
                </button>
                <button
                  onClick={handleNewConversation}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1 text-xs"
                  title="Nueva conversación"
                >
                  <Plus size={16} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setView("chat")}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1 text-xs"
                title="Volver al chat"
              >
                <ArrowLeft size={16} />
              </button>
            )}

            <button 
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1"
              title="Cerrar ventana"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Main Body */}
        {view === "history" ? (
          <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tus Consultas Previas</h4>
              <button
                onClick={handleNewConversation}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                <Plus size={13} />
                <span>Nueva consulta</span>
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs">
                <Loader2 size={16} className="animate-spin text-indigo-600" />
                <span>Cargando historial...</span>
              </div>
            ) : historyList.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-2">
                <MessageSquare size={32} className="mx-auto text-slate-300" />
                <p className="text-xs font-medium text-slate-600">Aún no tienes conversaciones guardadas.</p>
                <p className="text-[11px] text-slate-400">Cada consulta sobre P&L o pedidos se guardará automáticamente aquí.</p>
              </div>
            ) : (
              historyList.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    conversationId === conv.id
                      ? "bg-indigo-50/80 border-indigo-300 shadow-xs ring-1 ring-indigo-200"
                      : "bg-white hover:bg-slate-50 border-slate-200 hover:border-indigo-200 shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs font-bold text-slate-800 group-hover:text-indigo-950 truncate">
                        {conv.title}
                      </h5>
                      {conv.lastMessageSnippet && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                          {conv.lastMessageSnippet}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                        <span>{new Date(conv.updatedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        <span>•</span>
                        <span>{conv.messageCount} mensajes</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition-all"
                      title="Eliminar conversación"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Active Conversation Pill */}
            {conversationTitle && (
              <div className="px-3 py-1.5 bg-indigo-50/70 border-b border-indigo-100/60 flex items-center justify-between text-xs text-indigo-900 shrink-0">
                <span className="truncate font-medium text-[11px]">
                  📌 {conversationTitle}
                </span>
                <button
                  onClick={handleNewConversation}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold ml-2 shrink-0 underline"
                >
                  Nueva
                </button>
              </div>
            )}

            {/* Messages Container - 100% UNOBSTRUCTED */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 bg-slate-50/50">
              {messages.length === 0 && (
                <div className="text-center py-6 px-2 space-y-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-indigo-100">
                    <Bot size={26} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-slate-800">¡Hola! Soy Tracker, tu Asistente CFO y Operativo</h4>
                    <p className="text-xs text-slate-500 max-w-[340px] mx-auto leading-relaxed">
                      Puedo analizar tu <strong>Estado de Resultados</strong> en vivo, o <strong>crear y editar pedidos por voz</strong> directamente en el ERP con tus productos y clientes.
                    </p>
                  </div>

                  {/* Quick Starters */}
                  <div className="pt-2">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Instrucciones y preguntas sugeridas</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                      {starterQuestions.map((q, idx) => {
                        const Icon = q.icon;
                        return (
                          <button
                            key={idx}
                            onClick={() => handleSend(q.text)}
                            className="group p-2.5 bg-white hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-200 rounded-xl text-left transition-all duration-200 shadow-xs hover:shadow-sm"
                          >
                            <div className="flex items-center gap-1.5 mb-1 text-indigo-600 group-hover:text-indigo-700">
                              <Icon size={14} />
                              <span className="text-[11px] font-bold text-slate-800 group-hover:text-indigo-900">{q.label}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 line-clamp-2 leading-tight">
                              {q.text}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`flex gap-2.5 max-w-[90%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-xs ${
                      msg.role === "user" 
                        ? "bg-blue-600 text-white" 
                        : "bg-indigo-900 text-yellow-300 border border-indigo-700"
                    }`}>
                      {msg.role === "user" ? <User size={14} /> : <Bot size={15} />}
                    </div>
                    <div className={`p-3.5 rounded-2xl text-xs sm:text-sm shadow-xs break-words overflow-hidden [overflow-wrap:anywhere] ${
                      msg.role === "user" 
                        ? "bg-blue-600 text-white rounded-tr-none font-medium" 
                        : "bg-white border border-slate-200/90 rounded-tl-none shadow-sm"
                    }`}>
                      {msg.role === "user" ? (
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      ) : (
                        <FormattedMessageContent text={msg.text} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2.5 items-center text-slate-500 bg-white px-3.5 py-2.5 rounded-2xl shadow-xs border border-slate-200/80">
                    <Loader2 size={16} className="animate-spin text-indigo-600" />
                    <span className="text-xs font-medium">Procesando orden y consultando ERP...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Compact Mini-Bar when Draft is active and side modal is closed */}
            {draftOrder && draftOrder.items.length > 0 && !isDraftModalOpen && (
              <div className="px-3.5 py-1.5 bg-slate-900 text-white flex items-center justify-between text-[11px] border-t border-slate-800 shrink-0 shadow-inner">
                <span className="truncate flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span><strong>{draftOrder.items.length} productos</strong> (${draftOrder.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN)</span>
                </span>
                <button
                  onClick={() => setIsDraftModalOpen(true)}
                  className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 underline ml-2 shrink-0"
                >
                  Ver panel del pedido
                </button>
              </div>
            )}

            {/* Input & Voice Controls */}
            <div className="p-3 bg-white border-t border-slate-200 shrink-0">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1 flex items-center">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Habla o escribe: 'Crea pedido para Maria Perez con 5 zapatos...'"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-100/80 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-400 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                  />
                  <button 
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="absolute right-1.5 p-1.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-indigo-600"
                    title="Enviar mensaje"
                  >
                    <Send size={15} />
                  </button>
                </div>

                {/* Voice Listener Button & Status */}
                <VoiceListener
                  onSendMessage={(voiceText) => handleSend(voiceText)}
                  isLoading={isLoading}
                  onVoiceStateChange={setIsVoiceListening}
                />
              </form>
              <p className="text-[9px] text-center text-slate-400 mt-1.5">
                🎤 Puedes dictar o escribir instrucciones continuas. Di &ldquo;Agrega X&rdquo;, &ldquo;Cambia cantidad a Y&rdquo; o &ldquo;Confirma pedido&rdquo;.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
