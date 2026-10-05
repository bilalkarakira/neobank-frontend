import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account } from '../accounts/accounts.models';
import { Transfer } from './transfer';
import { TransferLimits } from './transfer.models';

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
const SAVINGS = account({ id: 'b', type: 'SAVINGS', nickname: 'Holiday', balance: '0.00', iban: 'XX38NEOB1000000002' });
const LIMITS: TransferLimits = { dailyLimit: '5000.00', usedToday: '4900.00', remaining: '100.00' };
const OTHER_IBAN = 'XX65NEOB1000000001'; // a valid IBAN (checksum) used as "someone else's"
const CATEGORIES = [
  { id: 'c-groceries', name: 'Groceries' },
  { id: 'c-dining', name: 'Dining' },
];

describe('Transfer page', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Transfer>;
  let el: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [Transfer],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Transfer);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const loadData = (accounts: Account[] = [CHECKING, SAVINGS]) => {
    http.expectOne('/api/accounts').flush(accounts);
    http.expectOne('/api/transfers/limits').flush(LIMITS);
    http.expectOne('/api/categories').flush(CATEGORIES);
    fixture.detectChanges();
  };
  const field = (id: string) => el.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
  const set = (id: string, value: string) => {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    fixture.detectChanges();
  };
  const tab = (label: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((b) => b.textContent?.includes(label))!;
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(text))!;
  const settle = () => {
    vi.advanceTimersByTime(400); // the IBAN lookup is debounced
    fixture.detectChanges();
  };
  const transferRequest = (): TestRequest => http.expectOne('/api/transfers');

  it('shows an empty state when the user has no accounts', () => {
    loadData([]);
    expect(el.textContent).toContain('You have no accounts yet');
  });

  it('preselects the first active account and lists balances', () => {
    loadData();
    expect(field('fromId').value).toBe('a');
    expect(el.textContent).toContain('Daily');
    expect(el.textContent).toContain('$500.00');
  });

  it('moves money between my own accounts through review and confirm, with an Idempotency-Key', () => {
    loadData();
    set('toOwnId', 'b');
    set('amount', '75.5');
    expect(button('Review transfer').disabled).toBe(false);
    button('Review transfer').click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Review your transfer');
    expect(el.textContent).toContain('Holiday');
    expect(el.textContent).toContain('$75.50');

    button('Confirm transfer').click();
    const req = transferRequest();
    expect(req.request.body).toEqual({
      sourceAccountId: 'a',
      destinationIban: 'XX38NEOB1000000002',
      amount: '75.50',
      description: null,
      categoryId: null, // a category only applies to money sent to someone else
    });
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    req.flush({
      transactionId: 't',
      sourceAccountId: 'a',
      destinationIban: 'XX38NEOB1000000002',
      amount: '75.50',
      balance: '424.50',
      createdAt: '',
    });
    // success reloads balances and limits
    http.expectOne('/api/accounts').flush([CHECKING, SAVINGS]);
    http.expectOne('/api/transfers/limits').flush(LIMITS);
    fixture.detectChanges();

    expect(el.textContent).toContain('Transfer sent');
    expect(el.textContent).toContain('$424.50');
  });

  it('sends to someone else: validates the checksum locally, then confirms the recipient by name', () => {
    loadData();
    button('Someone else').click();
    fixture.detectChanges();

    set('iban', 'XX65NEOB1000000002'); // wrong check digits: never reaches the server
    settle();
    http.expectNone((r) => r.url === '/api/recipients/lookup');
    expect(el.textContent).toContain("doesn't look right");

    set('iban', 'xx65 neob 1000 0000 01'); // pasted with spaces and lowercase
    settle();
    const lookup = http.expectOne((r) => r.url === '/api/recipients/lookup');
    expect(lookup.request.params.get('iban')).toBe(OTHER_IBAN);
    lookup.flush({ iban: OTHER_IBAN, ownerName: 'Alice K.' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Alice K.');

    set('amount', '20');
    expect(el.textContent).toContain('Remaining today: $100.00');
    expect(button('Review transfer').disabled).toBe(false);
  });

  it('offers a category only when sending to someone else, and sends the chosen one', () => {
    loadData();
    expect(field('categoryId')).toBeNull(); // my own accounts: no category

    button('Someone else').click();
    fixture.detectChanges();
    expect(field('categoryId')).not.toBeNull();
    expect([...field('categoryId').querySelectorAll('option')].map((o) => o.textContent?.trim())).toEqual([
      'No category', 'Groceries', 'Dining',
    ]);

    set('iban', OTHER_IBAN);
    settle();
    http.expectOne((r) => r.url === '/api/recipients/lookup').flush({ iban: OTHER_IBAN, ownerName: 'Alice K.' });
    set('amount', '20');
    set('categoryId', 'c-dining');
    button('Review transfer').click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Category');
    expect(el.textContent).toContain('Dining');

    button('Confirm transfer').click();
    const req = transferRequest();
    expect(req.request.body.categoryId).toBe('c-dining');
    req.error(new ProgressEvent('error'));
  });

  it('treats a different category as a different attempt (new idempotency key)', () => {
    loadData();
    button('Someone else').click();
    fixture.detectChanges();
    set('iban', OTHER_IBAN);
    settle();
    http.expectOne((r) => r.url === '/api/recipients/lookup').flush({ iban: OTHER_IBAN, ownerName: 'Alice K.' });
    set('amount', '20');
    set('categoryId', 'c-dining');
    button('Review transfer').click();
    fixture.detectChanges();

    button('Confirm transfer').click();
    const first = transferRequest();
    const key = first.request.headers.get('Idempotency-Key');
    first.error(new ProgressEvent('error')); // outcome unknown: the key stays reserved for this exact request
    fixture.detectChanges();

    button('Back').click();
    fixture.detectChanges();
    set('categoryId', 'c-groceries');
    button('Review transfer').click();
    fixture.detectChanges();
    button('Confirm transfer').click();
    const second = transferRequest();

    expect(second.request.headers.get('Idempotency-Key')).not.toBe(key);
    second.error(new ProgressEvent('error'));
  });

  it('reports an unknown recipient and blocks the review', () => {
    loadData();
    button('Someone else').click();
    fixture.detectChanges();
    set('amount', '10');

    set('iban', OTHER_IBAN);
    settle();
    http.expectOne((r) => r.url === '/api/recipients/lookup')
      .flush({ code: 'RECIPIENT_NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(el.textContent).toContain('No account was found');
    expect(button('Review transfer').disabled).toBe(true);
  });

  it('warns when the amount exceeds the balance or the remaining daily limit', () => {
    loadData();
    set('toOwnId', 'b');
    set('amount', '600');
    expect(el.textContent).toContain('more than the balance');
    expect(button('Review transfer').disabled).toBe(true);

    button('Someone else').click();
    fixture.detectChanges();
    set('iban', OTHER_IBAN);
    settle();
    http.expectOne((r) => r.url === '/api/recipients/lookup').flush({ iban: OTHER_IBAN, ownerName: 'Alice K.' });
    set('amount', '150');
    expect(el.textContent).toContain('more than your remaining daily limit');
    expect(button('Review transfer').disabled).toBe(true);
  });

  it('keeps the same key when retrying after a network error, and renews it after a rejection', () => {
    loadData();
    set('toOwnId', 'b');
    set('amount', '10');
    button('Review transfer').click();
    fixture.detectChanges();

    button('Confirm transfer').click();
    const first = transferRequest();
    const key = first.request.headers.get('Idempotency-Key');
    first.error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(el.textContent).toContain('will not be sent twice');

    button('Confirm transfer').click();
    const retry = transferRequest();
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush({ code: 'INSUFFICIENT_FUNDS' }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Insufficient funds');

    button('Confirm transfer').click();
    const afterRejection = transferRequest();
    expect(afterRejection.request.headers.get('Idempotency-Key')).not.toBe(key);
    afterRejection.error(new ProgressEvent('error'));
  });

  it('shows the server message when the daily limit is exceeded', () => {
    loadData();
    button('Someone else').click();
    fixture.detectChanges();
    set('iban', OTHER_IBAN);
    settle();
    http.expectOne((r) => r.url === '/api/recipients/lookup').flush({ iban: OTHER_IBAN, ownerName: 'Alice K.' });
    set('amount', '50');
    button('Review transfer').click();
    fixture.detectChanges();

    button('Confirm transfer').click();
    transferRequest().flush(
      { code: 'DAILY_LIMIT_EXCEEDED', detail: 'Daily transfer limit of 5000.00 exceeded. Remaining today: 20.00.' },
      { status: 422, statusText: 'Unprocessable' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Remaining today: 20.00');
  });

  it('ignores a second click on Confirm while the first is in flight', () => {
    loadData();
    set('toOwnId', 'b');
    set('amount', '10');
    button('Review transfer').click();
    fixture.detectChanges();

    const confirm = button('Confirm transfer');
    confirm.click();
    confirm.click();

    transferRequest(); // expectOne fails if two requests were sent
    http.verify();
  });

  it('offers no own-account destination when the user has a single account', () => {
    loadData([CHECKING]);
    expect(el.textContent).toContain('You need another active account');
  });

  it('tells the user how long to wait when recipient lookups are rate-limited, and blocks the review', () => {
    loadData();
    button('Someone else').click();
    fixture.detectChanges();
    set('amount', '10');

    set('iban', OTHER_IBAN);
    settle();
    http.expectOne((r) => r.url === '/api/recipients/lookup').flush(
      { code: 'RATE_LIMITED', retryAfterSeconds: 600 },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '600' } },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Too many attempts. Please try again in about 10 minutes.');
    expect(el.textContent).not.toContain('No account was found');
    expect(button('Review transfer').disabled).toBe(true);
  });

  it('shows the wait on the review step when the transfer itself is rate-limited, and allows another try', () => {
    loadData();
    set('toOwnId', 'b');
    set('amount', '10');
    button('Review transfer').click();
    fixture.detectChanges();
    button('Confirm transfer').click();

    transferRequest().flush(
      { code: 'RATE_LIMITED' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '40' } },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Too many attempts. Please try again in about 40 seconds.');
    expect(el.textContent).not.toContain('The transfer was rejected');
    expect(button('Confirm transfer').disabled).toBe(false);
  });

  it('offers the available balance of each account, not the balance', () => {
    loadData([account({ id: 'a', balance: '500.00', availableBalance: '400.00', heldAmount: '100.00' }), SAVINGS]);
    const option = [...field('fromId').querySelectorAll('option')].map((o) => o.textContent?.replace(/\s+/g, ' ').trim());
    expect(option[0]).toContain('$400.00 available');
    expect(option[0]).not.toContain('$500.00');
  });

  it('warns against the available balance and names the reserved money', () => {
    loadData([account({ id: 'a', balance: '500.00', availableBalance: '400.00', heldAmount: '100.00' }), SAVINGS]);
    set('toOwnId', 'b');

    set('amount', '450');
    expect(el.textContent).toContain('more than the available balance');
    expect(el.textContent).toContain('100.00 USD is reserved for card payments');
    expect(button('Review transfer').disabled).toBe(true);

    set('amount', '400');
    expect(el.textContent).not.toContain('more than the available balance');
    expect(button('Review transfer').disabled).toBe(false);
  });

  it('explains an insufficient-funds refusal when card payments hold part of the money', () => {
    loadData([account({ id: 'a', balance: '500.00', availableBalance: '400.00', heldAmount: '100.00' }), SAVINGS]);
    set('toOwnId', 'b');
    set('amount', '10');
    button('Review transfer').click();
    fixture.detectChanges();

    button('Confirm transfer').click();
    transferRequest().flush({ code: 'INSUFFICIENT_FUNDS' }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(el.textContent).toContain('Money reserved for card payments cannot be sent');
  });

});
