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

      // Obtener todos los clientes para cruzar teléfono y correo
      const clientsSnap = await getDocs(collection(db, "companies", companyId, "clients"));
      const clientsMap = new Map<string, any>();
      clientsSnap.docs.forEach(doc => {
        clientsMap.set(doc.id, doc.data());
      });

      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .map(r => {
          const clientData = r.clientId ? clientsMap.get(r.clientId) : null;
          return {
            ...r,
            folio: r.orderNumber?.replace("POS-", "") || r.remissionNumber,
            client: { 
              name: r.clientName || "Público General",
              phone: clientData?.phone || "",
              email: clientData?.email || ""
            },
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
          };
        });

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

  const handleSearchDb = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      setFilteredSales(sales);
      return;
    }

    setLoading(true);
    try {
      if (!companyId) return;

      // 1. Buscar clientes por teléfono o email exacto
      const cleanPhone = term.replace(/\D/g, "");
      const clientQueries = [
        getDocs(query(collection(db, "companies", companyId, "clients"), where("phone", "==", searchTerm.trim()))),
        getDocs(query(collection(db, "companies", companyId, "clients"), where("email", "==", searchTerm.trim().toLowerCase())))
      ];
      if (cleanPhone && cleanPhone !== searchTerm.trim() && cleanPhone.length >= 8) {
        clientQueries.push(
          getDocs(query(collection(db, "companies", companyId, "clients"), where("phone", "==", cleanPhone)))
        );
      }

      const clientSnaps = await Promise.all(clientQueries);
      const clientIds: string[] = [];
      clientSnaps.forEach(snap => {
        snap.docs.forEach(d => {
          if (!clientIds.includes(d.id)) {
            clientIds.push(d.id);
          }
        });
      });

      // Buscar en remisiones
      const formattedTerm = term.startsWith("rem-") ? term.toUpperCase() : term;
      const formattedPosTerm = term.startsWith("pos-") ? term.toUpperCase() : `POS-${term.toUpperCase()}`;
      
      const promises = [];

      // Consulta 1: Coincidencia exacta en orderNumber (ej: POS-1002)
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("orderNumber", "==", formattedPosTerm)
        ))
      );

      // Consulta 2: Coincidencia exacta en remissionNumber (ej: 1002)
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("remissionNumber", "==", formattedTerm)
        ))
      );

      // Consulta 3: Coincidencia exacta en clientName
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          where("clientName", "==", searchTerm.trim())
        ))
      );

      // Consulta 4: Por clientIds encontrados (por teléfono o email)
      clientIds.forEach(cId => {
        promises.push(
          getDocs(query(
            collection(db, "companies", companyId, "remisiones"),
            where("clientId", "==", cId)
          ))
        );
      });

      // Consulta 5: Obtener remisiones generales recientes para filtrado en memoria
      promises.push(
        getDocs(query(
          collection(db, "companies", companyId, "remisiones"),
          limit(200)
        ))
      );

      const snaps = await Promise.all(promises);
      const docMap = new Map<string, any>();

      snaps.forEach(snap => {
        snap.docs.forEach(d => {
          docMap.set(d.id, { id: d.id, ...d.data() });
        });
      });

      // Obtener todos los clientes para cruzar teléfono y correo
      const clientsSnap = await getDocs(collection(db, "companies", companyId, "clients"));
      const clientsMap = new Map<string, any>();
      clientsSnap.docs.forEach(doc => {
        clientsMap.set(doc.id, doc.data());
      });

      const data = Array.from(docMap.values())
        .map(r => {
          const clientData = r.clientId ? clientsMap.get(r.clientId) : null;
          return {
            ...r,
            folio: r.orderNumber?.replace("POS-", "") || r.remissionNumber,
            client: { 
              name: r.clientName || "Público General",
              phone: clientData?.phone || "",
              email: clientData?.email || ""
            },
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
          };
        })
        .filter((s: any) => {
          const folio = (s.folio || "").toUpperCase();
          const remNum = (s.remissionNumber || "").toUpperCase();
          const orderNum = (s.orderNumber || "").toUpperCase();
          const name = (s.client?.name || "").toLowerCase();
          const email = (s.client?.email || "").toLowerCase();
          const phone = (s.client?.phone || "").toLowerCase();
          
          return folio === term.toUpperCase() || 
                 remNum === formattedTerm || 
                 orderNum === formattedPosTerm ||
                 s.id.toLowerCase() === term || 
                 name.includes(term) ||
                 email.includes(term) ||
                 phone.includes(term) ||
                 clientIds.includes(s.clientId);
        });

      // Ordenar en memoria por fecha de creación desc
      data.sort((a, b) => {
        const timeA = parseSafeDate(a.createdAt).getTime();
        const timeB = parseSafeDate(b.createdAt).getTime();
        return timeB - timeA;
      });

      setFilteredSales(data);
    } catch (error) {
      console.error("Error searching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm) {
      setFilteredSales(sales);
    }
  }, [searchTerm, sales]);

  const handlePrint = (sale: any) => {
    setSelectedSale(sale);
    setIsPrinting(true);
    
    // Give React time to render the hidden ticket, then print
    setTimeout(() => {
      const printContent = document.getElementById('thermal-ticket-print-area');
      if (!printContent) {
        window.print(); // Fallback
        setIsPrinting(false);
        return;
      }
      
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);
      
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write('<html><head><title>Imprimir Ticket</title>');
        document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => {
          doc.write(style.outerHTML);
        });
        doc.write('</head><body style="margin: 0; padding: 0; background: white;">');
        doc.write(printContent.outerHTML);
        doc.write('</body></html>');
        doc.close();
        
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          document.body.removeChild(iframe);
          setIsPrinting(false);
        }, 350);
      } else {
        window.print();
        setIsPrinting(false);
      }
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
          <form onSubmit={handleSearchDb} className="relative max-w-md flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Buscar por folio, cliente, teléfono o email..." 
                className="w-full pl-9 pr-4 py-2 bg-background border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              type="submit" 
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Buscar
            </button>
          </form>
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
