/**
 * Utilidades para normalización y deduplicación inteligente de movimientos bancarios
 * entre diferentes fuentes (Syncfy, cargas masivas CSV, extractos PDF, movimientos manuales).
 */

const SPANISH_MONTHS: Record<string, string> = {
  ene: '01',
  feb: '02',
  mar: '03',
  abr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  ago: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dic: '12',
};

/**
 * Normaliza cualquier formato de fecha a 'YYYY-MM-DD'
 * Soporta ISO 8601, 'YYYY-MM-DD HH:mm:ss', 'DD/MM/YYYY', 'DD-mes-YYYY' (español), timestamps numéricos y objetos Date.
 */
export function normalizeDate(raw: any, fallbackStr: string = new Date().toISOString().split('T')[0]): string {
  if (!raw) return fallbackStr;

  if (raw instanceof Date) {
    return raw.toISOString().split('T')[0];
  }

  if (typeof raw === 'number') {
    const ms = raw < 10000000000 ? raw * 1000 : raw;
    return new Date(ms).toISOString().split('T')[0];
  }

  let s = String(raw).trim();
  if (s.includes('T')) s = s.split('T')[0];
  if (s.includes(' ')) s = s.split(' ')[0];

  // Formato español ej: 28-jul-2026 o 18-jun-26
  const spanishMatch = s.toLowerCase().match(/^(\d{1,2})[\/\-]([a-z]{3})[\/\-](\d{2,4})$/);
  if (spanishMatch) {
    const day = spanishMatch[1].padStart(2, '0');
    const month = SPANISH_MONTHS[spanishMatch[2]] || '01';
    let year = spanishMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  // Formato DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  // Formato YYYY/MM/DD o YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  return s || fallbackStr;
}

/**
 * Limpia y normaliza cadenas de texto para comparaciones robustas
 * (mayúsculas, sin acentos, sin puntuación ni espacios redundantes)
 */
export function cleanText(str: any): string {
  if (!str) return '';
  return String(str)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export interface MinimalTransaction {
  id?: string;
  docId?: string;
  date: any;
  amount: number | string;
  concept?: string;
  reference?: string;
  syncfyTransactionId?: string;
  syncProvider?: string;
  reconciled?: boolean;
}

/**
 * Determina si dos movimientos bancarios representan la misma transacción física
 */
export function transactionsMatch(
  t1: MinimalTransaction,
  t2: MinimalTransaction,
  isCredit: boolean = false
): boolean {
  // 1. Coincidencia de Fecha (ambas normalizadas a YYYY-MM-DD)
  const d1 = normalizeDate(t1.date);
  const d2 = normalizeDate(t2.date);
  if (d1 !== d2) {
    return false;
  }

  // 2. Coincidencia de Importe (con tolerancia de 1 centavo)
  const a1 = Number(t1.amount) || 0;
  const a2 = Number(t2.amount) || 0;
  const sameAmount = Math.abs(a1 - a2) < 0.01;
  const invertedCreditAmount = isCredit && Math.abs(a1 + a2) < 0.01;

  if (!sameAmount && !invertedCreditAmount) {
    return false;
  }

  // 3. Similitud de Texto (Concepto y Referencia)
  const c1 = cleanText(t1.concept);
  const c2 = cleanText(t2.concept);
  const r1 = cleanText(t1.reference);
  const r2 = cleanText(t2.reference);

  // Si alguno no tiene concepto, la fecha e importe exacto son suficientes
  if (!c1 || !c2) return true;
  if (c1 === c2) return true;

  // Si un concepto contiene al otro (común por truncamiento de bancos o agregados de terminal)
  if (c1.includes(c2) || c2.includes(c1)) return true;

  // Si los primeros 10 caracteres alfanuméricos coinciden
  if (c1.length >= 10 && c2.length >= 10 && c1.substring(0, 10) === c2.substring(0, 10)) {
    return true;
  }

  // Si las referencias bancarias coinciden o una contiene a la otra
  if (r1 && r2 && (r1 === r2 || r1.includes(r2) || r2.includes(r1))) return true;
  if (r1 && (c2.includes(r1) || r1.includes(c2))) return true;
  if (r2 && (c1.includes(r2) || r2.includes(c1))) return true;

  return false;
}

/**
 * Busca en una lista de transacciones existentes la primera coincidencia no utilizada
 */
export function findMatchingTransaction<T extends MinimalTransaction>(
  incoming: MinimalTransaction,
  existingList: T[],
  usedIds: Set<string>,
  isCredit: boolean = false
): T | null {
  for (const existing of existingList) {
    const id = existing.id || existing.docId || '';
    if (id && usedIds.has(id)) continue;

    if (transactionsMatch(incoming, existing, isCredit)) {
      return existing;
    }
  }
  return null;
}
