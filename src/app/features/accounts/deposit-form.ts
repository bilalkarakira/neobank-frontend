import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ApiProblem } from '../../core/auth/auth.models';
import { newIdempotencyKey } from '../../core/idempotency-key';
import { Account, DepositResponse } from './accounts.models';
import { AccountsService } from './accounts.service';

const MIN = 0.01;
const MAX = 10000;

/** Mirrors the server: positive, at most 2 decimals, at most 10,000.00. Range is checked on the text only. */
function amountValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  if (value === '') {
    return null; // "required" reports this
  }
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value)) {
    return { format: true };
  }
  const number = Number(value);
  return number < MIN || number > MAX ? { range: true } : null;
}

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

  /**
   * One key per attempt. If a request fails in a way that leaves the outcome unknown (network error, 5xx) the SAME
   * key is reused for the retry, so the server cannot credit twice. A different amount is a different attempt.
   */
  private attempt: { key: string; amount: string } | null = null;

  protected pick(amount: string): void {
    this.form.controls.amount.setValue(amount);
    this.form.controls.amount.markAsTouched();
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const amount = this.normalize(this.form.controls.amount.value);
    if (this.attempt?.amount !== amount) {
      this.attempt = { key: newIdempotencyKey(), amount };
    }

    this.submitting.set(true);
    this.error.set(null);
    this.accounts.deposit(this.account().id, { amount }, this.attempt.key).subscribe({
      next: (response) => {
        this.submitting.set(false);
        this.attempt = null;
        this.deposited.emit(response);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        const definitive = err instanceof HttpErrorResponse && err.status >= 400 && err.status < 500;
        if (definitive) {
          this.attempt = null; // the server decided: the next try is a new attempt
        }
        this.error.set(this.messageFor(err));
      },
    });
  }

  /** "50" -> "50.00", "7.5" -> "7.50": the wire format is always two decimals. */
  private normalize(text: string): string {
    const [whole, fraction = ''] = text.trim().split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
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
