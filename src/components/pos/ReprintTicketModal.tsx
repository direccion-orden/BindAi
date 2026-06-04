"use client";

import { useState, useEffect } from "react";
import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { X, Search, Printer, Loader2 } from "lucide-react";
import { ThermalTicket } from "@/components/pos/ThermalTicket";

const parseSafeDate = (createdAt: any): Date => {
  if (!createdAt) return new Date();
  if (typeof createdAt.toDate === "function") {
    return createdAt.toDate();
  }
  if (createdAt.seconds) {
    return new Date(createdAt.seconds * 1000);
  }
  if (typeof createdAt === "string" || typeof createdAt === "number") {
    const parsed = new Date(createdAt);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

interface ReprintTicketModalProps {
  onClose: () => void;
}

export function ReprintTicketModal({ onClose }: ReprintTicketModalProps) {
  const { companyId } = useAuth();
  const [sales, setSales] = useState<any[]>([]);
  const [filteredSales, setFilteredSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchRecentSales();
    }
  }, [companyId]);

  const fetchRecentSales = async () => {
    try {
      if (!companyId) return;
      const q = query(
        collection(db, "companies", companyId, "remisiones"),
        where("isPosSale", "==", true),
        limit(100)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .map(r => ({
          ...r,
          folio: r.orderNumber?.replace("POS-", "") || r.remissionNumber,
          client: { name: r.clientName },
          financials: {
            subtotal: r.subtotal || 0,
            tax: r.tax || 0,
            total: r.totalAmount || 0
          },
          items: r.items?.map((item: any) => ({
            title: item.productName || item.title || "",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercentage: item.discountPercentage || 0
          })) || []
        }));

      // Ordenar en memoria por fecha de creación desc
      data.sort((a, b) => {
        const timeA = parseSafeDate(a.createdAt).getTime();
        const timeB = parseSafeDate(b.createdAt).getTime();
        return timeB - timeA;
      });

      setSales(data);
      setFilteredSales(data);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm) {
      setFilteredSales(sales);
      return;
    }
    
    const lowerTerm = searchTerm.toLowerCase();
    const filtered = sales.filter(sale => {
      const folio = sale.folio?.toLowerCase() || "";
      const clientName = sale.client?.name?.toLowerCase() || "";
      const email = sale.client?.email?.toLowerCase() || "";
      const phone = sale.client?.phone?.toLowerCase() || "";
      
      return folio.includes(lowerTerm) || 
             clientName.includes(lowerTerm) || 
             email.includes(lowerTerm) || 
             phone.includes(lowerTerm);
    });
    
    setFilteredSales(filtered);
  }, [searchTerm, sales]);

  const handlePrint = (sale: any) => {
    setSelectedSale(sale);
    setIsPrinting(true);
    
    // Give React time to render the hidden ticket, then print
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
      // We don't close the modal automatically so they can print again if needed
    }, 300);
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  };

  const formatDate = (sale: any) => {
    if (!sale.createdAt) return "Sin fecha";
    let dateObj = new Date();
    if (typeof sale.createdAt.toDate === 'function') {
        dateObj = sale.createdAt.toDate();
    } else if (sale.createdAt.seconds) {
        dateObj = new Date(sale.createdAt.seconds * 1000);
    } else if (typeof sale.createdAt === 'string' || typeof sale.createdAt === 'number') {
        const parsed = new Date(sale.createdAt);
        if (!isNaN(parsed.getTime())) dateObj = parsed;
    }
    return dateObj.toLocaleString('es-MX', { 
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in">
        
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center bg-muted/30">
          <div>
            <h2 className="text-xl font-bold">Reimprimir Ticket</h2>
            <p className="text-sm text-muted-foreground">Busca una venta para imprimir una copia de su comprobante.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full">
            <X className="w-5 h-5"/>
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Buscar por folio, cliente, teléfono o email..." 
              className="w-full pl-9 pr-4 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Cargando ventas recientes...</p>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No se encontraron ventas que coincidan con la búsqueda.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-3 font-medium">Fecha</th>
                  <th className="pb-3 font-medium">Folio</th>
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                  <th className="pb-3 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3">{formatDate(sale)}</td>
                    <td className="py-3 font-mono">{sale.folio || sale.id.slice(0,8).toUpperCase()}</td>
                    <td className="py-3">{sale.client?.name || "Público General"}</td>
                    <td className="py-3 text-right font-bold">{formatMoney(sale.financials?.total || 0)}</td>
                    <td className="py-3 text-center">
                      <button 
                        onClick={() => handlePrint(sale)}
                        disabled={isPrinting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-md font-medium transition-colors disabled:opacity-50"
                      >
                        <Printer className="w-4 h-4" />
                        Imprimir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Hidden print component */}
      {selectedSale && (
        <ThermalTicket saleId={selectedSale.id} saleData={selectedSale} />
      )}
    </div>
  );
}
