import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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

  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly showForm = signal(false);
  protected readonly depositingId = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly copiedId = signal<string | null>(null);

  protected readonly formatIban = formatIban;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.service.list().subscribe({
      next: (list) => this.accounts.set(list),
      error: () => this.loadFailed.set(true),
    });
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
