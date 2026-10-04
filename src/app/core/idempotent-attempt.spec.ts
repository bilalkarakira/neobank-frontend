import { HttpErrorResponse } from '@angular/common/http';
import { IdempotentAttempt } from './idempotent-attempt';

const http = (status: number) => new HttpErrorResponse({ status });

describe('IdempotentAttempt', () => {
  it('returns the same key for the same request', () => {
    const attempt = new IdempotentAttempt();
    expect(attempt.keyFor('a')).toBe(attempt.keyFor('a'));
  });

  it('returns a new key when the request changes', () => {
    const attempt = new IdempotentAttempt();
    expect(attempt.keyFor('a')).not.toBe(attempt.keyFor('b'));
  });

  it('keeps the key after network errors and server errors, because the outcome is unknown', () => {
    const attempt = new IdempotentAttempt();
    const key = attempt.keyFor('a');

    attempt.failed(new ProgressEvent('error'));
    expect(attempt.keyFor('a')).toBe(key);
    attempt.failed(http(0));
    expect(attempt.keyFor('a')).toBe(key);
    attempt.failed(http(503));
    expect(attempt.keyFor('a')).toBe(key);
  });

  it('starts a new attempt after the server definitively rejected the request', () => {
    const attempt = new IdempotentAttempt();
    const key = attempt.keyFor('a');

    attempt.failed(http(422));

    expect(attempt.keyFor('a')).not.toBe(key);
  });

  it('starts a new attempt after success', () => {
    const attempt = new IdempotentAttempt();
    const key = attempt.keyFor('a');

    attempt.succeeded();

    expect(attempt.keyFor('a')).not.toBe(key);
  });
});
