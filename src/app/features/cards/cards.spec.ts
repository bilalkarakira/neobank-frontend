import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account } from '../accounts/accounts.models';
import { Card, CardAuthorization, Dispute, IssuedCard, PendingAuthentication } from './cards.models';
import { Cards, disputeAmountValidator, limitValidator } from './cards';
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
  capturedAmount: null,
  capturedAt: null,
  forced: false,
  cash: false,
  parentId: null,
  online: false,
  ...overrides,
});

const dispute = (overrides: Partial<Dispute> = {}): Dispute => ({
  id: 'd1',
  authorizationId: 'p1',
  merchantName: 'Corner Cafe',
  last4: '0012',
  amount: '57.50',
  reason: 'UNAUTHORIZED',
  note: null,
  status: 'FILED',
  outcome: null,
  filedAt: '2026-10-07T10:00:00Z',
  openedAt: null,
  closedAt: null,
  answerDueAt: null,
  ...overrides,
});

const NOTHING_OWED = { total: '0.00', items: [] };

const waiting = (overrides: Partial<PendingAuthentication> = {}): PendingAuthentication => ({
  id: 'au1',
  reference: 'K7M2QX',
  merchantName: 'Web Shop',
  amount: '80.00',
  cardLast4: '0012',
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 4 * 60_000 + 30_000).toISOString(),
  ...overrides,
});

const PAN = '9999000000000012';
const PIN = '4321';
const CVV = '731';

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

  // the debt line is a nicety fetched next to the cards: tests that do not care answer it with "nothing owed"
  const settleOwed = () => http.match('/api/cards/owed').forEach((r) => r.flush(NOTHING_OWED));
  // the same for the list of disputes: tests that do not care answer it with "none"
  const settleDisputes = () => http.match('/api/cards/disputes').forEach((r) => r.flush([]));
  // and for the online payments waiting for approval
  const settleApprovals = () => http.match('/api/cards/authentications').forEach((r) => r.flush([]));
  afterEach(() => {
    settleOwed();
    settleDisputes();
    settleApprovals();
    http.verify();
  });

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
    expect(text('freeze-text')).toContain('too many wrong PINs or security codes');
    expect(button('Unfreeze')).toBeTruthy();
  });

  it('does not offer to unfreeze a card the bank froze', () => {
    loadData([card({ status: 'FROZEN', freezeReason: 'ADMIN' })]);
    expect(text('freeze-text')).toContain('Frozen by the bank');
    expect(button('Unfreeze')).toBeUndefined();
    expect(el.textContent).toContain('Only the bank can unfreeze this card');
  });

  // ---- issuing ----

  const issued = (): IssuedCard => ({ card: card({ id: 'c2', last4: '0012', nickname: 'Travel' }), pan: PAN, pin: PIN, cvv: CVV });

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
    expect(text('revealed-cvv')).toBe(CVV);
    expect(text('reveal-use')).toContain('security code is what an online shop asks for');
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
    expect(el.querySelector('[data-testid=revealed-cvv]')).toBeNull();
    expect(el.textContent).not.toContain(CVV);
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
    expect(text('no-posted')).toBe('Nothing has been posted yet.');
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

  it('lists posted payments with what was really taken, a note when it differs, and a note for one posted without approval', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({ items: [], page: 0, size: 0, totalElements: 0 });
    http.expectOne((r) => r.params.get('page') === '0').flush({
      items: [
        authorization({ id: 'p1', merchantName: 'Corner Cafe', amount: '50.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '57.50', capturedAt: '2026-10-06T09:00:00Z' }),
        authorization({ id: 'p2', merchantName: 'Gas Station', amount: '20.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '20.00', capturedAt: '2026-10-06T09:05:00Z' }),
        authorization({ id: 'p3', merchantName: 'Kiosk', amount: '5.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '5.00', capturedAt: '2026-10-06T09:10:00Z', forced: true }),
        authorization({ id: 'a1', merchantName: 'Pending Shop', amount: '9.00' }),
      ],
      page: 0, size: 10, totalElements: 4,
    });
    fixture.detectChanges();

    const posted = el.querySelector('[data-testid=posted]')!;
    expect(posted.querySelectorAll('li').length).toBe(3);
    expect(posted.textContent).toContain('$57.50');
    expect(posted.textContent).not.toContain('Pending Shop');
    const changed = [...posted.querySelectorAll('[data-testid=changed-note]')].map((n) => n.textContent?.replace(/\s+/g, ' ').trim());
    expect(changed).toEqual(['Authorized $50.00, posted $57.50 (a tip or a change by the shop)']);
    expect(posted.querySelectorAll('[data-testid=forced-note]').length).toBe(1);
    expect(posted.querySelector('[data-testid=forced-note]')!.textContent).toContain('posted anyway');
    expect(el.querySelector('[data-testid=recent]')!.textContent).toContain('Posted');
  });

  it('marks a cash withdrawal as such in the pending, posted and recent lists, and only that one', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({
      items: [authorization({ id: 'c1', merchantName: 'City ATM', amount: '100.00', cash: true }), authorization({ id: 's1', merchantName: 'Corner Cafe', amount: '9.00' })],
      page: 0, size: 2, totalElements: 2,
    });
    http.expectOne((r) => r.params.get('page') === '0').flush({
      items: [
        authorization({ id: 'c1', merchantName: 'City ATM', amount: '100.00', cash: true }),
        authorization({ id: 'c2', merchantName: 'City ATM', amount: '50.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '50.00', capturedAt: '2026-10-06T09:00:00Z', cash: true }),
        authorization({ id: 's2', merchantName: 'Corner Cafe', amount: '20.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '20.00', capturedAt: '2026-10-06T09:05:00Z' }),
      ],
      page: 0, size: 10, totalElements: 3,
    });
    fixture.detectChanges();

    const notes = (testId: string) => [...el.querySelector(`[data-testid=${testId}]`)!.querySelectorAll('[data-testid=cash-note]')].map((n) => n.textContent?.trim());
    expect(notes('pending')).toEqual(['Cash withdrawal']);
    expect(notes('posted')).toEqual(['Cash withdrawal']);
    expect(notes('recent')).toEqual(['Cash withdrawal', 'Cash withdrawal']);
    expect(el.querySelector('[data-testid=posted] [data-posted=s2] [data-testid=cash-note]')).toBeNull();
  });

  describe('online payments waiting for approval', () => {
    const open = (list: PendingAuthentication[]) => {
      http.expectOne('/api/cards/authentications').flush(list);
      loadData();
    };

    it('shows nothing when no request is waiting', () => {
      open([]);
      expect(el.querySelector('[data-testid=approvals]')).toBeNull();
    });

    it('shows the shop, the amount, the card, the reference and the time left of each waiting request', () => {
      open([waiting(), waiting({ id: 'au2', reference: 'PLM3ZR', merchantName: 'Book Store', amount: '45.50', expiresAt: new Date(Date.now() + 20_000).toISOString() })]);

      const rows = [...el.querySelectorAll('[data-testid=approval]')];
      expect(rows.length).toBe(2);
      expect(rows[0].textContent).toContain('Web Shop');
      expect(rows[0].querySelector('[data-testid=approval-amount]')!.textContent).toContain('$80.00');
      expect(rows[0].querySelector('[data-testid=approval-reference]')!.textContent).toBe('K7M2QX');
      expect(rows[0].textContent).toContain('Card ending 0012');
      expect(rows[0].querySelector('[data-testid=approval-left]')!.textContent).toBe('5 min left');
      expect(rows[1].querySelector('[data-testid=approval-left]')!.textContent).toBe('under a minute left');
      expect(rows[1].querySelector('[data-testid=approval-amount]')!.textContent).toContain('$45.50');
    });

    it('approves one request, removes it from the list and says what happens next', () => {
      open([waiting(), waiting({ id: 'au2', reference: 'PLM3ZR', merchantName: 'Book Store' })]);

      el.querySelectorAll<HTMLButtonElement>('[data-testid=approval]')[0].querySelectorAll('button')[0].click();
      const req = http.expectOne('/api/cards/authentications/au1/approve');
      expect(req.request.method).toBe('POST');
      req.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(el.querySelectorAll('[data-testid=approval]').length).toBe(1);
      expect(el.querySelector('[data-testid=approval-reference]')!.textContent).toBe('PLM3ZR');
      expect(el.querySelector('.alert-success')!.textContent).toContain('You approved the payment to Web Shop');
    });

    it('rejects a request through its own endpoint', () => {
      open([waiting()]);

      el.querySelectorAll<HTMLButtonElement>('[data-testid=approval] button')[1].click();
      const req = http.expectOne('/api/cards/authentications/au1/reject');
      expect(req.request.method).toBe('POST');
      req.flush(null, { status: 204, statusText: 'No Content' });
      fixture.detectChanges();

      expect(el.querySelector('[data-testid=approvals]')).toBeNull();
      expect(el.querySelector('.alert-success')!.textContent).toContain('You rejected the payment to Web Shop');
    });

    it('offers no second answer while one is being sent', () => {
      open([waiting(), waiting({ id: 'au2', reference: 'PLM3ZR' })]);

      const buttons = el.querySelectorAll<HTMLButtonElement>('[data-testid=approval] button');
      buttons[0].click();
      fixture.detectChanges();
      expect([...el.querySelectorAll<HTMLButtonElement>('[data-testid=approval] button')].every((b) => b.disabled)).toBe(true);
      http.expectOne('/api/cards/authentications/au1/approve').flush(null, { status: 204, statusText: 'No Content' });
    });

    it('tells the customer when the request expired meanwhile, and reloads the list', () => {
      open([waiting()]);

      el.querySelectorAll<HTMLButtonElement>('[data-testid=approval] button')[0].click();
      http.expectOne('/api/cards/authentications/au1/approve').flush({ code: 'CARD_INVALID_STATE', detail: 'x' }, { status: 422, statusText: 'Unprocessable' });
      fixture.detectChanges();

      expect(text('approval-error')).toContain('expired or was already answered');
      http.expectOne('/api/cards/authentications').flush([]);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid=approval]')).toBeNull();
    });

    it('shows a generic message when the answer could not be sent', () => {
      open([waiting()]);

      el.querySelectorAll<HTMLButtonElement>('[data-testid=approval] button')[0].click();
      http.expectOne('/api/cards/authentications/au1/approve').flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(text('approval-error')).toContain('Something went wrong');
      http.expectOne('/api/cards/authentications').flush([waiting()]);
      fixture.detectChanges();
      expect(el.querySelectorAll('[data-testid=approval]').length).toBe(1);
    });

    it('never shows the number, the PIN or the code of the card', () => {
      open([waiting()]);
      expect(el.querySelector('[data-testid=approvals]')!.textContent).not.toContain(PAN);
    });
  });

  it('marks an online payment as such in the pending, posted and recent lists, and only that one', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({
      items: [authorization({ id: 'w1', merchantName: 'Web Shop', amount: '19.99', online: true }), authorization({ id: 's1', merchantName: 'Corner Cafe', amount: '9.00' })],
      page: 0, size: 2, totalElements: 2,
    });
    http.expectOne((r) => r.params.get('page') === '0').flush({
      items: [
        authorization({ id: 'w1', merchantName: 'Web Shop', amount: '19.99', online: true }),
        authorization({ id: 'w2', merchantName: 'Web Shop', amount: '30.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '30.00', capturedAt: '2026-10-06T09:00:00Z', online: true }),
        authorization({ id: 's2', merchantName: 'Corner Cafe', amount: '20.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '20.00', capturedAt: '2026-10-06T09:05:00Z' }),
      ],
      page: 0, size: 10, totalElements: 3,
    });
    fixture.detectChanges();

    const notes = (testId: string) => [...el.querySelector(`[data-testid=${testId}]`)!.querySelectorAll('[data-testid=online-note]')].map((n) => n.textContent?.trim());
    expect(notes('pending')).toEqual(['Online payment']);
    expect(notes('posted')).toEqual(['Online payment']);
    expect(notes('recent')).toEqual(['Online payment', 'Online payment']);
    expect(el.querySelector('[data-testid=posted] [data-posted=s2] [data-testid=online-note]')).toBeNull();
    expect(el.querySelector('[data-testid=cash-note]')).toBeNull();
  });

  it('shows an addition to an earlier payment as such while pending and as merged once the payment cleared', () => {
    loadData();
    click('Show activity');
    http.expectOne((r) => r.params.get('pending') === 'true').flush({
      items: [authorization({ id: 'p1', merchantName: 'Gas Station', amount: '50.00' }), authorization({ id: 'p2', merchantName: 'Gas Station', amount: '25.00', parentId: 'p1' })],
      page: 0, size: 2, totalElements: 2,
    });
    http.expectOne((r) => r.params.get('page') === '0').flush({
      items: [
        authorization({ id: 'p1', merchantName: 'Gas Station', amount: '50.00' }),
        authorization({ id: 'p2', merchantName: 'Gas Station', amount: '25.00', parentId: 'p1' }),
        authorization({ id: 'm1', merchantName: 'Gas Station', amount: '10.00', parentId: 'c1', status: 'MERGED', expiresAt: null }),
        authorization({ id: 'c1', merchantName: 'Gas Station', amount: '40.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '48.20', capturedAt: '2026-10-06T09:00:00Z' }),
      ],
      page: 0, size: 10, totalElements: 4,
    });
    fixture.detectChanges();

    const notes = (testId: string) => [...el.querySelector(`[data-testid=${testId}]`)!.querySelectorAll('[data-testid=increment-note]')].map((n) => n.textContent?.trim());
    expect(notes('pending')).toEqual(['Added to an earlier payment']);
    expect(notes('recent')).toEqual(['Added to an earlier payment', 'Added to an earlier payment']);
    expect(el.querySelector('[data-testid=recent]')!.textContent).toContain('Added to the payment');
    const posted = el.querySelector('[data-testid=posted]')!;
    expect(posted.querySelectorAll('li').length).toBe(1);
    expect(posted.textContent).toContain('$48.20');
    expect(posted.textContent).not.toContain('Added to an earlier payment');
  });

  it('tells a customer who owes the bank money, and why card payments fail', () => {
    http.expectOne('/api/cards').flush([card()]);
    http.expectOne('/api/accounts').flush([account()]);
    http.expectOne('/api/cards/owed').flush({ total: '5.50', items: [{ accountId: 'a1', amount: '5.50', outstanding: '5.50', createdAt: '2026-10-06T09:00:00Z' }] });
    fixture.detectChanges();

    expect(text('owed')).toContain('You owe the bank $5.50');
    expect(text('owed')).toContain('card payments are declined until then');
  });

  it('shows no debt line when nothing is owed or the amount cannot be loaded', () => {
    http.expectOne('/api/cards').flush([card()]);
    http.expectOne('/api/accounts').flush([account()]);
    http.expectOne('/api/cards/owed').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid=owed]')).toBeNull();
    expect(el.textContent).toContain('Cards');
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
    settleOwed();
    settleDisputes();
    settleApprovals();
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

describe('Cards page: disputes', () => {
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

  afterEach(() => {
    http.match('/api/cards/owed').forEach((r) => r.flush(NOTHING_OWED));
    http.match('/api/cards/authentications').forEach((r) => r.flush([]));
    http.verify();
  });

  const field = (id: string) => el.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
  const set = (id: string, value: string) => {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    fixture.detectChanges();
  };
  const text = (testId: string) => el.querySelector(`[data-testid=${testId}]`)?.textContent?.replace(/\s+/g, ' ').trim();
  const submitForm = () => {
    el.querySelector<HTMLFormElement>('[data-testid=dispute-form]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  /** The page with one card, the customer's disputes, and the activity of the card open with the given posted payments. */
  const open = (disputes: Dispute[], posted: CardAuthorization[]) => {
    http.expectOne('/api/cards').flush([card()]);
    http.expectOne('/api/accounts').flush([account()]);
    http.expectOne('/api/cards/disputes').flush(disputes);
    fixture.detectChanges();
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Show activity'))!.click();
    fixture.detectChanges();
    http.expectOne((r) => r.params.get('pending') === 'true').flush({ items: [], page: 0, size: 0, totalElements: 0 });
    http.expectOne((r) => r.params.get('page') === '0').flush({ items: posted, page: 0, size: 10, totalElements: posted.length });
    fixture.detectChanges();
  };
  const posted = (overrides: Partial<CardAuthorization> = {}) =>
    authorization({ id: 'p1', amount: '50.00', status: 'CAPTURED', expiresAt: null, capturedAmount: '57.50', capturedAt: '2026-10-06T09:00:00Z', ...overrides });

  it('offers a dispute for a posted payment that has none and hides the offer when one exists', () => {
    open([dispute({ authorizationId: 'p2' })], [posted(), posted({ id: 'p2', merchantName: 'Gas Station' })]);

    const first = el.querySelector('[data-posted=p1]')!;
    const second = el.querySelector('[data-posted=p2]')!;
    expect(first.querySelector('[data-testid=dispute-button]')).not.toBeNull();
    expect(first.querySelector('[data-testid=dispute-state]')).toBeNull();
    expect(second.querySelector('[data-testid=dispute-button]')).toBeNull();
    expect(second.querySelector('[data-testid=dispute-state]')!.textContent).toContain('Sent to the card network, waiting for its answer');
  });

  it('files a dispute with the reason, the note and the amount, and shows the credit and the new state', () => {
    open([], [posted()]);
    el.querySelector<HTMLButtonElement>('[data-testid=dispute-button]')!.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=dispute-button]')).toBeNull();

    set('dispute-reason', 'NOT_RECEIVED');
    set('dispute-amount', '40.00');
    set('dispute-note', '  never arrived  ');
    submitForm();

    const req = http.expectOne('/api/cards/payments/p1/dispute');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'NOT_RECEIVED', note: 'never arrived', amount: '40.00' });
    req.flush(dispute({ amount: '40.00', reason: 'NOT_RECEIVED' }));
    http.expectOne('/api/cards').flush([card({ availableBalance: '194.75' })]); // the balance changed
    fixture.detectChanges();

    expect(el.querySelector('[data-testid=dispute-form]')).toBeNull();
    expect(el.textContent).toContain('Dispute filed. 40.00 USD was credited to your account for now');
    expect(el.querySelector('[data-posted=p1] [data-testid=dispute-state]')!.textContent).toContain('Sent to the card network');
    expect(el.querySelector('[data-testid=disputes]')!.textContent).toContain('$40.00');
  });

  it('sends an empty amount and note as null: the whole payment, no note', () => {
    open([], [posted()]);
    el.querySelector<HTMLButtonElement>('[data-testid=dispute-button]')!.click();
    fixture.detectChanges();
    set('dispute-reason', 'OTHER');
    submitForm();

    const req = http.expectOne('/api/cards/payments/p1/dispute');
    expect(req.request.body).toEqual({ reason: 'OTHER', note: null, amount: null });
    req.flush(dispute());
    http.expectOne('/api/cards').flush([card()]);
  });

  it('sends nothing without a reason, with a badly written amount, or with more than the payment', () => {
    open([], [posted()]);
    el.querySelector<HTMLButtonElement>('[data-testid=dispute-button]')!.click();
    fixture.detectChanges();

    submitForm();
    http.expectNone('/api/cards/payments/p1/dispute');

    set('dispute-reason', 'OTHER');
    for (const bad of ['abc', '-5', '0', '0.00', '1.234']) {
      set('dispute-amount', bad);
      submitForm();
      http.expectNone('/api/cards/payments/p1/dispute');
    }
    set('dispute-amount', '57.51');
    submitForm();
    http.expectNone('/api/cards/payments/p1/dispute');
    expect(text('dispute-error')).toContain('at most 57.50');

    set('dispute-amount', '57.50');
    submitForm();
    http.expectOne('/api/cards/payments/p1/dispute').flush(dispute({ amount: '57.50' }));
    http.expectOne('/api/cards').flush([card()]);
  });

  it('shows the reason the server gives and lets the customer try again', () => {
    open([], [posted()]);
    el.querySelector<HTMLButtonElement>('[data-testid=dispute-button]')!.click();
    fixture.detectChanges();
    set('dispute-reason', 'OTHER');
    submitForm();
    http.expectOne('/api/cards/payments/p1/dispute').flush({ detail: 'This payment is more than 120 days old and can no longer be disputed.', code: 'DISPUTE_NOT_ALLOWED' },
      { status: 422, statusText: 'x' });
    fixture.detectChanges();

    expect(text('dispute-error')).toBe('This payment is more than 120 days old and can no longer be disputed.');
    expect(el.querySelector('[data-testid=dispute-form]')).not.toBeNull();

    submitForm();
    http.expectOne('/api/cards/payments/p1/dispute').flush('x', { status: 404, statusText: 'x' });
    fixture.detectChanges();
    expect(text('dispute-error')).toBe('That payment was not found.');

    submitForm();
    http.expectOne('/api/cards/payments/p1/dispute').flush('x', { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(text('dispute-error')).toBe('We could not file the dispute. Please try again.');
  });

  it('closes the form with Cancel and sends nothing', () => {
    open([], [posted()]);
    el.querySelector<HTMLButtonElement>('[data-testid=dispute-button]')!.click();
    fixture.detectChanges();
    [...el.querySelectorAll<HTMLButtonElement>('[data-testid=dispute-form] button')].find((b) => b.textContent?.includes('Cancel'))!.click();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid=dispute-form]')).toBeNull();
    expect(el.querySelector('[data-testid=dispute-button]')).not.toBeNull();
  });

  it('lists the disputes with their state in words, the time the shop has left, and how a closed one ended', () => {
    http.expectOne('/api/cards').flush([card()]);
    http.expectOne('/api/accounts').flush([account()]);
    http.expectOne('/api/cards/disputes').flush([
      dispute({ id: 'd1', status: 'FILED' }),
      dispute({ id: 'd2', status: 'OPEN', openedAt: '2026-10-07T10:01:00Z', answerDueAt: '2026-10-21T10:01:00Z', merchantName: 'Gas Station' }),
      dispute({ id: 'd3', status: 'WON', outcome: 'The shop did not answer in time: your credit is final.', merchantName: 'Kiosk' }),
      dispute({ id: 'd4', status: 'LOST', outcome: 'The shop answered with evidence: signed receipt', merchantName: 'Bakery' }),
    ]);
    fixture.detectChanges();

    const rows = [...el.querySelectorAll('[data-dispute]')].map((r) => r.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows.length).toBe(4);
    expect(rows[0]).toContain('Sent to the card network, waiting for its answer');
    expect(rows[1]).toContain('Under review: the shop can still answer until');
    expect(rows[1]).toContain('Oct 21');
    expect(rows[2]).toContain('Won: the credit is final');
    expect(rows[2]).toContain('The shop did not answer in time');
    expect(rows[3]).toContain('Lost: the credit was taken back');
    expect(rows[3]).toContain('signed receipt');
    expect(rows[0]).toContain('I did not make this payment');
  });

  it('shows no disputes section when there are none', () => {
    http.expectOne('/api/cards').flush([card()]);
    http.expectOne('/api/accounts').flush([account()]);
    http.expectOne('/api/cards/disputes').flush([]);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=disputes]')).toBeNull();
  });

  it('works without the list of disputes when it cannot be loaded', () => {
    http.expectOne('/api/cards').flush([card()]);
    http.expectOne('/api/accounts').flush([account()]);
    http.expectOne('/api/cards/disputes').flush('x', { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=disputes]')).toBeNull();
    expect(el.textContent).toContain('Everyday');
  });
});

describe('disputeAmountValidator', () => {
  const check = (value: string) => disputeAmountValidator(new FormControl(value, { nonNullable: true }));

  it('accepts an empty value (the whole payment) and positive amounts with up to two decimals', () => {
    for (const ok of ['', '  ', '0.01', '1', '57.5', '1234.56']) {
      expect(check(ok), ok).toBeNull();
    }
  });

  it('refuses zero, negatives, three decimals and text', () => {
    expect(check('0')).toEqual({ range: true });
    expect(check('0.00')).toEqual({ range: true });
    expect(check('-1')).toEqual({ format: true });
    expect(check('1.005')).toEqual({ format: true });
    expect(check('abc')).toEqual({ format: true });
    expect(check('12345678901')).toEqual({ format: true });
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
