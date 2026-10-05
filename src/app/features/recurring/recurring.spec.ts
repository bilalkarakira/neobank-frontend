import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account } from '../accounts/accounts.models';
import { Recurring } from './recurring';
import { RecurringPayment, RecurringRun } from './recurring.models';

const account = (overrides: Partial<Account>): Account => ({
  id: 'a',
  iban: 'XX65NEOB1000000001',
  type: 'CHECKING',
  currency: 'USD',
  status: 'ACTIVE',
  nickname: 'Daily',
  balance: '500.00',
  availableBalance: overrides.balance ?? '500.00',
  heldAmount: '0.00',
  createdAt: '2026-10-04T10:00:00Z',
  ...overrides,
});

const CHECKING = account({ id: 'a' });
const SAVINGS = account({ id: 'b', type: 'SAVINGS', nickname: 'Holiday', iban: 'XX38NEOB1000000002' });
const OTHER_IBAN = 'XX65NEOB1000000001'; // any checksum-valid IBAN will do as "someone else's"
const CATEGORIES = [{ id: 'c-housing', name: 'Housing' }];
const TODAY = new Date().toISOString().slice(0, 10);

const payment = (overrides: Partial<RecurringPayment> = {}): RecurringPayment => ({
  id: 'p1',
  sourceAccountId: 'a',
  destinationIban: 'XX38NEOB1000000002',
  amount: '25.00',
  description: 'Savings top-up',
  categoryId: null,
  frequency: 'MONTHLY',
  startDate: '2026-10-05',
  endDate: null,
  nextRunDate: '2026-11-05',
  status: 'ACTIVE',
  autoPaused: false,
  consecutiveFailures: 0,
  createdAt: '2026-10-04T10:00:00Z',
  ...overrides,
});

describe('Recurring page', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Recurring>;
  let el: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [Recurring],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Recurring);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const loadData = (payments: RecurringPayment[] = [payment()], accounts: Account[] = [CHECKING, SAVINGS]) => {
    http.expectOne('/api/recurring-payments').flush(payments);
    http.expectOne('/api/accounts').flush(accounts);
    http.expectOne('/api/categories').flush(CATEGORIES);
    fixture.detectChanges();
  };
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(text))!;
  const click = (text: string) => {
    button(text).click();
    fixture.detectChanges();
  };
  const field = (id: string) => el.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
  const set = (id: string, value: string) => {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    fixture.detectChanges();
  };

  it('shows an empty state', () => {
    loadData([]);
    expect(el.textContent).toContain('No recurring payments yet');
  });

  it('lists an order with its amount, route and next payment', () => {
    loadData();
    const text = el.textContent ?? '';
    expect(text).toContain('$25.00 every month');
    expect(text).toContain('Daily → Holiday'); // own accounts are shown by name, not by IBAN
    expect(text).toContain('Savings top-up');
    expect(text).toContain('Active');
    expect(text).toContain('Nov 5, 2026');
  });

  it('says so when an order paused itself after failures', () => {
    loadData([payment({ status: 'PAUSED', autoPaused: true, consecutiveFailures: 3 })]);
    const text = el.textContent ?? '';
    expect(text).toContain('Paused after failed payments');
    expect(text).toContain('3 failed in a row');
    expect(button('Resume')).toBeTruthy();
  });

  it('pauses an order and shows the new state', () => {
    loadData();
    click('Pause');
    const req = http.expectOne('/api/recurring-payments/p1/pause');
    expect(req.request.method).toBe('POST');
    req.flush(payment({ status: 'PAUSED' }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Recurring payment paused.');
    expect(button('Resume')).toBeTruthy();
  });

  it('only cancels after a second confirmation, then removes the order', () => {
    loadData();
    click('Cancel payment');
    http.expectNone('/api/recurring-payments/p1'); // nothing sent yet
    expect(el.textContent).toContain('Cancel for good?');
    click('Yes, cancel');
    const req = http.expectOne('/api/recurring-payments/p1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    fixture.detectChanges();
    expect(el.textContent).toContain('No recurring payments yet');
  });

  it('can back out of a cancellation', () => {
    loadData();
    click('Cancel payment');
    click('Keep');
    expect(el.textContent).not.toContain('Cancel for good?');
    expect(button('Cancel payment')).toBeTruthy();
  });

  it('shows past runs with a plain-language failure reason', () => {
    loadData();
    click('Show payments');
    const runs: RecurringRun[] = [
      { runDate: '2026-10-05', status: 'FAILED', failureCode: 'INSUFFICIENT_FUNDS', failureMessage: 'x', transactionId: null, executedAt: '2026-10-05T00:05:00Z' },
      { runDate: '2026-09-05', status: 'SUCCESS', failureCode: null, failureMessage: null, transactionId: 't', executedAt: '2026-09-05T00:05:00Z' },
    ];
    http.expectOne('/api/recurring-payments/p1/runs').flush(runs);
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('Failed: Not enough money in the account');
    expect(text).toContain('Sent');
    expect(text).not.toContain('INSUFFICIENT_FUNDS');
    click('Hide payments');
    expect(el.textContent).not.toContain('Not enough money in the account');
  });

  it('edits the amount and note with a PUT using two decimals', () => {
    loadData();
    click('Edit');
    set('edit-amount', '30');
    set('edit-description', ' New note ');
    click('Save changes');
    const req = http.expectOne('/api/recurring-payments/p1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ amount: '30.00', description: 'New note', categoryId: null });
    req.flush(payment({ amount: '30.00', description: 'New note' }));
    fixture.detectChanges();
    expect(el.textContent).toContain('$30.00 every month');
  });

  it('does not send an invalid edit', () => {
    loadData();
    click('Edit');
    set('edit-amount', '0');
    click('Save changes');
    http.expectNone('/api/recurring-payments/p1');
    expect(el.textContent).toContain('Enter an amount between 0.01 and 10,000.00');
  });

  // ---- creating --------------------------------------------------------------------------------------------------

  it('creates an order between my own accounts', () => {
    loadData([]);
    click('New recurring payment');
    click('My accounts');
    set('toOwnId', 'b');
    set('amount', '40');
    set('frequency', 'WEEKLY');
    set('description', 'Top-up');
    click('Create recurring payment');

    const req = http.expectOne('/api/recurring-payments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      sourceAccountId: 'a',
      destinationIban: 'XX38NEOB1000000002',
      amount: '40.00',
      description: 'Top-up',
      categoryId: null,
      frequency: 'WEEKLY',
      startDate: TODAY,
      endDate: null,
    });
    req.flush(payment({ id: 'new', amount: '40.00', frequency: 'WEEKLY' }));
    fixture.detectChanges();
    expect(el.textContent).toContain('Recurring payment created.');
    expect(el.textContent).toContain('$40.00 every week');
  });

  it('starts the next order from the defaults instead of inheriting the last one', () => {
    loadData([]);
    click('New recurring payment');
    click('My accounts');
    set('toOwnId', 'b');
    set('amount', '40');
    set('frequency', 'WEEKLY');
    click('Create recurring payment');
    http.expectOne('/api/recurring-payments').flush(payment({ id: 'new', frequency: 'WEEKLY' }));
    fixture.detectChanges();

    click('New recurring payment');

    expect(field('frequency').value).toBe('MONTHLY');
    expect(field('iban')).toBeTruthy(); // back on "Someone else", not "My accounts"
    expect(field('amount').value).toBe('');
  });

  it('creates an order for someone else after the recipient lookup, with a category', () => {
    loadData([]);
    click('New recurring payment');
    set('iban', OTHER_IBAN);
    vi.advanceTimersByTime(400);
    http.expectOne((r) => r.url === '/api/recipients/lookup').flush({ iban: OTHER_IBAN, ownerName: 'Alice K.' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Alice K.');

    set('amount', '1200.5');
    set('categoryId', 'c-housing');
    set('endDate', '2027-12-31');
    click('Create recurring payment');

    const req = http.expectOne('/api/recurring-payments');
    expect(req.request.body).toMatchObject({
      destinationIban: OTHER_IBAN,
      amount: '1200.50',
      categoryId: 'c-housing',
      endDate: '2027-12-31',
    });
    req.flush(payment({ id: 'new' }));
  });

  it('keeps the button disabled until the destination is known', () => {
    loadData([]);
    click('New recurring payment');
    set('amount', '10');
    expect(button('Create recurring payment').disabled).toBe(true);
  });

  it('refuses a start date in the past and an end date before the start', () => {
    loadData([]);
    click('New recurring payment');
    click('My accounts');
    set('toOwnId', 'b');
    set('amount', '10');
    expect(button('Create recurring payment').disabled).toBe(false);

    set('startDate', '2020-01-01');
    expect(el.textContent).toContain('The first payment cannot be in the past.');
    expect(button('Create recurring payment').disabled).toBe(true);

    set('startDate', '2099-05-10');
    set('endDate', '2099-05-01');
    expect(el.textContent).toContain('The end date cannot be before the first payment.');
    expect(button('Create recurring payment').disabled).toBe(true);
  });

  it('shows the server message when the limit of orders is reached', () => {
    loadData([]);
    click('New recurring payment');
    click('My accounts');
    set('toOwnId', 'b');
    set('amount', '10');
    click('Create recurring payment');
    http.expectOne('/api/recurring-payments').flush(
      { code: 'RECURRING_LIMIT_REACHED', detail: 'You can have at most 10 recurring payments.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('You can have at most 10 recurring payments.');
    expect(button('Create recurring payment')).toBeTruthy(); // the form stays open so nothing is lost
  });

  it('tells the user how long to wait when the recipient lookup is rate-limited', () => {
    loadData([]);
    click('New recurring payment');
    set('iban', OTHER_IBAN);
    vi.advanceTimersByTime(400);
    http.expectOne((r) => r.url === '/api/recipients/lookup').flush(
      { code: 'RATE_LIMITED' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '120' } },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Too many attempts. Please try again in about 2 minutes.');
    set('amount', '10');
    expect(button('Create recurring payment').disabled).toBe(true); // no confirmed recipient
  });

  it('shows the wait when creating is rate-limited, and keeps the form open', () => {
    loadData([]);
    click('New recurring payment');
    click('My accounts');
    set('toOwnId', 'b');
    set('amount', '10');
    click('Create recurring payment');
    http.expectOne('/api/recurring-payments').flush(
      { code: 'RATE_LIMITED' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '30' } },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Too many attempts. Please try again in about 30 seconds.');
    expect(button('Create recurring payment')).toBeTruthy();
  });

  it('offers a retry when loading fails', () => {
    http.expectOne('/api/recurring-payments').flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/accounts').flush([CHECKING]);
    http.expectOne('/api/categories').flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load your recurring payments.');
    click('Try again');
    http.expectOne('/api/recurring-payments').flush([]);
    http.expectOne('/api/accounts').flush([CHECKING]);
    fixture.detectChanges();
    expect(el.textContent).toContain('No recurring payments yet');
  });
});
