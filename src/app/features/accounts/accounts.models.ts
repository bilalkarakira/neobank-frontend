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
