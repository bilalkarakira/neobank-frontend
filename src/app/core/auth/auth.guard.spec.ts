import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './auth.guard';
import { AuthService } from './auth.service';

type Login = 'guest' | 'token-only' | 'CUSTOMER' | 'ADMIN';

describe('route guards', () => {
  const run = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

  /** Starts the app in the given state, going through the real login flow (the token only exists in memory). */
  function setup(state: Login): Router {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const router = TestBed.inject(Router);
    if (state !== 'guest') {
      const http = TestBed.inject(HttpTestingController);
      TestBed.inject(AuthService).login({ email: 'a@b.c', password: 'S3curepass12' }).subscribe();
      http.expectOne('/api/auth/login').flush({ accessToken: 'tok', tokenType: 'Bearer', expiresIn: 900 });
      if (state !== 'token-only') { // 'token-only': /api/me has not answered yet, so no role is known
        http.expectOne('/api/me').flush({
          id: 'u', firstName: 'A', lastName: 'B', email: 'a@b.c', role: state, createdAt: '2026-10-01T00:00:00Z',
        });
      }
    }
    return router;
  }

  afterEach(() => localStorage.clear());

  it('authGuard lets logged-in users in and sends guests to /login', () => {
    setup('CUSTOMER');
    expect(run(authGuard)).toBe(true);

    const guestRouter = setup('guest');
    expect(guestRouter.serializeUrl(run(authGuard) as UrlTree)).toBe('/login');
  });

  it('a stored hint alone is not a login: only a live session passes the guard', () => {
    setup('guest');
    localStorage.setItem('neobank.hasSession', '1');
    expect(run(authGuard)).not.toBe(true);
  });

  describe('adminGuard', () => {
    it('sends guests to log in', () => {
      const router = setup('guest');
      expect(router.serializeUrl(run(adminGuard) as UrlTree)).toBe('/login');
    });

    it('sends customers to the dashboard', () => {
      const router = setup('CUSTOMER');
      expect(router.serializeUrl(run(adminGuard) as UrlTree)).toBe('/dashboard');
    });

    it('lets administrators in', () => {
      setup('ADMIN');
      expect(run(adminGuard)).toBe(true);
    });

    it('does not trust a login before the user is known', () => {
      const router = setup('token-only'); // logged in, but no role yet
      expect(router.serializeUrl(run(adminGuard) as UrlTree)).toBe('/dashboard');
    });
  });

  it('guestGuard lets guests in and sends logged-in users to the dashboard', () => {
    setup('guest');
    expect(run(guestGuard)).toBe(true);

    const router = setup('CUSTOMER');
    expect(router.serializeUrl(run(guestGuard) as UrlTree)).toBe('/dashboard');
  });
});
