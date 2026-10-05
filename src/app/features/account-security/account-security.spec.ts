import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AccountSecurity } from './account-security';
import { Session } from './account-security.models';

const session = (overrides: Partial<Session> = {}): Session => ({
  id: 's-desktop',
  device: 'Chrome on Windows',
  ip: '203.0.113.5',
  startedAt: '2026-10-05T12:00:00Z',
  lastActiveAt: '2026-10-05T16:00:00Z',
  expiresAt: '2026-10-12T16:00:00Z',
  current: true,
  ...overrides,
});
const DESKTOP = session();
const PHONE = session({ id: 's-phone', device: 'Safari on iOS', ip: '198.51.100.7', current: false });
const NO_CONTENT = { status: 204, statusText: 'No Content' };

describe('Account security page', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<AccountSecurity>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountSecurity],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AccountSecurity);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const loadSessions = (list: Session[] = [DESKTOP, PHONE]) => {
    http.expectOne('/api/sessions').flush(list);
    fixture.detectChanges();
  };
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!;
  const click = (text: string) => {
    button(text).click();
    fixture.detectChanges();
  };
  const set = (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>('#' + id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const fillPasswords = (current = 'Old-password-1', next = 'Brand-new-pass-77', repeat = next) => {
    set('currentPassword', current);
    set('newPassword', next);
    set('confirmPassword', repeat);
  };
  const submit = () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  // ---- sessions ---------------------------------------------------------------------------------------------

  it('lists each login with its device, address and times, and marks this device', () => {
    loadSessions();
    const text = el.textContent ?? '';
    expect(text).toContain('Chrome on Windows');
    expect(text).toContain('This device');
    expect(text).toContain('203.0.113.5');
    expect(text).toContain('Safari on iOS');
    expect(text).toContain('198.51.100.7');
    expect(text).toContain('Signed in Oct 5, 2026');
    expect(text).toContain('Last active Oct 5, 2026');
    expect(el.querySelectorAll('li').length).toBe(2);
    expect(text.match(/This device/g)).toHaveLength(1);
  });

  it('copes with a login whose address is unknown', () => {
    loadSessions([session({ ip: null })]);
    expect(el.textContent).toContain('Signed in');
    expect(el.textContent).not.toContain('null');
  });

  it('removes another device only after a second click, then reloads the list', () => {
    loadSessions();
    click('Remove');
    http.expectNone('/api/sessions/s-phone');
    expect(el.textContent).toContain('Yes, remove');

    click('Yes, remove');
    const req = http.expectOne('/api/sessions/s-phone');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, NO_CONTENT);
    fixture.detectChanges();

    expect(el.textContent).toContain('Safari on iOS was logged out.');
    http.expectOne('/api/sessions').flush([DESKTOP]);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('198.51.100.7');
  });

  it('can back out of removing a device', () => {
    loadSessions();
    click('Remove');
    click('Keep');
    http.expectNone('/api/sessions/s-phone');
    expect(button('Remove')).toBeTruthy();
  });

  it('logging out THIS device ends the session here too and goes to the login page', () => {
    loadSessions();
    const auth = TestBed.inject(AuthService);
    const logout = vi.spyOn(auth, 'logout').mockImplementation(() => undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    click('Log out');
    expect(el.textContent).toContain('Yes, log out');
    click('Yes, log out');
    http.expectOne('/api/sessions/s-desktop').flush(null, NO_CONTENT);

    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login']);
    http.expectNone('/api/sessions'); // no point reloading a list for a session that just ended
  });

  it('offers to log out all other devices only when there are some', () => {
    loadSessions([DESKTOP]);
    expect(el.textContent).not.toContain('Log out all other devices');
  });

  it('logs out all other devices after a confirmation', () => {
    loadSessions();
    click('Log out all other devices');
    http.expectNone('/api/sessions/revoke-others');
    expect(el.textContent).toContain('Log out 1 other device(s)?');

    click('Yes, log them out');
    const req = http.expectOne('/api/sessions/revoke-others');
    expect(req.request.method).toBe('POST');
    req.flush(null, NO_CONTENT);
    fixture.detectChanges();

    expect(el.textContent).toContain('All your other devices were logged out.');
    http.expectOne('/api/sessions').flush([DESKTOP]);
  });

  it('shows an error and the real list when ending a session fails', () => {
    loadSessions();
    click('Remove');
    click('Yes, remove');
    http.expectOne('/api/sessions/s-phone').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.textContent).toContain('Something went wrong. Please try again.');
    http.expectOne('/api/sessions').flush([DESKTOP]); // reloaded: it may already have ended
  });

  it('offers a retry when the sessions cannot be loaded', () => {
    http.expectOne('/api/sessions').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load your sessions.');
    click('Try again');
    http.expectOne('/api/sessions').flush([DESKTOP]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Chrome on Windows');
  });

  // ---- changing the password --------------------------------------------------------------------------------

  it('checks the new password against the registration rules before sending anything', () => {
    loadSessions();
    fillPasswords('Old-password-1', 'short1');
    submit();
    http.expectNone('/api/me/password');
    expect(el.textContent).toContain('Use 10 to 72 characters');

    fillPasswords('Old-password-1', 'onlyletterspassword');
    submit();
    http.expectNone('/api/me/password');
  });

  it('refuses a repetition that does not match, and re-checks it when the new password changes', () => {
    loadSessions();
    fillPasswords('Old-password-1', 'Brand-new-pass-77', 'Brand-new-pass-78');
    submit();
    http.expectNone('/api/me/password');
    expect(el.textContent).toContain('The two passwords do not match.');

    set('newPassword', 'Brand-new-pass-78'); // now they match
    expect(el.textContent).not.toContain('The two passwords do not match.');
  });

  it('needs the current password', () => {
    loadSessions();
    fillPasswords('', 'Brand-new-pass-77');
    submit();
    http.expectNone('/api/me/password');
    expect(el.textContent).toContain('Enter your current password.');
  });

  it('sends only the current and the new password, then clears the form and shows what happened', () => {
    loadSessions();
    fillPasswords();
    submit();

    const req = http.expectOne('/api/me/password');
    expect(req.request.body).toEqual({ currentPassword: 'Old-password-1', newPassword: 'Brand-new-pass-77' });
    req.flush(null, NO_CONTENT);
    fixture.detectChanges();

    expect(el.textContent).toContain('Your password was changed. Every other device was logged out.');
    expect(el.querySelector<HTMLInputElement>('#currentPassword')!.value).toBe('');
    expect(el.querySelector<HTMLInputElement>('#newPassword')!.value).toBe('');
    http.expectOne('/api/sessions').flush([DESKTOP]); // the list now shows only this device
  });

  it('ignores a second submit while the first is in flight', () => {
    loadSessions();
    fillPasswords();
    submit();
    submit();
    http.expectOne('/api/me/password'); // expectOne fails if two requests were sent
  });

  it('puts "wrong current password" on that field and keeps what was typed', () => {
    loadSessions();
    fillPasswords();
    submit();
    http.expectOne('/api/me/password').flush(
      { code: 'WRONG_CURRENT_PASSWORD' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('This is not your current password.');
    expect(el.querySelector<HTMLInputElement>('#newPassword')!.value).toBe('Brand-new-pass-77');
    http.expectNone('/api/sessions');
  });

  it('says so when the new password is the same as the current one', () => {
    loadSessions();
    fillPasswords();
    submit();
    http.expectOne('/api/me/password').flush({ code: 'SAME_PASSWORD' }, { status: 422, statusText: 'Unprocessable Entity' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Choose a password you have not just used.');
  });

  it('shows the wait when too many wrong attempts locked the account', () => {
    loadSessions();
    fillPasswords();
    submit();
    http.expectOne('/api/me/password').flush(
      { code: 'TOO_MANY_LOGIN_ATTEMPTS' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '900' } },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Too many attempts. Please try again in about 15 minutes.');
  });

  it('puts the server\'s field messages on the matching fields', () => {
    loadSessions();
    fillPasswords();
    submit();
    http.expectOne('/api/me/password').flush(
      { code: 'VALIDATION_FAILED', fields: { newPassword: 'must contain at least one letter and one digit' } },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('must contain at least one letter and one digit');
  });
});
