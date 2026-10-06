export type SortOption = 'date,desc' | 'date,asc' | 'amount,desc' | 'amount,asc';

export interface HistoryFilter {
  /** Dates are UTC days, "YYYY-MM-DD"; empty string means "no limit". */
  from: string;
  to: string;
  type: '' | 'DEPOSIT' | 'TRANSFER' | 'INTEREST' | 'CARD_PURCHASE' | 'CARD_REFUND' | 'CARD_COLLECTION';
  direction: '' | 'IN' | 'OUT';
  /** Only payments made by a standing order ('true'), only the others ('false'), or both (empty). */
  recurring: '' | 'true' | 'false';
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
  type: 'DEPOSIT' | 'TRANSFER' | 'INTEREST' | 'CARD_PURCHASE' | 'CARD_REFUND' | 'CARD_COLLECTION' | 'CARD_SHORTFALL';
  direction: 'IN' | 'OUT';
  /** Signed decimal string: "-250.00" for money out, "250.00" for money in. */
  amount: string;
  balanceAfter: string;
  description: string | null;
  /** The sender's spending category; only present on outgoing transfers. */
  category: string | null;
  counterparty: Counterparty;
  createdAt: string;
  /** True when a standing order made this payment (both the sender and the receiver see it). */
  recurring: boolean;
}

export interface HistoryPage {
  items: TransactionItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  /** Opaque position after the last item, for API clients that page by cursor; null on the last page. The page controls here still use page numbers. */
  nextCursor?: string | null;
}

export type HistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; page: HistoryPage }
  | { status: 'error' };
