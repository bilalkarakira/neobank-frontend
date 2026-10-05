import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { isRateLimited, tooManyMessage } from '../../../core/rate-limit';
import { Logo } from '../../../core/logo';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Logo],
  templateUrl: './login.html',
})
export class Login {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly params = this.route.snapshot.queryParamMap;
  protected readonly justRegistered = this.params.get('registered') === '1';
  protected readonly sessionExpired = this.params.get('expired') === '1';

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigate(['/dashboard']),
      error: (err: unknown) => {
        this.submitting.set(false);
        const unauthorized = err instanceof HttpErrorResponse && err.status === 401;
        if (isRateLimited(err)) {
          this.error.set(tooManyMessage(err));
        } else {
          this.error.set(unauthorized ? 'Invalid email or password.' : 'Something went wrong. Please try again.');
        }
      },
    });
  }
}
