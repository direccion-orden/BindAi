export interface BankTransaction {
  id: string;
  date: string; // YYYY-MM-DD
  concept: string;
  reference?: string;
  amount: number; // positive = INCOME, negative = EXPENSE
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
  balanceAfter?: number; // optional tracking, calculated client-side mostly
  createdAt: number;
}
