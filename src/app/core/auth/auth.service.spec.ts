import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { User } from './auth.models';
import { AuthService } from './auth.service';

const USER: User = {
  id: '1',
  firstName: 'Bilal',
  lastName: 'Karakira',
  email: 'bilal@example.com',
  role: 'CUSTOMER',
  createdAt: '2026-10-04T10:00:00Z',
};

describe('AuthService', () => {
  let http: HttpTestingController;

  function setup(): AuthService {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => http.verify());

  it('login stores the token, then loads the current user', () => {
    const auth = setup();
    let result: User | undefined;

    auth.login({ email: 'bilal@example.com', password: 'S3curepass12' }).subscribe((u) => (result = u));

    http.expectOne('/api/auth/login').flush({ accessToken: 'tok', tokenType: 'Bearer', expiresIn: 900 });
    http.expectOne('/api/me').flush(USER);

    expect(result).toEqual(USER);
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.user()).toEqual(USER);
    expect(localStorage.getItem('neobank.accessToken')).toBe('tok');
  });

  it('logout clears token and user', () => {
    localStorage.setItem('neobank.accessToken', 'tok');
    const auth = setup();
    expect(auth.isLoggedIn()).toBe(true);

    auth.logout();

    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.user()).toBeNull();
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

  it('restoreSession loads the user when a token is stored and does nothing otherwise', () => {
    const auth = setup();
    auth.restoreSession().subscribe();
    http.expectNone('/api/me');

    localStorage.setItem('neobank.accessToken', 'tok');
    TestBed.resetTestingModule();
    const restored = setup();
    restored.restoreSession().subscribe();
    http.expectOne('/api/me').flush(USER);

    expect(restored.user()).toEqual(USER);
  });
});
