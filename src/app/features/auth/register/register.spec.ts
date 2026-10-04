import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Register } from './register';

describe('Register', () => {
  let controller: HttpTestingController;

  function render() {
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    controller = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    return fixture;
  }

  function fill(el: HTMLElement, values: Record<string, string>) {
    for (const [id, value] of Object.entries(values)) {
      const input = el.querySelector<HTMLInputElement>('#' + id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
  }

  const VALID = { firstName: 'Bilal', lastName: 'Karakira', email: 'bilal@example.com', password: 'S3curepass12' };

  it('rejects a password without a digit or that is too short', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('button[type=submit]')!;

    fill(el, { ...VALID, password: 'onlyletterspassword' });
    fixture.detectChanges();
    expect(button.disabled).toBe(true);

    fill(el, { password: 'short1' });
    fixture.detectChanges();
    expect(button.disabled).toBe(true);

    fill(el, { password: 'S3curepass12' });
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it('shows "already registered" on the email field after a 409', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    fill(el, VALID);
    fixture.detectChanges();

    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    controller
      .expectOne('/api/auth/register')
      .flush({ code: 'EMAIL_ALREADY_REGISTERED' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(el.textContent).toContain('This email is already registered.');
  });

  it('says how long to wait when too many accounts were created from this network', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    fill(el, VALID);
    fixture.detectChanges();

    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    controller.expectOne('/api/auth/register').flush(
      { code: 'RATE_LIMITED' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '3600' } },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Too many attempts. Please try again in about 1 hour.');
    expect(el.textContent).not.toContain('Something went wrong');
  });

  it('redirects to login with the registered flag on success', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill(el, VALID);
    fixture.detectChanges();

    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    controller.expectOne('/api/auth/register').flush({});

    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { registered: 1 } });
  });
});
