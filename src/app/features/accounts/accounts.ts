import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Account } from './accounts.models';
import { AccountsService } from './accounts.service';
import { formatIban } from './iban';
import { OpenAccountForm } from './open-account-form';

@Component({
  selector: 'app-accounts',
  imports: [CurrencyPipe, OpenAccountForm],
  templateUrl: './accounts.html',
})
export class Accounts {
  private readonly service = inject(AccountsService);

  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly showForm = signal(false);
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

  protected title(account: Account): string {
    return account.nickname ?? (account.type === 'CHECKING' ? 'Checking account' : 'Savings account');
  }

  /** The balance string is only ever displayed here, never used for arithmetic. */
  protected amount(account: Account): number {
    return Number(account.balance);
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
