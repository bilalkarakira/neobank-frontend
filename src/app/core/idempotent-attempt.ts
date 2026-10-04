import { HttpErrorResponse } from '@angular/common/http';
import { newIdempotencyKey } from './idempotency-key';

/**
 * One Idempotency-Key per attempt at changing money.
 *
 * If a request fails in a way that leaves the outcome unknown (network error, 5xx) the SAME key is reused for the
 * retry, so the server cannot apply it twice. A different request (different fingerprint) is a new attempt, and so
 * is a retry after the server definitively rejected the previous one (4xx).
 */
export class IdempotentAttempt {
  private current: { key: string; fingerprint: string } | null = null;

  keyFor(fingerprint: string): string {
    if (this.current?.fingerprint !== fingerprint) {
      this.current = { key: newIdempotencyKey(), fingerprint };
    }
    return this.current.key;
  }

  /** Call after the request succeeded. */
  succeeded(): void {
    this.current = null;
  }

  /** Call after the request failed; keeps the key only when the outcome is unknown. */
  failed(error: unknown): void {
    const definitive = error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500;
    if (definitive) {
      this.current = null;
    }
  }
}
