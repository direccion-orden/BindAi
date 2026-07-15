"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Loader2, TrendingUp, Users, Target, Clock, Download, Calendar, ShoppingCart, Package, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, ComposedChart
} from "recharts";

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#3b82f6", "#94a3b8"];

export default function ReporteComercialPage() {
  const { companyId } = useAuth();
  
  // States for raw Firestore data
  const [locations, setLocations] = useState<any[]>([]);
  const [remisiones, setRemisiones] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ [key: string]: string }>({});
  const [productsMap, setProductsMap] = useState<{ [key: string]: any }>({});
  const [loading, setLoading] = useState(true);

  // States for filters
  const [selectedSucursal, setSelectedSucursal] = useState("all");
  const [selectedYear, setSelectedYear] = useState(2026); // Default to 2026 based on DB audit
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [dateFilterType, setDateFilterType] = useState<"por_mes" | "hoy" | "mes_fecha" | "ano_fecha">("por_mes");

  // States for product sales table
  const [tableDateFilterOption, setTableDateFilterOption] = useState("this_year");
  const [tableStartDate, setTableStartDate] = useState("2026-01-01");
  const [tableEndDate, setTableEndDate] = useState("2026-12-31");
  const [tableSucursal, setTableSucursal] = useState("all");
  const [tableCategory, setTableCategory] = useState("all");
  const [tableSearch, setTableSearch] = useState("");
  const [tableSortField, setTableSortField] = useState<string>("totalSales");
  const [tableSortDirection, setTableSortDirection] = useState<"asc" | "desc">("desc");
  const [taxMode, setTaxMode] = useState<"con_iva" | "sin_iva">("con_iva");

  // States for Category Drill Down
  const [selectedDrillDownCategory, setSelectedDrillDownCategory] = useState<string | null>(null);
  const [drillDownSearch, setDrillDownSearch] = useState("");
  const [drillDownSortField, setDrillDownSortField] = useState<"name" | "sku" | "units" | "revenue">("revenue");
  const [drillDownSortDirection, setDrillDownSortDirection] = useState<"asc" | "desc">("desc");

  const handleTableDateFilterChange = useCallback((option: string) => {
    setTableDateFilterOption(option);
    
    const getLocalDateString = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    
    if (option === "all") {
      setTableStartDate("");
      setTableEndDate("");
    } else if (option === "today") {
      const todayStr = getLocalDateString(now);
      setTableStartDate(todayStr);
      setTableEndDate(todayStr);
    } else if (option === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = getLocalDateString(yesterday);
      setTableStartDate(yesterdayStr);
      setTableEndDate(yesterdayStr);
    } else if (option === "this_month") {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setTableStartDate(getLocalDateString(startOfMonth));
      setTableEndDate(getLocalDateString(now));
    } else if (option === "last_month") {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setTableStartDate(getLocalDateString(startOfLastMonth));
      setTableEndDate(getLocalDateString(endOfLastMonth));
    } else if (option === "this_year") {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setTableStartDate(getLocalDateString(startOfYear));
      setTableEndDate(getLocalDateString(now));
    } else if (option === "last_30_days") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      setTableStartDate(getLocalDateString(thirtyDaysAgo));
    }
  }, []);

  const resolveItemCategoryId = useCallback((item: any) => {
    if (!item) return "";
    
    // 1. Look up from products map
    const prodId = item.productId;
    if (prodId && productsMap[prodId]) {
      const p = productsMap[prodId];
      if (p.Category1ID) return p.Category1ID;
      if (p.categoryId) return p.categoryId;
      if (p.productType) {
        // Try to find the category ID by its name (stored in productType)
        const nameLower = String(p.productType).toLowerCase().trim();
        const foundCat = Object.entries(categories).find(
          ([_, name]) => name.toLowerCase().trim() === nameLower
        );
        if (foundCat) return foundCat[0];
      }
    }
    
    // 2. Look up using item.categoryIds (e.g. from remisiones)
    if (item.categoryIds && item.categoryIds.length > 0) {
      const catVal = item.categoryIds[0];
      if (categories[catVal]) {
        return catVal;
      }
      const nameLower = String(catVal).toLowerCase().trim();
      const foundCatEntry = Object.entries(categories).find(
        ([_, name]) => name.toLowerCase().trim() === nameLower
      );
      if (foundCatEntry) {
        return foundCatEntry[0];
      }
    }
    
    // 3. Fallback for services based on code / productId prefixes
    const upperProdId = String(prodId || "").toUpperCase();
    if (upperProdId.startsWith("SER-ENVIO") || upperProdId.includes("ENVIO")) {
      const found = Object.entries(categories).find(([_, name]) => name.toUpperCase().includes("ENVIO"));
      if (found) return found[0];
    }
    if (upperProdId.startsWith("SER-ARRE") || upperProdId.includes("ARRENDAMIENTO")) {
      const found = Object.entries(categories).find(([_, name]) => name.toUpperCase().includes("ARRENDAMIENTO"));
      if (found) return found[0];
    }
    if (upperProdId.startsWith("SER-") || upperProdId.includes("SERVICIO")) {
      const found = Object.entries(categories).find(([_, name]) => name.toUpperCase().includes("SERVICIOS"));
      if (found) return found[0];
    }

    return "";
  }, [productsMap, categories]);

  // Fetch all required data once
  useEffect(() => {
    if (!companyId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        // Parallel queries to Firestore
        const [locSnap, remSnap, factSnap, pedSnap, goalSnap, catSnap, prodSnap] = await Promise.all([
          getDocs(collection(db, "companies", companyId, "locations")),
          getDocs(collection(db, "companies", companyId, "remisiones")),
          getDocs(collection(db, "companies", companyId, "facturas")),
          getDocs(collection(db, "companies", companyId, "pedidos")),
          getDocs(collection(db, "companies", companyId, "sales_goals")),
          getDocs(collection(db, "companies", companyId, "categories")),
          getDocs(collection(db, "companies", companyId, "products"))
        ]);

        // Map Locations
        const locs = locSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name || d.data().Name || "Sucursal sin nombre",
          channelType: d.data().channelType || "traditional"
        }));
        locs.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        setLocations(locs);

        // Map Remisiones (Active only)
        const rems = remSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRemisiones(rems);

        // Map Facturas
        const facts = factSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setFacturas(facts);

        // Map Pedidos
        const peds = pedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPedidos(peds);

        // Map Goals
        const gls = goalSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setGoals(gls);

        // Map Categories lookup
        const cats: { [key: string]: string } = {};
        catSnap.forEach(d => {
          cats[d.id] = d.data().name || d.data().Name || d.id;
        });
        setCategories(cats);

        // Map Products catalog lookup
        const prods: { [key: string]: any } = {};
        prodSnap.forEach(d => {
          const data = d.data();
          prods[d.id] = {
            id: d.id,
            Category1ID: data.Category1ID || null,
            Category2ID: data.Category2ID || null,
            Category3ID: data.Category3ID || null,
            categoryId: data.categoryId || null,
            productType: data.productType || null
          };
        });
        setProductsMap(prods);

      } catch (err) {
        console.error("Error loading reports data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [companyId]);

  // Initialize table dates dynamically
  useEffect(() => {
    handleTableDateFilterChange("this_year");
  }, [handleTableDateFilterChange]);

  // Compute stats and charts reactively
  const stats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const currentDate = now.getDate(); // 1-31
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const isToday = (d: Date) => {
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth && d.getDate() === currentDate;
    };

    const isMonthToDate = (d: Date) => {
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth && d.getDate() <= currentDate;
    };

    const isYearToDate = (d: Date) => {
      if (d.getFullYear() !== currentYear) return false;
      if (d.getMonth() < currentMonth) return true;
      if (d.getMonth() === currentMonth) return d.getDate() <= currentDate;
      return false;
    };

    const filterByDate = (dateStr: string | undefined) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;

      if (dateFilterType === "hoy") {
        return isToday(d);
      } else if (dateFilterType === "mes_fecha") {
        return isMonthToDate(d);
      } else if (dateFilterType === "ano_fecha") {
        return isYearToDate(d);
      } else {
        // por_mes
        if (d.getFullYear() !== selectedYear) return false;
        if (selectedMonth !== "all" && (d.getMonth() + 1) !== parseInt(selectedMonth)) return false;
        return true;
      }
    };

    const getGoalTarget = (g: any, ignoreLocation = false) => {
      if (!ignoreLocation && selectedSucursal !== "all" && g.locationId !== selectedSucursal) return 0;

      if (dateFilterType === "hoy") {
        if (g.year === currentYear && g.month === (currentMonth + 1)) {
          return (g.amount || 0) / daysInMonth;
        }
        return 0;
      } else if (dateFilterType === "mes_fecha") {
        if (g.year === currentYear && g.month === (currentMonth + 1)) {
          return ((g.amount || 0) / daysInMonth) * currentDate;
        }
        return 0;
      } else if (dateFilterType === "ano_fecha") {
        if (g.year === currentYear) {
          if (g.month < (currentMonth + 1)) {
            return g.amount || 0;
          } else if (g.month === (currentMonth + 1)) {
            return ((g.amount || 0) / daysInMonth) * currentDate;
          }
        }
        return 0;
      } else {
        // por_mes
        if (g.year === selectedYear) {
          if (selectedMonth === "all") {
            return g.amount || 0;
          } else if (g.month === parseInt(selectedMonth)) {
            return g.amount || 0;
          }
        }
        return 0;
      }
    };

    // 1. Filtered datasets
    const activeRemisiones = remisiones.filter(r => {
      if (r.status === "cancelada") return false;
      if (selectedSucursal !== "all" && r.locationId !== selectedSucursal) return false;
      return filterByDate(r.createdAt || r.date);
    });

    const activeFacturas = facturas.filter(f => {
      if (f.status === "cancelada") return false;
      if (f.posSaleId || f.remisionId || f.remissionId) return false; // Ignore facturas generated from existing remisiones to avoid double counting
      if (selectedSucursal !== "all" && f.locationId !== selectedSucursal) return false;
      return filterByDate(f.createdAt || f.date);
    });

    const activePedidos = pedidos.filter(p => {
      if (p.status === "cancelado") return false;
      if (selectedSucursal !== "all" && p.locationId !== selectedSucursal) return false;
      return filterByDate(p.createdAt);
    });

    // 2. KPI Cards calculations
    const totalSales = activeRemisiones.reduce((sum, r) => sum + (r.totalAmount || 0), 0) +
                       activeFacturas.reduce((sum, f) => sum + (f.totalAmount || 0), 0);
    
    // Backlog (pedidos pending delivery 'por_surtir')
    const pendingOrders = activePedidos.filter(p => p.status === 'por_surtir');
    const backlogAmount = pendingOrders.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const backlogBalance = pendingOrders.reduce((sum, p) => sum + ((p.totalAmount || 0) - (p.paidAmount || 0)), 0);

    // Ticket Promedio
    const salesCount = activeRemisiones.length + activeFacturas.length;
    const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;

    // Win Rate (pedidos vs total quotes - since cotizaciones count is 0 in db, we display 0% gracefully)
    const winRate = 0; 

    // Goal Attainment
    const totalGoalAmount = goals.reduce((sum, g) => sum + getGoalTarget(g), 0);
    const goalAttainment = totalGoalAmount > 0 ? (totalSales / totalGoalAmount) * 100 : 0;

    // 3. Monthly Sales vs Goals data series (always full year comparison for context)
    const chartYear = dateFilterType === "por_mes" ? selectedYear : currentYear;
    const monthlyData = MONTHS_SHORT.map((name, idx) => {
      const monthNum = idx + 1;
      
      const salesInMonth = remisiones.filter(r => {
        if (r.status === "cancelada") return false;
        const d = new Date(r.createdAt || r.date);
        if (isNaN(d.getTime()) || d.getFullYear() !== chartYear) return false;
        if (selectedSucursal !== "all" && r.locationId !== selectedSucursal) return false;
        return d.getMonth() + 1 === monthNum;
      }).reduce((sum, r) => sum + (r.totalAmount || 0), 0) +
      facturas.filter(f => {
        if (f.status === "cancelada" || f.posSaleId || f.remisionId || f.remissionId) return false;
        const d = new Date(f.createdAt || f.date);
        if (isNaN(d.getTime()) || d.getFullYear() !== chartYear) return false;
        if (selectedSucursal !== "all" && f.locationId !== selectedSucursal) return false;
        return d.getMonth() + 1 === monthNum;
      }).reduce((sum, f) => sum + (f.totalAmount || 0), 0);

      const goalInMonth = goals.filter(g => {
        if (g.year !== chartYear) return false;
        if (selectedSucursal !== "all" && g.locationId !== selectedSucursal) return false;
        return g.month === monthNum;
      }).reduce((sum, g) => sum + (g.amount || 0), 0);

      return {
        name,
        ventas: Math.round(salesInMonth),
        meta: Math.round(goalInMonth)
      };
    });

    // 4. Sales by Category (PIE)
    const categoryTotals: { [key: string]: number } = {};
    const processItemsForCategories = (documents: any[]) => {
      documents.forEach(doc => {
        if (!doc.items || doc.items.length === 0) return;
        
        const docTotal = doc.totalAmount || 0;
        
        // Calculate items sum to get weights
        const itemsSum = doc.items.reduce((sum: number, item: any) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
        
        doc.items.forEach((item: any) => {
          const itemVal = (item.quantity || 0) * (item.unitPrice || 0);
          const weight = itemsSum > 0 ? (itemVal / itemsSum) : (1 / doc.items.length);
          const val = weight * docTotal;
          
          // Find category name
          const catId = resolveItemCategoryId(item);
          const catName = categories[catId] || "Otros";
          categoryTotals[catName] = (categoryTotals[catName] || 0) + val;
        });
      });
    };
    processItemsForCategories(activeRemisiones);
    processItemsForCategories(activeFacturas);

    const categoryChartData = Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);

    // 5. Top 5 Clients (BAR)
    const clientTotals: { [key: string]: number } = {};
    const processClientTotals = (documents: any[]) => {
      documents.forEach(doc => {
        const name = doc.clientName || "Público en General";
        clientTotals[name] = (clientTotals[name] || 0) + (doc.totalAmount || 0);
      });
    };
    processClientTotals(activeRemisiones);
    processClientTotals(activeFacturas);

    const topClientsData = Object.entries(clientTotals)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // 6. Branch Sales vs Goal Table Details
    const branchPerformance = locations.map(loc => {
      const rSales = remisiones.filter(r => {
        if (r.status === "cancelada" || r.locationId !== loc.id) return false;
        return filterByDate(r.createdAt || r.date);
      }).reduce((sum, r) => sum + (r.totalAmount || 0), 0) +
      facturas.filter(f => {
        if (f.status === "cancelada" || f.locationId !== loc.id || f.posSaleId || f.remisionId || f.remissionId) return false;
        return filterByDate(f.createdAt || f.date);
      }).reduce((sum, f) => sum + (f.totalAmount || 0), 0);

      const rGoal = goals.filter(g => g.locationId === loc.id)
                         .reduce((sum, g) => sum + getGoalTarget({ ...g, locationId: "all" }, true), 0);

      const percent = rGoal > 0 ? (rSales / rGoal) * 100 : 0;
      const diff = rSales - rGoal;

      return {
        id: loc.id,
        name: loc.name,
        realSales: Math.round(rSales),
        goal: Math.round(rGoal),
        percent: Math.round(percent),
        diff: Math.round(diff)
      };
    }).sort((a, b) => b.realSales - a.realSales);

    const getGoalLabel = () => {
      if (dateFilterType === "hoy") return "Cumplimiento de Hoy";
      if (dateFilterType === "mes_fecha") return "Cumplimiento del Mes a la Fecha";
      if (dateFilterType === "ano_fecha") return "Cumplimiento del Año a la Fecha";
      if (selectedMonth === "all") return "Cumplimiento del Año";
      const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      return `Cumplimiento de ${monthNames[parseInt(selectedMonth) - 1]}`;
    };

    // Digital vs Tradicional Chart Data
    let digitalSales = 0;
    let traditionalSales = 0;
    
    // Proyectos vs Independiente Chart Data
    let proyectosSales = 0;
    let independienteSales = 0;
    
    branchPerformance.forEach(b => {
      const loc = locations.find(l => l.id === b.id);
      const isDigital = loc?.channelType === "digital";
      
      const nameClean = b.name.toLowerCase().trim();
      const isProyecto = nameClean === "proyectos monterrey" || nameClean === "cdmx";
      
      // If a specific sucursal is filtered, we only sum that one
      if (selectedSucursal !== "all" && b.id !== selectedSucursal) return;
      
      if (isDigital) {
        digitalSales += b.realSales;
      } else {
        traditionalSales += b.realSales;
      }
      
      if (isProyecto) {
        proyectosSales += b.realSales;
      } else {
        independienteSales += b.realSales;
      }
    });

    const channelChartData = [
      { name: "Canal Tradicional", value: Math.round(traditionalSales) },
      { name: "Canal Digital", value: Math.round(digitalSales) }
    ];

    const projectsChartData = [
      { name: "Proyectos (Mty + CDMX)", value: Math.round(proyectosSales) },
      { name: "Venta Independiente", value: Math.round(independienteSales) }
    ];

    return {
      totalSales,
      avgTicket,
      pendingOrdersCount: pendingOrders.length,
      backlogAmount,
      backlogBalance,
      winRate,
      totalGoalAmount,
      goalAttainment,
      monthlyData,
      categoryChartData,
      topClientsData,
      branchPerformance,
      channelChartData,
      projectsChartData,
      chartYear,
      goalLabel: getGoalLabel(),
      activeRemisiones,
      activeFacturas
    };
  }, [remisiones, facturas, pedidos, goals, categories, locations, selectedYear, selectedSucursal, selectedMonth, resolveItemCategoryId, dateFilterType]);

  // Compute category drill down data reactively
  const drillDownData = useMemo(() => {
    if (!selectedDrillDownCategory) return [];

    const productTotals: { [key: string]: { name: string; sku: string; units: number; revenue: number } } = {};

    const processItems = (documents: any[]) => {
      documents.forEach(doc => {
        if (!doc.items || doc.items.length === 0) return;

        const docTotal = doc.totalAmount || 0;
        const itemsSum = doc.items.reduce((sum: number, item: any) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);

        doc.items.forEach((item: any) => {
          const catId = resolveItemCategoryId(item);
          const catName = categories[catId] || "Otros";

          if (catName === selectedDrillDownCategory) {
            const itemVal = (item.quantity || 0) * (item.unitPrice || 0);
            const weight = itemsSum > 0 ? (itemVal / itemsSum) : (1 / doc.items.length);
            const val = weight * docTotal;

            const prodId = item.productId || "unknown";
            const pInfo = productsMap[prodId] || {};
            const productName = item.name || pInfo.name || pInfo.Name || item.productId || "Producto desconocido";
            const productSku = item.sku || pInfo.sku || pInfo.SKU || "S/K";

            const key = `${prodId}_${productName}_${productSku}`;

            if (!productTotals[key]) {
              productTotals[key] = {
                name: productName,
                sku: productSku,
                units: 0,
                revenue: 0
              };
            }

            productTotals[key].units += item.quantity || 0;
            productTotals[key].revenue += val;
          }
        });
      });
    };

    processItems(stats.activeRemisiones || []);
    processItems(stats.activeFacturas || []);

    return Object.values(productTotals)
      .map(p => ({
        ...p,
        revenue: Math.round(p.revenue),
        units: Math.round(p.units * 100) / 100
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [selectedDrillDownCategory, stats.activeRemisiones, stats.activeFacturas, categories, productsMap, resolveItemCategoryId]);

  const filteredAndSortedDrillDownData = useMemo(() => {
    let result = [...drillDownData];

    // Search filter
    if (drillDownSearch.trim()) {
      const s = drillDownSearch.toLowerCase();
      result = result.filter(
        p => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)
      );
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = a[drillDownSortField];
      let valB: any = b[drillDownSortField];

      if (typeof valA === "string") {
        return drillDownSortDirection === "asc"
          ? valA.localeCompare(valB, 'es')
          : valB.localeCompare(valA, 'es');
      } else {
        return drillDownSortDirection === "asc"
          ? valA - valB
          : valB - valA;
      }
    });

    return result;
  }, [drillDownData, drillDownSearch, drillDownSortField, drillDownSortDirection]);

  // Listener to close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedDrillDownCategory(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleDrillDownSort = (field: "name" | "sku" | "units" | "revenue") => {
    if (drillDownSortField === field) {
      setDrillDownSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setDrillDownSortField(field);
      setDrillDownSortDirection("desc");
    }
  };

  // Compute product sales table data reactively
  const productSalesTableData = useMemo(() => {
    const agg: { [key: string]: {
      productId: string;
      productName: string;
      sku: string;
      categoryName: string;
      quantity: number;
      totalSales: number;
    } } = {};

    const filterAndAggregate = (docs: any[]) => {
      docs.forEach(doc => {
        if (doc.status === "cancelada") return;
        
        // Date range check
        const dateStr = doc.createdAt || doc.date;
        if (!dateStr) return;
        const docDate = new Date(dateStr);
        if (isNaN(docDate.getTime())) return;
        
        const docDateOnly = (() => {
          const year = docDate.getFullYear();
          const month = String(docDate.getMonth() + 1).padStart(2, '0');
          const day = String(docDate.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })(); // YYYY-MM-DD
        if (tableStartDate && docDateOnly < tableStartDate) return;
        if (tableEndDate && docDateOnly > tableEndDate) return;

        // Sucursal check
        if (tableSucursal !== "all" && doc.locationId !== tableSucursal) return;

        if (!doc.items || doc.items.length === 0) return;
        
        const docTotal = doc.totalAmount || 0;
        const docSub = doc.subtotal || (docTotal / 1.16);
        
        // Reference total depends on taxMode
        const referenceTotal = taxMode === "con_iva" ? docTotal : docSub;

        // Calculate sum of items in this document to get weights
        const docItemsSum = doc.items.reduce((sum: number, it: any) => sum + (it.quantity || 0) * (it.unitPrice || 0), 0);

        doc.items.forEach((item: any) => {
          const resolvedCatId = resolveItemCategoryId(item);

          // Category check
          if (tableCategory !== "all" && resolvedCatId !== tableCategory) return;

          const catName = categories[resolvedCatId] || "Sin Categoría";
          const key = `${item.productId}-${item.variantId || 'default'}`;

          if (!agg[key]) {
            agg[key] = {
              productId: item.productId,
              productName: item.productName || "Producto sin nombre",
              sku: item.sku || "-",
              categoryName: catName,
              quantity: 0,
              totalSales: 0
            };
          }
          
          const rawItemValue = (item.quantity || 0) * (item.unitPrice || 0);
          const weight = docItemsSum > 0 ? (rawItemValue / docItemsSum) : (1 / doc.items.length);
          const itemValue = weight * referenceTotal;

          agg[key].quantity += (item.quantity || 0);
          agg[key].totalSales += itemValue;
        });
      });
    };

    filterAndAggregate(remisiones);
    
    // For facturas, ignore those that are from remisiones
    const activeFacturas = facturas.filter(f => !f.posSaleId && !f.remisionId && !f.remissionId);
    filterAndAggregate(activeFacturas);

    let list = Object.values(agg);

    // Apply search filter
    if (tableSearch.trim() !== "") {
      const term = tableSearch.toLowerCase().trim();
      list = list.filter(item => 
        item.productName.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term)
      );
    }

    // Apply sort
    list.sort((a, b) => {
      let aVal = a[tableSortField as keyof typeof a];
      let bVal = b[tableSortField as keyof typeof b];

      if (typeof aVal === "number" && typeof bVal === "number") {
        return tableSortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal || "").toLowerCase();
      const bStr = String(bVal || "").toLowerCase();
      return tableSortDirection === "asc" 
        ? aStr.localeCompare(bStr, 'es')
        : bStr.localeCompare(aStr, 'es');
    });

    return list;
  }, [remisiones, facturas, categories, tableStartDate, tableEndDate, tableSucursal, tableCategory, tableSearch, tableSortField, tableSortDirection, resolveItemCategoryId, taxMode]);

  const tableTotals = useMemo(() => {
    return productSalesTableData.reduce((acc, item) => {
      acc.totalSales += item.totalSales || 0;
      acc.totalQuantity += item.quantity || 0;
      return acc;
    }, { totalSales: 0, totalQuantity: 0 });
  }, [productSalesTableData]);

  const branchPerformanceTotals = useMemo(() => {
    const totals = stats.branchPerformance.reduce((acc, b) => {
      acc.realSales += b.realSales || 0;
      acc.goal += b.goal || 0;
      return acc;
    }, { realSales: 0, goal: 0 });

    const percent = totals.goal > 0 ? Math.round((totals.realSales / totals.goal) * 100) : 0;
    const diff = totals.realSales - totals.goal;

    return {
      realSales: totals.realSales,
      goal: totals.goal,
      percent,
      diff
    };
  }, [stats.branchPerformance]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(amount);
  };

  const handleExportCSV = () => {
    if (stats.branchPerformance.length === 0) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Sucursal,Ventas Reales (MXN),Meta de Venta (MXN),Cumplimiento (%),Desviacion (MXN)\n";
    
    stats.branchPerformance.forEach(b => {
      csvContent += `"${b.name}",${b.realSales},${b.goal},${b.percent}%,${b.diff}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const suffix = dateFilterType === "por_mes" ? `${selectedYear}_mes_${selectedMonth}` : dateFilterType;
    link.setAttribute("download", `desempeno_comercial_${suffix}_${selectedSucursal}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTableSort = (field: string) => {
    if (tableSortField === field) {
      setTableSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setTableSortField(field);
      setTableSortDirection("desc");
    }
  };

  const renderTableSortIcon = (field: string) => {
    if (tableSortField !== field) return <span className="text-slate-300 ml-1">⇅</span>;
    return tableSortDirection === "asc" ? <span className="text-indigo-600 ml-1">▲</span> : <span className="text-indigo-600 ml-1">▼</span>;
  };

  const handleExportProductSalesCSV = () => {
    if (productSalesTableData.length === 0) return;
    
    const headers = ["Producto", "SKU", "Categoria", "Unidades Vendidas", "Ingreso Total (MXN)"];
    const rows = productSalesTableData.map(item => [
      item.productName,
      item.sku,
      item.categoryName,
      item.quantity,
      item.totalSales.toFixed(2)
    ]);
    
    const csvContent = "\uFEFF" + [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const startName = tableStartDate || "inicio";
    const endName = tableEndDate || "fin";
    link.setAttribute("download", `ventas_por_producto_${startName}_a_${endName}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm text-muted-foreground font-semibold">Cargando reporte de desempeño comercial...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6 pb-10">
      {/* Header & Global Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">Desempeño Comercial</h1>
          <p className="text-muted-foreground">
            Métricas de facturación real vs. metas presupuestadas por sucursal.
          </p>
        </div>
        
        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Sucursal filter */}
          <div className="flex flex-col gap-1 w-full sm:w-56">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sucursal</span>
            <select
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
              value={selectedSucursal}
              onChange={(e) => setSelectedSucursal(e.target.value)}
            >
              <option value="all">Todas las Sucursales</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          {/* Period filter */}
          <div className="flex flex-col gap-1 w-full sm:w-44">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Período</span>
            <select
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
              value={dateFilterType}
              onChange={(e) => setDateFilterType(e.target.value as any)}
            >
              <option value="por_mes">Por mes/año</option>
              <option value="hoy">Hoy</option>
              <option value="mes_fecha">Mes a la fecha</option>
              <option value="ano_fecha">Año a la fecha</option>
            </select>
          </div>

          {/* Month filter */}
          {dateFilterType === "por_mes" && (
            <div className="flex flex-col gap-1 w-full sm:w-36">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mes</span>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="all">Todos los Meses</option>
                <option value="1">Enero</option>
                <option value="2">Febrero</option>
                <option value="3">Marzo</option>
                <option value="4">Abril</option>
                <option value="5">Mayo</option>
                <option value="6">Junio</option>
                <option value="7">Julio</option>
                <option value="8">Agosto</option>
                <option value="9">Septiembre</option>
                <option value="10">Octubre</option>
                <option value="11">Noviembre</option>
                <option value="12">Diciembre</option>
              </select>
            </div>
          )}

          {/* Year toggle */}
          {dateFilterType === "por_mes" && (
            <div className="flex flex-col gap-1 w-full sm:w-28">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Año</span>
              <select
                className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none font-semibold text-slate-700 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </div>
          )}

          <div className="self-end w-full sm:w-auto pt-2">
            <Button variant="outline" className="gap-2 h-10 border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 w-full sm:w-auto" onClick={handleExportCSV}>
              <Download className="w-4 h-4" /> Exportar Tabla
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Venta Total */}
        <div className="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Venta Total Facturada</p>
              <h3 className="text-2xl font-black text-slate-800 mt-1">{formatMoney(stats.totalSales)}</h3>
            </div>
            <div className="p-2.5 bg-indigo-50 rounded-xl">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          {stats.totalGoalAmount > 0 ? (
            <div className="mt-4">
              <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                <span>{stats.goalLabel}</span>
                <span className={stats.goalAttainment >= 100 ? "text-emerald-600" : stats.goalAttainment >= 80 ? "text-amber-600" : "text-rose-500"}>
                  {stats.goalAttainment.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    stats.goalAttainment >= 100 ? "bg-emerald-500" : stats.goalAttainment >= 80 ? "bg-amber-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.min(100, stats.goalAttainment)}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-400" /> Sin meta de venta asignada.
            </p>
          )}
        </div>

        {/* KPI 2: Backlog */}
        <div className="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Backlog (Por Surtir)</p>
              <h3 className="text-2xl font-black text-amber-600 mt-1">{formatMoney(stats.backlogAmount)}</h3>
            </div>
            <div className="p-2.5 bg-amber-50 rounded-xl">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-semibold">Pedidos:</span>
              <span className="text-slate-700 font-bold">{stats.pendingOrdersCount}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-semibold">Por cobrar:</span>
              <span className="text-rose-600 font-black">{formatMoney(stats.backlogBalance)}</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Win Rate */}
        <div className="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conversión (Win Rate)</p>
              <h3 className="text-2xl font-black text-slate-800 mt-1">
                {stats.winRate.toFixed(1)}%
              </h3>
            </div>
            <div className="p-2.5 bg-sky-50 rounded-xl">
              <Target className="w-5 h-5 text-sky-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            Sin cotizaciones activas en Firestore.
          </p>
        </div>

        {/* KPI 4: Ticket Promedio */}
        <div className="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ticket Promedio</p>
              <h3 className="text-2xl font-black text-slate-800 mt-1">{formatMoney(stats.avgTicket)}</h3>
            </div>
            <div className="p-2.5 bg-emerald-50 rounded-xl">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Calculado del total de entregas efectuadas
          </p>
        </div>
      </div>

      {/* Charts Row 1: Sales vs Goal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border rounded-xl p-6 shadow-sm lg:col-span-2 flex flex-col">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Ventas Facturadas vs Meta ({stats.chartYear})
          </h3>
          <div className="h-[300px] w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats.monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12}} 
                  tickFormatter={(val) => `$${val >= 1000000 ? (val/1000000).toFixed(1) + 'M' : val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                  dx={-10}
                />
                <RechartsTooltip 
                  formatter={(value: any) => [formatMoney(value), undefined]}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontFamily: 'inherit'}}
                />
                <Legend wrapperStyle={{paddingTop: '20px'}} />
                <Bar dataKey="ventas" name="Ventas Reales" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                {stats.totalGoalAmount > 0 && (
                  <Line type="monotone" dataKey="meta" name="Meta de Venta" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Categories Pie Chart */}
        <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              Venta por Categoría
              <span className="text-[9px] font-normal text-slate-400 border border-slate-100 px-1.5 py-0.5 rounded bg-slate-50">Drill down disponible</span>
            </h3>
            {stats.categoryChartData.length > 0 && (
              <span className="text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg">
                Total: {formatMoney(stats.totalSales)}
              </span>
            )}
          </div>
          
          {stats.categoryChartData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <Package className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm text-slate-400 font-semibold">Sin ventas en el período</p>
            </div>
          ) : (
            <>
              <div className="h-[200px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.categoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      onClick={(data) => {
                        if (data && data.name) {
                          setSelectedDrillDownCategory(data.name);
                          setDrillDownSearch("");
                        }
                      }}
                      className="cursor-pointer outline-none focus:outline-none"
                    >
                      {stats.categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any) => [formatMoney(value), "Venta"]}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-4 space-y-2 max-h-[120px] overflow-y-auto custom-scrollbar pr-2">
                {stats.categoryChartData.slice(0, 5).map((cat, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50/80 p-1.5 rounded-lg transition-all"
                    onClick={() => {
                      setSelectedDrillDownCategory(cat.name);
                      setDrillDownSearch("");
                    }}
                    title="Haz clic para ver el detalle de productos"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{backgroundColor: COLORS[idx % COLORS.length]}}></div>
                      <span className="text-slate-600 truncate font-semibold">{cat.name}</span>
                    </div>
                    <span className="text-slate-500 font-bold whitespace-nowrap">{formatMoney(cat.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Charts Row 2: Digital vs Tradicional & Proyectos vs Independiente */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Digital vs Tradicional */}
        <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Digital Vs Tradicional
            </h3>
            {stats.totalSales > 0 && (
              <span className="text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg">
                Total: {formatMoney(stats.totalSales)}
              </span>
            )}
          </div>
          
          {stats.channelChartData.reduce((acc, c) => acc + c.value, 0) === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <TrendingUp className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm text-slate-400 font-semibold">Sin ventas en el período</p>
            </div>
          ) : (
            <>
              <div className="h-[200px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.channelChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {stats.channelChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? "#6366f1" : "#ec4899"} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any) => [formatMoney(value), "Venta"]}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4">
                {stats.channelChartData.map((channel, idx) => {
                  const channelTotal = stats.channelChartData.reduce((acc, c) => acc + c.value, 0);
                  const percent = channelTotal > 0 ? (channel.value / channelTotal) * 100 : 0;
                  return (
                    <div key={idx} className="text-center">
                      <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">{channel.name}</span>
                      <h4 className="text-base font-extrabold text-slate-800 mt-1">{formatMoney(channel.value)}</h4>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full mt-1 inline-block border ${
                        idx === 0 ? "bg-indigo-50 text-indigo-700 border-indigo-100" : "bg-pink-50 text-pink-700 border-pink-100"
                      }`}>
                        {percent.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Proyectos vs Independiente */}
        <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              Venta en Proyectos Vs Independiente
            </h3>
            {stats.totalSales > 0 && (
              <span className="text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg">
                Total: {formatMoney(stats.totalSales)}
              </span>
            )}
          </div>
          
          {stats.projectsChartData.reduce((acc, p) => acc + p.value, 0) === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <Package className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm text-slate-400 font-semibold">Sin ventas en el período</p>
            </div>
          ) : (
            <>
              <div className="h-[200px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.projectsChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {stats.projectsChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? "#10b981" : "#3b82f6"} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any) => [formatMoney(value), "Venta"]}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4">
                {stats.projectsChartData.map((group, idx) => {
                  const groupTotal = stats.projectsChartData.reduce((acc, p) => acc + p.value, 0);
                  const percent = groupTotal > 0 ? (group.value / groupTotal) * 100 : 0;
                  return (
                    <div key={idx} className="text-center">
                      <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">{group.name}</span>
                      <h4 className="text-base font-extrabold text-slate-800 mt-1">{formatMoney(group.value)}</h4>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full mt-1 inline-block border ${
                        idx === 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-blue-50 text-blue-700 border-blue-100"
                      }`}>
                        {percent.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 3: Top Clients & Branch Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Clients Chart */}
        <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Top 5 Clientes Facturados
          </h3>
          {stats.topClientsData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <Users className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm text-slate-400 font-semibold">Sin clientes facturados</p>
            </div>
          ) : (
            <div className="h-[250px] w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={stats.topClientsData}
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(val) => `$${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} tick={{fill: '#64748b', fontSize: 11}} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 10, fontWeight: 600}} width={90} />
                  <RechartsTooltip 
                    formatter={(value: any) => [formatMoney(value), "Venta"]}
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    cursor={{fill: '#f8fafc'}}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={15}>
                    {stats.topClientsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#6366f1' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Branch Desempeño Table */}
        <div className="bg-white border rounded-xl p-6 shadow-sm lg:col-span-2 flex flex-col">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            Tabla de Desempeño por Sucursal
          </h3>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b">
                <tr>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3 text-right">Venta Real</th>
                  <th className="px-4 py-3 text-right">Meta Presupuesto</th>
                  <th className="px-4 py-3 text-right">Cumplimiento</th>
                  <th className="px-4 py-3 text-right">Desviación</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-700">
                {stats.branchPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                      No se encontraron sucursales activas.
                    </td>
                  </tr>
                ) : (
                  stats.branchPerformance.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{b.name}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{formatMoney(b.realSales)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-500">{formatMoney(b.goal)}</td>
                      <td className="px-4 py-3 text-right">
                        {b.goal > 0 ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-xs ${
                            b.percent >= 100 ? "bg-emerald-50 text-emerald-700" : b.percent >= 80 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                          }`}>
                            {b.percent}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic font-medium">Sin meta</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold text-xs ${b.diff >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {b.diff >= 0 ? `+${formatMoney(b.diff)}` : formatMoney(b.diff)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {stats.branchPerformance.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-800">
                  <tr>
                    <td className="px-4 py-3 font-bold text-slate-800">Total</td>
                    <td className="px-4 py-3 text-right font-black text-slate-900">{formatMoney(branchPerformanceTotals.realSales)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatMoney(branchPerformanceTotals.goal)}</td>
                    <td className="px-4 py-3 text-right">
                      {branchPerformanceTotals.goal > 0 ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-xs ${
                          branchPerformanceTotals.percent >= 100 ? "bg-emerald-100 text-emerald-800" : branchPerformanceTotals.percent >= 80 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
                        }`}>
                          {branchPerformanceTotals.percent}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic font-medium">Sin meta</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-black text-xs ${branchPerformanceTotals.diff >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                      {branchPerformanceTotals.diff >= 0 ? `+${formatMoney(branchPerformanceTotals.diff)}` : formatMoney(branchPerformanceTotals.diff)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Row 3: Venta por Producto */}
      <div className="bg-white border rounded-xl p-6 shadow-sm flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
          <div>
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              Detalle de Venta por Producto
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Listado detallado de unidades vendidas e ingresos generados por producto y categoría.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {/* Toggle Con/Sin IVA */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-sm shrink-0">
              <button
                type="button"
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  taxMode === "con_iva"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setTaxMode("con_iva")}
              >
                Con IVA
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  taxMode === "sin_iva"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setTaxMode("sin_iva")}
              >
                Sin IVA
              </button>
            </div>

            <div className="inline-flex items-center justify-between sm:justify-start px-3 py-1.5 rounded-lg text-sm sm:text-base font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 gap-2 shadow-sm">
              <span>Total: {formatMoney(tableTotals.totalSales)}</span>
              <span className="text-xs font-bold text-slate-500 bg-white border border-slate-100 px-2 py-0.5 rounded-md">
                {tableTotals.totalQuantity} uds
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="gap-2 h-9 border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 shadow-sm shrink-0"
              onClick={handleExportProductSalesCSV}
              disabled={productSalesTableData.length === 0}
            >
              <Download className="w-4 h-4" /> Exportar Ventas
            </Button>
          </div>
        </div>

        {/* Local Filters Bar */}
        <div className="flex flex-wrap items-end gap-3 bg-slate-50/50 p-4 border border-slate-100 rounded-xl">
          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Buscar Producto</span>
            <input 
              type="text"
              placeholder="Buscar por nombre o SKU..."
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs outline-none font-medium placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
            />
          </div>

          {/* Fecha */}
          <div className="flex flex-col gap-1 w-full sm:w-44">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fecha</span>
            <select
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs outline-none font-semibold text-slate-700 shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
              value={tableDateFilterOption}
              onChange={(e) => handleTableDateFilterChange(e.target.value)}
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

          {/* Rango de Fechas Condicional */}
          {tableDateFilterOption === "custom" && (
            <>
              {/* Desde */}
              <div className="flex flex-col gap-1 w-full sm:w-36">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Desde</span>
                <input 
                  type="date"
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs outline-none font-semibold text-slate-700 shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                  value={tableStartDate}
                  onChange={(e) => setTableStartDate(e.target.value)}
                />
              </div>

              {/* Hasta */}
              <div className="flex flex-col gap-1 w-full sm:w-36">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hasta</span>
                <input 
                  type="date"
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs outline-none font-semibold text-slate-700 shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
                  value={tableEndDate}
                  onChange={(e) => setTableEndDate(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Sucursal */}
          <div className="flex flex-col gap-1 w-full sm:w-48">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sucursal</span>
            <select
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs outline-none font-semibold text-slate-700 shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
              value={tableSucursal}
              onChange={(e) => setTableSucursal(e.target.value)}
            >
              <option value="all">Todas las Sucursales</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>

          {/* Categoría */}
          <div className="flex flex-col gap-1 w-full sm:w-48">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Categoría</span>
            <select
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs outline-none font-semibold text-slate-700 shadow-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all cursor-pointer"
              value={tableCategory}
              onChange={(e) => setTableCategory(e.target.value)}
            >
              <option value="all">Todas las Categorías</option>
              {Object.entries(categories).map(([catId, catName]) => (
                <option key={catId} value={catId}>{catName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border rounded-xl shadow-inner">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b">
              <tr>
                <th className="px-4 py-3.5 pl-6 cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleTableSort("productName")}>
                  Producto {renderTableSortIcon("productName")}
                </th>
                <th className="px-4 py-3.5 cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleTableSort("sku")}>
                  SKU {renderTableSortIcon("sku")}
                </th>
                <th className="px-4 py-3.5 cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleTableSort("categoryName")}>
                  Categoría {renderTableSortIcon("categoryName")}
                </th>
                <th className="px-4 py-3.5 text-right cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleTableSort("quantity")}>
                  Unidades Vendidas {renderTableSortIcon("quantity")}
                </th>
                <th className="px-4 py-3.5 text-right pr-6 cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleTableSort("totalSales")}>
                  Ingreso Total {renderTableSortIcon("totalSales")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {productSalesTableData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No se encontraron ventas de productos con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                productSalesTableData.map((item, idx) => (
                  <tr key={`${item.productId}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 pl-6 font-bold text-slate-900 text-xs sm:text-sm max-w-xs sm:max-w-md truncate" title={item.productName}>
                      {item.productName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 font-semibold">{item.sku}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {item.categoryName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-slate-900 font-mono text-xs sm:text-sm">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-right pr-6 font-extrabold text-emerald-600 font-mono text-xs sm:text-sm">
                      {formatMoney(item.totalSales)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Drill Down Modal */}
      {selectedDrillDownCategory && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedDrillDownCategory(null)}
        >
          <div 
            className="bg-white rounded-2xl border border-slate-100 shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  Desglose de Ventas por Producto
                </h3>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  Categoría: <span className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md font-extrabold">{selectedDrillDownCategory}</span>
                </p>
              </div>
              <button 
                onClick={() => setSelectedDrillDownCategory(null)}
                className="h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all font-bold text-lg"
              >
                &times;
              </button>
            </div>

            {/* Modal Filters/Search */}
            <div className="p-4 border-b bg-white flex items-center gap-3">
              <div className="relative flex-1">
                <input 
                  type="text"
                  placeholder="Buscar producto por nombre o SKU..."
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white pl-3 pr-8 text-xs outline-none font-medium placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm"
                  value={drillDownSearch}
                  onChange={(e) => setDrillDownSearch(e.target.value)}
                />
                {drillDownSearch && (
                  <button 
                    onClick={() => setDrillDownSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    &times;
                  </button>
                )}
              </div>
              
              <div className="text-xs font-extrabold text-slate-500 bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg whitespace-nowrap">
                Total Productos: {filteredAndSortedDrillDownData.length}
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="overflow-x-auto border border-slate-100 rounded-xl shadow-inner">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-extrabold tracking-wider border-b">
                    <tr>
                      <th 
                        className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors pl-6"
                        onClick={() => handleDrillDownSort("name")}
                      >
                        Producto {drillDownSortField === "name" ? (drillDownSortDirection === "asc" ? "▲" : "▼") : ""}
                      </th>
                      <th 
                        className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                        onClick={() => handleDrillDownSort("sku")}
                      >
                        SKU {drillDownSortField === "sku" ? (drillDownSortDirection === "asc" ? "▲" : "▼") : ""}
                      </th>
                      <th 
                        className="px-4 py-3 text-right cursor-pointer select-none hover:bg-slate-100 transition-colors"
                        onClick={() => handleDrillDownSort("units")}
                      >
                        Unidades Vendidas {drillDownSortField === "units" ? (drillDownSortDirection === "asc" ? "▲" : "▼") : ""}
                      </th>
                      <th 
                        className="px-4 py-3 text-right pr-6 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                        onClick={() => handleDrillDownSort("revenue")}
                      >
                        Monto Total (MXN) {drillDownSortField === "revenue" ? (drillDownSortDirection === "asc" ? "▲" : "▼") : ""}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700 text-xs">
                    {filteredAndSortedDrillDownData.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-slate-400 font-medium">
                          No se encontraron productos para esta categoría con los filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedDrillDownData.map((item, idx) => {
                        const totalCategorySales = drillDownData.reduce((sum, p) => sum + p.revenue, 0);
                        const percentage = totalCategorySales > 0 ? ((item.revenue / totalCategorySales) * 100).toFixed(1) : "0.0";
                        
                        return (
                          <tr key={`${item.name}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 pl-6 font-bold text-slate-900 max-w-xs truncate" title={item.name}>
                              {item.name}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-slate-500">{item.sku}</td>
                            <td className="px-4 py-3 text-right font-extrabold text-slate-900 font-mono">
                              {item.units}
                            </td>
                            <td className="px-4 py-3 text-right pr-6 font-extrabold text-emerald-600 font-mono">
                              <div className="flex flex-col items-end">
                                <span>{formatMoney(item.revenue)}</span>
                                <span className="text-[9px] font-black text-slate-400 mt-0.5">{percentage}% de la cat.</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50/50 border-t flex justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelectedDrillDownCategory(null)}
                className="font-bold text-slate-600 border-slate-200 hover:bg-slate-100"
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
