import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { amountValidator, normalizeAmount } from '../../core/amount';
import { ApiProblem } from '../../core/auth/auth.models';
import { IdempotentAttempt } from '../../core/idempotent-attempt';
import { accountTitle } from '../accounts/account-title';
import { Account } from '../accounts/accounts.models';
import { AccountsService } from '../accounts/accounts.service';
import { formatIban, isValidIban, normalizeIban } from '../accounts/iban';
import { Category, RecipientState, TransferLimits, TransferResponse } from './transfer.models';
import { TransferService } from './transfer.service';

type Step = 'details' | 'review' | 'done';
type Mode = 'own' | 'other';

@Component({
  selector: 'app-transfer',
  imports: [ReactiveFormsModule, CurrencyPipe, RouterLink],
  templateUrl: './transfer.html',
})
export class Transfer {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly accountsApi = inject(AccountsService);
  private readonly transfers = inject(TransferService);
  private readonly attempt = new IdempotentAttempt();

  protected readonly title = accountTitle;
  protected readonly formatIban = formatIban;

  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly limits = signal<TransferLimits | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly step = signal<Step>('details');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<TransferResponse | null>(null);

  protected readonly form = this.fb.group({
    fromId: ['', Validators.required],
    mode: this.fb.control<Mode>('own'),
    toOwnId: [''],
    iban: [''],
    amount: ['', [Validators.required, amountValidator]],
    description: ['', Validators.maxLength(100)],
    categoryId: [''],
  });

  protected readonly categories = signal<Category[]>([]);

  /** Debounced IBAN lookup: validates the checksum locally first, and only asks the server for plausible IBANs. */
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

  // form values mirrored as signals so the derived state below updates automatically
  private readonly fromIdSignal = toSignal(this.form.controls.fromId.valueChanges, { initialValue: '' });
  private readonly modeSignal = toSignal(this.form.controls.mode.valueChanges, { initialValue: 'own' as Mode });
  private readonly toOwnIdSignal = toSignal(this.form.controls.toOwnId.valueChanges, { initialValue: '' });
  private readonly amountSignal = toSignal(this.form.controls.amount.valueChanges, { initialValue: '' });

  /** Own accounts other than the one money leaves from. */
  protected readonly ownTargets = computed(() => {
    const fromId = this.fromIdSignal();
    return (this.accounts() ?? []).filter((a) => a.id !== fromId && a.status === 'ACTIVE');
  });

  protected readonly source = computed(() => (this.accounts() ?? []).find((a) => a.id === this.fromIdSignal()));

  /** The destination resolved to something we can actually send to, or null while it is incomplete. */
  protected readonly destination = computed<{ iban: string; label: string } | null>(() => {
    if (this.modeSignal() === 'own') {
      const target = this.ownTargets().find((a) => a.id === this.toOwnIdSignal());
      return target ? { iban: target.iban, label: this.title(target) } : null;
    }
    const state = this.recipient();
    return state.status === 'found' ? { iban: state.recipient.iban, label: state.recipient.ownerName } : null;
  });

  protected readonly sendingToOthers = computed(() => this.modeSignal() === 'other');

  constructor() {
    this.load();
    // the dropdown is a convenience: if the list cannot be loaded, transfers still work (uncategorized)
    this.transfers.categories().subscribe({ next: (list) => this.categories.set(list), error: () => undefined });
  }

  /** The chosen category's name, for the review step. */
  protected selectedCategoryName(): string | null {
    const id = this.form.controls.categoryId.value;
    return this.categories().find((c) => c.id === id)?.name ?? null;
  }

  protected load(): void {
    this.loadFailed.set(false);
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
    this.transfers.limits().subscribe({ next: (l) => this.limits.set(l), error: () => undefined });
  }

  protected setMode(mode: Mode): void {
    this.form.controls.mode.setValue(mode);
  }

  /** UX-only hints; the server is the authority on every one of these rules. */
  protected readonly amountHint = computed<string | null>(() => {
    const text = this.amountSignal().trim();
    if (text === '' || this.form.controls.amount.invalid) {
      return null;
    }
    const amount = Number(text);
    const source = this.source();
    if (source && amount > Number(source.balance)) {
      return 'This is more than the balance of the selected account.';
    }
    const limits = this.limits();
    if (this.sendingToOthers() && limits && amount > Number(limits.remaining)) {
      return `This is more than your remaining daily limit of ${limits.remaining} USD.`;
    }
    return null;
  });

  protected canReview(): boolean {
    return this.form.controls.fromId.valid && this.form.controls.amount.valid
      && this.form.controls.description.valid && this.destination() !== null && this.amountHint() === null;
  }

  protected review(): void {
    this.form.markAllAsTouched();
    if (this.canReview()) {
      this.error.set(null);
      this.step.set('review');
    }
  }

  protected back(): void {
    this.error.set(null);
    this.step.set('details');
  }

  protected confirm(): void {
    const source = this.source();
    const destination = this.destination();
    if (!source || !destination || this.submitting()) {
      return;
    }
    const amount = normalizeAmount(this.form.controls.amount.value);
    const description = this.form.controls.description.value.trim() || null;
    // a category describes spending, so it only applies when sending to someone else
    const categoryId = this.sendingToOthers() ? this.form.controls.categoryId.value || null : null;
    const key = this.attempt.keyFor(`${source.id}|${destination.iban}|${amount}|${description ?? ''}|${categoryId ?? ''}`);

    this.submitting.set(true);
    this.error.set(null);
    this.transfers
      .transfer({ sourceAccountId: source.id, destinationIban: destination.iban, amount, description, categoryId }, key)
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.attempt.succeeded();
          this.result.set(response);
          this.step.set('done');
          this.load(); // fresh balances and remaining daily limit
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.attempt.failed(err);
          this.error.set(this.messageFor(err));
        },
      });
  }

  protected another(): void {
    this.result.set(null);
    this.form.patchValue({ amount: '', description: '', iban: '', toOwnId: '', categoryId: '' });
    this.form.markAsUntouched();
    this.step.set('details');
  }

  private messageFor(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const problem = err.error as (ApiProblem & { remaining?: string }) | null;
      switch (problem?.code) {
        case 'INSUFFICIENT_FUNDS':
          return 'Insufficient funds in the selected account.';
        case 'DAILY_LIMIT_EXCEEDED':
          return problem.detail ?? 'This would exceed your daily transfer limit.';
        case 'RECIPIENT_UNAVAILABLE':
          return 'The recipient account cannot receive money right now.';
        case 'ACCOUNT_NOT_ACTIVE':
          return 'The selected account is not active.';
        case 'SAME_ACCOUNT':
          return 'Choose two different accounts.';
        case 'RECIPIENT_NOT_FOUND':
        case 'INVALID_IBAN':
          return 'We could not find that recipient. Please check the IBAN.';
      }
      if (err.status >= 400 && err.status < 500) {
        return 'The transfer was rejected. Please check the details and try again.';
      }
    }
    return 'We could not confirm the transfer. Press Confirm again to retry safely: it will not be sent twice.';
  }

  protected amountNumber(value: string): number {
    return Number(value);
  }
}
