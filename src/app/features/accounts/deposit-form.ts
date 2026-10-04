import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { amountValidator, normalizeAmount } from '../../core/amount';
import { ApiProblem } from '../../core/auth/auth.models';
import { IdempotentAttempt } from '../../core/idempotent-attempt';
import { Account, DepositResponse } from './accounts.models';
import { AccountsService } from './accounts.service';

@Component({
  selector: 'app-deposit-form',
  imports: [ReactiveFormsModule],
  templateUrl: './deposit-form.html',
})
export class DepositForm {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly accounts = inject(AccountsService);

  readonly account = input.required<Account>();
  readonly deposited = output<DepositResponse>();
  readonly cancelled = output<void>();

  protected readonly quickAmounts = ['50', '100', '500'];

  protected readonly form = this.fb.group({
    amount: ['', [Validators.required, amountValidator]],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly attempt = new IdempotentAttempt();

  protected pick(amount: string): void {
    this.form.controls.amount.setValue(amount);
    this.form.controls.amount.markAsTouched();
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const amount = normalizeAmount(this.form.controls.amount.value);
    const key = this.attempt.keyFor(amount);

    this.submitting.set(true);
    this.error.set(null);
    this.accounts.deposit(this.account().id, { amount }, key).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.attempt.succeeded();
        this.deposited.emit(response);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.attempt.failed(err);
        this.error.set(this.messageFor(err));
      },
    });
  }

  private messageFor(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const problem = err.error as ApiProblem | null;
      if (err.status === 422 && problem?.code === 'ACCOUNT_NOT_ACTIVE') {
        return 'This account is not active, so it cannot receive deposits.';
      }
      if (err.status === 400 && problem?.fields?.['amount']) {
        return `Amount ${problem.fields['amount']}.`;
      }
      if (err.status >= 400 && err.status < 500) {
        return 'The deposit was rejected. Please check the amount and try again.';
      }
    }
    return 'We could not confirm the deposit. Press the button again to retry safely: it will not be counted twice.';
  }
}
