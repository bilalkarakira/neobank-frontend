export type CardStatus = 'ACTIVE' | 'FROZEN' | 'CANCELLED';
export type FreezeReason = 'CUSTOMER' | 'PIN_TRIES' | 'ADMIN';
export type AuthorizationStatus = 'AUTHORIZED' | 'DECLINED' | 'REVERSED' | 'EXPIRED' | 'CAPTURED' | 'MERGED';

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
  /** The security code printed on the card, for online payments. */
  cvv: string;
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
  /** A withdrawal at a cash machine (processing code 01), not a payment at a shop. */
  cash: boolean;
  /** Set when this is an addition to an earlier payment (a pump that topped up): the first authorization it adds to. */
  parentId: string | null;
  /** A payment without the card present (an online shop). */
  online: boolean;
}

/** What the customer owes the bank because a cleared card payment was more than their account could cover. */
export interface Owed {
  total: string;
  items: { accountId: string; amount: string; outstanding: string; createdAt: string }[];
}

export type DisputeReason = 'UNAUTHORIZED' | 'NOT_RECEIVED' | 'DUPLICATE' | 'WRONG_AMOUNT' | 'OTHER';

/** FILED: credit given, waiting for the card network; OPEN: the shop may answer; WON: the credit is final; LOST: it was taken back. */
export type DisputeStatus = 'FILED' | 'OPEN' | 'WON' | 'LOST';

export interface Dispute {
  id: string;
  authorizationId: string;
  merchantName: string | null;
  last4: string;
  amount: string;
  reason: DisputeReason;
  note: string | null;
  status: DisputeStatus;
  /** Why it ended, in a sentence; null while it is still running. */
  outcome: string | null;
  filedAt: string;
  openedAt: string | null;
  closedAt: string | null;
  /** While OPEN: when the shop's time to answer ends and the credit becomes final. */
  answerDueAt: string | null;
}

/** {@code amount} null disputes the whole payment. */
export interface DisputeRequest {
  reason: DisputeReason;
  note: string | null;
  amount: string | null;
}

export interface AuthorizationPage {
  items: CardAuthorization[];
  page: number;
  size: number;
  totalElements: number;
}
