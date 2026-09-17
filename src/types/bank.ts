export interface BankTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  concept: string;
  reference?: string;
  amount: number; // positive = INCOME, negative = EXPENSE
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  balanceAfter?: number; // optional tracking, calculated client-side mostly
  createdAt: number;
  reconciled?: boolean;
  reconcileType?: 'match' | 'direct';
  matchedDocumentId?: string;
  matchedAt?: string;
}

export function isCreditAccount(acc: any): boolean {
  if (!acc) return false;
  if (acc.isCredit === true) return true;
  if (acc.type === "credit" || acc.type === "card") return true;
  if (acc.Type === 1) return true;
  if (typeof acc.TypeText === "string" && /cr[eé]dito/i.test(acc.TypeText)) return true;
  if (typeof acc.name === "string" && /\b(tc|tarjeta|cr[eé]dito)\b/i.test(acc.name)) return true;
  if (typeof acc.Name === "string" && /\b(tc|tarjeta|cr[eé]dito)\b/i.test(acc.Name)) return true;
  return false;
}

