import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError, timer } from 'rxjs';
import { LoginRequest, RegisterRequest, TokenResponse, User } from './auth.models';
import { SessionHint } from './session-hint';

/** Sent on the cookie-authenticated endpoints: a cross-site form or image cannot add a custom header. */
const CSRF_HEADERS = { 'X-Requested-With': 'neobank' };

/**
 * When two tabs refresh at once, one of them loses the race and is told 401 even though the login is fine: the
 * winner's new cookie is in the shared cookie jar a moment later. One delayed retry picks it up.
 */
export const REFRESH_RACE_RETRY_MS = 1500;

/**
 * The access token lives in memory only (gone on reload, unreachable for other tabs and for storage-stealing code).
 * A reload brings the session back through the httpOnly refresh cookie, which scripts cannot read at all.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly hint = inject(SessionHint);

  private readonly tokenSignal = signal<string | null>(null);
  private readonly userSignal = signal<User | null>(null);
  private refreshInFlight: Observable<string> | null = null;

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => this.tokenSignal() !== null);
  /** UX only (menu link, route guard): the server enforces the role on every /api/admin request. */
  readonly isAdmin = computed(() => this.userSignal()?.role === 'ADMIN');

  constructor() {
    this.hint.removeLegacyToken();
  }

  get token(): string | null {
    return this.tokenSignal();
  }

  register(request: RegisterRequest): Observable<User> {
    return this.http.post<User>('/api/auth/register', request);
  }

  login(request: LoginRequest): Observable<User> {
    return this.http.post<TokenResponse>('/api/auth/login', request, { withCredentials: true }).pipe(
      tap((response) => {
        this.tokenSignal.set(response.accessToken);
        this.hint.set();
      }),
      switchMap(() => this.loadUser()),
    );
  }

  loadUser(): Observable<User> {
    return this.http.get<User>('/api/me').pipe(tap((user) => this.userSignal.set(user)));
  }

  /**
   * Trades the refresh cookie for a new access token. Calls made while one is already running share its result,
   * which matters because the cookie rotates: a second parallel request would present the already-used token.
   */
  refresh(): Observable<string> {
    if (this.refreshInFlight === null) {
      this.refreshInFlight = this.requestRefresh().pipe(
        finalize(() => (this.refreshInFlight = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshInFlight;
  }

  private requestRefresh(): Observable<string> {
    const call = () =>
      this.http.post<TokenResponse>('/api/auth/refresh', null, { headers: CSRF_HEADERS, withCredentials: true });
    return call().pipe(
      catchError((err: unknown) =>
        isUnauthorized(err) ? timer(REFRESH_RACE_RETRY_MS).pipe(switchMap(call)) : throwError(() => err),
      ),
      map((response) => response.accessToken),
      tap((token) => {
        this.tokenSignal.set(token);
        this.hint.set();
      }),
      catchError((err: unknown) => {
        this.tokenSignal.set(null);
        if (isUnauthorized(err)) {
          this.hint.clear(); // the server dropped the cookie: no point trying again on the next page load
        }
        return throwError(() => err);
      }),
    );
  }

  /** Called once at startup: if this browser had a session, bring it back silently. Failure means "logged out". */
  restoreSession(): Observable<unknown> {
    if (!this.hint.get()) {
      return of(null);
    }
    return this.refresh().pipe(
      switchMap(() => this.loadUser()),
      catchError(() => of(null)),
    );
  }

  /** Forgets the session here at once, and asks the server to end it (best effort: the user is out either way). */
  logout(): void {
    const hadSession = this.tokenSignal() !== null || this.hint.get();
    this.clearLocal();
    if (hadSession) {
      this.http
        .post('/api/auth/logout', null, { headers: CSRF_HEADERS, withCredentials: true })
        .subscribe({ error: () => undefined });
    }
  }

  /** Ends every login of this user on every device. Other devices notice at their next refresh (within 15 minutes). */
  logoutAll(): Observable<void> {
    return this.http.post<void>('/api/auth/logout-all', null, { withCredentials: true }).pipe(
      tap(() => this.clearLocal()),
      map(() => undefined),
    );
  }

  private clearLocal(): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    this.hint.clear();
  }
}

function isUnauthorized(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 401;
}
