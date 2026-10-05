import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { NotificationItem } from './notifications.models';
import { NotificationsService } from './notifications.service';

@Component({
  selector: 'app-notifications',
  imports: [DatePipe],
  templateUrl: './notifications.html',
})
export class Notifications {
  private readonly api = inject(NotificationsService);

  protected readonly unread = this.api.unread;
  protected readonly items = signal<NotificationItem[] | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loadFailed.set(false);
    this.api.inbox().subscribe({
      next: (inbox) => this.items.set(inbox.items),
      error: () => this.loadFailed.set(true),
    });
  }

  protected markRead(item: NotificationItem): void {
    this.change(this.api.markRead(item.id));
  }

  protected markAllRead(): void {
    this.change(this.api.markAllRead());
  }

  /** The server is the source of truth, so after a change the list and the count are read again. */
  private change(request: ReturnType<NotificationsService['markAllRead']>): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: () => {
        this.busy.set(false);
        this.error.set('Could not update your notifications. Please try again.');
      },
    });
  }

  protected icon(kind: string): string {
    return kind === 'NEW_DEVICE_LOGIN' ? 'New login' : kind === 'LOGIN_LOCKED' ? 'Login locked' : kind === 'CARD_FROZEN_PIN' ? 'Card' : 'Password';
  }
}
