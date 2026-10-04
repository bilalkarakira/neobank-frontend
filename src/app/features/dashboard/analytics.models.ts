/** Money is a decimal string ("1234.50"); percentages are plain numbers (or null when undefined). */
export interface MonthTotals {
  month: string;
  income: string;
  spending: string;
  net: string;
}

export interface Changes {
  income: number | null;
  spending: number | null;
  net: number | null;
}

export interface Summary {
  currency: string;
  totalBalance: string;
  thisMonth: MonthTotals;
  lastMonth: MonthTotals;
  changePercent: Changes;
}

export interface BalancePoint {
  /** UTC day, "YYYY-MM-DD". */
  date: string;
  balance: string;
}

export interface CashflowMonth {
  /** UTC calendar month, "YYYY-MM". */
  month: string;
  income: string;
  spending: string;
}

export interface CategoryShare {
  name: string;
  total: string;
  /** Percentage with one decimal; the shares of a response add up to exactly 100. */
  share: number;
}

export interface SpendingByCategory {
  from: string;
  to: string;
  total: string;
  categories: CategoryShare[];
}

export type PeriodId = '30d' | '90d' | '6m' | '12m';

export interface Period {
  id: PeriodId;
  label: string;
  /** Length of the balance chart and of the category breakdown. */
  days: number;
  /** Number of months in the cash-flow chart. */
  months: number;
}

export const PERIODS: Period[] = [
  { id: '30d', label: 'Last 30 days', days: 30, months: 3 },
  { id: '90d', label: 'Last 90 days', days: 90, months: 3 },
  { id: '6m', label: 'Last 6 months', days: 180, months: 6 },
  { id: '12m', label: 'Last 12 months', days: 365, months: 12 },
];

export const DEFAULT_PERIOD: PeriodId = '90d';
