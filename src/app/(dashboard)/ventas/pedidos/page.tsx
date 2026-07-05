"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { getLocalDateString } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Package, Truck, CheckCircle2, User, FileText, Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Copy, Eye, FileDown, Ban, DollarSign, FileSpreadsheet, ChevronRight, ChevronDown } from "lucide-react";
import { getNextSequence } from "@/lib/firebase/counters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

interface Order {
  id: string;
  orderNumber: string;
  quoteNumber: string;
  clientName: string;
  subtotal: number;
  tax: number;
  totalAmount: number;
  status: string; // 'por_surtir', 'surtido', 'entregado', 'remisionado'
  createdAt: string;
  createdBy: string;
}

export default function PedidosPage() {
  const { companyId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const handleCopyOrder = async (order: any) => {
    if (!companyId) return;
    const confirm = window.confirm("¿Deseas duplicar este pedido?");
    if (!confirm) return;
    try {
      const newId = crypto.randomUUID();
      const orderNumber = await getNextSequence(companyId, 'pedidos');
      const newOrder = {
        ...order,
        id: newId,
        orderNumber,
        status: 'por_surtir',
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "companies", companyId, "pedidos", newId), newOrder);
      alert(`Pedido duplicado con éxito bajo el folio ${orderNumber}`);
    } catch (error) {
      console.error("Error duplicating order:", error);
      alert("Hubo un error al duplicar el pedido.");
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!companyId) return;
    const confirm = window.confirm("¿Estás seguro de que deseas cancelar este pedido?");
    if (!confirm) return;
    try {
      const orderRef = doc(db, "companies", companyId, "pedidos", orderId);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const orderData = orderSnap.data();
        if (orderData.quoteId) {
          try {
            await updateDoc(doc(db, "companies", companyId, "quotes", orderData.quoteId), {
              status: "negociacion",
              orderId: null
            });
          } catch (e) {
            console.warn("Failed to release related quote:", e);
          }
        }
      }

      await updateDoc(orderRef, {
        status: 'cancelado'
      });
      alert("Pedido cancelado con éxito");
    } catch (error) {
      console.error("Error cancelling order:", error);
      alert("Hubo un error al cancelar el pedido.");
    }
  };

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sucursalFilter, setSucursalFilter] = useState("all");
  const [dateFilterOption, setDateFilterOption] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locations, setLocations] = useState<any[]>([]);
  const [groupBy, setGroupBy] = useState<"none" | "client" | "location">("none");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const handleDateFilterChange = (option: string) => {
    setDateFilterOption(option);
    
    const now = new Date();
    
    if (option === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (option === "today") {
      const todayStr = getLocalDateString(now);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (option === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setDateFrom(yesterdayStr);
      setDateTo(yesterdayStr);
    } else if (option === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setDateFrom(getLocalDateString(startOfMonth));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(getLocalDateString(startOfLastMonth));
      setDateTo(getLocalDateString(endOfLastMonth));
    } else if (option === "this_year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setDateFrom(getLocalDateString(startOfYear));
      setDateTo(getLocalDateString(now));
    } else if (option === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setDateFrom(getLocalDateString(thirtyDaysAgo));
      setDateTo(getLocalDateString(now));
    }
  };

  useEffect(() => {
    if (!companyId) return;

    const unsubQ = onSnapshot(query(collection(db, "companies", companyId, "pedidos"), orderBy("createdAt", "desc")), (snap) => {
      setOrders(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      setLoading(false);
    });

    const unsubLoc = onSnapshot(query(collection(db, "companies", companyId, "locations")), (snap) => {
      setLocations(snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || d.data().Name || "Sucursal sin nombre"
      })));
    });

    return () => { unsubQ(); unsubLoc(); };
  }, [companyId]);

  const filteredOrders = orders.filter(order => {
    // 1. Search text
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchesFolio = order.orderNumber ? String(order.orderNumber).toLowerCase().includes(term) : false;
      const matchesClient = order.clientName ? String(order.clientName).toLowerCase().includes(term) : false;
      if (!matchesFolio && !matchesClient) return false;
    }
    // 2. Status filter
    if (statusFilter !== "all" && order.status !== statusFilter) {
      return false;
    }
    // 2.5. Sucursal filter
    if (sucursalFilter !== "all" && (order as any).locationId !== sucursalFilter) {
      return false;
    }
    // 3. Date range
    if (dateFrom || dateTo) {
      const localDate = order.createdAt ? getLocalDateString(new Date(order.createdAt)) : "";
      if (dateFrom && localDate < dateFrom) return false;
      if (dateTo && localDate > dateTo) return false;
    }
    return true;
  });

  // Sorting state
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "createdAt" || field === "totalAmount" ? "desc" : "asc");
    }
  };

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    let aVal = a[sortField as keyof Order] || "";
    let bVal = b[sortField as keyof Order] || "";

    if (typeof aVal === "string" && typeof bVal === "string") {
      if (sortField === "orderNumber") {
        const aNum = parseInt(aVal.replace(/\D/g, ""), 10) || 0;
        const bNum = parseInt(bVal.replace(/\D/g, ""), 10) || 0;
        return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
      }
      return sortDirection === "asc" 
        ? aVal.localeCompare(bVal, "es") 
        : bVal.localeCompare(aVal, "es");
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 ml-1.5 inline shrink-0" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 ml-1.5 inline shrink-0 font-bold" />
    );
  };

  const totalFilteredAmount = filteredOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

  // Convert SVG logo to PNG data URL for jsPDF
  const loadLogoAsDataUrl = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const svgW = 588;
      const svgH = 135;
      img.width = svgW;
      img.height = svgH;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 3;
        canvas.width = svgW * scale;
        canvas.height = svgH * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, svgW, svgH);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = '/logo.svg';
    });
  };

  const handleDownloadPDF = async () => {
    if (sortedOrders.length === 0) return;

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

      // Brand palette
      const TAUPE_DARK = [56, 52, 50];      // hsl(38,6%,22%) — foreground
      const TAUPE_MID = [120, 113, 108];     // hsl(38,6%,45%) — primary
      const TAUPE_LIGHT = [210, 206, 201];   // hsl(38,8%,85%) — border
      const TAUPE_BG = [243, 241, 238];      // hsl(38,13%,94%) — background
      const ACCENT = [122, 107, 140];        // hsl(266,12%,52%) — accent

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      let y = 14;

      // --- Logo + Header ---
      const logoH = 10;
      const logoW = logoH * (293.75 / 67.31);
      try {
        const logoDataUrl = await loadLogoAsDataUrl();
        doc.addImage(logoDataUrl, 'PNG', margin, y, logoW, logoH);
      } catch (error) {
        console.error("Error loading logo:", error);
      }

      // Title on the right, same line as logo
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
      doc.text("Reporte de Pedidos", pageWidth - margin, y + 7, { align: "right" });
      y += logoH + 3;

      // Divider line
      doc.setDrawColor(TAUPE_LIGHT[0], TAUPE_LIGHT[1], TAUPE_LIGHT[2]);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;

      // Report Info
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
      
      // Left info: Filter details
      let filterText = "Filtros: ";
      const activeFilters: string[] = [];
      if (searchTerm.trim()) activeFilters.push(`Búsqueda: "${searchTerm}"`);
      if (statusFilter !== "all") {
        const statusMap: Record<string, string> = {
          por_surtir: "Activo",
          surtido: "Surtido",
          remisionado: "Remisionado",
          cancelado: "Cancelado"
        };
        activeFilters.push(`Estatus: ${statusMap[statusFilter] || statusFilter}`);
      }
      if (sucursalFilter !== "all") {
        const locName = locations.find(l => l.id === sucursalFilter)?.name || sucursalFilter;
        activeFilters.push(`Sucursal: ${locName}`);
      }
      if (dateFilterOption !== "all") {
        activeFilters.push(`Fecha: ${dateFilterOption}`);
      }
      filterText += activeFilters.length > 0 ? activeFilters.join(", ") : "Ninguno";
      
      const filterLines = doc.splitTextToSize(filterText, pageWidth / 2 - margin);
      doc.text(filterLines, margin, y);

      // Right info: Date & Totals
      doc.text(
        `Generado: ${new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        pageWidth - margin,
        y,
        { align: "right" }
      );
      
      y += Math.max(filterLines.length * 4, 6) + 2;

      // --- Summary boxes ---
      const boxW = (pageWidth - margin * 2 - 5) / 2;
      const boxH = 12;
      
      const summaryData = [
        { label: "Total Pedidos", value: String(sortedOrders.length), borderColor: TAUPE_MID, textColor: TAUPE_DARK },
        { label: "Monto Total Filtrado", value: `$${totalFilteredAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, borderColor: ACCENT, textColor: ACCENT },
      ];

      summaryData.forEach((item, i) => {
        const x = margin + i * (boxW + 5);
        doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
        doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, "F");
        doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, "S");
        
        doc.setFontSize(7);
        doc.setTextColor(TAUPE_MID[0], TAUPE_MID[1], TAUPE_MID[2]);
        doc.setFont("helvetica", "normal");
        doc.text(item.label, x + 4, y + 4.5);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(item.textColor[0], item.textColor[1], item.textColor[2]);
        doc.text(item.value, x + 4, y + 9.5);
      });
      
      y += boxH + 6;

      // --- Table Headers ---
      const colWidths = [22, 63, 33, 27, 25, 18];
      const colHeaders = ["Folio", "Cliente", "Sucursal", "Fecha", "Total", "Estatus"];

      const renderTableHeader = (yPos: number) => {
        doc.setFillColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);
        doc.rect(margin, yPos, pageWidth - margin * 2, 7, "F");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(240, 238, 235);
        let hx = margin + 2;
        colHeaders.forEach((header, i) => {
          if (i === 4) {
            doc.text(header, hx + colWidths[i] - 4, yPos + 5, { align: "right" });
          } else {
            doc.text(header, hx, yPos + 5);
          }
          hx += colWidths[i];
        });
      };

      renderTableHeader(y);
      y += 7;

      // --- Table Rows ---
      const maxY = doc.internal.pageSize.getHeight() - 14;

      sortedOrders.forEach((order, rowIdx) => {
        if (y > maxY - 6) {
          doc.addPage();
          y = 14;
          renderTableHeader(y);
          y += 7;
        }

        if (rowIdx % 2 === 0) {
          doc.setFillColor(TAUPE_BG[0], TAUPE_BG[1], TAUPE_BG[2]);
          doc.rect(margin, y, pageWidth - margin * 2, 6, "F");
        }

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(TAUPE_DARK[0], TAUPE_DARK[1], TAUPE_DARK[2]);

        let cx = margin + 2;

        const folio = String(order.orderNumber || "");
        const cliente = String(order.clientName || "");
        const sucursal = String((order as any).locationName || locations.find(l => l.id === (order as any).locationId)?.name || "N/A");
        const fecha = new Date(order.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const total = `$${(order.totalAmount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
        
        let estatusStr = "Activo";
        if (order.status === "surtido") estatusStr = "Surtido";
        else if (order.status === "remisionado") estatusStr = "Remisionado";
        else if (order.status === "cancelado") estatusStr = "Cancelado";

        const truncateText = (text: string, widthLimit: number) => {
          return doc.getStringUnitWidth(text) * 7 * 0.352778 > widthLimit - 4
            ? doc.splitTextToSize(text, widthLimit - 4)[0]
            : text;
        };

        const rowData = [
          truncateText(folio, colWidths[0]),
          truncateText(cliente, colWidths[1]),
          truncateText(sucursal, colWidths[2]),
          fecha,
          total,
          estatusStr
        ];

        rowData.forEach((text, i) => {
          if (i === 4) {
            doc.text(text, cx + colWidths[i] - 4, y + 4, { align: "right" });
          } else {
            doc.text(text, cx, y + 4);
          }
          cx += colWidths[i];
        });

        y += 6;
      });

      doc.save(`pedidos_filtrados_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Hubo un error al generar el PDF.");
    }
  };

  const handleDownloadCSV = () => {
    if (sortedOrders.length === 0) return;

    try {
      const headers = ["No. Pedido", "Cliente", "Sucursal", "Fecha", "Total", "Estatus"];
      
      const escapeCSVField = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return `"${str}"`;
      };

      const rows = sortedOrders.map(order => {
        const folio = order.orderNumber || "";
        const cliente = order.clientName || "";
        const sucursal = (order as any).locationName || locations.find(l => l.id === (order as any).locationId)?.name || "N/A";
        const fecha = new Date(order.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const total = (order.totalAmount || 0).toFixed(2);
        
        let estatusStr = "Activo";
        if (order.status === "surtido") estatusStr = "Surtido";
        else if (order.status === "remisionado") estatusStr = "Remisionado";
        else if (order.status === "cancelado") estatusStr = "Cancelado";

        return [
          escapeCSVField(folio),
          escapeCSVField(cliente),
          escapeCSVField(sucursal),
          escapeCSVField(fecha),
          total,
          escapeCSVField(estatusStr)
        ].join(",");
      });

      const csvContent = "\ufeff" + [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `pedidos_filtrados_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating CSV:", error);
      alert("Hubo un error al generar el archivo CSV.");
    }
  };

  // Grouping logic
  interface OrderGroup {
    key: string;
    orders: Order[];
    totalAmount: number;
  }

  const groupedOrders: OrderGroup[] = React.useMemo(() => {
    if (groupBy === "none") return [];

    const groupsMap: Record<string, Order[]> = {};

    sortedOrders.forEach(order => {
      let groupKey = "N/A";
      if (groupBy === "client") {
        groupKey = order.clientName || "Cliente sin nombre";
      } else if (groupBy === "location") {
        groupKey = (order as any).locationName || locations.find(l => l.id === (order as any).locationId)?.name || "N/A";
      }

      if (!groupsMap[groupKey]) {
        groupsMap[groupKey] = [];
      }
      groupsMap[groupKey].push(order);
    });

    const groups = Object.entries(groupsMap).map(([key, orders]) => {
      const totalAmount = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      return { key, orders, totalAmount };
    });

    return groups.sort((a, b) => a.key.localeCompare(b.key, "es"));
  }, [sortedOrders, groupBy, locations]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }));
  };

  const renderOrderRow = (order: Order) => (
    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
      <td className="px-6 py-4 font-bold text-slate-900">{order.orderNumber}</td>
      <td className="px-6 py-4 font-medium text-slate-700">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-slate-400" />
          {order.clientName}
        </div>
      </td>
      <td className="px-6 py-4 text-slate-600 text-sm">
        {(order as any).locationName || locations.find(l => l.id === (order as any).locationId)?.name || "N/A"}
      </td>
      <td className="px-6 py-4 text-muted-foreground text-xs">
        {new Date(order.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </td>
      <td className="px-6 py-4 font-bold text-emerald-700">
        ${order.totalAmount?.toLocaleString('es-MX', {minimumFractionDigits:2})}
      </td>
      <td className="px-6 py-4">
        {order.status === 'por_surtir' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">Activo</span>}
        {order.status === 'surtido' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">Surtido</span>}
        {order.status === 'remisionado' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">Remisionado</span>}
        {order.status === 'cancelado' && <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">Cancelado</span>}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex justify-end items-center gap-1">
          <Link href={`/ventas/pedidos/${order.id}`} target="_blank">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 shrink-0"
              title="Abrir Detalles"
            >
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
          <Link href={`/pdf/pedido/${order.id}`} target="_blank">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-600 hover:text-slate-800 hover:bg-slate-50 shrink-0"
              title="Descargar PDF"
            >
              <FileDown className="w-4 h-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 shrink-0"
            onClick={() => handleCopyOrder(order)}
            title="Copiar"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-rose-600 hover:text-rose-800 hover:bg-rose-50 shrink-0"
            onClick={() => handleCancelOrder(order.id)}
            disabled={order.status === 'cancelado'}
            title="Cancelar"
          >
            <Ban className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }


  return (
    <div className="flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pedidos en Proceso</h1>
          <p className="text-muted-foreground">
            Gestiona el surtido, empaque y preparación de envíos.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleDownloadPDF}
            variant="outline"
            className="gap-2 font-semibold shadow-sm border-slate-300 text-slate-700 hover:bg-slate-50"
            disabled={sortedOrders.length === 0}
          >
            <FileDown className="w-4 h-4" /> Descargar PDF
          </Button>
          <Button
            onClick={handleDownloadCSV}
            variant="outline"
            className="gap-2 font-semibold shadow-sm border-slate-300 text-slate-700 hover:bg-slate-50"
            disabled={sortedOrders.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Descargar CSV
          </Button>
          <Link href="/ventas/pedidos/nuevo" target="_blank">
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md">
              <Plus className="w-4 h-4" /> Nuevo Pedido Directo
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monto Total Filtrado</p>
            <p className="text-xl font-bold text-slate-800">${totalFilteredAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Modern Filter Panel */}
      <div className="flex flex-col md:flex-row flex-wrap gap-4 items-stretch md:items-end justify-between bg-card p-4 rounded-xl border shadow-sm shrink-0">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end flex-1">
          <div className="space-y-1 w-full sm:w-64">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Buscar
            </span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9"
                placeholder="Folio o nombre del cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-1 w-full sm:w-40">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Estatus
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="por_surtir">Activo</option>
              <option value="surtido">Surtido</option>
              <option value="remisionado">Remisionado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div className="space-y-1 w-full sm:w-40">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sucursal
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={sucursalFilter}
              onChange={(e) => setSucursalFilter(e.target.value)}
            >
              <option value="all">Todas</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1 w-full sm:w-44">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Fecha
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={dateFilterOption}
              onChange={(e) => handleDateFilterChange(e.target.value)}
            >
              <option value="all">Cualquier fecha</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="this_month">Este Mes</option>
              <option value="last_month">Mes Anterior</option>
              <option value="last_30_days">Últimos 30 Días</option>
              <option value="this_year">Este Año</option>
              <option value="custom">Rango Personalizado</option>
            </select>
          </div>

          {dateFilterOption === "custom" && (
            <>
              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Desde</span>
                <Input
                  type="date"
                  className="h-9 bg-background"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-1 w-full sm:w-36">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hasta</span>
                <Input
                  type="date"
                  className="h-9 bg-background"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="space-y-1 w-full sm:w-40">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Agrupar por
            </span>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 font-medium"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
            >
              <option value="none">Sin agrupar</option>
              <option value="client">Cliente</option>
              <option value="location">Sucursal</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase text-xs font-semibold">
              <tr>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("orderNumber")}
                >
                  <div className="flex items-center">
                    No. Pedido
                    {renderSortIcon("orderNumber")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("clientName")}
                >
                  <div className="flex items-center">
                    Cliente
                    {renderSortIcon("clientName")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("locationName")}
                >
                  <div className="flex items-center">
                    Sucursal
                    {renderSortIcon("locationName")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("createdAt")}
                >
                  <div className="flex items-center">
                    Fecha
                    {renderSortIcon("createdAt")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("totalAmount")}
                >
                  <div className="flex items-center">
                    Total
                    {renderSortIcon("totalAmount")}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 cursor-pointer select-none hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center">
                    Estatus
                    {renderSortIcon("status")}
                  </div>
                </th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
               {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No se encontraron pedidos con los filtros aplicados.
                  </td>
                </tr>
              ) : groupBy === "none" ? (
                sortedOrders.map((order) => renderOrderRow(order))
              ) : (
                groupedOrders.map((group) => {
                  const isExpanded = expandedGroups[group.key] !== false;
                  return (
                    <React.Fragment key={group.key}>
                      <tr 
                        className="bg-indigo-50/20 hover:bg-indigo-50/40 cursor-pointer transition-colors border-y"
                        onClick={() => toggleGroup(group.key)}
                      >
                        <td colSpan={7} className="px-6 py-3 select-none">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-indigo-600 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-indigo-600 shrink-0" />
                              )}
                              <span className="font-bold text-slate-800 text-sm">
                                {groupBy === "client" ? "Cliente: " : "Sucursal: "}{group.key}
                              </span>
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                                {group.orders.length} {group.orders.length === 1 ? "pedido" : "pedidos"}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-muted-foreground mr-1.5 font-medium">Total del grupo:</span>
                              <span className="font-bold text-emerald-800 text-sm">
                                ${group.totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && group.orders.map((order) => renderOrderRow(order))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
