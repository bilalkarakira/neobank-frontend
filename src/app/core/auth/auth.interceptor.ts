import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { isRateLimited } from '../rate-limit';
import { AuthService } from './auth.service';

/** These never carry the bearer token, and a 401 from them is not "the session expired". */
const PUBLIC_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout'];

/**
 * Adds the bearer token to API calls. When the short-lived access token has expired (401), it is renewed silently
 * through the refresh cookie and the call is repeated once; only when that fails is the session really over.
 * The repeat is sent with `next`, which does not pass through this interceptor again, so it cannot loop.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = req.url.startsWith('/api/');
  const isPublic = PUBLIC_ENDPOINTS.some((url) => req.url.startsWith(url));
  if (!isApi || isPublic) {
    return next(req);
  }

  const withToken = (request: typeof req, token: string | null) =>
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  const endSession = () => {
    auth.logout();
    void router.navigate(['/login'], { queryParams: { expired: 1 } });
  };

  return next(withToken(req, auth.token)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      if (auth.token === null) {
        endSession(); // there was no session to renew
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        catchError((refreshError: unknown) => {
          // a rate-limited refresh says nothing about the session: do not log the user out for it
          if (!isRateLimited(refreshError)) {
            endSession();
          }
          return throwError(() => error);
        }),
        switchMap((token) =>
          next(withToken(req, token)).pipe(
            catchError((retryError: unknown) => {
              if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
                endSession();
              }
              return throwError(() => retryError);
            }),
          ),
        ),
      );
    }),
  );
};
