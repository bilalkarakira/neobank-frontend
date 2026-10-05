import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { Inbox } from './notifications.models';

/**
 * The customer's security notices. The unread count lives here (not in the page) so the menu badge and the page
 * always agree; it is refreshed whenever the inbox is read.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  readonly unread = signal(0);

  inbox(): Observable<Inbox> {
    return this.http.get<Inbox>('/api/notifications').pipe(tap((inbox) => this.unread.set(inbox.unreadCount)));
  }

  /** Just the count, for the menu badge: a failure leaves the badge as it was (it is not worth an error message). */
  refresh(): void {
    this.inbox().subscribe({ error: () => undefined });
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`/api/notifications/${id}/read`, null);
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>('/api/notifications/read-all', null);
  }

  clear(): void {
    this.unread.set(0);
  }
}
