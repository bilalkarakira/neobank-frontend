import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Login } from './login';

describe('Login', () => {
  let controller: HttpTestingController;

  function render() {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    controller = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  }

  function fill(el: HTMLElement, email: string, password: string) {
    const set = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>('#' + id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('email', email);
    set('password', password);
  }

  it('disables the submit button while the form is invalid', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(button.disabled).toBe(true);

    fill(el, 'bilal@example.com', 'S3curepass12');
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it('shows an error message on 401 and does not navigate', async () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fill(el, 'bilal@example.com', 'wrong-password');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    controller.expectOne('/api/auth/login').flush({ code: 'INVALID_CREDENTIALS' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(el.querySelector('[role=alert]')?.textContent).toContain('Invalid email or password');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says how long to wait after too many attempts, instead of "invalid password"', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fill(el, 'bilal@example.com', 'S3curepass12');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    controller.expectOne('/api/auth/login').flush(
      { code: 'TOO_MANY_LOGIN_ATTEMPTS', retryAfterSeconds: 900 },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '900' } },
    );
    fixture.detectChanges();

    const message = el.querySelector('[role=alert]')?.textContent ?? '';
    expect(message).toContain('Too many attempts. Please try again in about 15 minutes.');
    expect(message).not.toContain('Invalid email or password');
    expect(navigate).not.toHaveBeenCalled();
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false); // can try again later
  });

  it('falls back to the wait in the response body when the header is not visible', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;

    fill(el, 'bilal@example.com', 'S3curepass12');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    controller.expectOne('/api/auth/login').flush(
      { code: 'RATE_LIMITED', retryAfterSeconds: 45 },
      { status: 429, statusText: 'Too Many Requests' },
    );
    fixture.detectChanges();

    expect(el.querySelector('[role=alert]')?.textContent).toContain('about 45 seconds');
  });

  it('navigates to the dashboard after a successful login', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fill(el, 'bilal@example.com', 'S3curepass12');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    controller.expectOne('/api/auth/login').flush({ accessToken: 'tok', tokenType: 'Bearer', expiresIn: 900 });
    controller.expectOne('/api/me').flush({ id: '1', firstName: 'Bilal', lastName: 'K', email: 'bilal@example.com', role: 'CUSTOMER', createdAt: '' });

    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
