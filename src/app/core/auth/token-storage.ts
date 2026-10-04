import { Injectable } from '@angular/core';

const KEY = 'neobank.accessToken';

/**
 * Single place that knows where the access token lives.
 * localStorage is a known XSS trade-off; F2b (refresh tokens) moves this to an httpOnly cookie flow.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  set(token: string): void {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // storage unavailable (private mode, blocked): the session just won't survive a reload
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nothing to clear
    }
  }
}
