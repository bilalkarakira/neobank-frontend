import { failureLabel, frequencyLabel, statusLabel } from './recurring-labels';

describe('recurring labels', () => {
  it('names the frequencies', () => {
    expect(frequencyLabel('WEEKLY')).toBe('every week');
    expect(frequencyLabel('MONTHLY')).toBe('every month');
  });

  it('says why an order is paused', () => {
    expect(statusLabel({ status: 'ACTIVE', autoPaused: false })).toBe('Active');
    expect(statusLabel({ status: 'PAUSED', autoPaused: false })).toBe('Paused');
    expect(statusLabel({ status: 'PAUSED', autoPaused: true })).toBe('Paused after failed payments');
    expect(statusLabel({ status: 'COMPLETED', autoPaused: false })).toBe('Completed');
  });

  it('explains failures in plain words and never shows a raw code', () => {
    expect(failureLabel('INSUFFICIENT_FUNDS')).toBe('Not enough money in the account');
    expect(failureLabel('DAILY_LIMIT_EXCEEDED')).toBe('Daily transfer limit reached');
    expect(failureLabel('SOMETHING_NEW')).toBe('The payment could not be made');
    expect(failureLabel(null)).toBe('The payment could not be made');
  });
});
