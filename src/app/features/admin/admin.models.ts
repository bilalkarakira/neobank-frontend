export interface Volume {
  count: number;
  /** Decimal string such as "150.00". */
  amount: string;
}

export interface Overview {
  generatedAt: string;
  customers: number;
  accounts: { active: number; frozen: number; closed: number };
  depositsHeld: string;
  transfersLast24Hours: Volume;
  transfersLast30Days: Volume;
  interestPaid: string;
  recurring: { active: number; paused: number; failedRunsLast7Days: number };
  security: { lockedLogins: number; probingBlocks: number };
}

export interface Reconciliation {
  healthy: boolean;
  totalOfAllEntries: string;
  accountsWithWrongBalance: string[];
  customerAccountsBelowZero: string[];
}

export type AdminAccountStatus = 'ACTIVE' | 'FROZEN' | 'CLOSED';

export interface AdminAccount {
  id: string;
  iban: string;
  type: 'CHECKING' | 'SAVINGS';
  status: AdminAccountStatus;
  balance: string;
  ownerEmail: string;
  ownerName: string;
  createdAt: string;
  ownerId: string;
}

export interface AdminAccountPage {
  items: AdminAccount[];
  total: number;
  page: number;
  size: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  adminEmail: string;
  action: string;
  accountIban: string | null;
  reason: string | null;
  detail: string | null;
}

export interface InterestRunSummary {
  skippedByLock: boolean;
  credited: number;
  skipped: number;
  failed: number;
}

export interface RecurringRunSummary {
  skippedByLock: boolean;
  succeeded: number;
  failed: number;
}

/** A customer who cannot log in right now because of too many wrong passwords. */
export interface LockedLogin {
  email: string;
  failures: number;
  lockedUntil: string;
}

/** A user who cannot look up or send to IBANs right now because of too many unknown ones. */
export interface ProbingBlock {
  userId: string;
  email: string;
  misses: number;
  blockedUntil: string;
}

export interface SecuritySnapshot {
  lockedLogins: LockedLogin[];
  /** Locks on addresses that belong to no customer: counted only, nobody is affected. */
  otherLockedAddresses: number;
  probingBlocks: ProbingBlock[];
}

export interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

export interface CustomerAccount {
  id: string;
  iban: string;
  type: 'CHECKING' | 'SAVINGS';
  status: AdminAccountStatus;
  nickname: string | null;
  balance: string;
  createdAt: string;
}

/** One ledger entry of one of the customer's accounts; the amount is signed (money out is negative). */
export interface CustomerActivity {
  at: string;
  accountIban: string;
  type: 'DEPOSIT' | 'TRANSFER' | 'INTEREST';
  amount: string;
  balanceAfter: string;
  description: string | null;
}

export interface CustomerDetail {
  profile: CustomerProfile;
  accounts: CustomerAccount[];
  recentActivity: CustomerActivity[];
  activeSessions: number;
  /** Null when the customer can log in. */
  loginLockedUntil: string | null;
  activeOrders: number;
  pausedOrders: number;
}

export type CardAuthStatus = 'AUTHORIZED' | 'DECLINED' | 'REVERSED' | 'EXPIRED' | 'CAPTURED';

/** One card authorization decision. Only the last four digits of the card are ever sent. */
export interface CardAuthorizationRow {
  id: string;
  createdAt: string;
  last4: string;
  /** False for a number that matched no card (a probe, a typo, a card from another issuer). */
  cardKnown: boolean;
  customerEmail: string | null;
  merchantName: string | null;
  amount: string;
  status: CardAuthStatus;
  responseCode: string;
  reason: string | null;
  mti: string;
  /** Approved by the card network while NeoBank was unavailable, reported afterwards in an advice. */
  standIn: boolean;
  expiresAt: string | null;
}

export interface CardAuthorizationPage {
  items: CardAuthorizationRow[];
  total: number;
  page: number;
  size: number;
}

/** One clearing file the card network handed to NeoBank. */
export interface ClearingFileRow {
  fileName: string;
  networkFileId: string | null;
  status: 'RECEIVED' | 'DONE' | 'REJECTED';
  /** Why a file was refused whole. */
  reason: string | null;
  itemCount: number;
  controlTotal: string;
  receivedAt: string;
  ackWritten: boolean;
}

export type ClearingResult = 'POSTED' | 'FORCE_POSTED' | 'REFUND_POSTED' | 'DUPLICATE' | 'REJECTED';

/** How one presentment was decided. Only the last four digits of the card are ever sent. */
export interface ClearingItemRow {
  fileName: string;
  recordNo: number;
  kind: 'PURCHASE' | 'REFUND';
  amount: string;
  last4: string;
  merchantName: string | null;
  result: ClearingResult;
  reason: string | null;
  covered: string;
  shortfall: string;
  forced: boolean;
  createdAt: string;
}

export interface ClearingReceivableRow {
  email: string;
  last4: string;
  amount: string;
  outstanding: string;
  createdAt: string;
}

export interface ClearingTotals {
  receivableOutstanding: string;
  settlementPayable: string;
  postedNet: string;
  receivableAccount: string;
  /** The card settlement account equals posted purchases minus refunds, and the receivable account equals what is still owed. */
  booksMatch: boolean;
}

export interface ClearingOverview {
  enabled: boolean;
  files: ClearingFileRow[];
  items: ClearingItemRow[];
  receivables: ClearingReceivableRow[];
  totals: ClearingTotals;
}

export interface ClearingIngestResult {
  filesProcessed: number;
  filesRefused: number;
  itemsPosted: number;
  acknowledgementsWritten: number;
}

/** A settlement statement of the card network as NeoBank decided it. Figures are decimal strings, null when the file was unreadable. */
export interface SettlementRunRow {
  runNumber: string | null;
  fileName: string;
  businessDate: string | null;
  valueDate: string | null;
  status: 'MATCHED' | 'DISPUTED' | 'REFUSED';
  purchases: string | null;
  refunds: string | null;
  interchange: string | null;
  schemeFee: string | null;
  /** Signed: negative means NeoBank pays. */
  net: string | null;
  itemCount: number | null;
  /** Why it was disputed or refused. */
  reason: string | null;
  receivedAt: string;
}

/** One difference between what was authorized, cleared and settled. Only the last four digits of a card are ever sent. */
export interface ReconciliationFinding {
  kind: string;
  businessDate: string | null;
  last4: string;
  ours: string;
  theirs: string;
  message: string;
}

/** A cleared item that no settlement run has covered yet (not an exception: just not finished). */
export interface WaitingItem {
  businessDate: string;
  last4: string;
  kind: 'PURCHASE' | 'REFUND';
  amount: string;
  merchantName: string | null;
}

export interface ReconciliationTotals {
  authorizedOpen: number;
  authorizedOpenAmount: string;
  cleared: number;
  clearedAmount: string;
  settled: number;
  settledAmount: string;
  notYetSettled: number;
  notYetSettledAmount: string;
  settlementPayable: string;
  ledgerAgrees: boolean;
}

export interface SettlementReport {
  date: string | null;
  businessDates: string[];
  runs: SettlementRunRow[];
  totals: ReconciliationTotals;
  findings: ReconciliationFinding[];
  notYetSettled: WaitingItem[];
  allAgree: boolean;
}

export interface SettlementIngestResult {
  matched: number;
  disputed: number;
  refused: number;
}
