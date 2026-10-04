import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    localStorage.setItem('neobank.accessToken', 'tok');
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
  });

  afterEach(() => {
    controller.verify();
    localStorage.clear();
  });

  it('adds the bearer header to protected API calls', () => {
    http.get('/api/me').subscribe();
    const req = controller.expectOne('/api/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush({});
  });

  it('does not attach the token to login/register or non-API calls', () => {
    http.post('/api/auth/login', {}).subscribe();
    expect(controller.expectOne('/api/auth/login').request.headers.has('Authorization')).toBe(false);

    http.get('https://example.com/other').subscribe();
    expect(controller.expectOne('https://example.com/other').request.headers.has('Authorization')).toBe(false);
  });

  it('on 401 clears the session and redirects to login', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/me').subscribe({ error: () => undefined });
    controller.expectOne('/api/me').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { expired: 1 } });
  });

  it('a failed login (401) does not trigger the session-expired redirect', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    controller.expectOne('/api/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(navigate).not.toHaveBeenCalled();
  });
});
