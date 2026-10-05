export type AccountType = 'CHECKING' | 'SAVINGS';

export interface Account {
  id: string;
  iban: string;
  type: AccountType;
  currency: string;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  nickname: string | null;
  /** Decimal string such as "0.00"; never parsed for arithmetic on the client. */
  balance: string;
  /** Balance minus money reserved by pending card payments: what can actually be spent. */
  availableBalance: string;
  /** Reserved by pending card payments (decimal string, "0.00" when nothing is held). */
  heldAmount: string;
  createdAt: string;
  /** Yearly rate (APY) as a percentage like "3.50"; only savings accounts have one. */
  interestRate?: string | null;
}

export interface OpenAccountRequest {
  type: AccountType;
  nickname: string | null;
}

export interface DepositRequest {
  /** Decimal string such as "100.00". */
  amount: string;
  description?: string | null;
}

export interface DepositResponse {
  transactionId: string;
  accountId: string;
  amount: string;
  /** The account balance right after this deposit. */
  balance: string;
  createdAt: string;
}

export interface InterestSummary {
  apyPercent: string | null;
  /** Interest earned in months of the current year (decimal string). */
  earnedThisYear: string;
}
