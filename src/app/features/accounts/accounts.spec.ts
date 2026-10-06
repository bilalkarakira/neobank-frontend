import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Account } from './accounts.models';
import { Accounts } from './accounts';

const account = (overrides: Partial<Account> = {}): Account => ({
  id: '1',
  iban: 'XX47NEOB1000000001',
  type: 'CHECKING',
  currency: 'USD',
  status: 'ACTIVE',
  nickname: null,
  balance: '1250.50',
  availableBalance: overrides.balance ?? '1250.50',
  heldAmount: '0.00',
  createdAt: '2026-10-04T10:00:00Z',
  ...overrides,
});

describe('Accounts', () => {
  let http: HttpTestingController;

  function render() {
    TestBed.configureTestingModule({
      imports: [Accounts],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Accounts);
    fixture.detectChanges();
    return fixture;
  }

  // the debt banner is a nicety fetched next to the list: tests that do not care answer it with "nothing owed"
  afterEach(() => {
    http.match('/api/cards/owed').forEach((r) => r.flush({ total: '0.00', items: [] }));
    http.verify();
  });

  it('tells a customer who owes the bank money, and says nothing otherwise', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account()]);
    http.expectOne('/api/cards/owed').flush({ total: '5.50', items: [{ accountId: '1', amount: '5.50', outstanding: '5.50', createdAt: '2026-10-06T09:00:00Z' }] });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=owed]')?.textContent).toContain('You owe the bank $5.50');
    expect(el.querySelector('[data-testid=owed]')?.textContent).toContain('next deposit or refund');
  });

  it('shows no debt banner when nothing is owed or the amount cannot be loaded', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account()]);
    http.expectOne('/api/cards/owed').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=owed]')).toBeNull();
  });

  it('shows the empty state when there are no accounts', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([]);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('You have no accounts yet');
  });

  it('renders each account with a formatted IBAN, title and USD balance', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account(), account({ id: '2', type: 'SAVINGS', nickname: 'Holiday', balance: '0.00', iban: 'XX12NEOB1000000002' })]);
    http.expectOne('/api/accounts/2/interest').flush({ apyPercent: '3.50', earnedThisYear: '0.00', accruals: [] });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(text).toContain('Checking account');
    expect(text).toContain('Holiday');
    expect(text).toContain('XX47 NEOB 1000 0000 01');
    expect(text).toContain('$1,250.50');
    expect(text).toContain('$0.00');
  });

  it('shows the total balance across all accounts, and none when there are no accounts', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account({ balance: '1250.50' }), account({ id: '2', iban: 'XX12NEOB1000000002', balance: '49.50' })]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid=total-balance]')?.textContent).toContain('$1,300.00');
    expect(el.textContent).toContain('Across 2 accounts');
  });

  it('shows no total card before the first account exists', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=total-balance]')).toBeNull();
  });

  it('shows the interest rate and the interest earned this year on savings accounts only', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([
      account({ id: 'c', type: 'CHECKING' }),
      account({ id: 's', type: 'SAVINGS', nickname: 'Rainy day', interestRate: '3.50', iban: 'XX12NEOB1000000002' }),
    ]);
    // only the savings account asks for its interest (verify() in afterEach fails on any other request)
    http.expectOne('/api/accounts/s/interest').flush({ apyPercent: '3.50', earnedThisYear: '12.34', accruals: [] });
    fixture.detectChanges();

    const [checking, savings] = [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')];
    expect(savings.textContent).toContain('3.5% APY');
    expect(savings.textContent).toContain('Interest earned this year: $12.34');
    expect(checking.textContent).not.toContain('APY');
    expect(checking.textContent).not.toContain('Interest earned');
  });

  it('still shows a savings account when its interest cannot be loaded', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account({ id: 's', type: 'SAVINGS', interestRate: '3.50' })]);
    http.expectOne('/api/accounts/s/interest').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('3.5% APY');
    expect(text).not.toContain('Interest earned');
  });

  it('shows an error with a retry when loading fails', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role=alert]')?.textContent).toContain('Could not load your accounts');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Try again'))!.click();
    http.expectOne('/api/accounts').flush([]);
  });

  it('opens an account through the form and adds it to the top of the list', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account()]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Open account'))!.click();
    fixture.detectChanges();

    const nickname = el.querySelector<HTMLInputElement>('#nickname')!;
    nickname.value = '  Rainy day ';
    nickname.dispatchEvent(new Event('input'));
    // the radios render in the order CHECKING, SAVINGS (Angular keeps their values internally, not in the DOM)
    el.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click();
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    const req = http.expectOne('/api/accounts');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'SAVINGS', nickname: 'Rainy day' });
    req.flush(account({ id: '2', type: 'SAVINGS', nickname: 'Rainy day', balance: '0.00' }));
    fixture.detectChanges();

    const items = el.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Rainy day');
    expect(el.querySelector('form')).toBeNull();
  });

  it('deposits into one account, updates only that balance and shows a confirmation', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([
      account({ id: 'a', nickname: 'Daily', balance: '10.00' }),
      account({ id: 'b', nickname: 'Holiday', balance: '0.00', iban: 'XX12NEOB1000000002' }),
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const depositButtons = [...el.querySelectorAll('li > button')].filter((b) => b.textContent?.trim() === 'Deposit');
    (depositButtons[1] as HTMLButtonElement).click(); // the Holiday account
    fixture.detectChanges();

    const input = el.querySelector<HTMLInputElement>('li input')!;
    input.value = '75';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('li form')!.dispatchEvent(new Event('submit'));

    const req = http.expectOne('/api/accounts/b/deposits');
    expect(req.request.body).toEqual({ amount: '75.00' });
    req.flush({ transactionId: 't', accountId: 'b', amount: '75.00', balance: '75.00', createdAt: '' });
    fixture.detectChanges();

    const text = el.textContent!;
    expect(text).toContain('Deposited $75.00 into Holiday');
    expect(el.querySelectorAll('li')[0].textContent).toContain('$10.00'); // untouched
    expect(el.querySelectorAll('li')[1].textContent).toContain('$75.00');
    expect(el.querySelector('li form')).toBeNull(); // the form closed
  });

  it('offers no deposit button for accounts that are not active', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account({ status: 'FROZEN' })]);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Deposit');
  });

  it('shows the limit message from the server when the account limit is reached', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account()]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Open account'))!.click();
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    http.expectOne('/api/accounts').flush(
      { code: 'ACCOUNT_LIMIT_REACHED', detail: 'You can have at most 1 open checking account.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(el.querySelector('form [role=alert]')?.textContent).toContain('at most 1 open checking account');
    expect(el.querySelectorAll('li').length).toBe(1);
  });

  it('says how much is available when pending card payments reserve part of the balance', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account({ balance: '200.00', availableBalance: '154.75', heldAmount: '45.25' })]);
    fixture.detectChanges();

    const note = (fixture.nativeElement as HTMLElement).querySelector('[data-testid=held-note]')?.textContent?.replace(/\s+/g, ' ');
    expect(note).toContain('$154.75 available');
    expect(note).toContain('$45.25 reserved for card payments');
  });

  it('shows no reservation note when nothing is reserved', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account()]);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid=held-note]')).toBeNull();
  });

});
