import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('route guards', () => {
  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  function setup(token: string | null): Router {
    localStorage.clear();
    if (token) {
      localStorage.setItem('neobank.accessToken', token);
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    return TestBed.inject(Router);
  }

  afterEach(() => localStorage.clear());

  it('authGuard lets logged-in users in and sends guests to /login', () => {
    const router = setup('tok');
    expect(run(authGuard)).toBe(true);

    const guestRouter = setup(null);
    const result = run(authGuard) as UrlTree;
    expect(guestRouter.serializeUrl(result)).toBe('/login');
    expect(router).toBeTruthy();
  });

  describe('adminGuard', () => {
    const asUser = (role: 'ADMIN' | 'CUSTOMER') => {
      const router = setup('tok');
      TestBed.inject(AuthService).loadUser().subscribe();
      TestBed.inject(HttpTestingController).expectOne('/api/me').flush({
        id: 'u', firstName: 'A', lastName: 'B', email: 'a@b.c', role, createdAt: '2026-10-01T00:00:00Z',
      });
      return router;
    };

    it('sends guests to log in', () => {
      const router = setup(null);
      expect(router.serializeUrl(run(adminGuard) as UrlTree)).toBe('/login');
    });

    it('sends customers to the dashboard', () => {
      const router = asUser('CUSTOMER');
      expect(router.serializeUrl(run(adminGuard) as UrlTree)).toBe('/dashboard');
    });

    it('lets administrators in', () => {
      asUser('ADMIN');
      expect(run(adminGuard)).toBe(true);
    });

    it('does not trust a stored token before the user is known', () => {
      const router = setup('tok'); // logged in, but /api/me has not answered: no role yet
      expect(router.serializeUrl(run(adminGuard) as UrlTree)).toBe('/dashboard');
    });
  });

  it('guestGuard lets guests in and sends logged-in users to the dashboard', () => {
    const guestRouter = setup(null);
    expect(run(guestGuard)).toBe(true);

    const router = setup('tok');
    const result = run(guestGuard) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/dashboard');
    expect(guestRouter).toBeTruthy();
  });
});
