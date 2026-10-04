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
