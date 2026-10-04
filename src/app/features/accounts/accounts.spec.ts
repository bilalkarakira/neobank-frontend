import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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
  createdAt: '2026-10-04T10:00:00Z',
  ...overrides,
});

describe('Accounts', () => {
  let http: HttpTestingController;

  function render() {
    TestBed.configureTestingModule({
      imports: [Accounts],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Accounts);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('shows the empty state when there are no accounts', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([]);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('You have no accounts yet');
  });

  it('renders each account with a formatted IBAN, title and USD balance', () => {
    const fixture = render();
    http.expectOne('/api/accounts').flush([account(), account({ id: '2', type: 'SAVINGS', nickname: 'Holiday', balance: '0.00', iban: 'XX12NEOB1000000002' })]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(text).toContain('Checking account');
    expect(text).toContain('Holiday');
    expect(text).toContain('XX47 NEOB 1000 0000 01');
    expect(text).toContain('$1,250.50');
    expect(text).toContain('$0.00');
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
});
