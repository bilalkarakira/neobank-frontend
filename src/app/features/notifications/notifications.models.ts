export type NotificationKind = 'NEW_DEVICE_LOGIN' | 'LOGIN_LOCKED' | 'PASSWORD_CHANGED' | 'CARD_FROZEN_PIN' | 'CARD_AUTH_REQUESTED';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface Inbox {
  /** Every unread notice, even those beyond the newest 50 that are listed. */
  unreadCount: number;
  items: NotificationItem[];
}
