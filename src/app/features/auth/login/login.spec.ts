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

  it('navigates to /home after a successful login', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fill(el, 'bilal@example.com', 'S3curepass12');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    controller.expectOne('/api/auth/login').flush({ accessToken: 'tok', tokenType: 'Bearer', expiresIn: 900 });
    controller.expectOne('/api/me').flush({ id: '1', firstName: 'Bilal', lastName: 'K', email: 'bilal@example.com', role: 'CUSTOMER', createdAt: '' });

    expect(navigate).toHaveBeenCalledWith(['/home']);
  });
});
