import { CurrencyPipe, DatePipe } from '@angular/common';
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
  AuditEntry,
  Overview,
  Reconciliation,
  SecuritySnapshot,
} from './admin.models';
import { AdminService } from './admin.service';

type Tab = 'overview' | 'accounts' | 'security' | 'audit';
type Pending = { account: AdminAccount; kind: 'freeze' | 'unfreeze' };
type PendingSecurity =
  | { kind: 'login'; email: string }
  | { kind: 'probing'; userId: string; email: string };

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  FREEZE_ACCOUNT: 'Froze account',
  UNFREEZE_ACCOUNT: 'Unfroze account',
  RUN_INTEREST: 'Ran the interest job',
  RUN_RECURRING: 'Ran recurring payments',
  UNLOCK_LOGIN: 'Unlocked a login',
  CLEAR_PROBING_BLOCK: 'Lifted a probing block',
};

@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe],
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

  // security
  protected readonly security = signal<SecuritySnapshot | null>(null);
  protected readonly securityFailed = signal(false);
  protected readonly pendingSecurity = signal<PendingSecurity | null>(null);
  protected readonly securityReason = this.fb.control('', [Validators.required, Validators.maxLength(200)]);
  protected readonly securityActing = signal(false);

  // audit
  protected readonly audit = signal<AuditEntry[] | null>(null);
  protected readonly auditFailed = signal(false);

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

  protected ask(account: AdminAccount, kind: 'freeze' | 'unfreeze'): void {
    this.reason.reset('');
    this.error.set(null);
    this.pending.set({ account, kind });
  }

  protected confirm(): void {
    const pending = this.pending();
    if (!pending || this.reason.invalid || this.reason.value.trim() === '' || this.acting()) {
      this.reason.markAsTouched();
      return;
    }
    this.acting.set(true);
    const request =
      pending.kind === 'freeze'
        ? this.api.freeze(pending.account.id, this.reason.value.trim())
        : this.api.unfreeze(pending.account.id, this.reason.value.trim());
    request.subscribe({
      next: () => {
        this.acting.set(false);
        this.pending.set(null);
        this.notice.set(`Account ${formatIban(pending.account.iban)} ${pending.kind === 'freeze' ? 'frozen' : 'unfrozen'}.`);
        this.loadAccounts(this.pageIndex());
        this.audit.set(null);
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
