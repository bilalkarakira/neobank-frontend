import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiProblem } from '../../core/auth/auth.models';
import { Account, AccountType } from './accounts.models';
import { AccountsService } from './accounts.service';

@Component({
  selector: 'app-open-account-form',
  imports: [ReactiveFormsModule],
  templateUrl: './open-account-form.html',
})
export class OpenAccountForm {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly accounts = inject(AccountsService);

  readonly opened = output<Account>();
  readonly cancelled = output<void>();

  protected readonly types: { value: AccountType; label: string; hint: string }[] = [
    { value: 'CHECKING', label: 'Checking', hint: 'Everyday spending' },
    { value: 'SAVINGS', label: 'Savings', hint: 'Earns interest' },
  ];

  protected readonly form = this.fb.group({
    type: this.fb.control<AccountType>('CHECKING', Validators.required),
    nickname: ['', Validators.maxLength(40)],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const { type, nickname } = this.form.getRawValue();

    this.accounts.open({ type, nickname: nickname.trim() || null }).subscribe({
      next: (account) => {
        this.submitting.set(false);
        this.form.controls.nickname.reset('');
        this.opened.emit(account);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        const problem = err instanceof HttpErrorResponse ? (err.error as ApiProblem | null) : null;
        // the limit rule's message is written for customers, so it is shown as-is
        this.error.set(
          err instanceof HttpErrorResponse && err.status === 422 && problem?.detail
            ? problem.detail
            : 'Could not open the account. Please try again.',
        );
      },
    });
  }
}
