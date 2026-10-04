export type Frequency = 'WEEKLY' | 'MONTHLY';
export type RecurringStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface RecurringPayment {
  id: string;
  sourceAccountId: string;
  destinationIban: string;
  /** Decimal string such as "25.00". */
  amount: string;
  description: string | null;
  categoryId: string | null;
  frequency: Frequency;
  /** Calendar days (UTC) as "YYYY-MM-DD". */
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  status: RecurringStatus;
  /** True when the order paused itself after repeated failed runs. */
  autoPaused: boolean;
  consecutiveFailures: number;
  createdAt: string;
}

export interface CreateRecurringRequest {
  sourceAccountId: string;
  destinationIban: string;
  amount: string;
  description: string | null;
  categoryId: string | null;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
}

export interface UpdateRecurringRequest {
  amount: string;
  description: string | null;
  categoryId: string | null;
}

export interface RecurringRun {
  runDate: string;
  status: 'SUCCESS' | 'FAILED';
  failureCode: string | null;
  failureMessage: string | null;
  transactionId: string | null;
  executedAt: string;
}
