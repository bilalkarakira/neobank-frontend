import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardsService } from '../cards/cards.service';
import { accountTitle } from './account-title';
import { Account, DepositResponse } from './accounts.models';
import { AccountsService } from './accounts.service';
import { DepositForm } from './deposit-form';
import { formatIban } from './iban';
import { OpenAccountForm } from './open-account-form';

@Component({
  selector: 'app-accounts',
  imports: [CurrencyPipe, OpenAccountForm, DepositForm, RouterLink],
  templateUrl: './accounts.html',
})
export class Accounts {
  private readonly service = inject(AccountsService);
  private readonly cards = inject(CardsService);

  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly showForm = signal(false);
  protected readonly depositingId = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly copiedId = signal<string | null>(null);
  /** Interest earned this year per savings account id; filled in after the list loads. */
  protected readonly earned = signal<Record<string, string>>({});

  /** What the customer owes the bank after a cleared card payment their account could not cover (a nicety: absent if it cannot load). */
  protected readonly owedToBank = signal<string>('0.00');

  protected readonly formatIban = formatIban;

  /** Sum of the open and frozen balances (closed accounts are empty by rule). Every account is in USD. */
  protected readonly total = computed(() => (this.accounts() ?? []).reduce((sum, a) => sum + Number(a.balance), 0));

  constructor() {
    this.load();
    this.cards.owed().subscribe({ next: (o) => this.owedToBank.set(o.total), error: () => undefined });
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.service.list().subscribe({
      next: (list) => {
        this.accounts.set(list);
        this.loadInterest(list);
      },
      error: () => this.loadFailed.set(true),
    });
  }

  /** The interest line is a nicety: if it cannot be loaded the card simply shows no interest line. */
  private loadInterest(list: Account[]): void {
    for (const account of list.filter((a) => a.type === 'SAVINGS')) {
      this.service.interest(account.id).subscribe({
        next: (summary) => this.earned.update((current) => ({ ...current, [account.id]: summary.earnedThisYear })),
        error: () => undefined,
      });
    }
  }

  /** "3.50" -> "3.5" */
  protected rate(account: Account): string {
    return String(Number(account.interestRate));
  }

  /** True when pending card payments reserve part of the balance. */
  protected hasHolds(account: Account): boolean {
    return Number(account.heldAmount) > 0;
  }

  /** True when a cleared card payment left the customer owing the bank money. */
  protected owes(): boolean {
    return Number(this.owedToBank()) > 0;
  }

  protected amountOf(value: string): number {
    return Number(value);
  }

  protected onOpened(account: Account): void {
    this.accounts.update((list) => [account, ...(list ?? [])]);
    this.showForm.set(false);
  }

  protected onDeposited(account: Account, response: DepositResponse): void {
    // the server's balance is authoritative: show exactly what it reports
    this.accounts.update((list) =>
      (list ?? []).map((a) => (a.id === response.accountId ? { ...a, balance: response.balance } : a)),
    );
    this.depositingId.set(null);
    this.notice.set(`Deposited ${this.money(response.amount, account.currency)} into ${this.title(account)}.`);
    setTimeout(() => this.notice.set(null), 5000);
  }

  protected readonly title = accountTitle;

  /** The balance string is only ever displayed here, never used for arithmetic. */
  protected amount(account: Account): number {
    return Number(account.balance);
  }

  private money(value: string, currency: string): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
  }

  protected async copy(account: Account): Promise<void> {
    try {
      await navigator.clipboard.writeText(account.iban);
      this.copiedId.set(account.id);
      setTimeout(() => this.copiedId.set(null), 1500);
    } catch {
      // clipboard blocked: nothing useful to do, the IBAN is still on screen
    }
  }
}
