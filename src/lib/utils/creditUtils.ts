import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/**
 * Calcula la fecha de vencimiento sumando creditDays a la fecha de aplicación (YYYY-MM-DD o ISO).
 */
export function calculateDueDate(appliedDateStr: string, creditDays: number): string {
  if (!appliedDateStr || !creditDays || creditDays <= 0) return appliedDateStr || "";
  
  // Extraer año, mes, día independientemente de si viene como YYYY-MM-DD o ISO string
  const dateParts = appliedDateStr.split("T")[0].split("-");
  if (dateParts.length !== 3) return appliedDateStr;

  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1; // 0-indexed
  const day = parseInt(dateParts[2], 10);

  const baseDate = new Date(year, month, day);
  if (isNaN(baseDate.getTime())) return appliedDateStr;

  baseDate.setDate(baseDate.getDate() + Number(creditDays));

  const resYear = baseDate.getFullYear();
  const resMonth = String(baseDate.getMonth() + 1).padStart(2, "0");
  const resDay = String(baseDate.getDate()).padStart(2, "0");

  return `${resYear}-${resMonth}-${resDay}`;
}

/**
 * Obtiene el saldo deudor total pendiente del cliente consultando remisiones, facturas y pedidos pendientes.
 */
export async function getClientCurrentDebt(companyId: string, clientId: string): Promise<{ totalDebt: number; unpaidCount: number }> {
  if (!companyId || !clientId) return { totalDebt: 0, unpaidCount: 0 };

  let totalDebt = 0;
  let unpaidCount = 0;

  try {
    // 1. Remisiones activas del cliente
    const remQuery = query(
      collection(db, "companies", companyId, "remisiones"),
      where("clientId", "==", clientId),
      where("status", "in", ["activa", "facturada"])
    );
    const remSnap = await getDocs(remQuery);
    remSnap.docs.forEach(d => {
      const data = d.data();
      const totalAmount = Number(data.totalAmount || data.total || 0);
      const paidAmount = Number(data.paidAmount || 0);
      const saldo = Math.max(0, totalAmount - paidAmount);
      if (saldo > 0.01) {
        totalDebt += saldo;
        unpaidCount++;
      }
    });

    // 2. Facturas del cliente (no pagadas)
    const facQuery = query(
      collection(db, "companies", companyId, "facturas"),
      where("clientId", "==", clientId),
      where("status", "in", ["timbrada", "por_timbrar", "activa"])
    );
    const facSnap = await getDocs(facQuery);
    facSnap.docs.forEach(d => {
      const data = d.data();
      // Si la factura deriva de una remisión que ya sumamos, evitamos duplicar saldo comprobando remissionId
      if (data.remissionId || data.remisionId) return;

      const totalAmount = Number(data.totalAmount || data.total || 0);
      const paidAmount = Number(data.paidAmount || 0);
      const saldo = Math.max(0, totalAmount - paidAmount);
      if (saldo > 0.01) {
        totalDebt += saldo;
        unpaidCount++;
      }
    });

  } catch (error) {
    console.error("Error al calcular saldo deudor del cliente:", error);
  }

  return { totalDebt, unpaidCount };
}

export interface CreditValidationResult {
  allowed: boolean;
  hasCreditLine: boolean;
  creditDays: number;
  creditLimit: number;
  currentDebt: number;
  remainingCredit: number;
  newTotalDebt: number;
  exceededAmount: number;
  message?: string;
}

/**
 * Valida si el cliente tiene suficiente crédito disponible para autorizar una nueva venta.
 */
export async function validateClientCreditLimit(
  companyId: string,
  client: any,
  newSaleAmount: number
): Promise<CreditValidationResult> {
  const hasCreditLine = Boolean(client?.hasCreditLine || (client?.creditLimit && Number(client.creditLimit) > 0));
  const creditLimit = Number(client?.creditLimit || 0);
  const creditDays = Number(client?.creditDays || 0);

  if (!hasCreditLine || creditLimit <= 0) {
    return {
      allowed: false,
      hasCreditLine: false,
      creditDays: 0,
      creditLimit: 0,
      currentDebt: 0,
      remainingCredit: 0,
      newTotalDebt: newSaleAmount,
      exceededAmount: 0,
      message: "El cliente no cuenta con una línea de crédito autorizada."
    };
  }

  const { totalDebt } = await getClientCurrentDebt(companyId, client.id);
  const newTotalDebt = totalDebt + newSaleAmount;
  const remainingCredit = Math.max(0, creditLimit - totalDebt);
  const exceededAmount = Math.max(0, newTotalDebt - creditLimit);

  if (newTotalDebt > creditLimit + 0.01) {
    return {
      allowed: false,
      hasCreditLine: true,
      creditDays,
      creditLimit,
      currentDebt: totalDebt,
      remainingCredit,
      newTotalDebt,
      exceededAmount,
      message: `El cliente ha topado su línea de crédito autorizada. Límite: $${creditLimit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}, Saldo Deudor Actual: $${totalDebt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}, Crédito Disponible: $${remainingCredit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}.`
    };
  }

  return {
    allowed: true,
    hasCreditLine: true,
    creditDays,
    creditLimit,
    currentDebt: totalDebt,
    remainingCredit: Math.max(0, creditLimit - newTotalDebt),
    newTotalDebt,
    exceededAmount: 0
  };
}
