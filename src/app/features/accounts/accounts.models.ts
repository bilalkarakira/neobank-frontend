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
  createdAt: string;
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
