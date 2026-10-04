import { Injectable } from '@angular/core';

const KEY = 'neobank.hasSession';
/** The access token used to live here; it must not stay behind in browsers that ran an older version. */
const LEGACY_TOKEN_KEY = 'neobank.accessToken';

/**
 * A NON-secret flag that says "this browser probably has a refresh cookie". It exists only so a guest's page load does
 * not fire a pointless refresh request (and log a 401). The access token itself is kept in memory only, and the
 * refresh token is an httpOnly cookie that scripts cannot read: neither is ever stored here.
 */
@Injectable({ providedIn: 'root' })
export class SessionHint {
  get(): boolean {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  }

  set(): void {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // storage unavailable: the session just won't be restored after a reload
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nothing to clear
    }
  }

  removeLegacyToken(): void {
    try {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      // nothing to remove
    }
  }
}
