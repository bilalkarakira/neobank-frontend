import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AccountsService } from './accounts.service';

describe('AccountsService', () => {
  let service: AccountsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AccountsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists accounts from GET /api/accounts', () => {
    service.list().subscribe((accounts) => expect(accounts).toEqual([]));
    const req = http.expectOne('/api/accounts');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('deposits with POST and an Idempotency-Key header', () => {
    service.deposit('acc-1', { amount: '10.00' }, 'key-123').subscribe();
    const req = http.expectOne('/api/accounts/acc-1/deposits');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-123');
    expect(req.request.body).toEqual({ amount: '10.00' });
    req.flush({});
  });

  it('loads the interest summary of a savings account', () => {
    service.interest('acc-1').subscribe((summary) => expect(summary.earnedThisYear).toBe('12.34'));
    const req = http.expectOne('/api/accounts/acc-1/interest');
    expect(req.request.method).toBe('GET');
    req.flush({ apyPercent: '3.50', earnedThisYear: '12.34', accruals: [] });
  });

  it('opens an account with POST /api/accounts', () => {
    service.open({ type: 'SAVINGS', nickname: 'Holiday' }).subscribe();
    const req = http.expectOne('/api/accounts');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ type: 'SAVINGS', nickname: 'Holiday' });
    req.flush({});
  });
});
