import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows the brand but no logout button for guests', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('NeoBank');
    expect(el.querySelector('button')).toBeNull();
  });

  describe('Admin menu link', () => {
    const navFor = async (role: 'ADMIN' | 'CUSTOMER') => {
      localStorage.setItem('neobank.accessToken', 'tok');
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [App],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();
      const fixture = TestBed.createComponent(App);
      TestBed.inject(AuthService).loadUser().subscribe();
      TestBed.inject(HttpTestingController).expectOne('/api/me').flush({
        id: 'u', firstName: 'A', lastName: 'B', email: 'a@b.c', role, createdAt: '2026-10-01T00:00:00Z',
      });
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).querySelector('nav')?.textContent ?? '';
    };

    afterEach(() => localStorage.clear());

    it('is shown to administrators only', async () => {
      expect(await navFor('ADMIN')).toContain('Admin');
      expect(await navFor('CUSTOMER')).not.toContain('Admin');
      expect(await navFor('CUSTOMER')).toContain('Recurring'); // the rest of the menu is unchanged
    });
  });
});
