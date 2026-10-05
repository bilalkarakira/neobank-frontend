import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(NotificationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the inbox and keeps the unread count for the menu badge', () => {
    service.inbox().subscribe();
    http.expectOne('/api/notifications').flush({ unreadCount: 3, items: [] });
    expect(service.unread()).toBe(3);
  });

  it('leaves the badge as it was when a background refresh fails', () => {
    service.unread.set(2);
    service.refresh();
    http.expectOne('/api/notifications').flush({}, { status: 500, statusText: 'Server Error' });
    expect(service.unread()).toBe(2);
  });

  it('marks one or all as read with POST', () => {
    service.markRead('n-1').subscribe();
    const one = http.expectOne('/api/notifications/n-1/read');
    expect(one.request.method).toBe('POST');
    one.flush(null, { status: 204, statusText: 'No Content' });

    service.markAllRead().subscribe();
    const all = http.expectOne('/api/notifications/read-all');
    expect(all.request.method).toBe('POST');
    all.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('forgets the count when told to (on logout)', () => {
    service.unread.set(4);
    service.clear();
    expect(service.unread()).toBe(0);
  });
});
