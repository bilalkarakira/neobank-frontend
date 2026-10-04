import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiProblem } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
})
export class Register {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName: ['', [Validators.required, Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    // mirrors the backend rules: 10-72 chars, at least one letter and one digit
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(72),
        Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).*$/),
      ],
    ],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected showError(control: AbstractControl): boolean {
    return control.touched && control.invalid;
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigate(['/login'], { queryParams: { registered: 1 } }),
      error: (err: unknown) => {
        this.submitting.set(false);
        this.applyServerError(err);
      },
    });
  }

  /** Puts server-side problems on the matching field when we can, otherwise in a general banner. */
  private applyServerError(err: unknown): void {
    if (!(err instanceof HttpErrorResponse)) {
      this.error.set('Something went wrong. Please try again.');
      return;
    }
    const problem = err.error as ApiProblem | null;

    if (err.status === 409 && problem?.code === 'EMAIL_ALREADY_REGISTERED') {
      this.setServerError('email', 'This email is already registered.');
    } else if (err.status === 400 && problem?.fields) {
      for (const [field, message] of Object.entries(problem.fields)) {
        this.setServerError(field, message);
      }
    } else {
      this.error.set('Something went wrong. Please try again.');
    }
  }

  private setServerError(field: string, message: string): void {
    const control = this.form.get(field);
    if (control) {
      control.setErrors({ server: message });
      control.markAsTouched();
    } else {
      this.error.set(message);
    }
  }

  protected serverMessage(control: AbstractControl): string | null {
    return (control.errors?.['server'] as string | undefined) ?? null;
  }
}
