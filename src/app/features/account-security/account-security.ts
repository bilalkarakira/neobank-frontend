import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiProblem } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { isRateLimited, tooManyMessage } from '../../core/rate-limit';
import { Session } from './account-security.models';
import { AccountSecurityService } from './account-security.service';

/** The new password and its repetition must be identical (UX only: the server never sees the repetition). */
function matchesNewPassword(control: AbstractControl): ValidationErrors | null {
  const group = control.parent;
  return group && control.value !== group.get('newPassword')?.value ? { mismatch: true } : null;
}

@Component({
  selector: 'app-account-security',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './account-security.html',
})
export class AccountSecurity {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AccountSecurityService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly sessions = signal<Session[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** The session (or "others") that is waiting for a second click. */
  protected readonly confirming = signal<string | 'others' | null>(null);

  protected readonly otherCount = computed(() => (this.sessions() ?? []).filter((s) => !s.current).length);

  protected readonly form = this.fb.group({
    currentPassword: ['', [Validators.required, Validators.maxLength(72)]],
    // the same rules as registration
    newPassword: [
      '',
      [Validators.required, Validators.minLength(10), Validators.maxLength(72), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).*$/)],
    ],
    confirmPassword: ['', [Validators.required, matchesNewPassword]],
  });
  protected readonly changing = signal(false);
  protected readonly formError = signal<string | null>(null);

  constructor() {
    this.load();
    // the repetition has to be re-checked when the new password changes
    this.form.controls.newPassword.valueChanges.subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.api.sessions().subscribe({
      next: (list) => this.sessions.set(list),
      error: () => this.loadFailed.set(true),
    });
  }

  protected ask(target: string): void {
    this.error.set(null);
    this.confirming.set(target);
  }

  protected cancelAsk(): void {
    this.confirming.set(null);
  }

  protected revoke(session: Session): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.revoke(session.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirming.set(null);
        if (session.current) {
          // ending this device's own login is a logout: forget everything here too
          this.auth.logout();
          void this.router.navigate(['/login']);
          return;
        }
        this.notice.set(`${session.device} was logged out.`);
        this.load();
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected revokeOthers(): void {
    this.busy.set(true);
    this.error.set(null);
    this.api.revokeOthers().subscribe({
      next: () => {
        this.busy.set(false);
        this.confirming.set(null);
        this.notice.set('All your other devices were logged out.');
        this.load();
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.changing()) {
      return;
    }
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.changing.set(true);
    this.formError.set(null);
    this.notice.set(null);
    this.api.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => {
        this.changing.set(false);
        this.form.reset();
        this.notice.set('Your password was changed. Every other device was logged out.');
        this.load(); // the list now shows only this device
      },
      error: (err: unknown) => {
        this.changing.set(false);
        this.applyPasswordError(err);
      },
    });
  }

  protected serverMessage(control: AbstractControl): string | null {
    return (control.errors?.['server'] as string | undefined) ?? null;
  }

  protected showError(control: AbstractControl): boolean {
    return control.touched && control.invalid;
  }

  private applyPasswordError(err: unknown): void {
    if (isRateLimited(err)) {
      this.formError.set(tooManyMessage(err));
      return;
    }
    if (err instanceof HttpErrorResponse) {
      const problem = err.error as ApiProblem | null;
      if (problem?.code === 'WRONG_CURRENT_PASSWORD') {
        this.form.controls.currentPassword.setErrors({ server: 'This is not your current password.' });
        this.form.controls.currentPassword.markAsTouched();
        return;
      }
      if (problem?.code === 'SAME_PASSWORD') {
        this.form.controls.newPassword.setErrors({ server: 'Choose a password you have not just used.' });
        this.form.controls.newPassword.markAsTouched();
        return;
      }
      if (err.status === 400 && problem?.fields) {
        for (const [field, message] of Object.entries(problem.fields)) {
          const control = this.form.get(field);
          if (control) {
            control.setErrors({ server: message });
            control.markAsTouched();
          } else {
            this.formError.set(message);
          }
        }
        return;
      }
    }
    this.formError.set('Something went wrong. Please try again.');
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    this.confirming.set(null);
    this.error.set(isRateLimited(err) ? tooManyMessage(err) : 'Something went wrong. Please try again.');
    this.load(); // it may already have ended: show the truth
  }
}
