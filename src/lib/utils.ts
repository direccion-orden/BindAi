import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function getLocalDateString(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getClientDisplayName(c: any): string {
  if (!c) return "";
  return (
    c.name ||
    c.businessName ||
    c.LegalName ||
    c.CommercialName ||
    c.ClientName ||
    c.razonSocial ||
    c.legalName ||
    "Cliente sin nombre"
  ).trim();
}

function normalizeStr(str: string): string {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function matchesClientFilter(c: any, search: string): boolean {
  if (!c) return false;
  if (!search) return true;
  const q = normalizeStr(search);
  const name = normalizeStr(getClientDisplayName(c));
  const rfc = normalizeStr(c.rfc || c.RFC || c.taxId || "");
  const email = normalizeStr(c.email || c.Email || "");
  const code = normalizeStr((c.code || c.Number || "").toString());
  const phone = normalizeStr(c.phone || c.Phone || "");

  return (
    name.includes(q) ||
    rfc.includes(q) ||
    email.includes(q) ||
    code.includes(q) ||
    phone.includes(q)
  );
}

export function formatMoney(amount: number = 0, currency: string = "MXN"): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}
