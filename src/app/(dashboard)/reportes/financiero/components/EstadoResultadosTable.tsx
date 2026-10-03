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
  BarChart3,
  Landmark,
  Wallet,
  Coins
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
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(currentQuarter);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [hideZeroRows, setHideZeroRows] = useState<boolean>(true);

  const selectedLocationObj = useMemo(() => {
    if (selectedLocation === "all") return null;
    return locations.find((l) => l.id === selectedLocation) || null;
  }, [locations, selectedLocation]);

  const selectedLocationName = useMemo(() => {
    if (!selectedLocationObj) return "";
    return (selectedLocationObj.name || selectedLocationObj.Name || "").trim();
  }, [selectedLocationObj]);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    ingresos: true,
    costos: true,
    gastos: true,
    financieros: true,
    impuestos: true,
    dividendos: true,
    margenBruto: false,
    margenOperativo: false,
    margenNeto: false,
    margenRetenido: false,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () =>
    setExpandedSections({
      ingresos: true,
      costos: true,
      gastos: true,
      financieros: true,
      impuestos: true,
      dividendos: true,
      margenBruto: true,
      margenOperativo: true,
      margenNeto: true,
      margenRetenido: true,
    });
  const collapseAll = () =>
    setExpandedSections({
      ingresos: false,
      costos: false,
      gastos: false,
      financieros: false,
      impuestos: false,
      dividendos: false,
      margenBruto: false,
      margenOperativo: false,
      margenNeto: false,
      margenRetenido: false,
    });

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
  const isCostoOperativo = (name: string, typeOrClass?: string) => {
    if (typeOrClass) {
      const lower = typeOrClass.toLowerCase();
      if (lower === "costo") return true;
      if (lower === "gasto") return false;
      if (
        lower === "financiero" ||
        lower === "impuestos" ||
        lower === "dividendos" ||
        lower === "balance"
      ) {
        return false;
      }
    }

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

    // Pre-populate with registered locations
    if (selectedLocation !== "all") {
      if (selectedLocationName) {
        allLocations.add(selectedLocationName);
        if (!tree[selectedLocationName]) tree[selectedLocationName] = {};
      }
    } else {
      locations.forEach((l) => {
        const name = (l.name || l.Name || "Sucursal General").trim();
        allLocations.add(name);
        if (!tree[name]) tree[name] = {};
      });
    }

    const matchesLocation = (locId?: string, locNameCandidate?: string) => {
      if (selectedLocation === "all") return true;
      if (locId && locId === selectedLocation) return true;
      if (
        selectedLocationName &&
        locNameCandidate &&
        normalize(locNameCandidate) === normalize(selectedLocationName)
      ) {
        return true;
      }
      return false;
    };

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
      if (!matchesLocation(r.locationId, r.locationName)) return;
      const locName =
        r.locationId && locationNameMap[r.locationId]
          ? locationNameMap[r.locationId]
          : r.locationName || "Sin Sucursal / General";
      const val = Number(
        r.subtotal !== undefined && r.subtotal !== null && r.subtotal > 0
          ? r.subtotal
          : r.totalAmount || r.total || 0
      );
      addIncome(locName, r.date || r.createdAt, val);
    });

    // 2. Facturas (excluyendo vinculadas a remisiones o POS para evitar duplicidad)
    facturas.forEach((f) => {
      if (f.status === "cancelada" || f.posSaleId || f.remisionId || f.remissionId) return;
      if (!matchesLocation(f.locationId, f.locationName)) return;
      const locName =
        f.locationId && locationNameMap[f.locationId]
          ? locationNameMap[f.locationId]
          : f.locationName || "Sin Sucursal / General";
      const val = Number(
        f.subtotal !== undefined && f.subtotal !== null && f.subtotal > 0
          ? f.subtotal
          : f.totalAmount || f.total || 0
      );
      addIncome(locName, f.date || f.createdAt, val);
    });

    return { tree, locations: Array.from(allLocations).sort() };
  }, [remisiones, facturas, locations, locationNameMap, selectedLocation, selectedLocationName]);

  // 1. Balance-sheet flows that NEVER enter P&L (neither OPEX nor post-EBITDA)
  const isBalanceSheetPassThrough = (doc: any, ccName?: string, item?: any): boolean => {
    // Check explicit cost center classification
    const ccId = (item && item.costCenterId) || doc.costCenterId;
    const ccObj =
      (ccId && costCenterMap[ccId]) ||
      (ccName && costCentersByName[normalize(ccName)]);
    if (ccObj) {
      const classif = (ccObj.classification || ccObj.type || "").toLowerCase();
      if (classif === "balance") return true;
    }

    const concept = normalize(doc.concept || (item && item.concept) || "");
    const vendor = normalize(doc.vendorName || doc.providerName || "");
    const cc = normalize(ccName || (ccObj && ccObj.name) || (doc.costCenterId && costCenterMap[doc.costCenterId]?.name) || doc.costCenterName || "");
    const acc = normalize(doc.accountName || "");
    const combined = `${concept} ${vendor} ${cc} ${acc}`;

    // Credit card balance payoff
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

    // Debt principal amortization / loan repayments
    if (
      cc.includes("pago deuda") ||
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

    // VAT pass-through payments (Pago IVA trasladado / pasivo fiscal)
    if (
      cc.includes("pago iva trasladado") ||
      combined.includes("pago iva trasladado") ||
      combined.includes("pago de iva trasladado") ||
      combined.includes("iva trasladado")
    ) {
      return true;
    }

    // Internal transfers between company bank accounts
    if (combined.includes("traspaso") || combined.includes("transferencia entre cuentas")) {
      return true;
    }

    return false;
  };

  // 2. Classify post-EBITDA deduction category (Financieros, Impuestos, Dividendos)
  const classifyPostEbitda = (
    doc: any,
    ccName?: string,
    item?: any
  ): "gastos_financieros" | "impuestos" | "dividendos" | null => {
    // Check explicit cost center classification
    const ccId = (item && item.costCenterId) || doc.costCenterId;
    const ccObj =
      (ccId && costCenterMap[ccId]) ||
      (ccName && costCentersByName[normalize(ccName)]);
    if (ccObj) {
      const classif = (ccObj.classification || ccObj.type || "").toLowerCase();
      if (classif === "financiero" || classif === "gastos_financieros") return "gastos_financieros";
      if (classif === "impuestos") return "impuestos";
      if (classif === "dividendos") return "dividendos";
      if (classif === "costo" || classif === "gasto" || classif === "balance") return null;
    }

    const concept = normalize(doc.concept || (item && item.concept) || "");
    const vendor = normalize(doc.vendorName || doc.providerName || "");
    const cc = normalize(ccName || (ccObj && ccObj.name) || (doc.costCenterId && costCenterMap[doc.costCenterId]?.name) || doc.costCenterName || "");
    const acc = normalize(doc.accountName || "");

    // Gastos Financieros (Intereses y comisiones bancarias)
    if (
      cc.includes("intereses") ||
      cc.includes("otras comisiones banco") ||
      acc.includes("gastos financieros") ||
      acc.includes("intereses") ||
      concept.includes("intereses") ||
      concept.includes("interes ") ||
      concept.includes("comision por apertura") ||
      concept.includes("interes moratorio")
    ) {
      return "gastos_financieros";
    }

    // Impuestos (SAT / ISR)
    if (
      cc.includes("pago de impuestos") ||
      acc.includes("impuestos y derechos") ||
      acc.includes("impuesto sobre la renta") ||
      concept.includes("pago de impuestos") ||
      concept.includes("pago impuestos sat") ||
      concept.includes("impuestos sat") ||
      concept.includes("sat - guia") ||
      concept.includes("impuesto sobre la renta") ||
      concept.includes("isr ") ||
      (vendor.includes("sat") && (concept.includes("impuesto") || concept.includes("declaracion")))
    ) {
      return "impuestos";
    }

    // Dividendos / Retiros de socios / Gastos personales
    if (
      cc.includes("gastos personales") ||
      concept.includes("gastos personales") ||
      concept.includes("dividendo") ||
      concept.includes("retiro de socio") ||
      concept.includes("retiro socio") ||
      concept.includes("utilidad distribuida")
    ) {
      return "dividendos";
    }

    return null;
  };

  // Process Expenses by [Category: Costo | Gasto | Financieros | Impuestos | Dividendos, Year, Month]
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
    const financierosTree: { [catName: string]: { [year: number]: { [month: number]: number } } } = {};
    const impuestosTree: { [catName: string]: { [year: number]: { [month: number]: number } } } = {};
    const dividendosTree: { [catName: string]: { [year: number]: { [month: number]: number } } } = {};

    const allCostosCC = new Set<string>();
    const allGastosCC = new Set<string>();
    const allFinancierosCats = new Set<string>([
      "Intereses y Costo Financiero",
      "Comisiones Bancarias y Financieras"
    ]);
    const allImpuestosCats = new Set<string>(["Impuestos Federales (SAT / ISR)"]);
    const allDividendosCats = new Set<string>(["Retiros y Gastos Personales de Socios"]);

    allFinancierosCats.forEach((c) => { if (!financierosTree[c]) financierosTree[c] = {}; });
    allImpuestosCats.forEach((c) => { if (!impuestosTree[c]) impuestosTree[c] = {}; });
    allDividendosCats.forEach((c) => { if (!dividendosTree[c]) dividendosTree[c] = {}; });

    // Pre-populate with all registered cost centers (excluding balance sheet and post-EBITDA ones)
    costCenters.forEach((cc) => {
      const name = cc.name || cc.code || "Centro General";
      if (isBalanceSheetPassThrough({ costCenterName: name, costCenterId: cc.id }, name)) return;
      if (classifyPostEbitda({ costCenterName: name, costCenterId: cc.id }, name)) return;
      if (isCostoOperativo(name, cc.classification || cc.type)) {
        allCostosCC.add(name);
        if (!costosTree[name]) costosTree[name] = {};
      } else {
        allGastosCC.add(name);
        if (!gastosTree[name]) gastosTree[name] = {};
      }
    });

    const addExpense = (ccName: string, isCosto: boolean, dateStr: string | undefined, amount: number) => {
      if (!dateStr || isNaN(amount) || amount <= 0) return;
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

    const addPostExpense = (
      type: "financieros" | "impuestos" | "dividendos",
      catName: string,
      dateStr: string | undefined,
      amount: number
    ) => {
      if (!dateStr || isNaN(amount) || amount <= 0) return;
      const p = parseDateParts(dateStr);
      if (!p) return;

      if (type === "financieros") {
        allFinancierosCats.add(catName);
        if (!financierosTree[catName]) financierosTree[catName] = {};
        if (!financierosTree[catName][p.year]) financierosTree[catName][p.year] = {};
        financierosTree[catName][p.year][p.month] =
          (financierosTree[catName][p.year][p.month] || 0) + amount;
      } else if (type === "impuestos") {
        allImpuestosCats.add(catName);
        if (!impuestosTree[catName]) impuestosTree[catName] = {};
        if (!impuestosTree[catName][p.year]) impuestosTree[catName][p.year] = {};
        impuestosTree[catName][p.year][p.month] =
          (impuestosTree[catName][p.year][p.month] || 0) + amount;
      } else if (type === "dividendos") {
        allDividendosCats.add(catName);
        if (!dividendosTree[catName]) dividendosTree[catName] = {};
        if (!dividendosTree[catName][p.year]) dividendosTree[catName][p.year] = {};
        dividendosTree[catName][p.year][p.month] =
          (dividendosTree[catName][p.year][p.month] || 0) + amount;
      }
    };

    const processDoc = (doc: any, isInbox = false) => {
      if (doc.status === "cancelado") return;

      const dateStr = doc.date || doc.createdAt;
      const val = Number(
        doc.subtotal !== undefined && doc.subtotal !== null && doc.subtotal > 0
          ? doc.subtotal
          : doc.amount || doc.totalAmount || doc.total || 0
      );
      if (val <= 0) return;

      // 2. Deduplicate exact provisional duplicates from AI auto-reconciler
      if (doc.createdBy === "Agente IA (Provisional)") {
        const dShort = (dateStr || "").slice(0, 10);
        const provKey = `${dShort}_${Math.round(val * 100)}_${normalize(doc.vendorName || doc.concept || "")}`;
        if (seenProvisionalKeys.has(provKey)) return;
        seenProvisionalKeys.add(provKey);
      }

      const processItemOrDoc = (item?: any, itemVal?: number) => {
        const actualVal = itemVal !== undefined ? itemVal : val;
        if (actualVal <= 0) return;

        // Location check if a specific branch is selected
        if (selectedLocation !== "all") {
          const itemLocId = (item && item.locationId) || doc.locationId;
          const itemLocName =
            (item && item.locationName) ||
            doc.locationName ||
            (itemLocId && locationNameMap[itemLocId]);
          const matchesLocId = itemLocId && itemLocId === selectedLocation;
          const matchesLocName =
            selectedLocationName &&
            itemLocName &&
            normalize(itemLocName) === normalize(selectedLocationName);
          if (!matchesLocId && !matchesLocName) return;
        }

        const ccName = resolveCostCenter(doc, item);

        // A. Balance-sheet pass-through check (exclude from P&L completely)
        if (isBalanceSheetPassThrough(doc, ccName, item)) return;

        // B. Post-EBITDA classification check
        const postCat = classifyPostEbitda(doc, ccName, item);
        if (postCat === "gastos_financieros") {
          const lower = normalize(ccName) + " " + normalize(doc.concept || "");
          const catName = lower.includes("comision") && !lower.includes("interes")
            ? "Comisiones Bancarias y Financieras"
            : "Intereses y Costo Financiero";
          addPostExpense("financieros", catName, dateStr, actualVal);
          return;
        }
        if (postCat === "impuestos") {
          const catName = "Impuestos Federales (SAT / ISR)";
          addPostExpense("impuestos", catName, dateStr, actualVal);
          return;
        }
        if (postCat === "dividendos") {
          const catName = "Retiros y Gastos Personales de Socios";
          addPostExpense("dividendos", catName, dateStr, actualVal);
          return;
        }

        // C. Operating Cost vs Expense
        const ccObj =
          (item && item.costCenterId && costCenterMap[item.costCenterId]) ||
          (doc.costCenterId && costCenterMap[doc.costCenterId]) ||
          costCentersByName[normalize(ccName)];
        const isCost = isCostoOperativo(ccName, ccObj?.classification || ccObj?.type);
        addExpense(ccName, isCost, dateStr, actualVal);
      };

      // If document has items with individual amounts and cost centers, allocate item by item
      if (doc.items && doc.items.length > 0 && doc.items.some((it: any) => it.costCenterId || it.amount || it.subtotal)) {
        doc.items.forEach((it: any) => {
          const itemVal = Number(it.subtotal || it.amount || ((it.quantity || 1) * (it.unitCost || 0)) || 0);
          if (itemVal <= 0) return;
          processItemOrDoc(it, itemVal);
        });
      } else {
        processItemOrDoc();
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
      financierosTree,
      financierosCats: Array.from(allFinancierosCats).sort(),
      impuestosTree,
      impuestosCats: Array.from(allImpuestosCats).sort(),
      dividendosTree,
      dividendosCats: Array.from(allDividendosCats).sort(),
    };
  }, [expenses, expensesInbox, costCenters, costCenterMap, costCentersByName, locationNameMap, selectedLocation, selectedLocationName]);

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

      let totalFinancieros = 0;
      processedExpenses.financierosCats.forEach((cat) => {
        totalFinancieros += col.getValue(processedExpenses.financierosTree[cat]);
      });

      let totalImpuestos = 0;
      processedExpenses.impuestosCats.forEach((cat) => {
        totalImpuestos += col.getValue(processedExpenses.impuestosTree[cat]);
      });

      const utilidadNeta = utilidadOperacion - totalFinancieros - totalImpuestos;
      const margenNetoPct = totalIngresos > 0 ? (utilidadNeta / totalIngresos) * 100 : 0;

      let totalDividendos = 0;
      processedExpenses.dividendosCats.forEach((cat) => {
        totalDividendos += col.getValue(processedExpenses.dividendosTree[cat]);
      });

      const utilidadRetenida = utilidadNeta - totalDividendos;
      const margenRetenidoPct = totalIngresos > 0 ? (utilidadRetenida / totalIngresos) * 100 : 0;

      return {
        colId: col.id,
        totalIngresos,
        totalCostos,
        utilidadBruta,
        margenBrutoPct,
        totalGastos,
        utilidadOperacion,
        margenOperativoPct,
        totalFinancieros,
        totalImpuestos,
        utilidadNeta,
        margenNetoPct,
        totalDividendos,
        utilidadRetenida,
        margenRetenidoPct,
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
    if (hideZeroRows && selectedLocation === "all") {
      list = list.filter((loc) => {
        const tree = processedIncomes.tree[loc];
        return columns.some((col) => Math.abs(col.getValue(tree)) > 0.01);
      });
    }
    return list;
  }, [processedIncomes, searchTerm, hideZeroRows, columns, selectedLocation]);

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

  const filteredFinancierosCats = useMemo(() => {
    let list = processedExpenses.financierosCats;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((cat) => cat.toLowerCase().includes(q));
    }
    if (hideZeroRows) {
      list = list.filter((cat) => {
        const tree = processedExpenses.financierosTree[cat];
        return columns.some((col) => Math.abs(col.getValue(tree)) > 0.01);
      });
    }
    return list;
  }, [processedExpenses, searchTerm, hideZeroRows, columns]);

  const filteredImpuestosCats = useMemo(() => {
    let list = processedExpenses.impuestosCats;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((cat) => cat.toLowerCase().includes(q));
    }
    if (hideZeroRows) {
      list = list.filter((cat) => {
        const tree = processedExpenses.impuestosTree[cat];
        return columns.some((col) => Math.abs(col.getValue(tree)) > 0.01);
      });
    }
    return list;
  }, [processedExpenses, searchTerm, hideZeroRows, columns]);

  const filteredDividendosCats = useMemo(() => {
    let list = processedExpenses.dividendosCats;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((cat) => cat.toLowerCase().includes(q));
    }
    if (hideZeroRows) {
      list = list.filter((cat) => {
        const tree = processedExpenses.dividendosTree[cat];
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
    totalFinancieros: 0,
    totalImpuestos: 0,
    utilidadNeta: 0,
    margenNetoPct: 0,
    totalDividendos: 0,
    utilidadRetenida: 0,
    margenRetenidoPct: 0,
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

    rows.push(['"--- 4. GASTOS FINANCIEROS ---"']);
    filteredFinancierosCats.forEach((cat) => {
      rows.push(makeRow(cat, (col) => col.getValue(processedExpenses.financierosTree[cat])));
    });
    rows.push(makeRow("TOTAL GASTOS FINANCIEROS", (col, idx) => totalsByCol[idx].totalFinancieros));

    rows.push(['"--- 5. IMPUESTOS (SAT / ISR) ---"']);
    filteredImpuestosCats.forEach((cat) => {
      rows.push(makeRow(cat, (col) => col.getValue(processedExpenses.impuestosTree[cat])));
    });
    rows.push(makeRow("TOTAL IMPUESTOS SAT / ISR", (col, idx) => totalsByCol[idx].totalImpuestos));

    rows.push(makeRow("UTILIDAD NETA DEL EJERCICIO", (col, idx) => totalsByCol[idx].utilidadNeta));
    rows.push(makeRow("MARGEN NETO (%)", (col, idx) => `${totalsByCol[idx].margenNetoPct.toFixed(1)}%`));

    rows.push(['"--- 6. DISTRIBUCIONES (DIVIDENDOS) ---"']);
    filteredDividendosCats.forEach((cat) => {
      rows.push(makeRow(cat, (col) => col.getValue(processedExpenses.dividendosTree[cat])));
    });
    rows.push(makeRow("TOTAL DIVIDENDOS Y RETIROS", (col, idx) => totalsByCol[idx].totalDividendos));

    rows.push(makeRow("UTILIDAD RETENIDA FINAL", (col, idx) => totalsByCol[idx].utilidadRetenida));
    rows.push(makeRow("MARGEN RETENIDO (%)", (col, idx) => `${totalsByCol[idx].margenRetenidoPct.toFixed(1)}%`));

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const locTag =
      selectedLocation === "all"
        ? "Consolidado"
        : selectedLocationName.replace(/\s+/g, "_");
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Estado_Resultados_${locTag}_${viewMode}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col space-y-6 animate-in fade-in duration-300">
      {/* KPI Cards: High-Level View of Current Selected Scope */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
            {selectedLocation === "all"
              ? `Ventas de ${filteredLocations.length} sucursales`
              : `Sucursal: ${selectedLocationName}`}
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
          <div className="text-xl font-black text-slate-900">
            {formatMoney(activeTotals.totalCostos)}
          </div>
          <span className="text-[10px] text-muted-foreground mt-1">
            Materia prima, fletes, maquila
          </span>
        </div>

        {/* 3. Utilidad Bruta */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Utilidad Bruta</span>
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-900">
            {formatMoney(activeTotals.utilidadBruta)}
          </div>
          <span className="text-[10px] font-semibold text-emerald-700 mt-1">
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
          <div className="text-xl font-black text-slate-900">
            {formatMoney(activeTotals.totalGastos)}
          </div>
          <span className="text-[10px] text-muted-foreground mt-1">
            Nómina, rentas, admon.
          </span>
        </div>

        {/* 5. EBITDA */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">EBITDA Op.</span>
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl font-black ${activeTotals.utilidadOperacion >= 0 ? "text-slate-900" : "text-rose-600"}`}>
            {formatMoney(activeTotals.utilidadOperacion)}
          </div>
          <span className="text-[10px] font-semibold text-blue-700 mt-1">
            Margen Op: {activeTotals.margenOperativoPct.toFixed(1)}%
          </span>
        </div>

        {/* 6. Utilidad Retenida */}
        <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Utilidad Retenida</span>
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-xl font-black ${activeTotals.utilidadRetenida >= 0 ? "text-slate-900" : "text-rose-600"}`}>
            {formatMoney(activeTotals.utilidadRetenida)}
          </div>
          <span className="text-[10px] font-semibold text-emerald-700 mt-1">
            Retención: {activeTotals.margenRetenidoPct.toFixed(1)}%
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

        {/* Dynamic Contextual Selectors (Sucursal, Year, Month, Quarter, Search) */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Sucursal Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              Sucursal:
            </span>
            <Select value={selectedLocation} onValueChange={(val) => setSelectedLocation(val)}>
              <SelectTrigger className="w-[195px] h-8 text-xs bg-slate-50 border-slate-200 font-bold">
                <SelectValue placeholder="Todas las sucursales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Todas las Sucursales (Consolidado)
                </SelectItem>
                {locations.map((loc) => {
                  const locName = (loc.name || loc.Name || "Sucursal").trim();
                  return (
                    <SelectItem key={loc.id} value={loc.id}>
                      {locName}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

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
            <thead className="sticky top-0 z-30 bg-slate-100/95 text-slate-700 backdrop-blur-sm border-b border-slate-200 shadow-sm">
              <tr>
                <th className="py-3 px-4 font-bold text-slate-800 uppercase tracking-wider text-[11px] sticky left-0 z-40 bg-slate-100 min-w-[260px] border-r border-slate-200 shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                  Concepto Financiero
                </th>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className={`py-3 px-3 text-right font-bold text-[11px] whitespace-nowrap min-w-[110px] border-r border-slate-200 last:border-r-0 ${
                      col.isTotal ? "bg-slate-200/60 text-slate-900" : "text-slate-700"
                    } ${col.isVariance || col.isPercentage ? "bg-slate-150/40" : ""}`}
                  >
                    <div>{col.label}</div>
                    {col.subLabel && (
                      <div className="text-[10px] font-normal text-slate-500 font-mono">
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
                className="bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer select-none transition-colors border-t border-slate-200"
              >
                <td className="py-2.5 px-4 font-bold text-slate-800 uppercase tracking-wider text-xs sticky left-0 z-20 bg-slate-50 hover:bg-slate-100 border-r border-slate-200 flex items-center gap-2 shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  {expandedSections.ingresos ? (
                    <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <span className="truncate">1. Ingresos Operativos (Ventas por Sucursal)</span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalIngresos;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-slate-800 font-bold border-r border-slate-200 last:border-r-0 ${
                        col.isTotal ? "bg-slate-100/80 text-slate-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
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



              {/* ======================================================== */}
              {/* 2. SECCIÓN: COSTOS OPERATIVOS (CENTROS DE COSTO) */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("costos")}
                className="bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer select-none transition-colors border-t border-slate-200"
              >
                <td className="py-2.5 px-4 font-bold text-slate-800 uppercase tracking-wider text-xs sticky left-0 z-20 bg-slate-50 hover:bg-slate-100 border-r border-slate-200 flex items-center gap-2 shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  {expandedSections.costos ? (
                    <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <span className="truncate">2. Costos Operativos y de Venta (Centros de Costo)</span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalCostos;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-slate-800 font-bold border-r border-slate-200 last:border-r-0 ${
                        col.isTotal ? "bg-slate-100/80 text-slate-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
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



              {/* ======================================================== */}
              {/* 3. UTILIDAD BRUTA Y MARGEN BRUTO */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("margenBruto")}
                className="bg-emerald-50/40 hover:bg-emerald-100/50 cursor-pointer select-none font-bold border-t-2 border-b border-emerald-200 transition-colors"
                title="Clic para mostrar/ocultar % de Margen Bruto"
              >
                <td className="py-2.5 px-4 font-bold text-emerald-900 uppercase tracking-wider text-xs sticky left-0 z-10 bg-emerald-50/80 hover:bg-emerald-100/70 border-r border-emerald-200 flex items-center justify-between shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  <span className="flex items-center gap-1.5">
                    {expandedSections.margenBruto ? (
                      <ChevronDown className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    )}
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
                      className={`py-2.5 px-3 text-right whitespace-nowrap font-bold text-xs border-r border-emerald-200 last:border-r-0 ${
                        val >= 0 ? "text-emerald-900" : "text-rose-600"
                      } ${col.isTotal ? "bg-emerald-100/60 text-emerald-950 font-black" : ""}`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Margen Bruto % (Colapsable) */}
              {expandedSections.margenBruto && (
                <tr className="bg-emerald-50/20 text-xs font-semibold text-slate-600 border-b border-slate-200 animate-in fade-in duration-200">
                  <td className="py-1 px-4 pl-8 sticky left-0 z-10 bg-emerald-50/40 border-r border-emerald-100 text-[11px] italic text-slate-500">
                    Margen Bruto (%)
                  </td>
                  {columns.map((col, idx) => {
                    const pct = totalsByCol[idx].margenBrutoPct;
                    return (
                      <td
                        key={col.id}
                        className={`py-1 px-3 text-right whitespace-nowrap border-r border-emerald-100 last:border-r-0 font-mono text-[11px] ${
                          pct >= 30 ? "text-emerald-700 font-bold" : pct > 0 ? "text-slate-600" : "text-rose-600"
                        }`}
                      >
                        {pct.toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* ======================================================== */}
              {/* 4. SECCIÓN: GASTOS OPERATIVOS / ADMINISTRATIVOS */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("gastos")}
                className="bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer select-none transition-colors border-t border-slate-200"
              >
                <td className="py-2.5 px-4 font-bold text-slate-800 uppercase tracking-wider text-xs sticky left-0 z-20 bg-slate-50 hover:bg-slate-100 border-r border-slate-200 flex items-center gap-2 shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  {expandedSections.gastos ? (
                    <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <span className="truncate">3. Gastos de Operación y Administración (Centros de Costo)</span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalGastos;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-slate-800 font-bold border-r border-slate-200 last:border-r-0 ${
                        col.isTotal ? "bg-slate-100/80 text-slate-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
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



              {/* ======================================================== */}
              {/* 5. UTILIDAD DE OPERACIÓN (EBITDA) Y MARGEN OPERATIVO */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("margenOperativo")}
                className="bg-emerald-50/40 hover:bg-emerald-100/50 cursor-pointer select-none font-bold border-t-2 border-b border-emerald-200 transition-colors"
                title="Clic para mostrar/ocultar % de Margen Operativo"
              >
                <td className="py-2.5 px-4 font-bold text-emerald-900 uppercase tracking-wider text-xs sticky left-0 z-10 bg-emerald-50/80 hover:bg-emerald-100/70 border-r border-emerald-200 flex items-center justify-between shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  <span className="flex items-center gap-1.5">
                    {expandedSections.margenOperativo ? (
                      <ChevronDown className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    )}
                    UTILIDAD DE OPERACIÓN (EBITDA)
                  </span>
                  <span className="text-[10px] text-emerald-700 font-mono font-normal">
                    (U. Bruta - Gastos)
                  </span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].utilidadOperacion;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap font-bold text-xs border-r border-emerald-200 last:border-r-0 ${
                        val >= 0 ? "text-emerald-900" : "text-rose-600"
                      } ${col.isTotal ? "bg-emerald-100/60 text-emerald-950 font-black" : ""}`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Margen Operativo % (Colapsable) */}
              {expandedSections.margenOperativo && (
                <tr className="bg-emerald-50/20 text-xs font-semibold text-slate-600 border-b border-slate-200 animate-in fade-in duration-200">
                  <td className="py-1 px-4 pl-8 sticky left-0 z-10 bg-emerald-50/40 border-r border-emerald-100 text-[11px] italic text-slate-500">
                    Margen Operativo (%)
                  </td>
                  {columns.map((col, idx) => {
                    const pct = totalsByCol[idx].margenOperativoPct;
                    return (
                      <td
                        key={col.id}
                        className={`py-1 px-3 text-right whitespace-nowrap border-r border-emerald-100 last:border-r-0 font-mono text-[11px] ${
                          pct >= 15 ? "text-emerald-700 font-bold" : pct > 0 ? "text-slate-600" : "text-rose-600"
                        }`}
                      >
                        {pct.toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* ======================================================== */}
              {/* 6. SECCIÓN: GASTOS FINANCIEROS (INTERESES Y COSTO FINANCIERO) */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("financieros")}
                className="bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer select-none transition-colors border-t border-slate-200"
              >
                <td className="py-2.5 px-4 font-bold text-slate-800 uppercase tracking-wider text-xs sticky left-0 z-20 bg-slate-50 hover:bg-slate-100 border-r border-slate-200 flex items-center gap-2 shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  {expandedSections.financieros ? (
                    <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <span className="truncate">(-) Gastos Financieros (Intereses y Comisiones de Crédito)</span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalFinancieros;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-slate-800 font-bold border-r border-slate-200 last:border-r-0 ${
                        col.isTotal ? "bg-slate-100/80 text-slate-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Filas de Gastos Financieros */}
              {expandedSections.financieros &&
                filteredFinancierosCats.map((cat) => (
                  <tr key={cat} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 pl-10 text-slate-700 sticky left-0 z-10 bg-white border-r border-slate-100 font-normal truncate max-w-[280px]">
                      {cat}
                    </td>
                    {columns.map((col) => {
                      const val = col.getValue(processedExpenses.financierosTree[cat]);
                      const isPct = col.isPercentage;
                      return (
                        <td
                          key={col.id}
                          className={`py-2 px-3 text-right whitespace-nowrap border-r border-slate-50 last:border-r-0 ${
                            col.isTotal ? "bg-amber-50/30 font-bold text-slate-900" : "text-slate-600"
                          } ${
                            isPct
                              ? val > 0 ? "text-rose-600 font-bold" : val < 0 ? "text-emerald-600 font-bold" : "text-slate-400"
                              : col.isVariance
                              ? val > 0 ? "text-rose-700 font-semibold" : val < 0 ? "text-emerald-700 font-semibold" : ""
                              : ""
                          }`}
                        >
                          {isPct ? formatPct(val) : formatMoney(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}


              {/* ======================================================== */}
              {/* 7. SECCIÓN: IMPUESTOS (SAT / ISR) */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("impuestos")}
                className="bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer select-none transition-colors border-t border-slate-200"
              >
                <td className="py-2.5 px-4 font-bold text-slate-800 uppercase tracking-wider text-xs sticky left-0 z-20 bg-slate-50 hover:bg-slate-100 border-r border-slate-200 flex items-center gap-2 shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  {expandedSections.impuestos ? (
                    <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <span className="truncate">(-) Impuestos (Contribuciones Federales y SAT)</span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalImpuestos;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-slate-800 font-bold border-r border-slate-200 last:border-r-0 ${
                        col.isTotal ? "bg-slate-100/80 text-slate-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Filas de Impuestos */}
              {expandedSections.impuestos &&
                filteredImpuestosCats.map((cat) => (
                  <tr key={cat} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 pl-10 text-slate-700 sticky left-0 z-10 bg-white border-r border-slate-100 font-normal truncate max-w-[280px]">
                      {cat}
                    </td>
                    {columns.map((col) => {
                      const val = col.getValue(processedExpenses.impuestosTree[cat]);
                      const isPct = col.isPercentage;
                      return (
                        <td
                          key={col.id}
                          className={`py-2 px-3 text-right whitespace-nowrap border-r border-slate-50 last:border-r-0 ${
                            col.isTotal ? "bg-rose-50/30 font-bold text-slate-900" : "text-slate-600"
                          } ${
                            isPct
                              ? val > 0 ? "text-rose-600 font-bold" : val < 0 ? "text-emerald-600 font-bold" : "text-slate-400"
                              : col.isVariance
                              ? val > 0 ? "text-rose-700 font-semibold" : val < 0 ? "text-emerald-700 font-semibold" : ""
                              : ""
                          }`}
                        >
                          {isPct ? formatPct(val) : formatMoney(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}



              {/* ======================================================== */}
              {/* 8. UTILIDAD NETA DEL EJERCICIO */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("margenNeto")}
                className="bg-emerald-50/40 hover:bg-emerald-100/50 cursor-pointer select-none font-bold border-t-2 border-b border-emerald-200 transition-colors"
                title="Clic para mostrar/ocultar % de Margen Neto"
              >
                <td className="py-2.5 px-4 font-bold text-emerald-900 uppercase tracking-wider text-xs sticky left-0 z-10 bg-emerald-50/80 hover:bg-emerald-100/70 border-r border-emerald-200 flex items-center justify-between shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  <span className="flex items-center gap-1.5">
                    {expandedSections.margenNeto ? (
                      <ChevronDown className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    )}
                    UTILIDAD NETA DEL EJERCICIO
                  </span>
                  <span className="text-[10px] text-emerald-700 font-mono font-normal">
                    (EBITDA - Financ. - Imp.)
                  </span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].utilidadNeta;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap font-bold text-xs border-r border-emerald-200 last:border-r-0 ${
                        val >= 0 ? "text-emerald-900" : "text-rose-600"
                      } ${col.isTotal ? "bg-emerald-100/60 text-emerald-950 font-black" : ""}`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Margen Neto % (Colapsable) */}
              {expandedSections.margenNeto && (
                <tr className="bg-emerald-50/20 text-xs font-semibold text-slate-600 border-b border-slate-200 animate-in fade-in duration-200">
                  <td className="py-1 px-4 pl-8 sticky left-0 z-10 bg-emerald-50/40 border-r border-emerald-100 text-[11px] italic text-slate-500">
                    Margen Neto (%)
                  </td>
                  {columns.map((col, idx) => {
                    const pct = totalsByCol[idx].margenNetoPct;
                    return (
                      <td
                        key={col.id}
                        className={`py-1 px-3 text-right whitespace-nowrap border-r border-emerald-100 last:border-r-0 font-mono text-[11px] ${
                          pct >= 10 ? "text-emerald-700 font-bold" : pct > 0 ? "text-slate-600" : "text-rose-600"
                        }`}
                      >
                        {pct.toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              )}

              {/* ======================================================== */}
              {/* 9. SECCIÓN: DISTRIBUCIONES (DIVIDENDOS Y RETIROS DE SOCIOS) */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("dividendos")}
                className="bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer select-none transition-colors border-t border-slate-200"
              >
                <td className="py-2.5 px-4 font-bold text-slate-800 uppercase tracking-wider text-xs sticky left-0 z-20 bg-slate-50 hover:bg-slate-100 border-r border-slate-200 flex items-center gap-2 shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  {expandedSections.dividendos ? (
                    <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                  <span className="truncate">(-) Dividendos y Retiros de Socios (Gastos Personales)</span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].totalDividendos;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap text-slate-800 font-bold border-r border-slate-200 last:border-r-0 ${
                        col.isTotal ? "bg-slate-100/80 text-slate-900" : ""
                      }`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Filas de Dividendos */}
              {expandedSections.dividendos &&
                filteredDividendosCats.map((cat) => (
                  <tr key={cat} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 pl-10 text-slate-700 sticky left-0 z-10 bg-white border-r border-slate-100 font-normal truncate max-w-[280px]">
                      {cat}
                    </td>
                    {columns.map((col) => {
                      const val = col.getValue(processedExpenses.dividendosTree[cat]);
                      const isPct = col.isPercentage;
                      return (
                        <td
                          key={col.id}
                          className={`py-2 px-3 text-right whitespace-nowrap border-r border-slate-50 last:border-r-0 ${
                            col.isTotal ? "bg-purple-50/30 font-bold text-slate-900" : "text-slate-600"
                          } ${
                            isPct
                              ? val > 0 ? "text-rose-600 font-bold" : val < 0 ? "text-emerald-600 font-bold" : "text-slate-400"
                              : col.isVariance
                              ? val > 0 ? "text-rose-700 font-semibold" : val < 0 ? "text-emerald-700 font-semibold" : ""
                              : ""
                          }`}
                        >
                          {isPct ? formatPct(val) : formatMoney(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))}



              {/* ======================================================== */}
              {/* 10. UTILIDAD RETENIDA FINAL DEL EJERCICIO */}
              {/* ======================================================== */}
              <tr
                onClick={() => toggleSection("margenRetenido")}
                className="bg-emerald-50/40 hover:bg-emerald-100/50 cursor-pointer select-none font-bold border-t-2 border-b border-emerald-200 transition-colors"
                title="Clic para mostrar/ocultar % de Margen de Retención"
              >
                <td className="py-2.5 px-4 font-bold text-emerald-900 uppercase tracking-wider text-xs sticky left-0 z-10 bg-emerald-50/80 hover:bg-emerald-100/70 border-r border-emerald-200 flex items-center justify-between shadow-[1px_0_3px_rgba(0,0,0,0.03)]">
                  <span className="flex items-center gap-1.5">
                    {expandedSections.margenRetenido ? (
                      <ChevronDown className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    )}
                    UTILIDAD RETENIDA FINAL
                  </span>
                  <span className="text-[10px] text-emerald-700 font-mono font-normal">
                    (Remanente Reinvertible)
                  </span>
                </td>
                {columns.map((col, idx) => {
                  const val = totalsByCol[idx].utilidadRetenida;
                  return (
                    <td
                      key={col.id}
                      className={`py-2.5 px-3 text-right whitespace-nowrap font-bold text-xs border-r border-emerald-200 last:border-r-0 ${
                        val >= 0 ? "text-emerald-900" : "text-rose-600"
                      } ${col.isTotal ? "bg-emerald-100/60 text-emerald-950 font-black" : ""}`}
                    >
                      {formatMoney(val)}
                    </td>
                  );
                })}
              </tr>

              {/* Margen Retenido % (Colapsable) */}
              {expandedSections.margenRetenido && (
                <tr className="bg-emerald-50/20 text-xs font-semibold text-slate-600 border-b border-slate-200 animate-in fade-in duration-200">
                  <td className="py-1 px-4 pl-8 sticky left-0 z-10 bg-emerald-50/40 border-r border-emerald-100 text-[11px] italic text-slate-500">
                    Margen de Retención (%)
                  </td>
                  {columns.map((col, idx) => {
                    const pct = totalsByCol[idx].margenRetenidoPct;
                    return (
                      <td
                        key={col.id}
                        className={`py-1 px-3 text-right whitespace-nowrap border-r border-emerald-100 last:border-r-0 font-mono text-[11px] ${
                          pct >= 10 ? "text-emerald-700 font-bold" : pct > 0 ? "text-slate-600" : "text-rose-600"
                        }`}
                      >
                        {pct.toFixed(1)}%
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
