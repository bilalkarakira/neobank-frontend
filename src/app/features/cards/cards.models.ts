export type CardStatus = 'ACTIVE' | 'FROZEN' | 'CANCELLED';
export type FreezeReason = 'CUSTOMER' | 'PIN_TRIES' | 'ADMIN';
export type AuthorizationStatus = 'AUTHORIZED' | 'DECLINED' | 'REVERSED' | 'EXPIRED' | 'CAPTURED';

/** A card as the server describes it: masked number only. Money values are decimal strings, never parsed for sums. */
export interface Card {
  id: string;
  accountId: string;
  accountName: string;
  /** "9999 00** **** 1234" */
  maskedPan: string;
  last4: string;
  /** "MM/YY" */
  expiry: string;
  status: CardStatus;
  freezeReason: FreezeReason | null;
  nickname: string | null;
  dailyLimit: string;
  spentToday: string;
  ledgerBalance: string;
  availableBalance: string;
  heldAmount: string;
  createdAt: string;
}

/** The answer to issuing a card: the only time the full number and PIN are ever sent. */
export interface IssuedCard {
  card: Card;
  pan: string;
  pin: string;
}

export interface IssueCardRequest {
  accountId: string;
  nickname: string | null;
}

export interface CardAuthorization {
  id: string;
  merchantName: string | null;
  amount: string;
  status: AuthorizationStatus;
  responseCode: string;
  /** Plain-language reason for a decline; null for an approval. */
  reason: string | null;
  /** Approved by the card network on its own while NeoBank was unavailable, and reported afterwards. */
  standIn: boolean;
  createdAt: string;
  /** Only for a hold that still reserves money. */
  expiresAt: string | null;
  /** What was actually taken from the balance once the payment cleared (a tip makes it more than `amount`). */
  capturedAmount: string | null;
  capturedAt: string | null;
  /** Cleared although NeoBank never authorized it: the shop was paid by its bank, so it was posted anyway. */
  forced: boolean;
}

/** What the customer owes the bank because a cleared card payment was more than their account could cover. */
export interface Owed {
  total: string;
  items: { accountId: string; amount: string; outstanding: string; createdAt: string }[];
}

export interface AuthorizationPage {
  items: CardAuthorization[];
  page: number;
  size: number;
  totalElements: number;
}
