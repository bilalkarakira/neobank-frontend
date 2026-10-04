import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, switchMap, tap } from 'rxjs';
import { LoginRequest, RegisterRequest, TokenResponse, User } from './auth.models';
import { TokenStorage } from './token-storage';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(TokenStorage);

  private readonly tokenSignal = signal<string | null>(this.storage.get());
  private readonly userSignal = signal<User | null>(null);

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => this.tokenSignal() !== null);
  /** UX only (menu link, route guard): the server enforces the role on every /api/admin request. */
  readonly isAdmin = computed(() => this.userSignal()?.role === 'ADMIN');

  get token(): string | null {
    return this.tokenSignal();
  }

  register(request: RegisterRequest): Observable<User> {
    return this.http.post<User>('/api/auth/register', request);
  }

  login(request: LoginRequest): Observable<User> {
    return this.http.post<TokenResponse>('/api/auth/login', request).pipe(
      tap((response) => {
        this.storage.set(response.accessToken);
        this.tokenSignal.set(response.accessToken);
      }),
      switchMap(() => this.loadUser()),
    );
  }

  loadUser(): Observable<User> {
    return this.http.get<User>('/api/me').pipe(tap((user) => this.userSignal.set(user)));
  }

  /** Called once at startup: if a token is stored, restore the user; a bad token is cleared by the interceptor. */
  restoreSession(): Observable<unknown> {
    if (!this.isLoggedIn()) {
      return of(null);
    }
    return this.loadUser().pipe(catchError(() => of(null)));
  }

  logout(): void {
    this.storage.clear();
    this.tokenSignal.set(null);
    this.userSignal.set(null);
  }
}
