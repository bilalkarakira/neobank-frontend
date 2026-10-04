import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService, REFRESH_RACE_RETRY_MS } from './auth.service';

const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };
const USER = { id: '1', firstName: 'A', lastName: 'B', email: 'a@b.c', role: 'CUSTOMER', createdAt: '2026-10-04T10:00:00Z' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: AuthService;
  let router: Router;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    controller.verify();
    localStorage.clear();
  });

  const logIn = (token = 'tok') => {
    auth.login({ email: 'a@b.c', password: 'S3curepass12' }).subscribe();
    controller.expectOne('/api/auth/login').flush({ accessToken: token, tokenType: 'Bearer', expiresIn: 900 });
    controller.expectOne('/api/me').flush(USER);
  };
  const bearer = (req: { request: { headers: { get(name: string): string | null } } }) =>
    req.request.headers.get('Authorization');

  it('adds the bearer header to protected API calls', () => {
    logIn('tok');
    http.get('/api/accounts').subscribe();
    const req = controller.expectOne('/api/accounts');
    expect(bearer(req)).toBe('Bearer tok');
    req.flush([]);
  });

  it('does not attach the token to the auth endpoints or to non-API calls', () => {
    logIn('tok');
    for (const url of ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout']) {
      http.post(url, {}).subscribe({ error: () => undefined });
      expect(controller.expectOne(url).request.headers.has('Authorization')).toBe(false);
    }
    http.get('https://example.com/other').subscribe();
    expect(controller.expectOne('https://example.com/other').request.headers.has('Authorization')).toBe(false);
  });

  // ---- silent renewal ---------------------------------------------------------------------------------------

  it('renews an expired access token silently and repeats the call: the user notices nothing', () => {
    logIn('old');
    let result: unknown;
    http.get('/api/accounts').subscribe((r) => (result = r));

    controller.expectOne('/api/accounts').flush({}, UNAUTHORIZED);
    controller.expectOne('/api/auth/refresh').flush({ accessToken: 'new', tokenType: 'Bearer', expiresIn: 900 });
    const retry = controller.expectOne('/api/accounts');
    expect(bearer(retry)).toBe('Bearer new');
    retry.flush(['account']);

    expect(result).toEqual(['account']);
    expect(auth.token).toBe('new');
    expect(auth.isLoggedIn()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('several calls failing at once cause ONE refresh, and every call is repeated', () => {
    logIn('old');
    const results: unknown[] = [];
    http.get('/api/accounts').subscribe((r) => results.push(r));
    http.get('/api/recurring-payments').subscribe((r) => results.push(r));
    http.get('/api/transfers/limits').subscribe((r) => results.push(r));

    controller.expectOne('/api/accounts').flush({}, UNAUTHORIZED);
    controller.expectOne('/api/recurring-payments').flush({}, UNAUTHORIZED);
    controller.expectOne('/api/transfers/limits').flush({}, UNAUTHORIZED);
    controller.expectOne('/api/auth/refresh').flush({ accessToken: 'new', tokenType: 'Bearer', expiresIn: 900 });
    // no second refresh: the single-use cookie would have been presented twice

    for (const url of ['/api/accounts', '/api/recurring-payments', '/api/transfers/limits']) {
      const retry = controller.expectOne(url);
      expect(bearer(retry)).toBe('Bearer new');
      retry.flush('ok');
    }
    expect(results).toEqual(['ok', 'ok', 'ok']);
  });

  it('when the refresh itself fails the session is over: logged out and sent to the login page', () => {
    logIn('old');
    let error: unknown;
    http.get('/api/accounts').subscribe({ error: (e) => (error = e) });

    controller.expectOne('/api/accounts').flush({}, UNAUTHORIZED);
    controller.expectOne('/api/auth/refresh').flush({}, UNAUTHORIZED);
    vi.advanceTimersByTime(REFRESH_RACE_RETRY_MS);
    controller.expectOne('/api/auth/refresh').flush({}, UNAUTHORIZED);
    // no logout request: the server rejected the cookie and already told the browser to drop it

    controller.expectNone('/api/auth/logout');
    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('neobank.hasSession')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { expired: 1 } });
    expect((error as { status: number }).status).toBe(401); // the caller still sees what went wrong
  });

  it('a call that is still rejected after a fresh token ends the session, and never loops', () => {
    logIn('old');
    http.get('/api/admin/overview').subscribe({ error: () => undefined });

    controller.expectOne('/api/admin/overview').flush({}, UNAUTHORIZED);
    controller.expectOne('/api/auth/refresh').flush({ accessToken: 'new', tokenType: 'Bearer', expiresIn: 900 });
    controller.expectOne('/api/admin/overview').flush({}, UNAUTHORIZED); // the repeat is rejected too
    controller.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });

    controller.expectNone('/api/auth/refresh'); // exactly one refresh per failure
    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { expired: 1 } });
  });

  it('other errors pass straight through: no refresh, no logout', () => {
    logIn('tok');
    let error: { status: number } | undefined;
    http.get('/api/accounts').subscribe({ error: (e) => (error = e) });

    controller.expectOne('/api/accounts').flush({}, { status: 422, statusText: 'Unprocessable' });

    expect(error?.status).toBe(422);
    controller.expectNone('/api/auth/refresh');
    controller.expectNone('/api/auth/logout');
    expect(auth.isLoggedIn()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a repeated call that fails for another reason is passed on without ending the session', () => {
    logIn('old');
    let error: { status: number } | undefined;
    http.get('/api/accounts').subscribe({ error: (e) => (error = e) });

    controller.expectOne('/api/accounts').flush({}, UNAUTHORIZED);
    controller.expectOne('/api/auth/refresh').flush({ accessToken: 'new', tokenType: 'Bearer', expiresIn: 900 });
    controller.expectOne('/api/accounts').flush({}, { status: 500, statusText: 'Server Error' });

    expect(error?.status).toBe(500);
    expect(auth.isLoggedIn()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a 401 with no session at all goes to login without trying to refresh', () => {
    http.get('/api/accounts').subscribe({ error: () => undefined });

    controller.expectOne('/api/accounts').flush({}, UNAUTHORIZED);

    controller.expectNone('/api/auth/refresh');
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { expired: 1 } });
  });

  it('a failed login (401) is not "session expired": no refresh, no redirect', () => {
    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    controller.expectOne('/api/auth/login').flush({}, UNAUTHORIZED);

    controller.expectNone('/api/auth/refresh');
    expect(navigate).not.toHaveBeenCalled();
  });
});
