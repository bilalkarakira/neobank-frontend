import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { amountValidator, normalizeAmount } from '../../core/amount';
import { ApiProblem } from '../../core/auth/auth.models';
import { tooManyMessage } from '../../core/rate-limit';
import { accountTitle } from '../accounts/account-title';
import { Account } from '../accounts/accounts.models';
import { AccountsService } from '../accounts/accounts.service';
import { formatIban, isValidIban, normalizeIban } from '../accounts/iban';
import { Category, RecipientState } from '../transfer/transfer.models';
import { TransferService } from '../transfer/transfer.service';
import { failureLabel, frequencyLabel, statusLabel } from './recurring-labels';
import { Frequency, RecurringPayment, RecurringRun } from './recurring.models';
import { RecurringService } from './recurring.service';

type Mode = 'own' | 'other';
type RunsState = RecurringRun[] | 'loading' | 'error';

/** Today as a UTC calendar day: the server schedules in UTC, so the default start date must agree with it. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-recurring',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './recurring.html',
})
export class Recurring {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly accountsApi = inject(AccountsService);
  private readonly transfers = inject(TransferService);
  private readonly api = inject(RecurringService);

  protected readonly title = accountTitle;
  protected readonly formatIban = formatIban;
  protected readonly statusLabel = statusLabel;
  protected readonly frequencyLabel = frequencyLabel;
  protected readonly failureLabel = failureLabel;
  protected readonly today = todayUtc();

  protected readonly payments = signal<RecurringPayment[] | null>(null);
  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loadFailed = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly confirmingCancel = signal<string | null>(null);
  protected readonly runs = signal<Record<string, RunsState>>({});

  protected readonly showForm = signal(false);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    fromId: ['', Validators.required],
    mode: this.fb.control<Mode>('other'),
    toOwnId: [''],
    iban: [''],
    amount: ['', [Validators.required, amountValidator]],
    description: ['', Validators.maxLength(100)],
    categoryId: [''],
    frequency: this.fb.control<Frequency>('MONTHLY'),
    startDate: [todayUtc(), Validators.required],
    endDate: [''],
  });

  protected readonly editingId = signal<string | null>(null);
  protected readonly editForm = this.fb.group({
    amount: ['', [Validators.required, amountValidator]],
    description: ['', Validators.maxLength(100)],
    categoryId: [''],
  });

  protected readonly recipient = toSignal(
    this.form.controls.iban.valueChanges.pipe(
      map((value) => normalizeIban(value)),
      debounceTime(350),
      distinctUntilChanged(),
      switchMap((iban): Observable<RecipientState> => {
        if (iban === '') {
          return of({ status: 'idle' });
        }
        if (!isValidIban(iban)) {
          return of({ status: 'invalid' });
        }
        return this.transfers.lookup(iban).pipe(
          map((recipient): RecipientState => ({ status: 'found', recipient })),
          startWith<RecipientState>({ status: 'checking' }),
          catchError((err: unknown): Observable<RecipientState> => {
            const status = err instanceof HttpErrorResponse ? err.status : 0;
            const code = err instanceof HttpErrorResponse ? (err.error as ApiProblem | null)?.code : undefined;
            if (status === 429) return of({ status: 'rate-limited', message: tooManyMessage(err) });
            if (status === 404) return of({ status: 'not-found' });
            if (status === 422 && code === 'RECIPIENT_UNAVAILABLE') return of({ status: 'unavailable' });
            if (status === 400) return of({ status: 'invalid' });
            return of({ status: 'error' });
          }),
        );
      }),
      takeUntilDestroyed(),
    ),
    { initialValue: { status: 'idle' } as RecipientState },
  );

  private readonly fromIdSignal = toSignal(this.form.controls.fromId.valueChanges, { initialValue: '' });
  private readonly modeSignal = toSignal(this.form.controls.mode.valueChanges, { initialValue: 'other' as Mode });
  private readonly toOwnIdSignal = toSignal(this.form.controls.toOwnId.valueChanges, { initialValue: '' });
  private readonly startSignal = toSignal(this.form.controls.startDate.valueChanges, { initialValue: todayUtc() });
  private readonly endSignal = toSignal(this.form.controls.endDate.valueChanges, { initialValue: '' });

  protected readonly sendingToOthers = computed(() => this.modeSignal() === 'other');

  protected readonly ownTargets = computed(() =>
    (this.accounts() ?? []).filter((a) => a.id !== this.fromIdSignal() && a.status === 'ACTIVE'),
  );

  protected readonly destination = computed<{ iban: string; label: string } | null>(() => {
    if (this.modeSignal() === 'own') {
      const target = this.ownTargets().find((a) => a.id === this.toOwnIdSignal());
      return target ? { iban: target.iban, label: this.title(target) } : null;
    }
    const state = this.recipient();
    return state.status === 'found' ? { iban: state.recipient.iban, label: state.recipient.ownerName } : null;
  });

  /** UX-only: the server checks every date rule again. */
  protected readonly dateProblem = computed<string | null>(() => {
    const start = this.startSignal();
    const end = this.endSignal();
    if (start && start < this.today) return 'The first payment cannot be in the past.';
    if (start && end && end < start) return 'The end date cannot be before the first payment.';
    return null;
  });

  constructor() {
    this.load();
    this.transfers.categories().subscribe({ next: (list) => this.categories.set(list), error: () => undefined });
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.api.list().subscribe({
      next: (list) => this.payments.set(list),
      error: () => this.loadFailed.set(true),
    });
    this.accountsApi.list().subscribe({
      next: (list) => {
        this.accounts.set(list);
        const firstActive = list.find((a) => a.status === 'ACTIVE');
        if (firstActive && !this.form.controls.fromId.value) {
          this.form.controls.fromId.setValue(firstActive.id);
        }
      },
      error: () => this.loadFailed.set(true),
    });
  }

  /** A readable name for where the money goes: one of my own accounts, or the bare IBAN. */
  protected destinationLabel(payment: RecurringPayment): string {
    const own = (this.accounts() ?? []).find((a) => a.iban === payment.destinationIban);
    return own ? this.title(own) : formatIban(payment.destinationIban);
  }

  /** A category describes spending, so it only applies to payments to other customers. */
  protected isOwnDestination(payment: RecurringPayment): boolean {
    return (this.accounts() ?? []).some((a) => a.iban === payment.destinationIban);
  }

  protected sourceLabel(payment: RecurringPayment): string {
    const source = (this.accounts() ?? []).find((a) => a.id === payment.sourceAccountId);
    return source ? this.title(source) : 'your account';
  }

  protected categoryName(id: string | null): string | null {
    return this.categories().find((c) => c.id === id)?.name ?? null;
  }

  protected amountNumber(value: string): number {
    return Number(value);
  }

  protected setMode(mode: Mode): void {
    this.form.controls.mode.setValue(mode);
  }

  protected openForm(): void {
    this.notice.set(null);
    this.formError.set(null);
    this.showForm.set(true);
  }

  protected canSubmit(): boolean {
    const f = this.form.controls;
    return f.fromId.valid && f.amount.valid && f.description.valid && f.startDate.valid
      && this.destination() !== null && this.dateProblem() === null;
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    const destination = this.destination();
    if (!this.canSubmit() || !destination || this.submitting()) {
      return;
    }
    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.formError.set(null);
    this.api
      .create({
        sourceAccountId: v.fromId,
        destinationIban: destination.iban,
        amount: normalizeAmount(v.amount),
        description: v.description.trim() || null,
        categoryId: v.mode === 'other' ? v.categoryId || null : null,
        frequency: v.frequency,
        startDate: v.startDate,
        endDate: v.endDate || null,
      })
      .subscribe({
        next: (created) => {
          this.submitting.set(false);
          this.payments.update((list) => [created, ...(list ?? [])]);
          this.showForm.set(false);
          this.notice.set('Recurring payment created.');
          // back to the defaults, so the next order never silently inherits this one's frequency or destination
          this.form.patchValue({
            mode: 'other',
            amount: '',
            description: '',
            iban: '',
            toOwnId: '',
            categoryId: '',
            frequency: 'MONTHLY',
            startDate: todayUtc(),
            endDate: '',
          });
          this.form.markAsUntouched();
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.formError.set(this.messageFor(err));
        },
      });
  }

  protected pause(payment: RecurringPayment): void {
    this.act(payment.id, this.api.pause(payment.id), 'Recurring payment paused.');
  }

  protected resume(payment: RecurringPayment): void {
    this.act(payment.id, this.api.resume(payment.id), 'Recurring payment resumed.');
  }

  protected askCancel(id: string): void {
    this.confirmingCancel.set(id);
  }

  protected cancel(payment: RecurringPayment): void {
    this.busyId.set(payment.id);
    this.error.set(null);
    this.api.cancel(payment.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirmingCancel.set(null);
        this.payments.update((list) => (list ?? []).filter((p) => p.id !== payment.id));
        this.notice.set('Recurring payment cancelled. Payments already made stay in your history.');
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.confirmingCancel.set(null);
        this.error.set(this.messageFor(err));
      },
    });
  }

  private act(id: string, request: Observable<RecurringPayment>, message: string): void {
    this.busyId.set(id);
    this.error.set(null);
    this.notice.set(null);
    request.subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.payments.update((list) => (list ?? []).map((p) => (p.id === id ? updated : p)));
        this.notice.set(message);
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.error.set(this.messageFor(err));
      },
    });
  }

  protected startEdit(payment: RecurringPayment): void {
    this.editForm.reset({
      amount: payment.amount,
      description: payment.description ?? '',
      categoryId: payment.categoryId ?? '',
    });
    this.error.set(null);
    this.editingId.set(payment.id);
  }

  protected saveEdit(payment: RecurringPayment): void {
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) {
      return;
    }
    const v = this.editForm.getRawValue();
    this.busyId.set(payment.id);
    this.error.set(null);
    this.api
      .update(payment.id, {
        amount: normalizeAmount(v.amount),
        description: v.description.trim() || null,
        categoryId: v.categoryId || null,
      })
      .subscribe({
        next: (updated) => {
          this.busyId.set(null);
          this.editingId.set(null);
          this.payments.update((list) => (list ?? []).map((p) => (p.id === payment.id ? updated : p)));
          this.notice.set('Recurring payment updated. The new amount applies from the next payment.');
        },
        error: (err: unknown) => {
          this.busyId.set(null);
          this.error.set(this.messageFor(err));
        },
      });
  }

  protected toggleRuns(payment: RecurringPayment): void {
    if (this.runs()[payment.id] !== undefined) {
      this.runs.update(({ [payment.id]: _closed, ...rest }) => rest);
      return;
    }
    this.runs.update((state) => ({ ...state, [payment.id]: 'loading' }));
    this.api.runs(payment.id).subscribe({
      next: (list) => this.runs.update((state) => ({ ...state, [payment.id]: list })),
      error: () => this.runs.update((state) => ({ ...state, [payment.id]: 'error' })),
    });
  }

  protected runList(id: string): RunsState | undefined {
    return this.runs()[id];
  }

  private messageFor(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const problem = err.error as ApiProblem | null;
      switch (problem?.code) {
        case 'RECURRING_LIMIT_REACHED':
          return problem.detail ?? 'You have reached the limit of recurring payments.';
        case 'DAILY_LIMIT_EXCEEDED':
          return 'This amount is above the daily transfer limit, so it could never be sent.';
        case 'SAME_ACCOUNT':
          return 'Choose two different accounts.';
        case 'RECIPIENT_NOT_FOUND':
        case 'INVALID_IBAN':
          return 'We could not find that recipient. Please check the IBAN.';
        case 'RECIPIENT_UNAVAILABLE':
          return 'The recipient account cannot receive money right now.';
        case 'RECURRING_NOT_FOUND':
          return 'This recurring payment no longer exists.';
        case 'RECURRING_INVALID_STATE':
          return problem.detail ?? 'That is not possible in the current state.';
        case 'VALIDATION_FAILED': {
          const first = Object.entries(problem.fields ?? {})[0];
          return first ? `${first[0]} ${first[1]}` : 'Please check the details and try again.';
        }
      }
      if (err.status === 429) {
        return tooManyMessage(err);
      }
      if (err.status >= 400 && err.status < 500) {
        return 'The request was rejected. Please check the details and try again.';
      }
    }
    return 'Something went wrong. Please try again.';
  }
}
