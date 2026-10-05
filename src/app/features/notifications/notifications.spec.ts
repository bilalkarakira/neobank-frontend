import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Notifications } from './notifications';
import { Inbox, NotificationItem } from './notifications.models';

const item = (overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'n-1',
  kind: 'NEW_DEVICE_LOGIN',
  title: 'New login to your account',
  body: 'Someone signed in from Safari on iOS (address 198.51.100.7).',
  createdAt: '2026-10-05T12:00:00Z',
  read: false,
  ...overrides,
});
const INBOX: Inbox = {
  unreadCount: 2,
  items: [
    item(),
    item({ id: 'n-2', kind: 'PASSWORD_CHANGED', title: 'Your password was changed', body: 'Changed.', read: false }),
    item({ id: 'n-3', kind: 'LOGIN_LOCKED', title: 'Your login was locked', body: 'Locked.', read: true }),
  ],
};
const NO_CONTENT = { status: 204, statusText: 'No Content' };

describe('Notifications page', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Notifications>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Notifications], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Notifications);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const load = (inbox: Inbox = INBOX) => {
    http.expectOne('/api/notifications').flush(inbox);
    fixture.detectChanges();
  };
  const buttons = (text: string) => [...el.querySelectorAll('button')].filter((b) => b.textContent?.trim() === text);

  it('shows each notice with its title, text and whether it is unread', () => {
    load();
    const rows = [...el.querySelectorAll('li')];
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('New login to your account');
    expect(rows[0].textContent).toContain('Safari on iOS (address 198.51.100.7)');
    expect(rows[0].getAttribute('data-unread')).toBe('true');
    expect(rows[2].getAttribute('data-unread')).toBe('false');
    expect(rows[2].querySelector('button')).toBeNull(); // nothing to mark on a read one
  });

  it('says so when there is nothing to report', () => {
    load({ unreadCount: 0, items: [] });
    expect(el.textContent).toContain('Nothing to report.');
    expect(buttons('Mark all as read').length).toBe(0);
  });

  it('marks one notice read and then reads the inbox again', () => {
    load();
    buttons('Mark as read')[1].click();
    http.expectOne('/api/notifications/n-2/read').flush(null, NO_CONTENT);
    http.expectOne('/api/notifications').flush({
      unreadCount: 1,
      items: [INBOX.items[0], { ...INBOX.items[1], read: true }, INBOX.items[2]],
    });
    fixture.detectChanges();

    expect(el.querySelectorAll('li')[1].getAttribute('data-unread')).toBe('false');
    expect(buttons('Mark as read').length).toBe(1);
  });

  it('marks everything read, and the button goes away', () => {
    load();
    buttons('Mark all as read')[0].click();
    http.expectOne('/api/notifications/read-all').flush(null, NO_CONTENT);
    http.expectOne('/api/notifications').flush({ unreadCount: 0, items: INBOX.items.map((n) => ({ ...n, read: true })) });
    fixture.detectChanges();

    expect(buttons('Mark all as read').length).toBe(0);
    expect(el.querySelectorAll('[data-unread="true"]').length).toBe(0);
  });

  it('keeps the list and explains when marking fails', () => {
    load();
    buttons('Mark all as read')[0].click();
    http.expectOne('/api/notifications/read-all').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.textContent).toContain('Could not update your notifications.');
    expect(el.querySelectorAll('li').length).toBe(3);
  });

  it('does not send a second request while one is in flight', () => {
    load();
    const all = buttons('Mark all as read')[0];
    all.click();
    all.click();
    http.expectOne('/api/notifications/read-all').flush(null, NO_CONTENT);
    http.expectOne('/api/notifications').flush(INBOX);
  });

  it('offers a retry when the inbox cannot be loaded', () => {
    http.expectOne('/api/notifications').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load your notifications.');

    buttons('Try again')[0].click();
    load();
    expect(el.querySelectorAll('li').length).toBe(3);
  });

  it('shows the notice of a card frozen after wrong PINs', () => {
    http.expectOne('/api/notifications').flush({
      unreadCount: 1,
      items: [item({ id: 'n-9', kind: 'CARD_FROZEN_PIN', title: 'Your card was frozen', body: 'Frozen after wrong PINs.' })],
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('Your card was frozen');
    expect(el.textContent).toContain('Card ·');
  });

});
