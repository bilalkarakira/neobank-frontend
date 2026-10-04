import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';

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

  it('guestGuard lets guests in and sends logged-in users to the dashboard', () => {
    const guestRouter = setup(null);
    expect(run(guestGuard)).toBe(true);

    const router = setup('tok');
    const result = run(guestGuard) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/dashboard');
    expect(guestRouter).toBeTruthy();
  });
});
