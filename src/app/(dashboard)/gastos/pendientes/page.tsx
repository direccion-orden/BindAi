"use client";

import React, { useState, useEffect } from "react";
import { collection, query, onSnapshot, where, orderBy, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Trash2, Calendar, Smartphone, FileText, CheckCircle2, Eye, X } from "lucide-react";
import Link from "next/link";

export default function GastosPendientesPage() {
  const { companyId } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;

    const q = query(
      collection(db, "companies", companyId, "gastosPendientes"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
      setLoading(false);
    }, (error) => {
      console.error("Error loading pending gastos:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    if (!confirm("¿Estás seguro de que deseas descartar este comprobante?")) return;

    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "companies", companyId, "gastosPendientes", id));
    } catch (error) {
      console.error("Error discarding receipt:", error);
      alert("Error al descartar el comprobante.");
    } finally {
      setDeletingId(null);
    }
  };

  const formatPhoneNumber = (num: string) => {
    if (!num) return "Desconocido";
    const cleaned = num.replace(/\D/g, "");
    if (cleaned.length === 12 && cleaned.startsWith("52")) {
      return `+52 ${cleaned.slice(2, 4)} ${cleaned.slice(4, 8)} ${cleaned.slice(8)}`;
    }
    return num;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-950 to-blue-900 bg-clip-text text-transparent">
            Gastos Pendientes (WhatsApp)
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Comprobantes de gastos enviados por WhatsApp. Asócialos a un gasto operativo en el ERP para registrarlos en tu contabilidad.
          </p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 flex items-center gap-2 self-start md:self-auto shadow-sm">
          <FileText className="w-4 h-4 text-indigo-600" />
          <span className="text-indigo-950 font-bold text-xs">
            {items.length} pendientes
          </span>
        </div>
      </div>

      {/* Grid List */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed rounded-2xl bg-white p-12 shadow-sm min-h-[350px]">
          <div className="bg-emerald-50 text-emerald-600 rounded-full p-4 mb-4 border border-emerald-100">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="font-bold text-lg text-slate-800">¡Todo al día!</h3>
          <p className="text-slate-500 text-sm mt-1 text-center max-w-sm">
            No tienes comprobantes de gastos pendientes de procesar en este momento. Todos los recibos de WhatsApp han sido registrados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const dateStr = item.createdAt?.toDate 
              ? item.createdAt.toDate().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) 
              : "Fecha desconocida";

            return (
              <div 
                key={item.id} 
                className="bg-card border rounded-2xl overflow-hidden shadow-sm flex flex-col hover:shadow-md transition-all duration-300 group"
              >
                {/* Image Preview Container */}
                <div className="relative h-48 bg-slate-100 overflow-hidden flex items-center justify-center border-b border-slate-100">
                  {item.imageUrl ? (
                    <>
                      <img 
                        src={item.imageUrl} 
                        alt="Comprobante" 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                        onClick={() => setSelectedImage(item.imageUrl)}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                        <span className="bg-white/90 text-indigo-950 px-3 py-1.5 rounded-full text-xs font-bold shadow flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5" /> Ver Comprobante
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-400 flex flex-col items-center">
                      <FileText className="w-12 h-12 mb-2 opacity-55" />
                      <span className="text-xs font-medium">Sin imagen</span>
                    </div>
                  )}
                  {/* Status Badge */}
                  <span className="absolute top-3 left-3 bg-amber-500 text-white text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full shadow-sm">
                    Pendiente
                  </span>
                </div>

                {/* Metadata */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                      <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{formatPhoneNumber(item.fromNumber)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{dateStr}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <Link 
                      href={`/compras/gastos/nuevo?receiptUrl=${encodeURIComponent(item.imageUrl)}&pendingGastoId=${item.id}`}
                      className="flex-1"
                    >
                      <Button className="w-full gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9">
                        <PlusCircle className="w-4 h-4" /> Crear Gasto
                      </Button>
                    </Link>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 h-9 w-9 shrink-0"
                      title="Descartar comprobante"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Modal Preview */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedImage(null)}
        >
          <div 
            className="relative bg-white rounded-2xl p-2 max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute right-4 top-4 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-full p-2 border shadow transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="overflow-auto max-h-[85vh] rounded-xl flex items-center justify-center p-4 bg-slate-50 border border-slate-100">
              <img 
                src={selectedImage} 
                alt="Comprobante en grande" 
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
