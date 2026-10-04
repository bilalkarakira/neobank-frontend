import { Frequency, RecurringPayment } from './recurring.models';

export function frequencyLabel(frequency: Frequency): string {
  return frequency === 'WEEKLY' ? 'every week' : 'every month';
}

/** What to show next to an order: why it is not running is more useful than the raw status. */
export function statusLabel(payment: Pick<RecurringPayment, 'status' | 'autoPaused'>): string {
  switch (payment.status) {
    case 'ACTIVE':
      return 'Active';
    case 'PAUSED':
      return payment.autoPaused ? 'Paused after failed payments' : 'Paused';
    case 'COMPLETED':
      return 'Completed';
  }
}

/** Plain-language reason for a failed run; unknown codes fall back to a generic text. */
export function failureLabel(code: string | null): string {
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
      return 'Not enough money in the account';
    case 'DAILY_LIMIT_EXCEEDED':
      return 'Daily transfer limit reached';
    case 'ACCOUNT_NOT_ACTIVE':
      return 'Your account was not active';
    case 'RECIPIENT_UNAVAILABLE':
      return 'The recipient could not receive money';
    case 'RECIPIENT_NOT_FOUND':
      return 'The recipient account no longer exists';
    default:
      return 'The payment could not be made';
  }
}
