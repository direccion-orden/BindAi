export type CashFlowEntryType = 'INCOME' | 'EXPENSE';

export interface BindERPProvider {
  ID: string;
  LegalName: string;
  RFC: string;
}

export interface BindERPAccount {
  ID: string;
  Name: string;
  Balance: number;
}

export interface BindERPExpense {
  ID?: string;
  ProviderID: string;
  AccountID: string;
  LocationID: string;
  Amount: number;
  Concept: string;
  Date: string; // ISO string
}

export interface BindERPCostCenter {
  ID: string;
  Name: string;
}

export interface CashFlowRecord {
  id?: string;
  day: number;
  month: number;
  year: number;
  type: CashFlowEntryType;
  category: string; // Used for static categories, or cost center ID
  costCenterId?: string;
  concept: string;
  amount: number;
  isReal: boolean; // Si viene de Bind ERP como real pagado, o proyectado localmente
  isProgrammed?: boolean; // True if it's a future expense saved in Firestore
  isApplied?: boolean; // True if a programmed expense was pushed to ERP
  providerId?: string;
  accountId?: string;
  notes?: string;
}

export interface MonthlyForecast {
  category: string;
  type: CashFlowEntryType;
  averageAmount: number;
}
