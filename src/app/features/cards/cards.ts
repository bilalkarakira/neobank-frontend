import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiProblem } from '../../core/auth/auth.models';
import { accountTitle } from '../accounts/account-title';
import { Account } from '../accounts/accounts.models';
import { AccountsService } from '../accounts/accounts.service';
import { AuthorizationStatus, Card, CardAuthorization, Dispute, DisputeReason, IssuedCard, Owed } from './cards.models';
import { CardsService } from './cards.service';

export const MAX_DAILY_LIMIT = 5000;
const ACTIVITY_PAGE = 10;

/** Mirrors the server: positive, at most 2 decimals, at most 5,000.00. The server checks again. */
export function limitValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  if (value === '') {
    return null; // "required" reports this
  }
  if (!/^\d{1,4}(\.\d{1,2})?$|^5000(\.0{1,2})?$/.test(value)) {
    return { format: true };
  }
  const number = Number(value);
  return number < 0.01 || number > MAX_DAILY_LIMIT ? { range: true } : null;
}

/** Empty means "the whole payment"; otherwise a positive amount with at most two decimals. The server checks the upper limit. */
export function disputeAmountValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  if (value === '') {
    return null;
  }
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) {
    return { format: true };
  }
  return Number(value) <= 0 ? { range: true } : null;
}

export const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: 'UNAUTHORIZED', label: 'I did not make this payment' },
  { value: 'NOT_RECEIVED', label: 'I did not receive what I paid for' },
  { value: 'DUPLICATE', label: 'I was charged twice' },
  { value: 'WRONG_AMOUNT', label: 'The amount is wrong' },
  { value: 'OTHER', label: 'Something else' },
];

type ActivityState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; pending: CardAuthorization[]; recent: CardAuthorization[]; page: number; total: number };

const STATUS_LABELS: Record<AuthorizationStatus, string> = {
  AUTHORIZED: 'Pending',
  DECLINED: 'Declined',
  REVERSED: 'Cancelled by the shop',
  EXPIRED: 'Expired',
  CAPTURED: 'Posted',
  MERGED: 'Added to the payment',
};

@Component({
  selector: 'app-cards',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './cards.html',
})
export class Cards {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(CardsService);
  private readonly accountsApi = inject(AccountsService);

  protected readonly cards = signal<Card[] | null>(null);
  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);
  protected readonly confirmingCancel = signal<string | null>(null);

  protected readonly showIssue = signal(false);
  protected readonly issuing = signal(false);
  protected readonly issueError = signal<string | null>(null);
  /** The number and PIN of a card just issued. Held in memory only, and gone as soon as it is dismissed. */
  protected readonly revealed = signal<IssuedCard | null>(null);
  protected readonly copied = signal<string | null>(null);

  protected readonly issueForm = this.fb.group({
    accountId: ['', Validators.required],
    nickname: ['', Validators.maxLength(40)],
  });

  protected readonly editingLimitId = signal<string | null>(null);
  protected readonly limitControl = this.fb.control('', [Validators.required, limitValidator]);

  protected readonly open = signal<Record<string, boolean>>({});
  protected readonly activity = signal<Record<string, ActivityState>>({});
  protected readonly owed = signal<Owed | null>(null);

  protected readonly disputes = signal<Dispute[]>([]);
  /** The posted payment whose dispute form is open. */
  protected readonly disputing = signal<string | null>(null);
  protected readonly disputeBusy = signal(false);
  protected readonly disputeError = signal<string | null>(null);
  protected readonly disputeReasons = DISPUTE_REASONS;
  protected readonly disputeForm = this.fb.group({
    reason: ['', Validators.required],
    amount: ['', disputeAmountValidator],
    note: ['', Validators.maxLength(200)],
  });

  protected readonly title = accountTitle;
  protected readonly maxLimit = MAX_DAILY_LIMIT;

  /** Only an active checking account can have a card; the server checks again. */
  protected readonly eligibleAccounts = computed(() =>
    (this.accounts() ?? []).filter((a) => a.type === 'CHECKING' && a.status === 'ACTIVE'),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    // a nicety next to the cards: if it cannot be loaded the page simply shows no debt line
    this.api.owed().subscribe({ next: (o) => this.owed.set(o), error: () => undefined });
    this.api.disputes().subscribe({ next: (list) => this.disputes.set(list), error: () => undefined });
    this.loadFailed.set(false);
    this.api.list().subscribe({
      next: (list) => this.cards.set(list),
      error: () => this.loadFailed.set(true),
    });
    this.accountsApi.list().subscribe({ next: (list) => this.accounts.set(list), error: () => this.accounts.set([]) });
  }

  // ---- issuing ----------------------------------------------------------------------------------------------

  protected openIssue(): void {
    this.issueError.set(null);
    const eligible = this.eligibleAccounts();
    this.issueForm.reset({ accountId: eligible.length === 1 ? eligible[0].id : '', nickname: '' });
    this.showIssue.set(true);
  }

  protected issue(): void {
    if (this.issueForm.invalid || this.issuing()) {
      this.issueForm.markAllAsTouched();
      return;
    }
    const { accountId, nickname } = this.issueForm.getRawValue();
    this.issuing.set(true);
    this.issueError.set(null);
    this.api.issue({ accountId, nickname: nickname.trim() === '' ? null : nickname.trim() }).subscribe({
      next: (issued) => {
        this.issuing.set(false);
        this.showIssue.set(false);
        this.revealed.set(issued);
        this.cards.update((list) => [issued.card, ...(list ?? [])]);
      },
      error: (err: unknown) => {
        this.issuing.set(false);
        this.issueError.set(this.issueMessage(err));
      },
    });
  }

  /** After this the number and PIN cannot be shown again, by anyone. */
  protected dismissReveal(): void {
    this.revealed.set(null);
    this.copied.set(null);
  }

  /** "9999000000000012" -> "9999 0000 0000 0012" */
  protected formatPan(pan: string): string {
    return pan.replace(/(.{4})/g, '$1 ').trim();
  }

  protected async copy(text: string, key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(key);
      setTimeout(() => this.copied.set(null), 1500);
    } catch {
      // clipboard blocked: the value is still on screen
    }
  }

  private issueMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const problem = err.error as ApiProblem | null;
      switch (problem?.code) {
        case 'CARD_LIMIT_REACHED':
          return problem.detail ?? 'You have reached the card limit. Cancel a card to get a new one.';
        case 'CARD_ACCOUNT_NOT_ELIGIBLE':
          return 'A card can only be linked to one of your active checking accounts.';
        case 'ACCOUNT_NOT_FOUND':
          return 'That account was not found.';
      }
      if (err.status >= 400 && err.status < 500) {
        return 'The card could not be issued. Please check the details and try again.';
      }
    }
    return 'We could not issue the card. Please try again.';
  }

  // ---- managing a card ----------------------------------------------------------------------------------------

  protected freeze(card: Card): void {
    this.act(card, this.api.freeze(card.id), `Card ending ${card.last4} is frozen. Payments will be refused until you unfreeze it.`);
  }

  protected unfreeze(card: Card): void {
    this.act(card, this.api.unfreeze(card.id), `Card ending ${card.last4} is active again.`);
  }

  private act(card: Card, request: ReturnType<CardsService['freeze']>, message: string): void {
    this.busyId.set(card.id);
    this.error.set(null);
    this.notice.set(null);
    request.subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.replace(updated);
        this.notice.set(message);
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.error.set(this.actionMessage(err));
      },
    });
  }

  protected askCancel(card: Card): void {
    this.confirmingCancel.set(card.id);
  }

  protected cancel(card: Card): void {
    this.busyId.set(card.id);
    this.error.set(null);
    this.api.cancel(card.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.confirmingCancel.set(null);
        this.cards.update((list) => (list ?? []).filter((c) => c.id !== card.id));
        this.notice.set(`Card ending ${card.last4} was cancelled for good.`);
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.confirmingCancel.set(null);
        this.error.set(this.actionMessage(err));
      },
    });
  }

  protected startLimit(card: Card): void {
    this.limitControl.reset(card.dailyLimit);
    this.editingLimitId.set(card.id);
  }

  protected saveLimit(card: Card): void {
    if (this.limitControl.invalid) {
      this.limitControl.markAsTouched();
      return;
    }
    this.busyId.set(card.id);
    this.api.changeLimit(card.id, this.limitControl.value.trim()).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.editingLimitId.set(null);
        this.replace(updated);
        this.notice.set(`The daily limit of the card ending ${card.last4} is now ${updated.dailyLimit} USD.`);
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.error.set(this.actionMessage(err));
      },
    });
  }

  private replace(updated: Card): void {
    this.cards.update((list) => (list ?? []).map((c) => (c.id === updated.id ? updated : c)));
  }

  private actionMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const problem = err.error as ApiProblem | null;
      if (problem?.code === 'CARD_INVALID_STATE') {
        return problem.detail ?? 'That is not possible for this card right now.';
      }
      if (err.status === 404) {
        this.load(); // the card is gone (cancelled elsewhere): show what is really there
        return 'That card no longer exists.';
      }
      if (err.status === 400) {
        return problem?.detail ?? 'That value is not allowed.';
      }
    }
    return 'Something went wrong. Please try again.';
  }

  // ---- activity ---------------------------------------------------------------------------------------------

  protected toggleActivity(card: Card): void {
    const nowOpen = !this.open()[card.id];
    this.open.update((current) => ({ ...current, [card.id]: nowOpen }));
    if (nowOpen) {
      this.loadActivity(card, 0);
    }
  }

  protected loadActivity(card: Card, page: number): void {
    this.activity.update((current) => ({ ...current, [card.id]: { status: 'loading' } }));
    this.api.pending(card.id).subscribe({
      next: (pending) =>
        this.api.activity(card.id, page, ACTIVITY_PAGE).subscribe({
          next: (recent) =>
            this.activity.update((current) => ({
              ...current,
              [card.id]: { status: 'ready', pending: pending.items, recent: recent.items, page, total: recent.totalElements },
            })),
          error: () => this.activity.update((current) => ({ ...current, [card.id]: { status: 'error' } })),
        }),
      error: () => this.activity.update((current) => ({ ...current, [card.id]: { status: 'error' } })),
    });
  }

  protected pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / ACTIVITY_PAGE));
  }

  protected statusLabel(status: AuthorizationStatus): string {
    return STATUS_LABELS[status];
  }

  /** The cleared (posted) payments among the shown ones, newest first. */
  protected posted(items: CardAuthorization[]): CardAuthorization[] {
    return items.filter((a) => a.status === 'CAPTURED');
  }

  // ---- disputes ----------------------------------------------------------------------------------------------

  /** The dispute of a posted payment, if it has one (a payment can be disputed once). */
  protected disputeFor(a: CardAuthorization): Dispute | undefined {
    return this.disputes().find((d) => d.authorizationId === a.id);
  }

  protected startDispute(a: CardAuthorization): void {
    this.disputeError.set(null);
    this.disputeForm.reset({ reason: '', amount: '', note: '' });
    this.disputing.set(a.id);
  }

  protected cancelDispute(): void {
    this.disputing.set(null);
    this.disputeError.set(null);
  }

  protected submitDispute(a: CardAuthorization): void {
    if (this.disputeForm.invalid || this.disputeBusy()) {
      this.disputeForm.markAllAsTouched();
      return;
    }
    const { reason, amount, note } = this.disputeForm.getRawValue();
    const posted = a.capturedAmount ?? a.amount;
    if (amount.trim() !== '' && Number(amount) > Number(posted)) {
      this.disputeError.set(`The amount can be at most ${posted}, the amount of the payment.`);
      return;
    }
    this.disputeBusy.set(true);
    this.disputeError.set(null);
    this.api
      .fileDispute(a.id, { reason: reason as DisputeReason, note: note.trim() === '' ? null : note.trim(), amount: amount.trim() === '' ? null : amount.trim() })
      .subscribe({
        next: (d) => {
          this.disputeBusy.set(false);
          this.disputing.set(null);
          this.disputes.update((list) => [d, ...list]);
          this.notice.set(`Dispute filed. ${d.amount} USD was credited to your account for now while the card network looks into it.`);
          this.api.list().subscribe({ next: (list) => this.cards.set(list), error: () => undefined }); // the balance changed
        },
        error: (err: unknown) => {
          this.disputeBusy.set(false);
          this.disputeError.set(this.disputeMessage(err));
        },
      });
  }

  private disputeMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const problem = err.error as ApiProblem | null;
      if (err.status === 404) {
        return 'That payment was not found.';
      }
      if (err.status === 422) {
        return problem?.detail ?? 'This payment cannot be disputed.';
      }
      if (err.status === 400) {
        return 'Please check the details and try again.';
      }
    }
    return 'We could not file the dispute. Please try again.';
  }

  /** What a dispute's state means for the customer, in words. */
  protected disputeText(d: Dispute): string {
    switch (d.status) {
      case 'FILED':
        return 'Sent to the card network, waiting for its answer';
      case 'OPEN':
        return 'Under review: the shop can still answer';
      case 'WON':
        return 'Won: the credit is final';
      default:
        return 'Lost: the credit was taken back';
    }
  }

  protected reasonLabel(reason: DisputeReason): string {
    return DISPUTE_REASONS.find((r) => r.value === reason)?.label ?? reason;
  }

  /** True when what was posted differs from what was authorized (a tip, or an amount the shop changed). */
  protected changed(a: CardAuthorization): boolean {
    return a.capturedAmount !== null && Number(a.capturedAmount) !== Number(a.amount);
  }

  protected number(value: string): number {
    return Number(value);
  }

  /** Why the card is frozen, in the customer's words. */
  protected freezeText(card: Card): string {
    switch (card.freezeReason) {
      case 'PIN_TRIES':
        return 'Frozen after too many wrong PINs';
      case 'ADMIN':
        return 'Frozen by the bank';
      default:
        return 'Frozen by you';
    }
  }

  /** Only the bank can lift its own freeze. */
  protected canUnfreeze(card: Card): boolean {
    return card.freezeReason !== 'ADMIN';
  }
}
