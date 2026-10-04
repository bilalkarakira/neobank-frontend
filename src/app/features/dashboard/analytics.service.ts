import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BalancePoint, CashflowMonth, Period, SpendingByCategory, Summary } from './analytics.models';

/** Every call takes an optional account id: null means "all my accounts". */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  summary(accountId: string | null): Observable<Summary> {
    return this.http.get<Summary>('/api/analytics/summary', { params: this.params(accountId) });
  }

  balanceHistory(accountId: string | null, period: Period): Observable<BalancePoint[]> {
    return this.http.get<BalancePoint[]>('/api/analytics/balance-history', {
      params: this.params(accountId, { days: String(period.days) }),
    });
  }

  cashflow(accountId: string | null, period: Period): Observable<CashflowMonth[]> {
    return this.http.get<CashflowMonth[]>('/api/analytics/cashflow', {
      params: this.params(accountId, { months: String(period.months) }),
    });
  }

  /** The category breakdown covers the same span as the balance chart: the last {period.days} days, UTC. */
  spendingByCategory(accountId: string | null, period: Period, today: Date = new Date()): Observable<SpendingByCategory> {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (period.days - 1)));
    return this.http.get<SpendingByCategory>('/api/analytics/spending-by-category', {
      params: this.params(accountId, { from: from.toISOString().slice(0, 10) }),
    });
  }

  private params(accountId: string | null, extra: Record<string, string> = {}): HttpParams {
    const fromObject: Record<string, string> = { ...extra };
    if (accountId) {
      fromObject['accountId'] = accountId;
    }
    return new HttpParams({ fromObject });
  }
}
