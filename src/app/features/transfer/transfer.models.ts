export interface TransferRequest {
  sourceAccountId: string;
  destinationIban: string;
  /** Decimal string such as "250.00". */
  amount: string;
  description?: string | null;
}

export interface TransferResponse {
  transactionId: string;
  sourceAccountId: string;
  destinationIban: string;
  amount: string;
  /** The SOURCE account's balance right after the transfer. */
  balance: string;
  createdAt: string;
}

export interface TransferLimits {
  dailyLimit: string;
  usedToday: string;
  remaining: string;
}

export interface Recipient {
  iban: string;
  /** First name and last initial only, e.g. "Alice K." */
  ownerName: string;
}

export type RecipientState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'found'; recipient: Recipient }
  | { status: 'invalid' }
  | { status: 'not-found' }
  | { status: 'unavailable' }
  | { status: 'error' };
