export type SortOption = 'date,desc' | 'date,asc' | 'amount,desc' | 'amount,asc';

export interface HistoryFilter {
  /** Dates are UTC days, "YYYY-MM-DD"; empty string means "no limit". */
  from: string;
  to: string;
  type: '' | 'DEPOSIT' | 'TRANSFER' | 'INTEREST';
  direction: '' | 'IN' | 'OUT';
  minAmount: string;
  maxAmount: string;
  q: string;
  sort: SortOption;
  page: number;
  size: number;
}

export interface Counterparty {
  label: string;
  iban: string | null;
  ownAccount: boolean;
}

export interface TransactionItem {
  transactionId: string;
  type: 'DEPOSIT' | 'TRANSFER' | 'INTEREST';
  direction: 'IN' | 'OUT';
  /** Signed decimal string: "-250.00" for money out, "250.00" for money in. */
  amount: string;
  balanceAfter: string;
  description: string | null;
  /** The sender's spending category; only present on outgoing transfers. */
  category: string | null;
  counterparty: Counterparty;
  createdAt: string;
}

export interface HistoryPage {
  items: TransactionItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export type HistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; page: HistoryPage }
  | { status: 'error' };
