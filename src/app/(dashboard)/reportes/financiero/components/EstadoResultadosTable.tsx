"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  Filter,
  Layers,
  Search,
  TrendingDown,
  TrendingUp,
  Building2,
  PieChart,
  Minimize2,
  Maximize2,
  Eye,
  EyeOff,
  DollarSign,
  Receipt,
  BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface EstadoResultadosTableProps {
  locations: any[];
  remisiones: any[];
  facturas: any[];
  expenses: any[];
  expensesInbox: any[];
  costCenters: any[];
}

type ViewMode =
  | "monthly"
  | "quarterly"
  | "mom"
  | "yoy_month"
  | "qoq"
  | "yoy_quarter"
  | "yoy_year";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const MONTH_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"
];

const QUARTER_NAMES = ["Q1 (Ene-Mar)", "Q2 (Abr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dic)"];

// Timezone-safe date parser to prevent UTC offset day/month shifting
function parseDateParts(dateStr: string | undefined): { year: number; month: number } | null {
  if (!dateStr) return null;
  if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parts = dateStr.slice(0, 10).split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    if (!isNaN(year) && !isNaN(month)) {
      return { year, month };
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() };
}

function normalize(val: any): string {
  if (val === null || val === undefined) return "";
  let s = "";
  if (typeof val === "string") {
    s = val;
  } else if (typeof val === "number" || typeof val === "boolean") {
    s = String(val);
  } else if (typeof val === "object") {
    s = val.name || val.label || val.value || val.concept || "";
  }
  if (!s || typeof s !== "string") return "";
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export default function EstadoResultadosTable({
  locations,
  remisiones,
  facturas,
  expenses,
  expensesInbox,
  costCenters,
}: EstadoResultadosTableProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const currentQuarter = Math.floor(currentMonth / 3);

  // Filters & View State
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(currentQuarter);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [hideZeroRows, setHideZeroRows] = useState<boolean>(true);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    ingresos: true,
    costos: true,
    gastos: true,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => setExpandedSections({ ingresos: true, costos: true, gastos: true });
  const collapseAll = () => setExpandedSections({ ingresos: false, costos: false, gastos: false });

  // Available Years in Data
  const yearOptions = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(currentYear);
    yearsSet.add(currentYear - 1);
    yearsSet.add(currentYear - 2);

    const extractYear = (dateStr?: string) => {
      const p = parseDateParts(dateStr);
      if (p) yearsSet.add(p.year);
    };

    remisiones.forEach((r) => extractYear(r.date || r.createdAt));
    facturas.forEach((f) => extractYear(f.date || f.createdAt));
    expenses.forEach((e) => extractYear(e.date || e.createdAt));
    expensesInbox.forEach((i) => extractYear(i.date || i.createdAt));

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [remisiones, facturas, expenses, expensesInbox, currentYear]);

  // Location Name Map
  const locationNameMap = useMemo(() => {
    const map: { [id: string]: string } = {};
    locations.forEach((loc) => {
      map[loc.id] = (loc.name || loc.Name || "Sucursal General").trim();
    });
    return map;
  }, [locations]);

  // Cost Center Map by ID and by Normalized Name
  const costCenterMap = useMemo(() => {
    const map: { [id: string]: any } = {};
    costCenters.forEach((cc) => {
      map[cc.id] = cc;
    });
    return map;
  }, [costCenters]);

  const costCentersByName = useMemo(() => {
    const map: { [normName: string]: any } = {};
    costCenters.forEach((cc) => {
      map[normalize(cc.name)] = cc;
    });
    return map;
  }, [costCenters]);

  // Helper to determine Costo vs Gasto
  const isCostoOperativo = (name: string, type?: string) => {
    if (type && type.toLowerCase() === "costo") return true;
    if (type && type.toLowerCase() === "gasto") return false;

    const lower = normalize(name);
    if (lower.includes("sin centro")) return false; // Egresos sin asignar van a Gastos

    const costoKeywords = [
      "materia prima",
      "maquila",
      "compra de inventario",
      "inventario",
      "insumos de proyectos",
      "insumos",
      "fletes",
      "empaque ecommerce",
      "empaque producto",
      "empaque tienda",
      "empaque",
      "costo directo",
      "costo de venta",
      "costo operativo",
      "produccion",
      "fabricacion",
    ];
    return costoKeywords.some((kw) => lower.includes(kw));
  };

  // Robust Cost Center Resolution Helper (Cascade: Item -> Root -> Items list -> Bind ERP Account)
  const resolveCostCenter = (doc: any, item?: any): string => {
    // 1. Direct item-level costCenter
    if (item) {
      if (item.costCenterId && costCenterMap[item.costCenterId]) {
        return costCenterMap[item.costCenterId].name;
      }
      if (item.costCenterName) {
        const norm = normalize(item.costCenterName);
        if (costCentersByName[norm]) return costCentersByName[norm].name;
      }
    }

    // 2. Direct root costCenterId or costCenterName
    if (doc.costCenterId && costCenterMap[doc.costCenterId]) {
      return costCenterMap[doc.costCenterId].name;
    }
    if (doc.costCenterName) {
      const norm = normalize(doc.costCenterName);
      if (costCentersByName[norm]) return costCentersByName[norm].name;
    }

    // 3. Fallback to doc's items array if no specific item was passed
    if (doc.items && doc.items.length > 0) {
      for (const it of doc.items) {
        if (it.costCenterId && costCenterMap[it.costCenterId]) {
          return costCenterMap[it.costCenterId].name;
        }
        if (it.costCenterName) {
          const norm = normalize(it.costCenterName);
          if (costCentersByName[norm]) return costCentersByName[norm].name;
        }
      }
    }

    // 4. Fallback to accountName or accountCode (Bind ERP historical classification)
    const accName = normalize(doc.accountName || (item && item.accountName) || "");
    if (accName) {
      for (const [normCC, cc] of Object.entries(costCentersByName)) {
        if (accName.includes(normCC) || normCC.includes(accName)) {
          return cc.name;
        }
      }
      if (accName.includes("sueldo") || accName.includes("salario") || accName.includes("asimilad")) {
        if (costCentersByName["nomina"]) return costCentersByName["nomina"].name;
      }
      if (accName.includes("combustible") || accName.includes("gasolina")) {
        if (costCentersByName["gasolina"]) return costCentersByName["gasolina"].name;
      }
      if (accName.includes("comision") || accName.includes("bancari")) {
        if (costCentersByName["comisiones tpv"]) return costCentersByName["comisiones tpv"].name;
      }
      if (accName.includes("transporte") || accName.includes("flete") || accName.includes("envio")) {
        if (costCentersByName["fletes"]) return costCentersByName["fletes"].name;
      }
      if (accName.includes("personal")) {
        if (costCentersByName["gastos personales"]) return costCentersByName["gastos personales"].name;
      }
      if (accName.includes("arrendamiento") || accName.includes("renta")) {
        if (costCentersByName["renta tienda"]) return costCentersByName["renta tienda"].name;
      }
      if (accName.includes("general")) {
        if (costCentersByName["gastos generales"]) return costCentersByName["gastos generales"].name;
      }
      if (accName.includes("mantenimiento")) {
        if (costCentersByName["mantenimiento fabrica"]) return costCentersByName["mantenimiento fabrica"].name;
      }
      if (accName.includes("publicidad")) {
        if (costCentersByName["publicidad"]) return costCentersByName["publicidad"].name;
      }
    }

    return "Sin Centro de Costos Asignado";
  };

  // Process Incomes by [Location, Year, Month]
  const processedIncomes = useMemo(() => {
    const tree: { [location: string]: { [year: number]: { [month: number]: number } } } = {};
    const allLocations = new Set<string>();

    // Pre-populate with all registered locations
    locations.forEach((l) => {
      const name = (l.name || l.Name || "Sucursal General").trim();
      allLocations.add(name);
      if (!tree[name]) tree[name] = {};
    });

    const addIncome = (locName: string, dateStr: string | undefined, amount: number) => {
      if (!dateStr || isNaN(amount) || amount <= 0) return;
      const p = parseDateParts(dateStr);
      if (!p) return;

      allLocations.add(locName);
      if (!tree[locName]) tree[locName] = {};
      if (!tree[locName][p.year]) tree[locName][p.year] = {};
      tree[locName][p.year][p.month] = (tree[locName][p.year][p.month] || 0) + amount;
    };

    // 1. Remisiones
    remisiones.forEach((r) => {
      if (r.status === "cancelada") return;
      const locName = r.locationId && locationNameMap[r.locationId]
        ? locationNameMap[r.locationId]
        : (r.locationName || "Sin Sucursal / General");
      const val = Number(r.subtotal !== undefined && r.subtotal !== null && r.subtotal > 0 ? r.subtotal : (r.totalAmount || r.total || 0));
      addIncome(locName, r.date || r.createdAt, val);
    });

    // 2. Facturas (excluyendo vinculadas a remisiones o POS para evitar duplicidad)
    facturas.forEach((f) => {
      if (f.status === "cancelada" || f.posSaleId || f.remisionId || f.remissionId) return;
      const locName = f.locationId && locationNameMap[f.locationId]
        ? locationNameMap[f.locationId]
        : (f.locationName || "Sin Sucursal / General");
      const val = Number(f.subtotal !== undefined && f.subtotal !== null && f.subtotal > 0 ? f.subtotal : (f.totalAmount || f.total || 0));
      addIncome(locName, f.date || f.createdAt, val);
    });

    return { tree, locations: Array.from(allLocations).sort() };
  }, [remisiones, facturas, locations, locationNameMap]);

  // Function to identify non-operational / balance-sheet cost centers (e.g. debt repayment, federal taxes, dividends)
  const isNonOperationalCostCenter = (name: string): boolean => {
    const n = normalize(name);
    return (
      n.includes("pago deuda") ||
      n.includes("pago de impuestos") ||
      n.includes("pago iva") ||
      n.includes("iva trasladado") ||
      n.includes("amortizacion") ||
      n.includes("traspaso")
    );
  };

  // Function to detect non-operational / balance-sheet / debt / credit card payments
  const isNonOperationalExpense = (doc: any): boolean => {
    const concept = normalize(doc.concept || "");
    const vendor = normalize(doc.vendorName || doc.providerName || "");
    const cc = normalize(costCenterMap[doc.costCenterId] || doc.costCenterName || "");
    const itemsCC = normalize(doc.items?.map((it: any) => costCenterMap[it.costCenterId] || it.costCenterName || "").join(" ") || "");
    const acc = normalize(doc.accountName || "");
    const combined = `${concept} ${vendor} ${cc} ${itemsCC} ${acc}`;

    // Direct check against non-operational cost centers
    if (isNonOperationalCostCenter(cc) || isNonOperationalCostCenter(itemsCC)) {
      return true;
    }

    // 1. Credit card bill payments (Paying off credit card balances is a balance sheet flow)
    if (
      combined.includes("pago de servicio de tarjeta") ||
      combined.includes("pago de tarjeta de credito") ||
      combined.includes("pago tarjeta de credito") ||
      combined.includes("pago de tarjeta") ||
      combined.includes("pago tc") ||
      combined.includes("pago tarjeta b") ||
      (concept.includes("tarjeta de credito") && concept.includes("pago"))
    ) {
      return true;
    }

    // 2. Debt principal repayments and bank loan payments
    if (
      combined.includes("pago deuda") ||
      combined.includes("pago de deuda") ||
      combined.includes("amortizacion") ||
      combined.includes("pago de prestamo") ||
      combined.includes("cobro automatico de recibo/prestamo") ||
      combined.includes("recibo/prestamo") ||
      (concept.includes("prestamo") && concept.includes("pago"))
    ) {
      return true;
    }

    // 3. Tax payments to SAT (VAT / Income Tax pass-through)
    if (
      combined.includes("pago de impuestos") ||
      combined.includes("pago impuestos sat") ||
      combined.includes("pago iva") ||
      combined.includes("iva trasladado") ||
      combined.includes("pago de derechos sat")
    ) {
      return true;
    }

    // 4. Transfers between company accounts
    if (
      combined.includes("traspaso") ||
      combined.includes("transferencia entre cuentas")
    ) {
      return true;
    }

    return false;
  };

  // Process Expenses by [Category: Costo | Gasto, CostCenterName, Year, Month]
  const processedExpenses = useMemo(() => {
    const expSatIds = new Set<string>();
    const expDatesAndAmounts = new Set<string>();
    const seenProvisionalKeys = new Set<string>();

    expenses.forEach((e) => {
      if (e.satInvoiceId) expSatIds.add(String(e.satInvoiceId).toLowerCase());
      const date = (e.date || e.createdAt || "").slice(0, 10);
      const amt = Math.round(Number(e.subtotal || e.amount || e.total || 0) * 100);
      if (amt > 0) expDatesAndAmounts.add(`${date}_${amt}`);
    });

    const costosTree: { [ccName: string]: { [year: number]: { [month: number]: number } } } = {};
    const gastosTree: { [ccName: string]: { [year: number]: { [month: number]: number } } } = {};
    const allCostosCC = new Set<string>();
    const allGastosCC = new Set<string>();

    // Pre-populate with all registered cost centers (excluding non-operational ones like debt and tax pass-through)
    costCenters.forEach((cc) => {
      const name = cc.name || cc.code || "Centro General";
      if (isNonOperationalCostCenter(name)) return;
      if (isCostoOperativo(name, cc.type)) {
        allCostosCC.add(name);
        if (!costosTree[name]) costosTree[name] = {};
      } else {
        allGastosCC.add(name);
        if (!gastosTree[name]) gastosTree[name] = {};
      }
    });

    const addExpense = (ccName: string, isCosto: boolean, dateStr: string | undefined, amount: number) => {
      if (!dateStr || isNaN(amount) || amount <= 0) return;
      if (isNonOperationalCostCenter(ccName)) return;
      const p = parseDateParts(dateStr);
      if (!p) return;

      if (isCosto) {
        allCostosCC.add(ccName);
        if (!costosTree[ccName]) costosTree[ccName] = {};
        if (!costosTree[ccName][p.year]) costosTree[ccName][p.year] = {};
        costosTree[ccName][p.year][p.month] = (costosTree[ccName][p.year][p.month] || 0) + amount;
      } else {
        allGastosCC.add(ccName);
        if (!gastosTree[ccName]) gastosTree[ccName] = {};
        if (!gastosTree[ccName][p.year]) gastosTree[ccName][p.year] = {};
        gastosTree[ccName][p.year][p.month] = (gastosTree[ccName][p.year][p.month] || 0) + amount;
      }
    };

    const processDoc = (doc: any, isInbox = false) => {
      if (doc.status === "cancelado") return;

      // 1. Exclude non-operational payments (credit cards, debt principal, taxes, transfers)
      if (isNonOperationalExpense(doc)) return;

      const dateStr = doc.date || doc.createdAt;
      const val = Number(doc.subtotal !== undefined && doc.subtotal !== null && doc.subtotal > 0 ? doc.subtotal : (doc.amount || doc.totalAmount || doc.total || 0));
      if (val <= 0) return;

      // 2. Deduplicate exact provisional duplicates from AI auto-reconciler
      if (doc.createdBy === "Agente IA (Provisional)") {
        const dShort = (dateStr || "").slice(0, 10);
        const provKey = `${dShort}_${Math.round(val * 100)}_${normalize(doc.vendorName || doc.concept || "")}`;
        if (seenProvisionalKeys.has(provKey)) return;
        seenProvisionalKeys.add(provKey);
      }

      // If document has items with individual amounts and cost centers, allocate item by item
      if (doc.items && doc.items.length > 0 && doc.items.some((it: any) => it.costCenterId || it.amount || it.subtotal)) {
        doc.items.forEach((it: any) => {
          const itemVal = Number(it.subtotal || it.amount || ((it.quantity || 1) * (it.unitCost || 0)) || 0);
          if (itemVal <= 0) return;
          const ccName = resolveCostCenter(doc, it);
          const isCost = isCostoOperativo(ccName);
          addExpense(ccName, isCost, dateStr, itemVal);
        });
      } else {
        const ccName = resolveCostCenter(doc);
        const isCost = isCostoOperativo(ccName);
        addExpense(ccName, isCost, dateStr, val);
      }
    };

    // Process all expenses (the authoritative expense ledger)
    expenses.forEach((e) => processDoc(e, false));

    // For expenses_inbox, only process distinct non-duplicate purchase invoices not yet in expenses
    expensesInbox.forEach((i) => {
      if (expSatIds.has(String(i.id).toLowerCase())) return;
      const date = (i.date || i.createdAt || "").slice(0, 10);
      const amt = Math.round(Number(i.subtotal || i.total || 0) * 100);
      // Skip if already matching an existing expense by date and amount
      if (expDatesAndAmounts.has(`${date}_${amt}`)) return;
      processDoc(i, true);
    });

    return {
      costosTree,
      costosCC: Array.from(allCostosCC).sort(),
      gastosTree,
      gastosCC: Array.from(allGastosCC).sort(),
    };
  }, [expenses, expensesInbox, costCenters, costCenterMap, costCentersByName]);

  // Dynamic Columns Configuration based on View Mode
  interface TableColumn {
    id: string;
    label: string;
    subLabel?: string;
    isTotal?: boolean;
    isVariance?: boolean;
    isPercentage?: boolean;
    getValue: (tree: { [year: number]: { [month: number]: number } } | undefined) => number;
  }

  const columns: TableColumn[] = useMemo(() => {
    const getMonthVal = (tree: { [y: number]: { [m: number]: number } } | undefined, y: number, m: number) => {
      return (tree && tree[y] && tree[y][m]) || 0;
    };

    const getQuarterVal = (tree: { [y: number]: { [m: number]: number } } | undefined, y: number, q: number) => {
      const startMonth = q * 3;
      return (
        getMonthVal(tree, y, startMonth) +
        getMonthVal(tree, y, startMonth + 1) +
        getMonthVal(tree, y, startMonth + 2)
      );
    };

    const getYearVal = (tree: { [y: number]: { [m: number]: number } } | undefined, y: number) => {
      let sum = 0;
      for (let m = 0; m < 12; m++) {
        sum += getMonthVal(tree, y, m);
      }
      return sum;
    };

    if (viewMode === "monthly") {
      const cols: TableColumn[] = MONTH_SHORT.map((name, mIdx) => ({
        id: `month_${mIdx}`,
        label: name,
        subLabel: `${selectedYear}`,
        getValue: (tree) => getMonthVal(tree, selectedYear, mIdx),
      }));

      cols.push({
        id: "total_accumulated",
        label: "Total Acumulado",
        subLabel: `${selectedYear}`,
        isTotal: true,
        getValue: (tree) => getYearVal(tree, selectedYear),
      });

      return cols;
    }

    if (viewMode === "quarterly") {
      const cols: TableColumn[] = QUARTER_NAMES.map((name, qIdx) => ({
        id: `q_${qIdx}`,
        label: name,
        subLabel: `${selectedYear}`,
        getValue: (tree) => getQuarterVal(tree, selectedYear, qIdx),
      }));

      cols.push({
        id: "total_year",
        label: "Total Anual",
        subLabel: `${selectedYear}`,
        isTotal: true,
        getValue: (tree) => getYearVal(tree, selectedYear),
      });

      return cols;
    }

    if (viewMode === "mom") {
      const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;

      return [
        {
          id: "curr_month",
          label: `${MONTH_NAMES[selectedMonth]} ${selectedYear}`,
          subLabel: "Mes Actual",
          getValue: (tree) => getMonthVal(tree, selectedYear, selectedMonth),
        },
        {
          id: "prev_month",
          label: `${MONTH_NAMES[prevMonth]} ${prevYear}`,
          subLabel: "Mes Anterior",
          getValue: (tree) => getMonthVal(tree, prevYear, prevMonth),
        },
        {
          id: "diff_abs",
          label: "Variación ($)",
          subLabel: "Diferencia",
          isVariance: true,
          getValue: (tree) =>
            getMonthVal(tree, selectedYear, selectedMonth) -
            getMonthVal(tree, prevYear, prevMonth),
        },
        {
          id: "diff_pct",
          label: "Variación (%)",
          subLabel: "Crecimiento",
          isPercentage: true,
          getValue: (tree) => {
            const curr = getMonthVal(tree, selectedYear, selectedMonth);
            const prev = getMonthVal(tree, prevYear, prevMonth);
            if (prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / Math.abs(prev)) * 100;
          },
        },
      ];
    }

    if (viewMode === "yoy_month") {
      const lastYear = selectedYear - 1;

      return [
        {
          id: "curr_year_m",
          label: `${MONTH_NAMES[selectedMonth]} ${selectedYear}`,
          subLabel: "Año Actual",
          getValue: (tree) => getMonthVal(tree, selectedYear, selectedMonth),
        },
        {
          id: "last_year_m",
          label: `${MONTH_NAMES[selectedMonth]} ${lastYear}`,
          subLabel: "Año Anterior",
          getValue: (tree) => getMonthVal(tree, lastYear, selectedMonth),
        },
        {
          id: "diff_abs",
          label: "Variación ($)",
          subLabel: "Diferencia YoY",
          isVariance: true,
          getValue: (tree) =>
            getMonthVal(tree, selectedYear, selectedMonth) -
            getMonthVal(tree, lastYear, selectedMonth),
        },
        {
          id: "diff_pct",
          label: "Variación (%)",
          subLabel: "Crecimiento YoY",
          isPercentage: true,
          getValue: (tree) => {
            const curr = getMonthVal(tree, selectedYear, selectedMonth);
            const prev = getMonthVal(tree, lastYear, selectedMonth);
            if (prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / Math.abs(prev)) * 100;
          },
        },
      ];
    }

    if (viewMode === "qoq") {
      const prevQuarter = selectedQuarter === 0 ? 3 : selectedQuarter - 1;
      const prevYear = selectedQuarter === 0 ? selectedYear - 1 : selectedYear;

      return [
        {
          id: "curr_q",
          label: `${QUARTER_NAMES[selectedQuarter]} ${selectedYear}`,
          subLabel: "Trimestre Actual",
          getValue: (tree) => getQuarterVal(tree, selectedYear, selectedQuarter),
        },
        {
          id: "prev_q",
          label: `${QUARTER_NAMES[prevQuarter]} ${prevYear}`,
          subLabel: "Trimestre Anterior",
          getValue: (tree) => getQuarterVal(tree, prevYear, prevQuarter),
        },
        {
          id: "diff_abs",
          label: "Variación ($)",
          subLabel: "Diferencia",
          isVariance: true,
          getValue: (tree) =>
            getQuarterVal(tree, selectedYear, selectedQuarter) -
            getQuarterVal(tree, prevYear, prevQuarter),
        },
        {
          id: "diff_pct",
          label: "Variación (%)",
          subLabel: "Crecimiento",
          isPercentage: true,
          getValue: (tree) => {
            const curr = getQuarterVal(tree, selectedYear, selectedQuarter);
            const prev = getQuarterVal(tree, prevYear, prevQuarter);
            if (prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / Math.abs(prev)) * 100;
          },
        },
      ];
    }

    if (viewMode === "yoy_quarter") {
      const lastYear = selectedYear - 1;

      return [
        {
          id: "curr_q_yoy",
          label: `${QUARTER_NAMES[selectedQuarter]} ${selectedYear}`,
          subLabel: "Año Actual",
          getValue: (tree) => getQuarterVal(tree, selectedYear, selectedQuarter),
        },
        {
          id: "last_q_yoy",
          label: `${QUARTER_NAMES[selectedQuarter]} ${lastYear}`,
          subLabel: "Año Anterior",
          getValue: (tree) => getQuarterVal(tree, lastYear, selectedQuarter),
        },
        {
          id: "diff_abs",
          label: "Variación ($)",
          subLabel: "Diferencia YoY",
          isVariance: true,
          getValue: (tree) =>
            getQuarterVal(tree, selectedYear, selectedQuarter) -
            getQuarterVal(tree, lastYear, selectedQuarter),
        },
        {
          id: "diff_pct",
          label: "Variación (%)",
          subLabel: "Crecimiento YoY",
          isPercentage: true,
          getValue: (tree) => {
            const curr = getQuarterVal(tree, selectedYear, selectedQuarter);
            const prev = getQuarterVal(tree, lastYear, selectedQuarter);
            if (prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / Math.abs(prev)) * 100;
          },
        },
      ];
    }

    // yoy_year
    const lastYear = selectedYear - 1;
    return [
      {
        id: "curr_year_full",
        label: `Año ${selectedYear}`,
        subLabel: "Actual",
        getValue: (tree) => getYearVal(tree, selectedYear),
      },
      {
        id: "last_year_full",
        label: `Año ${lastYear}`,
        subLabel: "Anterior",
        getValue: (tree) => getYearVal(tree, lastYear),
      },
      {
        id: "diff_abs",
        label: "Variación ($)",
        subLabel: "Diferencia YoY",
        isVariance: true,
        getValue: (tree) => getYearVal(tree, selectedYear) - getYearVal(tree, lastYear),
      },
      {
        id: "diff_pct",
        label: "Variación (%)",
        subLabel: "Crecimiento YoY",
        isPercentage: true,
        getValue: (tree) => {
          const curr = getYearVal(tree, selectedYear);
          const prev = getYearVal(tree, lastYear);
          if (prev === 0) return curr > 0 ? 100 : 0;
          return ((curr - prev) / Math.abs(prev)) * 100;
        },
      },
    ];
  }, [viewMode, selectedYear, selectedMonth, selectedQuarter]);

  // Aggregate Totals by Column for High-Level Sections
  const totalsByCol = useMemo(() => {
    return columns.map((col) => {
      let totalIngresos = 0;
      processedIncomes.locations.forEach((loc) => {
        totalIngresos += col.getValue(processedIncomes.tree[loc]);
      });

      let totalCostos = 0;
      processedExpenses.costosCC.forEach((cc) => {
        totalCostos += col.getValue(processedExpenses.costosTree[cc]);
      });

      const utilidadBruta = totalIngresos - totalCostos;
      const margenBrutoPct = totalIngresos > 0 ? (utilidadBruta / totalIngresos) * 100 : 0;

      let totalGastos = 0;
      processedExpenses.gastosCC.forEach((cc) => {
        totalGastos += col.getValue(processedExpenses.gastosTree[cc]);
      });

      const utilidadOperacion = utilidadBruta - totalGastos;
      const margenOperativoPct = totalIngresos > 0 ? (utilidadOperacion / totalIngresos) * 100 : 0;

      return {
        colId: col.id,
        totalIngresos,
        totalCostos,
        utilidadBruta,
        margenBrutoPct,
        totalGastos,
        utilidadOperacion,
        margenOperativoPct,
      };
    });
  }, [columns, processedIncomes, processedExpenses]);

  // Filter Locations & Cost Centers by Search & Zero-Row Suppression
  const filteredLocations = useMemo(() => {
    let list = processedIncomes.locations;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((loc) => loc.toLowerCase().includes(q));
    }
    if (hideZeroRows) {
      list = list.filter((loc) => {
        const tree = processedIncomes.tree[loc];
        return columns.some((col) => Math.abs(col.getValue(tree)) > 0.01);
      });
    }
    return list;
  }, [processedIncomes, searchTerm, hideZeroRows, columns]);

  const filteredCostosCC = useMemo(() => {
    let list = processedExpenses.costosCC;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((cc) => cc.toLowerCase().includes(q));
    }
    if (hideZeroRows) {
      list = list.filter((cc) => {
        const tree = processedExpenses.costosTree[cc];
        return columns.some((col) => Math.abs(col.getValue(tree)) > 0.01);
      });
    }
    return list;
  }, [processedExpenses, searchTerm, hideZeroRows, columns]);

  const filteredGastosCC = useMemo(() => {
    let list = processedExpenses.gastosCC;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((cc) => cc.toLowerCase().includes(q));
    }
    if (hideZeroRows) {
      list = list.filter((cc) => {
        const tree = processedExpenses.gastosTree[cc];
        return columns.some((col) => Math.abs(col.getValue(tree)) > 0.01);
      });
    }
    return list;
  }, [processedExpenses, searchTerm, hideZeroRows, columns]);

  // Currency & Percentage Formatting
  const formatMoney = (val: number) => {
    if (Math.abs(val) < 0.01) return "-";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatPct = (val: number) => {
    if (isNaN(val) || !isFinite(val)) return "0.0%";
    const prefix = val > 0 ? "+" : "";
    return `${prefix}${val.toFixed(1)}%`;
  };

  // Primary metric for KPI cards (takes the total/accumulated or primary column)
  const primaryColIdx = useMemo(() => {
    const totalIdx = columns.findIndex((c) => c.isTotal);
    return totalIdx !== -1 ? totalIdx : 0;
  }, [columns]);

  const activeTotals = totalsByCol[primaryColIdx] || {
    totalIngresos: 0,
    totalCostos: 0,
    utilidadBruta: 0,
    margenBrutoPct: 0,
    totalGastos: 0,
    utilidadOperacion: 0,
    margenOperativoPct: 0,
  };

  // CSV Export
  const exportToCSV = () => {
    const headers = ["Concepto", ...columns.map((c) => `${c.label} (${c.subLabel || ""})`)];
    const rows: string[][] = [];

    const makeRow = (
      name: string,
      getValue: (col: TableColumn, cIdx: number) => number | string
    ) => {
      const row = [`"${name}"`];
      columns.forEach((col, idx) => {
        const val = getValue(col, idx);
        row.push(typeof val === "number" ? val.toFixed(2) : `"${val}"`);
      });
      return row;
    };

    rows.push(['"--- 1. INGRESOS OPERATIVOS ---"']);
    filteredLocations.forEach((loc) => {
      rows.push(makeRow(loc, (col) => col.getValue(processedIncomes.tree[loc])));
    });
    rows.push(makeRow("TOTAL INGRESOS OPERATIVOS", (col, idx) => totalsByCol[idx].totalIngresos));

    rows.push(['"--- 2. COSTOS OPERATIVOS ---"']);
    filteredCostosCC.forEach((cc) => {
      rows.push(makeRow(cc, (col) => col.getValue(processedExpenses.costosTree[cc])));
    });
    rows.push(makeRow("TOTAL COSTOS OPERATIVOS", (col, idx) => totalsByCol[idx].totalCostos));

    rows.push(makeRow("UTILIDAD BRUTA", (col, idx) => totalsByCol[idx].utilidadBruta));
    rows.push(makeRow("MARGEN BRUTO (%)", (col, idx) => `${totalsByCol[idx].margenBrutoPct.toFixed(1)}%`));

    rows.push(['"--- 3. GASTOS OPERATIVOS ---"']);
    filteredGastosCC.forEach((cc) => {
      rows.push(makeRow(cc, (col) => col.getValue(processedExpenses.gastosTree[cc])));
    });
    rows.push(makeRow("TOTAL GASTOS OPERATIVOS", (col, idx) => totalsByCol[idx].totalGastos));

    rows.push(makeRow("UTILIDAD DE OPERACIÓN (EBITDA)", (col, idx) => totalsByCol[idx].utilidadOperacion));
    rows.push(makeRow("MARGEN OPERATIVO (%)", (col, idx) => `${totalsByCol[idx].margenOperativoPct.toFixed(1)}%`));

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Estado_Resultados_${viewMode}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
      {/* KPI Cards: High-Level View of Current Selected Scope */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* 1. Ingresos */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Ingresos Netos</span>
            <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {formatMoney(activeTotals.totalIngresos)}
          </div>
          <span className="text-[10px] text-muted-foreground mt-1">
            Ventas de {filteredLocations.length} sucursales
          </span>
        </div>

        {/* 2. Costos */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Costos Op.</span>
            <div className="p-1.5 bg-amber-50 rounded-lg text-amber-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-amber-900">
            {formatMoney(activeTotals.totalCostos)}
          </div>
          <span className="text-[10px] text-muted-foreground mt-1">
            Materia prima, fletes, maquila
          </span>
        </div>

        {/* 3. Utilidad Bruta */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between border-emerald-100">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Utilidad Bruta</span>
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-900">
            {formatMoney(activeTotals.utilidadBruta)}
          </div>
          <span className="text-[10px] font-bold text-emerald-600 mt-1">
            Margen: {activeTotals.margenBrutoPct.toFixed(1)}%
          </span>
        </div>

        {/* 4. Gastos */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Gastos Op.</span>
            <div className="p-1.5 bg-rose-50 rounded-lg text-rose-600">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-rose-900">
            {formatMoney(activeTotals.totalGastos)}
          </div>
          <span className="text-[10px] text-muted-foreground mt-1">
            Nómina, rentas, admon.
          </span>
        </div>

        {/* 5. EBITDA */}
        <div className="bg-slate-900 text-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-300 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">EBITDA Op.</span>
            <div className="p-1.5 bg-slate-800 rounded-lg text-amber-400">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl font-black ${activeTotals.utilidadOperacion >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {formatMoney(activeTotals.utilidadOperacion)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            Margen Op: {activeTotals.margenOperativoPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Control Bar & Filters */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* View Mode Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-indigo-600" />
              Vista:
            </span>

            <div className="bg-slate-100 p-1 rounded-xl flex flex-wrap gap-1">
              <Button
                variant={viewMode === "monthly" ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-8 ${viewMode === "monthly" ? "bg-white text-indigo-700 font-bold shadow-sm" : "text-slate-600"}`}
                onClick={() => setViewMode("monthly")}
              >
                12 Meses
              </Button>
              <Button
                variant={viewMode === "quarterly" ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-8 ${viewMode === "quarterly" ? "bg-white text-indigo-700 font-bold shadow-sm" : "text-slate-600"}`}
                onClick={() => setViewMode("quarterly")}
              >
                Trimestral
              </Button>
              <Button
                variant={viewMode === "mom" ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-8 ${viewMode === "mom" ? "bg-white text-indigo-700 font-bold shadow-sm" : "text-slate-600"}`}
                onClick={() => setViewMode("mom")}
              >
                Mes vs Mes Ant.
              </Button>
              <Button
                variant={viewMode === "yoy_month" ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-8 ${viewMode === "yoy_month" ? "bg-white text-indigo-700 font-bold shadow-sm" : "text-slate-600"}`}
                onClick={() => setViewMode("yoy_month")}
              >
                Mismo Mes Año Ant.
              </Button>
              <Button
                variant={viewMode === "qoq" ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-8 ${viewMode === "qoq" ? "bg-white text-indigo-700 font-bold shadow-sm" : "text-slate-600"}`}
                onClick={() => setViewMode("qoq")}
              >
                Trim vs Trim Ant.
              </Button>
              <Button
                variant={viewMode === "yoy_quarter" ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-8 ${viewMode === "yoy_quarter" ? "bg-white text-indigo-700 font-bold shadow-sm" : "text-slate-600"}`}
                onClick={() => setViewMode("yoy_quarter")}
              >
                Mismo Trim Año Ant.
              </Button>
              <Button
                variant={viewMode === "yoy_year" ? "default" : "ghost"}
                size="sm"
                className={`text-xs h-8 ${viewMode === "yoy_year" ? "bg-white text-indigo-700 font-bold shadow-sm" : "text-slate-600"}`}
                onClick={() => setViewMode("yoy_year")}
              >
                Año vs Año Ant.
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Hide Zero Rows Toggle */}
            <Button
              variant={hideZeroRows ? "secondary" : "outline"}
              size="sm"
              onClick={() => setHideZeroRows(!hideZeroRows)}
              className={`h-8 gap-1.5 text-xs font-semibold ${
                hideZeroRows
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
              title={hideZeroRows ? "Mostrando solo filas con movimientos" : "Mostrando todas las filas"}
            >
              {hideZeroRows ? <EyeOff className="w-3.5 h-3.5 text-indigo-600" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
              {hideZeroRows ? "Filas activas" : "Todas las filas"}
            </Button>

            {/* Expand / Collapse All */}
            <div className="flex items-center border rounded-lg bg-slate-50 p-0.5 text-xs text-slate-500">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={expandAll}
                title="Expandir todas las secciones"
              >
                <Maximize2 className="w-3.5 h-3.5 mr-1" /> Expandir
              </Button>
              <div className="w-[1px] h-4 bg-slate-200" />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={collapseAll}
                title="Colapsar todas las secciones"
              >
                <Minimize2 className="w-3.5 h-3.5 mr-1" /> Colapsar
              </Button>
            </div>

            {/* Export CSV */}
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              className="h-8 gap-1.5 text-xs font-semibold bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600" /> Exportar CSV
            </Button>
          </div>
        </div>

        {/* Dynamic Contextual Selectors (Year, Month, Quarter, Search) */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Year Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold">Año:</span>
            <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
              <SelectTrigger className="w-[95px] h-8 text-xs bg-slate-50 border-slate-200 font-bold">
                <SelectValue placeholder="Año" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((yr) => (
                  <SelectItem key={yr} value={String(yr)}>
                    {yr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month Selector for month-based comparative views */}
          {(viewMode === "mom" || viewMode === "yoy_month") && (
            <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
              <span className="text-slate-500 font-semibold">Mes de Referencia:</span>
              <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
                <SelectTrigger className="w-[130px] h-8 text-xs bg-slate-50 border-slate-200 font-bold">
                  <SelectValue placeholder="Mes" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quarter Selector for quarter-based comparative views */}
          {(viewMode === "qoq" || viewMode === "yoy_quarter") && (
            <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
              <span className="text-slate-500 font-semibold">Trimestre de Referencia:</span>
              <Select value={String(selectedQuarter)} onValueChange={(val) => setSelectedQuarter(Number(val))}>
                <SelectTrigger className="w-[140px] h-8 text-xs bg-slate-50 border-slate-200 font-bold">
                  <SelectValue placeholder="Trimestre" />
                </SelectTrigger>
                <SelectContent>
                  {QUARTER_NAMES.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Search Input */}
          <div className="relative ml-auto w-full sm:w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Buscar sucursal o centro..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-8 text-xs bg-slate-50 border-slate-200"
            />
          </div>
        </div>
      </div>

      {/* Main Income Statement Table */}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden border-slate-200">
        <div className="overflow-x-auto max-h-[850px]">
          <table className="w-full text-left border-collapse text-xs">
            {/* Header */}
            <thead className="sticky top-0 z-30 bg-slate-900 text-white shadow-md">
              <tr>
                <th className="py-3 px-4 font-bold text-slate-100 uppercase tracking-wider text-[11px] sticky left-0 z-40 bg-slate-900 min-w-[260px] border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.15)]">
                  Concepto Financiero
                </th>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className={`py-3 px-3 text-right font-bold text-[11px] whitespace-nowrap min-w-[110px] border-r border-slate-800 last:border-r-0 ${
                      col.isTotal ? "bg-slate-800 text-amber-300" : ""
                    } ${col.isVariance || col.isPercentage ? "bg-slate-850" : ""}`}
                  >
                    <div>{col.label}</div>
                    {col.subLabel && (
                      <div className="text-[10px] font-normal text-slate-400 font-mono">
                        {col.subLabel}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-medium">
              {/* ======================================================== */}
              {/* 1. SECCIÓN: INGRESOS OPERATIVOS POR SUCURSAL */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("ingresos")}
                className="bg-indigo-50/70 hover:bg-indigo-100/70 cursor-pointer select-none transition-colors border-t-2 border-indigo-200"
              >
                <td
                  colSpan={columns.length + 1}
                  className="py-2.5 px-4 font-black text-indigo-950 uppercase tracking-wider text-xs sticky left-0 z-20 flex items-center gap-2"
                >
                  {expandedSections.ingresos ? (
                    <ChevronDown className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-indigo-600" />
                  )}
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>1. Ingresos Operativos (Ventas por Sucursal)</span>
                  <Badge variant="outline" className="ml-2 bg-white text-indigo-700 text-[10px] py-0 px-1.5 border-indigo-200 font-bold">
                    {filteredLocations.length} sucursales
                  </Badge>
                </td>
              </tr>

              {/* Rows: Each Location */}
              {expandedSections.ingresos &&
                filteredLocations.map((loc) => (
                  <tr key={loc} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-2 px-4 pl-9 text-slate-700 font-semibold sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.03)] truncate max-w-[260px]">
                      {loc}
                    </td>
                    {columns.map((col) => {
                      const val = col.getValue(processedIncomes.tree[loc]);
                      const isPct = col.isPercentage;
                      return (
                        <td
                          key={col.id}
                          className={`py-2 px-3 text-right whitespace-nowrap border-r border-slate-50 last:border-r-0 ${
                            col.isTotal ? "bg-amber-50/30 font-bold text-slate-900" : "text-slate-600"
                          } ${
                            isPct
                              ? val > 0
                                ? "text-emerald-600 font-bold"
                                : val < 0
                                ? "text-rose-600 font-bold"
                                : "text-slate-400"
                              : col.isVariance
                              ? val > 0
                                ? "text-emerald-700 font-semibold"
                                : val < 0
                                ? "text-rose-700 font-semibold"
                                : ""
                              : ""
                          }`}
                        >
                          {isPct ? formatPct(val) : formatMoney(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}

              {/* Total Ingresos Row */}
              <tr className="bg-indigo-50/40 font-black border-t border-b-2 border-indigo-200">
                <td className="py-2.5 px-4 pl-6 text-indigo-950 font-black sticky left-0 z-10 bg-indigo-50/90 border-r border-indigo-100 uppercase tracking-wider text-[11px] shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                  TOTAL INGRESOS OPERATIVOS
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalIngresos;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-indigo-950 font-black border-r border-indigo-100 last:border-r-0 ${
                        col.isTotal ? "bg-indigo-100/60 text-indigo-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* ======================================================== */}
              {/* 2. SECCIÓN: COSTOS OPERATIVOS (CENTROS DE COSTO) */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("costos")}
                className="bg-amber-50/70 hover:bg-amber-100/70 cursor-pointer select-none transition-colors border-t-2 border-amber-200"
              >
                <td
                  colSpan={columns.length + 1}
                  className="py-2.5 px-4 font-black text-amber-950 uppercase tracking-wider text-xs sticky left-0 z-20 flex items-center gap-2"
                >
                  {expandedSections.costos ? (
                    <ChevronDown className="w-4 h-4 text-amber-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-amber-600" />
                  )}
                  <Layers className="w-4 h-4 text-amber-600" />
                  <span>2. Costos Operativos y de Venta (Centros de Costo)</span>
                  <Badge variant="outline" className="ml-2 bg-white text-amber-700 text-[10px] py-0 px-1.5 border-amber-200 font-bold">
                    {filteredCostosCC.length} centros
                  </Badge>
                </td>
              </tr>

              {/* Rows: Each Costo Cost Center */}
              {expandedSections.costos &&
                filteredCostosCC.map((cc) => (
                  <tr key={cc} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-2 px-4 pl-9 text-slate-700 font-semibold sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.03)] truncate max-w-[260px]">
                      {cc}
                    </td>
                    {columns.map((col) => {
                      const val = col.getValue(processedExpenses.costosTree[cc]);
                      const isPct = col.isPercentage;
                      return (
                        <td
                          key={col.id}
                          className={`py-2 px-3 text-right whitespace-nowrap border-r border-slate-50 last:border-r-0 ${
                            col.isTotal ? "bg-amber-50/30 font-bold text-slate-900" : "text-slate-600"
                          } ${
                            isPct
                              ? val > 0
                                ? "text-rose-600 font-bold" // For costs, increase is unfavorable
                                : val < 0
                                ? "text-emerald-600 font-bold"
                                : "text-slate-400"
                              : col.isVariance
                              ? val > 0
                                ? "text-rose-700 font-semibold"
                                : val < 0
                                ? "text-emerald-700 font-semibold"
                                : ""
                              : ""
                          }`}
                        >
                          {isPct ? formatPct(val) : formatMoney(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}

              {/* Total Costos Row */}
              <tr className="bg-amber-50/40 font-black border-t border-b-2 border-amber-200">
                <td className="py-2.5 px-4 pl-6 text-amber-950 font-black sticky left-0 z-10 bg-amber-50/90 border-r border-amber-100 uppercase tracking-wider text-[11px] shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                  TOTAL COSTOS OPERATIVOS
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalCostos;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-amber-950 font-black border-r border-amber-100 last:border-r-0 ${
                        col.isTotal ? "bg-amber-100/60 text-amber-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* ======================================================== */}
              {/* 3. UTILIDAD BRUTA Y MARGEN BRUTO */}
              {/* ======================================================== */}
              <tr className="bg-emerald-50/80 font-black border-t-2 border-b border-emerald-300">
                <td className="py-3 px-4 font-black text-emerald-950 uppercase tracking-wider text-xs sticky left-0 z-10 bg-emerald-100 border-r border-emerald-200 flex items-center justify-between shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-700" />
                    UTILIDAD BRUTA
                  </span>
                  <span className="text-[10px] text-emerald-700 font-mono font-normal">
                    (Ingresos - Costos)
                  </span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].utilidadBruta;
                  return (
                    <td
                      key={col.id}
                      className={`py-3 px-3 text-right whitespace-nowrap font-black text-xs border-r border-emerald-200 last:border-r-0 ${
                        val >= 0 ? "text-emerald-900" : "text-rose-700"
                      } ${col.isTotal ? "bg-emerald-100 text-emerald-950 font-black" : ""}`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Margen Bruto % */}
              <tr className="bg-emerald-50/30 text-xs font-semibold text-emerald-800 border-b-2 border-emerald-200">
                <td className="py-1.5 px-4 pl-8 sticky left-0 z-10 bg-emerald-50/90 border-r border-emerald-100 text-[11px] italic">
                  Margen Bruto (%)
                </td>
                {columns.map((col, idx) => {
                  const pct = totalsByCol[idx].margenBrutoPct;
                  return (
                    <td
                      key={col.id}
                      className={`py-1.5 px-3 text-right whitespace-nowrap border-r border-emerald-100 last:border-r-0 font-mono text-[11px] ${
                        pct >= 30 ? "text-emerald-700 font-bold" : pct > 0 ? "text-amber-700" : "text-rose-600"
                      }`}
                    >
                      {pct.toFixed(1)}%
                    </td>
                  );
                })}
              </tr>

              {/* ======================================================== */}
              {/* 4. SECCIÓN: GASTOS OPERATIVOS / ADMINISTRATIVOS */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("gastos")}
                className="bg-rose-50/70 hover:bg-rose-100/70 cursor-pointer select-none transition-colors border-t-2 border-rose-200"
              >
                <td
                  colSpan={columns.length + 1}
                  className="py-2.5 px-4 font-black text-rose-950 uppercase tracking-wider text-xs sticky left-0 z-20 flex items-center gap-2"
                >
                  {expandedSections.gastos ? (
                    <ChevronDown className="w-4 h-4 text-rose-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-rose-600" />
                  )}
                  <Layers className="w-4 h-4 text-rose-600" />
                  <span>3. Gastos de Operación y Administración (Centros de Costo)</span>
                  <Badge variant="outline" className="ml-2 bg-white text-rose-700 text-[10px] py-0 px-1.5 border-rose-200 font-bold">
                    {filteredGastosCC.length} centros
                  </Badge>
                </td>
              </tr>

              {/* Rows: Each Gasto Cost Center */}
              {expandedSections.gastos &&
                filteredGastosCC.map((cc) => (
                  <tr key={cc} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-2 px-4 pl-9 text-slate-700 font-semibold sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-100 shadow-[1px_0_3px_rgba(0,0,0,0.03)] truncate max-w-[260px]">
                      {cc}
                    </td>
                    {columns.map((col) => {
                      const val = col.getValue(processedExpenses.gastosTree[cc]);
                      const isPct = col.isPercentage;
                      return (
                        <td
                          key={col.id}
                          className={`py-2 px-3 text-right whitespace-nowrap border-r border-slate-50 last:border-r-0 ${
                            col.isTotal ? "bg-rose-50/30 font-bold text-slate-900" : "text-slate-600"
                          } ${
                            isPct
                              ? val > 0
                                ? "text-rose-600 font-bold" // For expenses, increase is unfavorable
                                : val < 0
                                ? "text-emerald-600 font-bold"
                                : "text-slate-400"
                              : col.isVariance
                              ? val > 0
                                ? "text-rose-700 font-semibold"
                                : val < 0
                                ? "text-emerald-700 font-semibold"
                                : ""
                              : ""
                          }`}
                        >
                          {isPct ? formatPct(val) : formatMoney(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}

              {/* Total Gastos Row */}
              <tr className="bg-rose-50/40 font-black border-t border-b-2 border-rose-200">
                <td className="py-2.5 px-4 pl-6 text-rose-950 font-black sticky left-0 z-10 bg-rose-50/90 border-r border-rose-100 uppercase tracking-wider text-[11px] shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                  TOTAL GASTOS OPERATIVOS
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalGastos;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-rose-950 font-black border-r border-rose-100 last:border-r-0 ${
                        col.isTotal ? "bg-rose-100/60 text-rose-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* ======================================================== */}
              {/* 5. UTILIDAD DE OPERACIÓN (EBITDA) Y MARGEN OPERATIVO */}
              {/* ======================================================== */}
              <tr className="bg-slate-900 text-white font-black border-t-4 border-double border-slate-700">
                <td className="py-3.5 px-4 font-black uppercase tracking-wider text-xs sticky left-0 z-10 bg-slate-950 border-r border-slate-800 flex items-center justify-between shadow-[2px_0_5px_rgba(0,0,0,0.2)]">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    UTILIDAD DE OPERACIÓN (EBITDA)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono font-normal">
                    (U. Bruta - Gastos)
                  </span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].utilidadOperacion;
                  return (
                    <td
                      key={col.id}
                      className={`py-3.5 px-3 text-right whitespace-nowrap font-black text-sm border-r border-slate-800 last:border-r-0 ${
                        val >= 0 ? "text-emerald-400" : "text-rose-400"
                      } ${col.isTotal ? "bg-slate-850 text-amber-300" : ""}`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Margen Operativo % */}
              <tr className="bg-slate-800 text-slate-300 text-xs font-semibold">
                <td className="py-1.5 px-4 pl-8 sticky left-0 z-10 bg-slate-850 border-r border-slate-700 text-[11px] italic">
                  Margen Operativo (%)
                </td>
                {columns.map((col, idx) => {
                  const pct = totalsByCol[idx].margenOperativoPct;
                  return (
                    <td
                      key={col.id}
                      className={`py-1.5 px-3 text-right whitespace-nowrap border-r border-slate-700 last:border-r-0 font-mono text-[11px] ${
                        pct >= 15 ? "text-emerald-400 font-bold" : pct > 0 ? "text-amber-400" : "text-rose-400"
                      }`}
                    >
                      {pct.toFixed(1)}%
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
