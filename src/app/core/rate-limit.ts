import { HttpErrorResponse } from '@angular/common/http';

/** True for the server's "too many attempts" answer (HTTP 429). */
export function isRateLimited(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 429;
}

/**
 * How long the server asks us to wait, in seconds: the Retry-After header, or the same number from the problem body
 * when a proxy or CORS setup hides the header. Null when neither is usable.
 */
export function retryAfterSeconds(err: unknown): number | null {
  if (!(err instanceof HttpErrorResponse)) {
    return null;
  }
  const fromHeader = Number(err.headers?.get('Retry-After'));
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return fromHeader;
  }
  const fromBody = Number((err.error as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds);
  return Number.isFinite(fromBody) && fromBody > 0 ? fromBody : null;
}

/** "40 seconds", "15 minutes", "2 hours": rounded UP, so the user never retries a moment too early. */
export function waitText(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (seconds < 60) {
    return plural(Math.max(1, Math.ceil(seconds)), 'second');
  }
  if (seconds < 3600) {
    return plural(Math.ceil(seconds / 60), 'minute');
  }
  return plural(Math.ceil(seconds / 3600), 'hour');
}

/** The message for a 429, with the wait when the server told us. */
export function tooManyMessage(err: unknown): string {
  const seconds = retryAfterSeconds(err);
  return seconds === null
    ? 'Too many attempts. Please wait a little and try again.'
    : `Too many attempts. Please try again in about ${waitText(seconds)}.`;
}
