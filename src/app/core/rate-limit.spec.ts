import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { isRateLimited, retryAfterSeconds, tooManyMessage, waitText } from './rate-limit';

const tooMany = (retryAfter: string | null, body: unknown = null, status = 429) =>
  new HttpErrorResponse({
    status,
    error: body,
    headers: retryAfter === null ? new HttpHeaders() : new HttpHeaders({ 'Retry-After': retryAfter }),
  });

describe('rate-limit helpers', () => {
  it('recognises only a 429 response', () => {
    expect(isRateLimited(tooMany('60'))).toBe(true);
    expect(isRateLimited(tooMany('60', null, 401))).toBe(false);
    expect(isRateLimited(new Error('network'))).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });

  it('reads Retry-After, and falls back to the number in the problem body', () => {
    expect(retryAfterSeconds(tooMany('900'))).toBe(900);
    expect(retryAfterSeconds(tooMany(null, { retryAfterSeconds: 40 }))).toBe(40);
    expect(retryAfterSeconds(tooMany('900', { retryAfterSeconds: 40 }))).toBe(900); // the header wins
  });

  it('ignores values it cannot use', () => {
    expect(retryAfterSeconds(tooMany('soon'))).toBeNull();
    expect(retryAfterSeconds(tooMany('0'))).toBeNull();
    expect(retryAfterSeconds(tooMany('-5'))).toBeNull();
    expect(retryAfterSeconds(tooMany(null))).toBeNull();
    expect(retryAfterSeconds('not an error')).toBeNull();
  });

  it('rounds the wait UP into the friendliest unit', () => {
    expect(waitText(1)).toBe('1 second');
    expect(waitText(40)).toBe('40 seconds');
    expect(waitText(59.2)).toBe('60 seconds');
    expect(waitText(60)).toBe('1 minute');
    expect(waitText(61)).toBe('2 minutes'); // never tell someone to retry too early
    expect(waitText(900)).toBe('15 minutes');
    expect(waitText(3599)).toBe('60 minutes');
    expect(waitText(3600)).toBe('1 hour');
    expect(waitText(7200)).toBe('2 hours');
  });

  it('builds the user-facing message with or without a known wait', () => {
    expect(tooManyMessage(tooMany('900'))).toBe('Too many attempts. Please try again in about 15 minutes.');
    expect(tooManyMessage(tooMany(null))).toBe('Too many attempts. Please wait a little and try again.');
  });
});
