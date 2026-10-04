import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Account, DepositResponse } from './accounts.models';
import { DepositForm } from './deposit-form';

const ACCOUNT: Account = {
  id: 'acc-1',
  iban: 'XX47NEOB1000000001',
  type: 'CHECKING',
  currency: 'USD',
  status: 'ACTIVE',
  nickname: null,
  balance: '0.00',
  createdAt: '2026-10-04T10:00:00Z',
};

describe('DepositForm', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DepositForm>;
  let el: HTMLElement;
  let emitted: DepositResponse[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DepositForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DepositForm);
    fixture.componentRef.setInput('account', ACCOUNT);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    emitted = [];
    fixture.componentInstance.deposited.subscribe((r) => emitted.push(r));
  });

  afterEach(() => http.verify());

  const type = (value: string) => {
    const input = el.querySelector<HTMLInputElement>('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const submitButton = () => el.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const expectDeposit = (): TestRequest => http.expectOne('/api/accounts/acc-1/deposits');
  const RESPONSE: DepositResponse = {
    transactionId: 't1',
    accountId: 'acc-1',
    amount: '25.50',
    balance: '25.50',
    createdAt: '2026-10-04T10:00:00Z',
  };

  it('accepts only valid amounts: positive, at most 2 decimals, at most 10,000', () => {
    for (const bad of ['', '0', '0.00', '-5', '1.005', 'abc', '10000.01', '100000']) {
      type(bad);
      expect(submitButton().disabled, `"${bad}" should be invalid`).toBe(true);
    }
    for (const good of ['0.01', '25', '25.5', '25.50', '10000', '10000.00']) {
      type(good);
      expect(submitButton().disabled, `"${good}" should be valid`).toBe(false);
    }
  });

  it('quick-pick chips fill the amount', () => {
    const chips = [...el.querySelectorAll<HTMLButtonElement>('button[type=button]')].filter((b) =>
      b.textContent?.includes('$'),
    );
    chips[1].click();
    fixture.detectChanges();

    expect(el.querySelector<HTMLInputElement>('input')!.value).toBe('100');
    expect(submitButton().disabled).toBe(false);
  });

  it('sends the amount with two decimals and an Idempotency-Key header, then emits the result', () => {
    type('25.5');
    submit();

    const req = expectDeposit();
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ amount: '25.50' });
    expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
    req.flush(RESPONSE);

    expect(emitted).toEqual([RESPONSE]);
  });

  it('reuses the same key when retrying after a network failure, so the server cannot double-credit', () => {
    type('25.50');
    submit();
    const first = expectDeposit();
    const key = first.request.headers.get('Idempotency-Key');
    first.error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('will not be counted twice');

    submit();
    const retry = expectDeposit();
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(RESPONSE);
  });

  it('reuses the key after a server error (5xx) too', () => {
    type('25.50');
    submit();
    const first = expectDeposit();
    const key = first.request.headers.get('Idempotency-Key');
    first.flush({}, { status: 503, statusText: 'Unavailable' });

    submit();
    const retry = expectDeposit();
    expect(retry.request.headers.get('Idempotency-Key')).toBe(key);
    retry.flush(RESPONSE);
  });

  it('uses a new key after the server definitively rejects the request, and after the amount changes', () => {
    type('25.50');
    submit();
    const rejected = expectDeposit();
    const key1 = rejected.request.headers.get('Idempotency-Key');
    rejected.flush({ code: 'ACCOUNT_NOT_ACTIVE' }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('not active');

    submit();
    const second = expectDeposit();
    const key2 = second.request.headers.get('Idempotency-Key');
    expect(key2).not.toBe(key1);
    second.error(new ProgressEvent('error')); // outcome unknown: key stays reserved for this amount

    type('30');
    submit();
    const third = expectDeposit();
    expect(third.request.headers.get('Idempotency-Key')).not.toBe(key2);
    third.flush(RESPONSE);
  });

  it('ignores a second submit while the first is still in flight (double click)', () => {
    type('25.50');
    submit();
    submit();

    expectDeposit().flush(RESPONSE); // expectOne fails if two requests were sent
    expect(emitted.length).toBe(1);
  });
});
