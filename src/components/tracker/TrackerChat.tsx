"use client"

import { useState, useRef, useEffect } from "react";
import { Send, User, Bot, X, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "model";
  text: string;
}

interface TrackerChatProps {
  onClose: () => void;
  companyId: string;
}

export function TrackerChat({ onClose, companyId }: TrackerChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
          })),
          companyId
        })
      });

      const data = await response.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: "model", text: `Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: "model", text: data.text }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: "model", text: "Hubo un problema al conectar con Tracker." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="font-bold text-sm">Tracker Agent</h3>
            <p className="text-[10px] opacity-80">Online | AI Assistant</p>
          </div>
        </div>
        <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-full transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 opacity-50">
            <Bot size={40} className="mx-auto mb-2" />
            <p className="text-sm italic">Hola, soy Tracker. ¿En qué puedo ayudarte hoy?</p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <button 
                onClick={() => setInput("¿Cómo estuvieron las ventas hoy?")}
                className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-full hover:bg-blue-100 border border-blue-100"
              >
                Ventas de hoy
              </button>
              <button 
                onClick={() => setInput("Busca al cliente Gignac")}
                className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-full hover:bg-blue-100 border border-blue-100"
              >
                Buscar cliente
              </button>
            </div>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`flex gap-2 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === "user" ? "bg-blue-100 text-blue-600" : "bg-indigo-600 text-white"
              }`}>
                {msg.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`p-3 rounded-2xl text-sm ${
                msg.role === "user" 
                  ? "bg-blue-600 text-white rounded-tr-none" 
                  : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tl-none"
              }`}>
                {msg.text}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-2 items-center text-gray-400 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-xs">Tracker está pensando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Pregunta algo..."
            className="w-full pl-4 pr-12 py-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
