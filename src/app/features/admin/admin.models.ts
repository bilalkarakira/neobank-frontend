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
