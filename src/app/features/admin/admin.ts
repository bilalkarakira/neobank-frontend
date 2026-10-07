import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, merge } from 'rxjs';
import { ApiProblem } from '../../core/auth/auth.models';
import { formatIban } from '../accounts/iban';
import {
  AdminAccount,
  AdminAccountPage,
  AdminAccountStatus,
  CustomerAccount,
  CustomerDetail,
  AuditEntry,
  CardAuthStatus,
  CardAuthorizationPage,
  ClearingOverview,
  ClearingResult,
  DisputeOverview,
  Overview,
  Reconciliation,
  SecuritySnapshot,
  SettlementReport,
} from './admin.models';
import { AdminService } from './admin.service';

type Tab = 'overview' | 'accounts' | 'customer' | 'security' | 'cards' | 'clearing' | 'settlement' | 'disputes' | 'audit';
/** What an action on an account needs to show: enough to name it, whichever list it was picked from. */
type Target = { id: string; iban: string; ownerEmail: string };
type Pending = { account: Target; kind: 'freeze' | 'unfreeze' | 'close' };
type PendingSecurity =
  | { kind: 'login'; email: string }
  | { kind: 'probing'; userId: string; email: string };

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  FREEZE_ACCOUNT: 'Froze account',
  UNFREEZE_ACCOUNT: 'Unfroze account',
  RUN_INTEREST: 'Ran the interest job',
  RUN_RECURRING: 'Ran recurring payments',
  RUN_CLEARING_INGEST: 'Looked for clearing files',
  RUN_SETTLEMENT_INGEST: 'Looked for settlement statements',
  CLOSE_DISPUTES: 'Closed disputes whose time ran out',
  UNLOCK_LOGIN: 'Unlocked a login',
  CLEAR_PROBING_BLOCK: 'Lifted a probing block',
  CLOSE_ACCOUNT: 'Closed account',
  VIEW_CUSTOMER: 'Viewed a customer',
};

@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, NgTemplateOutlet],
  templateUrl: './admin.html',
})
export class Admin {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AdminService);

  protected readonly formatIban = formatIban;
  protected readonly tab = signal<Tab>('overview');
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  // overview
  protected readonly overview = signal<Overview | null>(null);
  protected readonly reconciliation = signal<Reconciliation | null>(null);
  protected readonly overviewFailed = signal(false);
  protected readonly jobBusy = signal<'interest' | 'recurring' | null>(null);

  // accounts
  protected readonly page = signal<AdminAccountPage | null>(null);
  protected readonly accountsFailed = signal(false);
  protected readonly pageIndex = signal(0);
  protected readonly filters = this.fb.group({ q: [''], status: this.fb.control<AdminAccountStatus | ''>('') });
  protected readonly pending = signal<Pending | null>(null);
  protected readonly reason = this.fb.control('', [Validators.required, Validators.maxLength(200)]);
  protected readonly acting = signal(false);

  // customer
  protected readonly customer = signal<CustomerDetail | null>(null);
  protected readonly customerFailed = signal(false);
  protected readonly customerTrail = signal<AuditEntry[] | null>(null);
  protected readonly customerTrailFailed = signal(false);
  private customerId: string | null = null;

  // security
  protected readonly security = signal<SecuritySnapshot | null>(null);
  protected readonly securityFailed = signal(false);
  protected readonly pendingSecurity = signal<PendingSecurity | null>(null);
  protected readonly securityReason = this.fb.control('', [Validators.required, Validators.maxLength(200)]);
  protected readonly securityActing = signal(false);

  // card authorizations
  protected readonly cardPage = signal<CardAuthorizationPage | null>(null);
  protected readonly cardsFailed = signal(false);
  protected readonly cardPageIndex = signal(0);
  protected readonly cardFilters = this.fb.group({
    status: this.fb.control<CardAuthStatus | ''>(''),
    last4: ['', Validators.pattern(/^\d{4}$/)],
  });

  // clearing
  protected readonly clearing = signal<ClearingOverview | null>(null);
  protected readonly clearingFailed = signal(false);
  protected readonly clearingBusy = signal(false);
  protected readonly clearingResult = this.fb.control<ClearingResult | ''>('');

  // settlement and reconciliation
  protected readonly settlement = signal<SettlementReport | null>(null);
  protected readonly settlementFailed = signal(false);
  protected readonly settlementBusy = signal(false);
  protected readonly settlementDate = this.fb.control('');

  // disputes
  protected readonly disputes = signal<DisputeOverview | null>(null);
  protected readonly disputesFailed = signal(false);
  protected readonly disputesBusy = signal(false);

  // audit
  protected readonly audit = signal<AuditEntry[] | null>(null);
  protected readonly auditFailed = signal(false);

  protected readonly cardPageCount = computed(() => {
    const p = this.cardPage();
    return p ? Math.max(1, Math.ceil(p.total / p.size)) : 1;
  });

  protected readonly pageCount = computed(() => {
    const p = this.page();
    return p ? Math.max(1, Math.ceil(p.total / p.size)) : 1;
  });

  constructor() {
    this.loadOverview();
    // typing in the search box waits for a pause; changing the status filter applies at once
    merge(this.filters.controls.q.valueChanges.pipe(debounceTime(300)), this.filters.controls.status.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.loadAccounts(0));
    this.clearingResult.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.loadClearing());
    this.settlementDate.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.loadSettlement());
    // the card list reloads on a status change at once, and on four typed digits (or none) after a pause
    merge(this.cardFilters.controls.status.valueChanges, this.cardFilters.controls.last4.valueChanges.pipe(debounceTime(300)))
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.cardFilters.controls.last4.valid || this.cardFilters.controls.last4.value === '') {
          this.loadCardAuthorizations(0);
        }
      });
  }

  protected show(tab: Tab): void {
    this.tab.set(tab);
    this.notice.set(null);
    this.error.set(null);
    if (tab === 'accounts' && this.page() === null) {
      this.loadAccounts(0);
    }
    if (tab === 'security') {
      this.pendingSecurity.set(null);
      this.loadSecurity();
    }
    if (tab === 'cards') {
      this.loadCardAuthorizations(0);
    }
    if (tab === 'clearing') {
      this.loadClearing();
    }
    if (tab === 'settlement') {
      this.loadSettlement();
    }
    if (tab === 'disputes') {
      this.loadDisputes();
    }
    if (tab === 'audit') {
      this.loadAudit();
    }
  }

  protected actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  // ---- overview ---------------------------------------------------------------------------------------------

  protected loadOverview(): void {
    this.overviewFailed.set(false);
    this.api.overview().subscribe({
      next: (o) => this.overview.set(o),
      error: () => this.overviewFailed.set(true),
    });
    this.checkBooks();
  }

  protected checkBooks(): void {
    this.api.reconciliation().subscribe({
      next: (r) => this.reconciliation.set(r),
      error: () => this.reconciliation.set(null),
    });
  }

  protected runInterest(): void {
    this.startJob('interest');
    this.api.runInterest().subscribe({
      next: (s) => {
        this.finishJob(
          s.skippedByLock
            ? 'Another interest run is already in progress.'
            : `Interest job finished: ${s.credited} credited, ${s.skipped} skipped, ${s.failed} failed.`,
        );
      },
      error: (err: unknown) => this.failJob(err),
    });
  }

  protected runRecurring(): void {
    this.startJob('recurring');
    this.api.runRecurring().subscribe({
      next: (s) => {
        this.finishJob(
          s.skippedByLock
            ? 'Another recurring run is already in progress.'
            : `Recurring payments finished: ${s.succeeded} sent, ${s.failed} failed.`,
        );
      },
      error: (err: unknown) => this.failJob(err),
    });
  }

  private startJob(job: 'interest' | 'recurring'): void {
    this.jobBusy.set(job);
    this.notice.set(null);
    this.error.set(null);
  }

  private finishJob(message: string): void {
    this.jobBusy.set(null);
    this.notice.set(message);
    this.loadOverview(); // the numbers just changed
    this.audit.set(null); // and the audit tab is stale
  }

  private failJob(err: unknown): void {
    this.jobBusy.set(null);
    this.error.set(this.messageFor(err));
  }

  // ---- card authorizations ----------------------------------------------------------------------------------

  protected loadCardAuthorizations(index: number): void {
    this.cardsFailed.set(false);
    this.cardPageIndex.set(index);
    const { status, last4 } = this.cardFilters.getRawValue();
    this.api.cardAuthorizations(status, last4, index, PAGE_SIZE).subscribe({
      next: (p) => this.cardPage.set(p),
      error: () => this.cardsFailed.set(true),
    });
  }

  protected cardStatusLabel(status: CardAuthStatus): string {
    return { AUTHORIZED: 'Pending hold', DECLINED: 'Declined', REVERSED: 'Reversed', EXPIRED: 'Expired', CAPTURED: 'Posted' }[status];
  }

  // ---- clearing ---------------------------------------------------------------------------------------------

  protected loadClearing(): void {
    this.clearingFailed.set(false);
    this.api.clearing(this.clearingResult.value).subscribe({
      next: (c) => this.clearing.set(c),
      error: () => this.clearingFailed.set(true),
    });
  }

  /** Looks for new clearing files now; the server also does it by itself every few seconds. */
  protected ingestNow(): void {
    this.clearingBusy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.api.runClearingIngest().subscribe({
      next: (r) => {
        this.clearingBusy.set(false);
        this.notice.set(
          r.filesProcessed + r.filesRefused === 0
            ? 'No new clearing files.'
            : `${r.filesProcessed} file(s) processed (${r.itemsPosted} item(s) posted), ${r.filesRefused} refused.`,
        );
        this.loadClearing();
      },
      error: (err: unknown) => {
        this.clearingBusy.set(false);
        this.error.set(this.messageFor(err));
      },
    });
  }

  protected resultLabel(result: ClearingResult): string {
    return {
      POSTED: 'Posted',
      FORCE_POSTED: 'Posted without an authorization',
      REFUND_POSTED: 'Refund posted',
      DUPLICATE: 'Already posted',
      REJECTED: 'Rejected',
      CHARGEBACK_SENT: 'Chargeback sent',
      CHARGEBACK_POSTED: 'Chargeback accepted',
      CHARGEBACK_REFUSED: 'Chargeback refused',
      REPRESENTMENT_POSTED: 'Shop answered, customer debited again',
    }[result];
  }

  // ---- disputes ---------------------------------------------------------------------------------------------

  protected loadDisputes(): void {
    this.disputesFailed.set(false);
    this.api.disputes().subscribe({
      next: (d) => this.disputes.set(d),
      error: () => this.disputesFailed.set(true),
    });
  }

  /** Closes the disputes whose answer window has passed, now; the server also does it by itself every few seconds. */
  protected closeDisputesNow(): void {
    this.disputesBusy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.api.closeDueDisputes().subscribe({
      next: (r) => {
        this.disputesBusy.set(false);
        this.notice.set(r.closed === 0 ? 'No dispute is due to be closed.' : `${r.closed} dispute(s) closed as won.`);
        this.loadDisputes();
      },
      error: (err: unknown) => {
        this.disputesBusy.set(false);
        this.error.set(this.messageFor(err));
      },
    });
  }

  protected disputeStatusLabel(status: string): string {
    return { FILED: 'Sent to the network', OPEN: 'Waiting for the shop', WON: 'Won by the customer', LOST: 'Lost by the customer' }[status] ?? status;
  }

  // ---- settlement and reconciliation ------------------------------------------------------------------------

  protected loadSettlement(): void {
    this.settlementFailed.set(false);
    this.api.settlement(this.settlementDate.value).subscribe({
      next: (s) => this.settlement.set(s),
      error: () => this.settlementFailed.set(true),
    });
  }

  /** Looks for new settlement statements now; the server also does it by itself every few seconds. */
  protected ingestSettlementNow(): void {
    this.settlementBusy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.api.runSettlementIngest().subscribe({
      next: (r) => {
        this.settlementBusy.set(false);
        this.notice.set(
          r.matched + r.disputed + r.refused === 0
            ? 'No new settlement statements.'
            : `${r.matched} statement(s) matched and posted, ${r.disputed} disputed, ${r.refused} refused.`,
        );
        this.loadSettlement();
      },
      error: (err: unknown) => {
        this.settlementBusy.set(false);
        this.error.set(this.messageFor(err));
      },
    });
  }

  protected findingLabel(kind: string): string {
    return (
      {
        AMOUNT_CHANGED: 'Amount changed',
        CLEARED_WITHOUT_AUTHORIZATION: 'Cleared without approval',
        REJECTED_AT_ISSUER: 'Rejected by NeoBank',
        NEVER_CLEARED: 'Never cleared',
        SETTLEMENT_DISPUTED: 'Statement disputed',
        SETTLEMENT_REFUSED: 'Statement refused',
        SETTLEMENT_NOT_IN_LEDGER: 'Statement not in the ledger',
        LEDGER_MISMATCH: 'Ledger disagrees',
        CHARGEBACK_REFUSED: 'Chargeback refused',
        LATE_REPRESENTMENT: 'Answer after the dispute was won',
        DISPUTE_OPEN_TOO_LONG: 'Dispute open too long',
      } as Record<string, string>
    )[kind] ?? kind;
  }

  // ---- accounts ---------------------------------------------------------------------------------------------

  protected loadAccounts(index: number): void {
    this.accountsFailed.set(false);
    this.pageIndex.set(index);
    const { q, status } = this.filters.getRawValue();
    this.api.accounts(q, status, index, PAGE_SIZE).subscribe({
      next: (p) => this.page.set(p),
      error: () => this.accountsFailed.set(true),
    });
  }

  protected previous(): void {
    if (this.pageIndex() > 0) {
      this.loadAccounts(this.pageIndex() - 1);
    }
  }

  protected next(): void {
    if (this.pageIndex() + 1 < this.pageCount()) {
      this.loadAccounts(this.pageIndex() + 1);
    }
  }

  protected ask(account: Target, kind: 'freeze' | 'unfreeze' | 'close'): void {
    this.reason.reset('');
    this.error.set(null);
    this.pending.set({ account, kind });
  }

  /** From the customer view: the account knows its owner through the customer being shown. */
  protected askAboutCustomerAccount(account: CustomerAccount, kind: 'freeze' | 'unfreeze' | 'close'): void {
    this.ask({ id: account.id, iban: account.iban, ownerEmail: this.customer()?.profile.email ?? '' }, kind);
  }

  /** Only an account holding exactly nothing can be closed; the server enforces it, this just avoids a pointless click. */
  protected canClose(balance: string): boolean {
    return Number(balance) === 0;
  }

  protected confirm(): void {
    const pending = this.pending();
    if (!pending || this.reason.invalid || this.reason.value.trim() === '' || this.acting()) {
      this.reason.markAsTouched();
      return;
    }
    this.acting.set(true);
    const reason = this.reason.value.trim();
    const request =
      pending.kind === 'freeze'
        ? this.api.freeze(pending.account.id, reason)
        : pending.kind === 'close'
          ? this.api.close(pending.account.id, reason)
          : this.api.unfreeze(pending.account.id, reason);
    const newStatus = pending.kind === 'freeze' ? 'FROZEN' : pending.kind === 'close' ? 'CLOSED' : 'ACTIVE';
    request.subscribe({
      next: () => {
        this.acting.set(false);
        this.pending.set(null);
        const verb = pending.kind === 'freeze' ? 'frozen' : pending.kind === 'close' ? 'closed' : 'unfrozen';
        this.notice.set(`Account ${formatIban(pending.account.iban)} ${verb}.`);
        // the customer view is patched in place: re-fetching it would write another "viewed" line to the audit log
        this.customer.update((c) =>
          c ? { ...c, accounts: c.accounts.map((a) => (a.id === pending.account.id ? { ...a, status: newStatus } : a)) } : c,
        );
        if (this.page() !== null) {
          this.loadAccounts(this.pageIndex());
        }
        this.audit.set(null);
        if (this.customerId !== null && this.tab() === 'customer') {
          this.loadCustomerTrail(this.customerId);
        }
        this.loadOverview();
      },
      error: (err: unknown) => {
        this.acting.set(false);
        this.error.set(this.messageFor(err));
      },
    });
  }

  protected cancelPending(): void {
    this.pending.set(null);
  }

  // ---- customer ---------------------------------------------------------------------------------------------

  protected openCustomer(userId: string): void {
    this.tab.set('customer');
    this.notice.set(null);
    this.error.set(null);
    this.pending.set(null);
    this.customer.set(null);
    this.customerFailed.set(false);
    this.customerTrail.set(null);
    this.customerTrailFailed.set(false);
    this.customerId = userId;
    this.api.customer(userId).subscribe({
      next: (detail) => {
        this.customer.set(detail);
        // after the detail: opening the customer writes its own audit row, which the trail should already show
        this.loadCustomerTrail(userId);
      },
      error: () => this.customerFailed.set(true),
    });
  }

  protected loadCustomerTrail(userId: string): void {
    this.customerTrailFailed.set(false);
    this.api.customerAudit(userId).subscribe({
      // an answer for a customer the admin has since left must not overwrite the one now on screen
      next: (entries) => this.customerId === userId && this.customerTrail.set(entries),
      error: () => this.customerId === userId && this.customerTrailFailed.set(true),
    });
  }

  protected retryCustomer(): void {
    if (this.customerId) {
      this.openCustomer(this.customerId);
    }
  }

  protected backToAccounts(): void {
    this.pending.set(null);
    this.show('accounts');
  }

  /** The customer view belongs to the Accounts section, so that tab stays highlighted while it is open. */
  protected isTab(name: string): boolean {
    return this.tab() === name || (name === 'accounts' && this.tab() === 'customer');
  }

  protected activityLabel(type: string): string {
    return type === 'DEPOSIT' ? 'Deposit' : type === 'INTEREST' ? 'Interest' : 'Transfer';
  }

  // ---- security ---------------------------------------------------------------------------------------------

  protected loadSecurity(): void {
    this.securityFailed.set(false);
    this.api.security().subscribe({
      next: (snapshot) => this.security.set(snapshot),
      error: () => this.securityFailed.set(true),
    });
  }

  protected askUnlock(email: string): void {
    this.securityReason.reset('');
    this.error.set(null);
    this.pendingSecurity.set({ kind: 'login', email });
  }

  protected askClearBlock(userId: string, email: string): void {
    this.securityReason.reset('');
    this.error.set(null);
    this.pendingSecurity.set({ kind: 'probing', userId, email });
  }

  protected cancelSecurity(): void {
    this.pendingSecurity.set(null);
  }

  protected confirmSecurity(): void {
    const pending = this.pendingSecurity();
    const reason = this.securityReason.value.trim();
    if (!pending || reason === '' || this.securityReason.invalid || this.securityActing()) {
      this.securityReason.markAsTouched();
      return;
    }
    this.securityActing.set(true);
    const request =
      pending.kind === 'login' ? this.api.unlockLogin(pending.email, reason) : this.api.clearProbingBlock(pending.userId, reason);
    request.subscribe({
      next: () => {
        this.securityActing.set(false);
        this.pendingSecurity.set(null);
        this.notice.set(pending.kind === 'login' ? `${pending.email} can log in again.` : `${pending.email} can look up recipients again.`);
        this.loadSecurity();
        this.audit.set(null);
        this.loadOverview();
      },
      error: (err: unknown) => {
        this.securityActing.set(false);
        this.error.set(this.messageFor(err));
        this.loadSecurity(); // it may have expired or been lifted by someone else: show the truth
      },
    });
  }

  // ---- audit ------------------------------------------------------------------------------------------------

  protected loadAudit(): void {
    this.auditFailed.set(false);
    this.api.audit().subscribe({
      next: (list) => this.audit.set(list),
      error: () => this.auditFailed.set(true),
    });
  }

  protected amountNumber(value: string): number {
    return Number(value);
  }

  private messageFor(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const problem = err.error as ApiProblem | null;
      if (problem?.code === 'ADMIN_INVALID_STATE' && problem.detail) {
        return problem.detail;
      }
      if (problem?.code === 'ADMIN_ACCOUNT_NOT_EMPTY' && problem.detail) {
        return problem.detail;
      }
      if (problem?.code === 'CUSTOMER_NOT_FOUND') {
        return 'This customer no longer exists.';
      }
      if (problem?.code === 'NOT_LOCKED') {
        return 'That customer is no longer locked out.';
      }
      if (problem?.code === 'NOT_BLOCKED') {
        return 'That user is no longer blocked.';
      }
      if (problem?.code === 'ACCOUNT_NOT_FOUND') {
        return 'This account no longer exists.';
      }
      if (err.status === 403) {
        return 'You do not have permission to do this.';
      }
      if (err.status >= 400 && err.status < 500) {
        return 'The request was rejected. Please check the details and try again.';
      }
    }
    return 'Something went wrong. Please try again.';
  }
}
