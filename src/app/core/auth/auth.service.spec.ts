import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { User } from './auth.models';
import { AuthService, REFRESH_RACE_RETRY_MS } from './auth.service';

const USER: User = {
  id: '1',
  firstName: 'Bilal',
  lastName: 'Karakira',
  email: 'bilal@example.com',
  role: 'CUSTOMER',
  createdAt: '2026-10-04T10:00:00Z',
};
const TOKEN = (accessToken: string) => ({ accessToken, tokenType: 'Bearer', expiresIn: 900 });
const HINT = 'neobank.hasSession';

describe('AuthService', () => {
  let http: HttpTestingController;

  function setup(): AuthService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  const logIn = (auth: AuthService, token = 'tok') => {
    auth.login({ email: 'bilal@example.com', password: 'S3curepass12' }).subscribe();
    http.expectOne('/api/auth/login').flush(TOKEN(token));
    http.expectOne('/api/me').flush(USER);
  };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    http.verify();
    localStorage.clear();
  });

  // ---- login ------------------------------------------------------------------------------------------------

  it('login keeps the access token in memory, loads the user and leaves no token in storage', () => {
    const auth = setup();
    let result: User | undefined;

    auth.login({ email: 'bilal@example.com', password: 'S3curepass12' }).subscribe((u) => (result = u));

    const login = http.expectOne('/api/auth/login');
    expect(login.request.withCredentials).toBe(true); // so the browser accepts the refresh cookie
    login.flush(TOKEN('secret-access-token'));
    http.expectOne('/api/me').flush(USER);

    expect(result).toEqual(USER);
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.token).toBe('secret-access-token');
    expect(auth.user()).toEqual(USER);
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret-access-token');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('secret-access-token');
    expect(localStorage.getItem(HINT)).toBe('1');
  });

  it('a rejected login leaves the user logged out', () => {
    const auth = setup();
    auth.login({ email: 'bilal@example.com', password: 'wrong' }).subscribe({ error: () => undefined });
    http.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(HINT)).toBeNull();
  });

  it('removes an access token that an older version left in localStorage', () => {
    localStorage.setItem('neobank.accessToken', 'leftover');
    const auth = setup();
    expect(auth.isLoggedIn()).toBe(false); // a stored token is no longer a session
    expect(localStorage.getItem('neobank.accessToken')).toBeNull();
  });

  it('register posts the form to the API', () => {
    const auth = setup();
    const body = { firstName: 'Bilal', lastName: 'Karakira', email: 'bilal@example.com', password: 'S3curepass12' };

    auth.register(body).subscribe();

    const req = http.expectOne('/api/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(USER);
  });

  // ---- refresh ----------------------------------------------------------------------------------------------

  it('refresh sends the cookie with the CSRF header and keeps the new token in memory', () => {
    const auth = setup();
    let token: string | undefined;

    auth.refresh().subscribe((t) => (token = t));

    const req = http.expectOne('/api/auth/refresh');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-Requested-With')).toBe('neobank');
    req.flush(TOKEN('fresh'));

    expect(token).toBe('fresh');
    expect(auth.token).toBe('fresh');
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('parallel refresh calls share one request, because the cookie can only be used once', () => {
    const auth = setup();
    const seen: string[] = [];

    auth.refresh().subscribe((t) => seen.push(t));
    auth.refresh().subscribe((t) => seen.push(t));
    auth.refresh().subscribe((t) => seen.push(t));
    http.expectOne('/api/auth/refresh').flush(TOKEN('shared'));

    expect(seen).toEqual(['shared', 'shared', 'shared']);

    // and the next refresh, later on, is a fresh request
    auth.refresh().subscribe();
    http.expectOne('/api/auth/refresh').flush(TOKEN('next'));
  });

  it('retries once after a 401, in case another tab just rotated the cookie', () => {
    const auth = setup();
    let token: string | undefined;
    auth.refresh().subscribe((t) => (token = t));

    http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectNone('/api/auth/refresh'); // not immediately: the other tab's cookie needs a moment
    vi.advanceTimersByTime(REFRESH_RACE_RETRY_MS);
    http.expectOne('/api/auth/refresh').flush(TOKEN('recovered'));

    expect(token).toBe('recovered');
    expect(auth.token).toBe('recovered');
  });

  it('gives up after the second 401: logged out, and no more attempts on later page loads', () => {
    const auth = setup();
    localStorage.setItem(HINT, '1');
    let failed = false;
    auth.refresh().subscribe({ error: () => (failed = true) });

    http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    vi.advanceTimersByTime(REFRESH_RACE_RETRY_MS);
    http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBe(true);
    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem(HINT)).toBeNull();
    vi.advanceTimersByTime(60_000);
    http.expectNone('/api/auth/refresh'); // exactly one retry, never a loop
  });

  it('does not retry a server error, and keeps the hint so a later page load can try again', () => {
    const auth = setup();
    localStorage.setItem(HINT, '1');
    let failed = false;
    auth.refresh().subscribe({ error: () => (failed = true) });

    http.expectOne('/api/auth/refresh').flush({}, { status: 500, statusText: 'Server Error' });
    vi.advanceTimersByTime(REFRESH_RACE_RETRY_MS * 2);

    expect(failed).toBe(true);
    http.expectNone('/api/auth/refresh');
    expect(localStorage.getItem(HINT)).toBe('1');
  });

  it('a rate-limited refresh is not a verdict on the session: nothing is cleared and nothing is retried', () => {
    const auth = setup();
    logIn(auth, 'still-here');
    let failed = false;

    auth.refresh().subscribe({ error: () => (failed = true) });
    http.expectOne('/api/auth/refresh').flush({ code: 'RATE_LIMITED' }, { status: 429, statusText: 'Too Many Requests' });
    vi.advanceTimersByTime(REFRESH_RACE_RETRY_MS * 2);

    expect(failed).toBe(true);
    http.expectNone('/api/auth/refresh'); // 429 is not the 401 that triggers the cookie-race retry
    expect(auth.token).toBe('still-here');
    expect(auth.isLoggedIn()).toBe(true);
    expect(localStorage.getItem(HINT)).toBe('1');
  });

  // ---- restoring a session ----------------------------------------------------------------------------------

  it('restoreSession does nothing for a guest: no request, no console noise', () => {
    const auth = setup();
    auth.restoreSession().subscribe();
    http.expectNone('/api/auth/refresh');
    http.expectNone('/api/me');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('restoreSession brings a returning visitor back through the refresh cookie', () => {
    localStorage.setItem(HINT, '1');
    const auth = setup();

    auth.restoreSession().subscribe();
    http.expectOne('/api/auth/refresh').flush(TOKEN('restored'));
    http.expectOne('/api/me').flush(USER);

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.token).toBe('restored');
    expect(auth.user()).toEqual(USER);
  });

  it('restoreSession resolves (never errors) when the session is gone, so the app still starts', () => {
    localStorage.setItem(HINT, '1');
    const auth = setup();
    let completed = false;

    auth.restoreSession().subscribe({ complete: () => (completed = true) });
    http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    vi.advanceTimersByTime(REFRESH_RACE_RETRY_MS);
    http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(completed).toBe(true);
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  // ---- logout -----------------------------------------------------------------------------------------------

  it('logout forgets the session at once and tells the server to end it', () => {
    const auth = setup();
    logIn(auth);

    auth.logout();

    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(localStorage.getItem(HINT)).toBeNull();
    const req = http.expectOne('/api/auth/logout');
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-Requested-With')).toBe('neobank');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('logout still logs the user out here when the server cannot be reached', () => {
    const auth = setup();
    logIn(auth);

    auth.logout();
    http.expectOne('/api/auth/logout').error(new ProgressEvent('error'));

    expect(auth.isLoggedIn()).toBe(false);
  });

  it('logout for someone who was never logged in sends nothing', () => {
    const auth = setup();
    auth.logout();
    http.expectNone('/api/auth/logout');
  });

  it('logoutAll ends every session and clears this one only when the server confirms', () => {
    const auth = setup();
    logIn(auth);

    let failed = false;
    auth.logoutAll().subscribe({ error: () => (failed = true) });
    http.expectOne('/api/auth/logout-all').flush({}, { status: 500, statusText: 'Server Error' });
    expect(failed).toBe(true);
    expect(auth.isLoggedIn()).toBe(true); // not claimed as done when it was not

    auth.logoutAll().subscribe();
    const req = http.expectOne('/api/auth/logout-all');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.user()).toBeNull();
  });
});
