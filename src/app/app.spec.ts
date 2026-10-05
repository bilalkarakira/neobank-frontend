import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth/auth.service';
import { NotificationsService } from './features/notifications/notifications.service';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  /** Logs in through the real flow (the token lives in memory only) and renders the app. */
  const loggedInApp = (role: 'ADMIN' | 'CUSTOMER'): ComponentFixture<App> => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(AuthService).login({ email: 'a@b.c', password: 'S3curepass12' }).subscribe();
    http.expectOne('/api/auth/login').flush({ accessToken: 'tok', tokenType: 'Bearer', expiresIn: 900 });
    http.expectOne('/api/me').flush({
      id: 'u', firstName: 'A', lastName: 'B', email: 'a@b.c', role, createdAt: '2026-10-01T00:00:00Z',
    });
    fixture.detectChanges();
    return fixture;
  };
  const buttonLabelled = (fixture: ComponentFixture<App>, text: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;

  it('shows the brand but no logout button for guests', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('NeoBank');
    expect(el.querySelector('button')).toBeNull();
  });

  it('shows the Admin menu link to administrators only', () => {
    const admin = loggedInApp('ADMIN');
    expect((admin.nativeElement as HTMLElement).querySelector('nav')?.textContent).toContain('Admin');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const customer = loggedInApp('CUSTOMER');
    const nav = (customer.nativeElement as HTMLElement).querySelector('nav')?.textContent ?? '';
    expect(nav).not.toContain('Admin');
    expect(nav).toContain('Recurring'); // the rest of the menu is unchanged
  });

  it('shows the number of unread notifications next to the menu link, and nothing when there are none', () => {
    const fixture = loggedInApp('CUSTOMER');
    http.expectOne('/api/notifications').flush({ unreadCount: 3, items: [] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="unread-badge"]')?.textContent).toContain('3');
    expect(el.querySelector('nav')?.textContent).toContain('Notifications');

    TestBed.inject(NotificationsService).unread.set(0);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="unread-badge"]')).toBeNull();
  });

  it('forgets the count when the user logs out', () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = loggedInApp('CUSTOMER');
    http.expectOne('/api/notifications').flush({ unreadCount: 2, items: [] });
    fixture.detectChanges();

    buttonLabelled(fixture, 'Log out').click();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(TestBed.inject(NotificationsService).unread()).toBe(0);
  });

  it('puts the money destinations in the sidebar and the account ones under their own heading', () => {
    const fixture = loggedInApp('CUSTOMER');
    const sidebar = (fixture.nativeElement as HTMLElement).querySelector('aside')!;
    const labels = [...sidebar.querySelectorAll('a')].map((a) => a.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toEqual(expect.arrayContaining(['Dashboard', 'Accounts', 'Send money', 'Recurring', 'History', 'Security']));
    expect(sidebar.textContent).toContain('a@b.c'); // who is signed in
  });

  it('gives phones four bottom tabs and a More menu with the rest, closing it after a choice', () => {
    const fixture = loggedInApp('CUSTOMER');
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const el = fixture.nativeElement as HTMLElement;
    const tabs = [...el.querySelectorAll('nav[aria-label="Quick"] a')].map((a) => a.textContent?.trim());
    expect(tabs).toEqual(['Dashboard', 'Accounts', 'Send money', 'History']);
    expect(el.querySelector('[role=menu]')).toBeNull();

    (el.querySelector('nav[aria-label="Quick"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const menu = el.querySelector('[role=menu]')!;
    expect(menu.textContent).toContain('Recurring');
    expect(menu.textContent).toContain('Security');
    expect(menu.textContent).toContain('Notifications');
    expect(menu.textContent).not.toContain('Admin');

    (menu.querySelector('a') as HTMLAnchorElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role=menu]')).toBeNull();
  });

  it('offers Admin in the More menu to administrators only', () => {
    const fixture = loggedInApp('ADMIN');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('nav[aria-label="Quick"] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role=menu]')?.textContent).toContain('Admin');
  });

  it('Log out ends the session here, tells the server, and goes to the login page', () => {
    const fixture = loggedInApp('CUSTOMER');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    buttonLabelled(fixture, 'Log out').click();

    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('Log out everywhere asks the server to end every session before leaving', () => {
    const fixture = loggedInApp('CUSTOMER');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    buttonLabelled(fixture, 'Log out everywhere').click();
    expect(navigate).not.toHaveBeenCalled(); // not until the server confirmed

    http.expectOne('/api/auth/logout-all').flush(null, { status: 204, statusText: 'No Content' });
    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('stays logged in when "log out everywhere" fails, instead of pretending it worked', () => {
    const fixture = loggedInApp('CUSTOMER');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    buttonLabelled(fixture, 'Log out everywhere').click();
    http.expectOne('/api/auth/logout-all').flush({}, { status: 500, statusText: 'Server Error' });

    expect(TestBed.inject(AuthService).isLoggedIn()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
