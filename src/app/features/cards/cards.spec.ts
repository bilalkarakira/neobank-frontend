import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account } from '../accounts/accounts.models';
import { Card, CardAuthorization, IssuedCard } from './cards.models';
import { Cards, limitValidator } from './cards';
import { FormControl } from '@angular/forms';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'a1',
  iban: 'XX65NEOB1000000001',
  type: 'CHECKING',
  currency: 'USD',
  status: 'ACTIVE',
  nickname: 'Daily',
  balance: '200.00',
  availableBalance: '154.75',
  heldAmount: '45.25',
  createdAt: '2026-10-04T10:00:00Z',
  ...overrides,
});

const card = (overrides: Partial<Card> = {}): Card => ({
  id: 'c1',
  accountId: 'a1',
  accountName: 'Daily',
  maskedPan: '9999 00** **** 0012',
  last4: '0012',
  expiry: '10/29',
  status: 'ACTIVE',
  freezeReason: null,
  nickname: 'Everyday',
  dailyLimit: '1000.00',
  spentToday: '45.25',
  ledgerBalance: '200.00',
  availableBalance: '154.75',
  heldAmount: '45.25',
  createdAt: '2026-10-04T10:00:00Z',
  ...overrides,
});

const authorization = (overrides: Partial<CardAuthorization> = {}): CardAuthorization => ({
  id: 'x1',
  merchantName: 'Corner Cafe',
  amount: '45.25',
  status: 'AUTHORIZED',
  responseCode: '00',
  reason: null,
  standIn: false,
  createdAt: '2026-10-05T10:00:00Z',
  expiresAt: '2026-10-12T10:00:00Z',
  ...overrides,
});

const PAN = '9999000000000012';
const PIN = '4321';

describe('Cards page', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Cards>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Cards],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Cards);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const loadData = (cards: Card[] = [card()], accounts: Account[] = [account()]) => {
    http.expectOne('/api/cards').flush(cards);
    http.expectOne('/api/accounts').flush(accounts);
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
  const submit = (selector: string) => {
    el.querySelector<HTMLFormElement>(selector)!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const text = (testId: string) => el.querySelector(`[data-testid=${testId}]`)?.textContent?.replace(/\s+/g, ' ').trim();

  // ---- the list ----

  it('says so when there are no cards', () => {
    loadData([]);
    expect(el.textContent).toContain('You have no cards yet');
  });

  it('shows a card with its masked number, status and the four money figures', () => {
    loadData();

    expect(text('masked-pan')).toBe('9999 00** **** 0012');
    expect(text('card-status')).toBe('Active');
    expect(text('available')).toBe('$154.75');
    expect(text('ledger')).toBe('$200.00');
    expect(text('held')).toBe('$45.25');
    expect(text('spent')).toContain('$45.25');
    expect(text('spent')).toContain('of $1,000.00');
    expect(el.textContent).toContain('Linked to Daily');
  });

  it('never shows a full card number or PIN just from listing', () => {
    loadData();
    expect(el.querySelector('[data-testid=reveal]')).toBeNull();
    expect(el.textContent).not.toMatch(/\d{4} \d{4} \d{4} \d{4}/);
  });

  it('offers a retry when the cards cannot be loaded', () => {
    http.expectOne('/api/cards').flush('x', { status: 500, statusText: 'x' });
    http.expectOne('/api/accounts').flush([account()]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load your cards');

    click('Try again');
    http.expectOne('/api/cards').flush([card()]);
    http.expectOne('/api/accounts').flush([account()]);
    fixture.detectChanges();
    expect(text('masked-pan')).toBe('9999 00** **** 0012');
  });

  it('shows a card frozen after wrong PINs with the reason and offers to unfreeze it', () => {
    loadData([card({ status: 'FROZEN', freezeReason: 'PIN_TRIES' })]);
    expect(text('card-status')).toBe('Frozen');
    expect(text('freeze-text')).toContain('too many wrong PINs');
    expect(button('Unfreeze')).toBeTruthy();
  });

  it('does not offer to unfreeze a card the bank froze', () => {
    loadData([card({ status: 'FROZEN', freezeReason: 'ADMIN' })]);
    expect(text('freeze-text')).toContain('Frozen by the bank');
    expect(button('Unfreeze')).toBeUndefined();
    expect(el.textContent).toContain('Only the bank can unfreeze this card');
  });

  // ---- issuing ----

  const issued = (): IssuedCard => ({ card: card({ id: 'c2', last4: '0012', nickname: 'Travel' }), pan: PAN, pin: PIN });

  it('issues a card for a chosen account and shows the number and PIN once', () => {
    loadData([]);
    click('Issue a card');
    set('card-account', 'a1');
    set('card-nickname', ' Travel ');

    submit('form');
    const req = http.expectOne('/api/cards');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ accountId: 'a1', nickname: 'Travel' });
    req.flush(issued());
    fixture.detectChanges();

    expect(text('revealed-pan')).toBe('9999 0000 0000 0012');
    expect(text('revealed-pin')).toBe(PIN);
    expect(el.textContent).toContain('only time');
    expect(text('masked-pan')).toBe('9999 00** **** 0012'); // the new card is in the list, masked
  });

  it('removes the number and PIN for good once they are dismissed', () => {
    loadData([]);
    click('Issue a card');
    set('card-account', 'a1');
    submit('form');
    http.expectOne('/api/cards').flush(issued());
    fixture.detectChanges();

    click('I have saved them');

    expect(el.querySelector('[data-testid=reveal]')).toBeNull();
    expect(el.textContent).not.toContain(PAN);
    expect(el.textContent).not.toContain('9999 0000 0000 0012');
    expect(el.textContent).not.toContain(PIN);
  });

  it('sends no name when the field is left empty', () => {
    loadData([]);
    click('Issue a card');
    set('card-account', 'a1');
    submit('form');
    expect(http.expectOne('/api/cards').request.body).toEqual({ accountId: 'a1', nickname: null });
  });

  it('preselects the account when there is only one to choose from', () => {
    loadData([], [account()]);
    click('Issue a card');
    expect(field('card-account').value).toBe('a1');
  });

  it('offers only active checking accounts', () => {
    loadData([], [
      account(),
      account({ id: 's1', type: 'SAVINGS', nickname: 'Holiday' }),
      account({ id: 'f1', status: 'FROZEN', nickname: 'Frozen one' }),
    ]);
    click('Issue a card');

    const options = [...field('card-account').querySelectorAll('option')].map((o) => o.textContent?.trim());
    expect(options).toEqual(['Choose an account', 'Daily']);
  });

  it('sends people without a checking account to open one', () => {
    loadData([], [account({ type: 'SAVINGS' })]);
    click('Issue a card');
    expect(el.textContent).toContain('You need an active checking account first');
    expect(el.querySelector('form')).toBeNull();
  });

  it('does not send the form without an account', () => {
    loadData([], [account(), account({ id: 'a2', nickname: 'Second' })]);
    click('Issue a card');
    submit('form');
    http.expectNone('/api/cards');
  });

  it('explains the card limit', () => {
    loadData([], [account()]);
    click('Issue a card');
    submit('form');
    http.expectOne('/api/cards').flush(
      { code: 'CARD_LIMIT_REACHED', detail: 'You can have at most 3 cards. Cancel one to get a new one.' },
      { status: 422, statusText: 'x' },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('at most 3 cards');
    expect(el.querySelector('[data-testid=reveal]')).toBeNull();
  });

  it('shows a generic message when issuing fails for another reason', () => {
    loadData([], [account()]);
    click('Issue a card');
    submit('form');
    http.expectOne('/api/cards').flush('x', { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('could not issue the card');
  });

  // ---- freeze, unfreeze, cancel ----

  it('freezes a card and shows the server answer', () => {
    loadData();
    click('Freeze');
    const req = http.expectOne('/api/cards/c1/freeze');
    expect(req.request.method).toBe('POST');
    req.flush(card({ status: 'FROZEN', freezeReason: 'CUSTOMER' }));
    fixture.detectChanges();

    expect(text('card-status')).toBe('Frozen');
    expect(text('freeze-text')).toContain('Frozen by you');
    expect(el.querySelector('[role=status]')?.textContent).toContain('0012 is frozen');
  });

  it('unfreezes a card', () => {
    loadData([card({ status: 'FROZEN', freezeReason: 'CUSTOMER' })]);
    click('Unfreeze');
    http.expectOne('/api/cards/c1/unfreeze').flush(card());
    fixture.detectChanges();
    expect(text('card-status')).toBe('Active');
  });

  it('asks twice before cancelling and sends nothing at the first click', () => {
    loadData();
    click('Cancel card');
    http.expectNone('/api/cards/c1');
    expect(el.textContent).toContain('Cancel this card for good?');

    click('No');
    expect(el.textContent).not.toContain('Cancel this card for good?');
    http.expectNone('/api/cards/c1');
  });

  it('cancels a card after confirmation and removes it from the list', () => {
    loadData();
    click('Cancel card');
    click('Yes, cancel it');
    const req = http.expectOne('/api/cards/c1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(el.querySelector('[data-card]')).toBeNull();
    expect(el.querySelector('[role=status]')?.textContent).toContain('cancelled for good');
  });

  it('reloads the list when an action finds the card gone', () => {
    loadData();
    click('Freeze');
    http.expectOne('/api/cards/c1/freeze').flush({ code: 'CARD_NOT_FOUND' }, { status: 404, statusText: 'x' });
    http.expectOne('/api/cards').flush([]);
    http.expectOne('/api/accounts').flush([account()]);
    fixture.detectChanges();

    expect(el.textContent).toContain('That card no longer exists');
    expect(el.querySelector('[data-card]')).toBeNull();
  });

  it('shows the reason when the server refuses a state change', () => {
    loadData([card({ status: 'FROZEN', freezeReason: 'CUSTOMER' })]);
    click('Unfreeze');
    http.expectOne('/api/cards/c1/unfreeze').flush(
      { code: 'CARD_INVALID_STATE', detail: 'The bank froze this card, so only the bank can unfreeze it.' },
      { status: 422, statusText: 'x' },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('only the bank can unfreeze it');
  });

  // ---- daily limit ----

  it('changes the daily limit', () => {
    loadData();
    click('Change daily limit');
    set('limit-c1', '250.50');
    submit('form');
    const req = http.expectOne('/api/cards/c1/limit');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ dailyLimit: '250.50' });
    req.flush(card({ dailyLimit: '250.50' }));
    fixture.detectChanges();

    expect(text('spent')).toContain('of $250.50');
    expect(el.querySelector('#limit-c1')).toBeNull();
  });

  it('sends nothing for a limit the server would refuse', () => {
    loadData();
    click('Change daily limit');
    for (const bad of ['', '0', '0.00', '5000.01', '12.345', 'abc', '-5']) {
      set('limit-c1', bad);
      submit('form');
      http.expectNone('/api/cards/c1/limit');
    }
    expect(el.textContent).toContain('between 0.01 and 5000.00');
  });

  // ---- activity ----

  it('shows pending holds and recent activity, with the reason for a decline', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.url === '/api/cards/c1/authorizations' && r.params.get('pending') === 'true')
      .flush({ items: [authorization()], page: 0, size: 1, totalElements: 1 });
    http.expectOne((r) => r.url === '/api/cards/c1/authorizations' && r.params.get('page') === '0')
      .flush({
        items: [
          authorization(),
          authorization({ id: 'x2', merchantName: 'Big Store', amount: '500.00', status: 'DECLINED', responseCode: '51', reason: 'Not enough available money.', expiresAt: null }),
          authorization({ id: 'x3', merchantName: 'Kiosk', amount: '3.00', status: 'REVERSED', expiresAt: null }),
        ],
        page: 0, size: 10, totalElements: 3,
      });
    fixture.detectChanges();

    const pending = el.querySelector('[data-testid=pending]')!;
    expect(pending.textContent).toContain('Corner Cafe');
    expect(pending.textContent).toContain('$45.25');
    const recent = el.querySelector('[data-testid=recent]')!.textContent!;
    expect(recent).toContain('Not enough available money.');
    expect(recent).toContain('Declined');
    expect(recent).toContain('Pending');
    expect(recent).toContain('Cancelled by the shop');
    expect(el.textContent).toContain('Nothing is posted to your balance yet');
  });

  it('marks a payment the card network approved while NeoBank was unavailable', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({
      items: [authorization({ id: 'si1', merchantName: 'Gas Station', amount: '30.00', standIn: true })], page: 0, size: 1, totalElements: 1,
    });
    http.expectOne((r) => r.params.get('page') === '0').flush({
      items: [authorization({ id: 'si1', merchantName: 'Gas Station', amount: '30.00', standIn: true }), authorization({ id: 'x2', merchantName: 'Corner Cafe' })],
      page: 0, size: 10, totalElements: 2,
    });
    fixture.detectChanges();

    const notes = [...el.querySelectorAll('[data-testid=stand-in-note]')].map((n) => n.textContent?.trim());
    expect(notes).toEqual([
      'Approved by the card network while NeoBank was unavailable',
      'Approved by the card network while NeoBank was unavailable',
    ]); // once in the pending list and once in the recent list, and only for the stand-in payment
    expect(el.querySelector('[data-testid=recent]')!.textContent).toContain('Corner Cafe');
  });

  it('says when nothing is pending', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({ items: [], page: 0, size: 0, totalElements: 0 });
    http.expectOne((r) => r.params.get('page') === '0').flush({ items: [], page: 0, size: 10, totalElements: 0 });
    fixture.detectChanges();

    expect(text('no-pending')).toBe('Nothing is pending.');
    expect(el.textContent).toContain('No card payments yet');
  });

  it('pages through older activity', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({ items: [], page: 0, size: 0, totalElements: 0 });
    http.expectOne((r) => r.params.get('page') === '0').flush({ items: [authorization()], page: 0, size: 10, totalElements: 25 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Page 1 of 3');

    click('Older');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({ items: [], page: 0, size: 0, totalElements: 0 });
    http.expectOne((r) => r.params.get('page') === '1').flush({ items: [authorization({ id: 'x9' })], page: 1, size: 10, totalElements: 25 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Page 2 of 3');
  });

  it('hides the activity again without another request', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({ items: [], page: 0, size: 0, totalElements: 0 });
    http.expectOne((r) => r.params.get('page') === '0').flush({ items: [], page: 0, size: 10, totalElements: 0 });
    fixture.detectChanges();

    click('Hide activity');
    expect(el.textContent).not.toContain('Nothing is pending');
    http.verify();
  });

  it('offers a retry when the activity cannot be loaded', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush('x', { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load the activity');
  });
});

describe('limitValidator', () => {
  const check = (value: string) => limitValidator(new FormControl(value, { nonNullable: true }));

  it('accepts what the server accepts', () => {
    for (const ok of ['0.01', '1', '1234.5', '4999.99', '5000', '5000.0', '5000.00']) {
      expect(check(ok), ok).toBeNull();
    }
  });

  it('refuses amounts out of range and badly written ones', () => {
    expect(check('0')).toEqual({ range: true });
    expect(check('0.00')).toEqual({ range: true });
    expect(check('5000.01')).toEqual({ range: true });
    expect(check('1.234')).toEqual({ format: true });
    expect(check('-5')).toEqual({ format: true });
    expect(check('abc')).toEqual({ format: true });
    expect(check('12345')).toEqual({ format: true });
  });

  it('leaves an empty value to the required rule', () => {
    expect(check('')).toBeNull();
    expect(check('  ')).toBeNull();
  });
});
