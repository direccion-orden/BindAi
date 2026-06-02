"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, limit, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { usePOS, Product } from "@/context/POSContext";
import { useAuth } from "@/context/AuthContext";
import { Client } from "@/components/pos/ClientSelector";
import { Save, Loader2, Plus, ShoppingBag, Phone, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ClientInsightsPanelProps {
  client: Client;
}

export function ClientInsightsPanel({ client }: ClientInsightsPanelProps) {
  const { companyId } = useAuth();
  const { setClient, addItemToCart } = usePOS();
  
  const [phone, setPhone] = useState(client.phone || "");
  const [email, setEmail] = useState(client.email || "");
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Sync state if client prop changes
  useEffect(() => {
    setPhone(client.phone || "");
    setEmail(client.email || "");
    setIsDirty(false);
    fetchHistory(client.id);
  }, [client.id, client.phone, client.email]);

  const handleFieldChange = (setter: any, value: string, original: string | undefined) => {
    setter(value);
    setIsDirty(value !== (original || ""));
  };

  const saveContactInfo = async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      if (!companyId) return;
      const clientRef = doc(db, "companies", companyId, "clients", client.id);
      await updateDoc(clientRef, {
        phone: phone.trim(),
        email: email.trim().toLowerCase()
      });
      // Update global context so it doesn't revert on next render
      setClient({ ...client, phone: phone.trim(), email: email.trim().toLowerCase() });
      setIsDirty(false);
    } catch (error: any) {
      console.error("Error updating client:", error);
      alert("No se pudo actualizar el cliente. Detalle: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const fetchHistory = async (clientId: string) => {
    setLoadingHistory(true);
    try {
      if (!companyId) return;
      const q = query(
        collection(db, "companies", companyId, "remisiones"),
        where("clientId", "==", clientId)
      );
      const snapshot = await getDocs(q);
      
      // Ordenar en memoria por createdAt descendente
      const sortedSales = snapshot.docs
        .map(doc => doc.data())
        .sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        })
        .slice(0, 3); // Tomar solo las últimas 3 remisiones

      const uniqueItems = new Map();

      sortedSales.forEach(sale => {
        sale.items?.forEach((item: any) => {
          const itemId = item.variantId || item.productId || item.id || "";
          const itemTitle = item.productName || item.title || "";
          if (!uniqueItems.has(itemId)) {
            uniqueItems.set(itemId, {
              id: itemId,
              title: itemTitle,
              sku: item.sku || "",
              price: item.unitPrice || 0,
              cost: item.cost || 0,
              lastBought: sale.createdAt ? new Date(sale.createdAt) : new Date()
            });
          }
        });
      });

      setHistory(Array.from(uniqueItems.values()));
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAddHistoricalItem = async (item: any) => {
    try {
      if (!companyId) return;
      // Necesitamos el producto completo, así que lo buscamos de Firestore
      const prodRef = doc(db, "companies", companyId, "products", item.id);
      const prodSnap = await getDoc(prodRef);
      
      if (prodSnap.exists()) {
        const fullProduct = { id: prodSnap.id, ...prodSnap.data() } as Product;
        addItemToCart(fullProduct);
      } else {
        // Fallback construyendo un producto parcial si no existe
        const fallbackProduct: Product = {
          id: item.id,
          title: item.title,
          sku: item.sku,
          price: item.price,
          cost: item.cost,
          code: item.sku,
          imageUrl: null,
          bindCurrentInventory: 0,
          unit: "PZA"
        };
        addItemToCart(fallbackProduct);
      }
    } catch (error) {
      console.error("Error adding historical item:", error);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  return (
    <div className="flex-1 bg-muted/10 border-b flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
      
      {/* Información de Contacto */}
      <div className="p-2.5 border-b bg-background shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
            Contacto del Cliente
          </span>
          {isDirty && (
            <button 
              onClick={saveContactInfo}
              disabled={saving}
              className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded flex items-center gap-1 hover:bg-primary/90 transition-colors"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Guardar
            </button>
          )}
        </div>
        
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
            <Input 
              value={phone}
              onChange={(e) => handleFieldChange(setPhone, e.target.value, client.phone)}
              placeholder="Añadir celular..."
              className="h-7 text-xs flex-1 bg-transparent border-transparent hover:border-input focus-visible:border-input px-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
            <Input 
              value={email}
              onChange={(e) => handleFieldChange(setEmail, e.target.value, client.email)}
              placeholder="Añadir correo..."
              className="h-7 text-xs flex-1 bg-transparent border-transparent hover:border-input focus-visible:border-input px-2"
            />
          </div>
        </div>
      </div>

      {/* Sugerencias (Últimas 3 Visitas) */}
      <div className="p-3">
        <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
          <ShoppingBag className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">
            Sugerencias (Últimas Visitas)
          </span>
        </div>

        {loadingHistory ? (
          <div className="flex justify-center p-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center p-4 text-xs text-muted-foreground bg-background rounded border border-dashed">
            No hay historial reciente.
          </div>
        ) : (
          <div className="space-y-1.5">
            {history.map((item) => (
              <div 
                key={item.id}
                className="flex items-center justify-between p-2 bg-background border rounded hover:border-primary/30 transition-colors group"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-medium truncate" title={item.title}>
                    {item.title}
                  </span>
                </div>
                <button
                  onClick={() => handleAddHistoricalItem(item)}
                  className="w-6 h-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors"
                  title="Añadir al carrito"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
