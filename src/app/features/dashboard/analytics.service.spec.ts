import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PERIODS } from './analytics.models';
import { AnalyticsService } from './analytics.service';

const P90 = PERIODS.find((p) => p.id === '90d')!;
const P12M = PERIODS.find((p) => p.id === '12m')!;

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AnalyticsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for all accounts when no account is chosen (no accountId parameter)', () => {
    service.summary(null).subscribe();
    const req = http.expectOne((r) => r.url === '/api/analytics/summary');
    expect(req.request.params.has('accountId')).toBe(false);
    req.flush({});
  });

  it('narrows to one account', () => {
    service.summary('acc-1').subscribe();
    http.expectOne((r) => r.url === '/api/analytics/summary').flush({});
    service.balanceHistory('acc-1', P90).subscribe();
    const req = http.expectOne((r) => r.url === '/api/analytics/balance-history');
    expect(req.request.params.get('accountId')).toBe('acc-1');
    expect(req.request.params.get('days')).toBe('90');
    req.flush([]);
  });

  it('maps the period to days, months and a category range', () => {
    service.cashflow(null, P12M).subscribe();
    const cashflow = http.expectOne((r) => r.url === '/api/analytics/cashflow');
    expect(cashflow.request.params.get('months')).toBe('12');
    cashflow.flush([]);

    // 365 days ending 2026-10-04 start on 2025-10-05 (both ends inclusive)
    service.spendingByCategory(null, P12M, new Date(Date.UTC(2026, 9, 4, 23, 30))).subscribe();
    const categories = http.expectOne((r) => r.url === '/api/analytics/spending-by-category');
    expect(categories.request.params.get('from')).toBe('2025-10-05');
    categories.flush({});
  });

  it('computes the category range in UTC, not in the local time zone', () => {
    service.spendingByCategory(null, P90, new Date(Date.UTC(2026, 0, 1, 0, 5))).subscribe();
    const req = http.expectOne((r) => r.url === '/api/analytics/spending-by-category');
    expect(req.request.params.get('from')).toBe('2025-10-04'); // 90 days ending 2026-01-01
    req.flush({});
  });
});
