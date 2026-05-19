"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, FileText, MoreHorizontal, Calendar, User, DollarSign, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuoteModal } from "./QuoteModal";
import { getNextSequence } from "@/lib/firebase/counters";

interface QuoteItem {
  productId: string;
  productName: string;
  variantTitle?: string;
  quantity: number;
  unitPrice: number;
  discountPercentage: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  clientName: string;
  totalAmount: number;
  status: string; // 'Nueva', 'Enviada', 'En Negociación', 'Ganada', 'Perdida'
  createdAt: string;
  createdBy: string;
  items?: QuoteItem[];
  imageUrl?: string;
  imagePrompt?: string;
  subtotal?: number;
  tax?: number;
  notes?: string;
}

const CRM_STAGES = [
  { id: "nueva", name: "Nueva / Prospecto", color: "#94a3b8" }, // slate-400
  { id: "enviada", name: "Enviada al Cliente", color: "#3b82f6" }, // blue-500
  { id: "negociacion", name: "En Negociación", color: "#f59e0b" }, // amber-500
  { id: "ganada", name: "Ganada (Crear Pedido)", color: "#10b981" }, // emerald-500
  { id: "perdida", name: "Perdida", color: "#ef4444" } // red-500
];

export default function CotizacionesCRMPage() {
  const { companyId } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedQuoteId, setDraggedQuoteId] = useState<string | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!companyId) return;

    const unsubQ = onSnapshot(query(collection(db, "companies", companyId, "quotes"), orderBy("createdAt", "desc")), (snap) => {
      setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quote)));
      setLoading(false);
    });

    return () => unsubQ();
  }, [companyId]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedQuoteId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetStatusId: string) => {
    e.preventDefault();
    if (!draggedQuoteId || !companyId) return;

    const quote = quotes.find(q => q.id === draggedQuoteId);
    if (!quote || quote.status === targetStatusId) return;

    // Optimistic Update
    setQuotes(prev => prev.map(q => q.id === draggedQuoteId ? { ...q, status: targetStatusId } : q));

    if (targetStatusId === "ganada") {
      // Trigger conversion to Order (Pedido)
      if (window.confirm("¡Felicidades! ¿Deseas generar el Pedido de Venta de inmediato?")) {
        try {
          const orderId = crypto.randomUUID();
          const orderNumber = await getNextSequence(companyId, 'pedidos');
          
          await setDoc(doc(db, "companies", companyId, "pedidos", orderId), {
            id: orderId,
            orderNumber,
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            clientName: quote.clientName,
            items: quote.items || [],
            subtotal: quote.subtotal || 0,
            tax: quote.tax || 0,
            totalAmount: quote.totalAmount,
            projectId: quote.projectId || null,
            projectName: quote.projectName || null,
            status: "por_surtir", // 'por_surtir', 'surtido', 'entregado', 'remisionado'
            createdAt: new Date().toISOString(),
            createdBy: quote.createdBy,
          });

          await updateDoc(doc(db, "companies", companyId, "quotes", draggedQuoteId), {
            status: targetStatusId,
            orderId: orderId
          });

          alert(`Pedido ${orderNumber} creado exitosamente.`);
          router.push("/ventas/pedidos");
          return;
        } catch (error) {
          console.error("Error creating order:", error);
          alert("Hubo un error al generar el pedido.");
          return; // Abort if order creation fails
        }
      }
    }

    try {
      await updateDoc(doc(db, "companies", companyId, "quotes", draggedQuoteId), {
        status: targetStatusId
      });
    } catch (e) {
      console.error(e);
      alert("Error al actualizar la cotización.");
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  const renderQuoteCard = (quote: Quote) => (
    <div 
      key={quote.id}
      draggable
      onDragStart={(e) => handleDragStart(e, quote.id)}
      onClick={() => setSelectedQuote(quote)}
      className="bg-white border rounded-lg p-4 shadow-sm cursor-pointer hover:border-blue-300 transition-colors group relative"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
          {quote.quoteNumber}
        </span>
        <Link href={`/pdf/cotizacion/${quote.id}`} target="_blank" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-indigo-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-50 hover:bg-indigo-100">
            PDF
          </Button>
        </Link>
      </div>
      
      <div className="flex items-start gap-2 mb-3 mt-3">
        <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <p className="font-bold text-sm leading-snug text-slate-900">
          {quote.clientName}
        </p>
      </div>

      <div className="flex justify-between items-end border-t pt-2 mt-2">
        <div className="flex items-center text-xs text-muted-foreground gap-1">
          <Calendar className="w-3 h-3" />
          {new Date(quote.createdAt).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
        </div>
        <div className="text-right">
          <p className="font-bold text-emerald-700 text-sm">${quote.totalAmount.toLocaleString('es-MX')}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cotizaciones (CRM)</h1>
          <p className="text-muted-foreground">
            Gestiona el embudo de ventas y da seguimiento a prospectos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/ventas/cotizaciones/nueva">
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4" /> Nueva Cotización
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full gap-4 pb-4 px-1" style={{ width: 'max-content', minWidth: '100%' }}>
          {CRM_STAGES.map((stage) => {
            const stageQuotes = quotes.filter(q => q.status === stage.id);
            const totalStageAmount = stageQuotes.reduce((sum, q) => sum + q.totalAmount, 0);

            return (
              <div 
                key={stage.id} 
                className={`flex flex-col w-80 shrink-0 border rounded-xl overflow-hidden shadow-sm h-full ${stage.id === 'ganada' ? 'bg-emerald-50/50 border-emerald-200' : stage.id === 'perdida' ? 'bg-red-50/50 border-red-200' : 'bg-slate-50 border-slate-200'}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <div 
                  className="p-3 border-b bg-white flex flex-col gap-2 sticky top-0"
                  style={{ borderTop: `4px solid ${stage.color}` }}
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">{stage.name}</h3>
                    <div className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {stageQuotes.length}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Valor del embudo:</span>
                    <span className="font-bold text-slate-700">${totalStageAmount.toLocaleString('es-MX')}</span>
                  </div>
                </div>

                <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                  {stageQuotes.map(renderOrderCard => renderQuoteCard(renderOrderCard))}
                  {stageQuotes.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400 font-medium">
                      Arrastra cotizaciones aquí
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedQuote && (
        <QuoteModal 
          quote={selectedQuote} 
          onClose={() => setSelectedQuote(null)} 
          stages={CRM_STAGES} 
        />
      )}
    </div>
  );
}
