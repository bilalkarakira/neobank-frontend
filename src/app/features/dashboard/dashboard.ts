import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  catchError,
  filter,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  scan,
  startWith,
  switchMap,
  take,
} from 'rxjs';
import { accountTitle } from '../accounts/account-title';
import { Account } from '../accounts/accounts.models';
import { AccountsService } from '../accounts/accounts.service';
import {
  BalancePoint,
  CashflowMonth,
  DEFAULT_PERIOD,
  PERIODS,
  Period,
  PeriodId,
  SpendingByCategory,
  Summary,
} from './analytics.models';
import { AnalyticsService } from './analytics.service';
import { ChartCanvas } from './chart-canvas';
import { balanceLineConfig, cashflowBarConfig, describeBalance, describeCashflow } from './chart-configs';
import {
  formatChange,
  formatDay,
  formatMoney,
  formatMonthLong,
} from './format';
import { readVizTheme } from './viz-theme';

/** A dashboard widget: while reloading it keeps showing its previous data (dimmed) instead of collapsing. */
export type Widget<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T; refreshing: boolean }
  | { status: 'error' };

interface DashboardQuery {
  accountId: string | null;
  period: Period;
}

@Component({
  selector: 'app-dashboard',
  imports: [ChartCanvas, RouterLink],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly accountsApi = inject(AccountsService);
  private readonly analytics = inject(AnalyticsService);

  protected readonly periods = PERIODS;
  protected readonly title = accountTitle;
  protected readonly formatMoney = formatMoney;
  protected readonly formatChange = formatChange;
  protected readonly formatDay = formatDay;
  protected readonly formatMonthLong = formatMonthLong;

  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly accountsFailed = signal(false);
  protected readonly balanceAsTable = signal(false);
  protected readonly cashflowAsTable = signal(false);

  private readonly reload$ = new BehaviorSubject(0);
  /** Analytics are only requested once we know the user has at least one account. */
  private readonly hasAccounts$ = new BehaviorSubject(false);

  /** The URL is the source of truth for the filters (so they survive reloads and can be bookmarked). */
  private readonly query$: Observable<DashboardQuery> = this.route.queryParamMap.pipe(
    map((params) => ({
      accountId: params.get('account') || null,
      period: PERIODS.find((p) => p.id === params.get('period')) ?? PERIODS.find((p) => p.id === DEFAULT_PERIOD)!,
    })),
  );

  protected readonly query = toSignal(this.query$, {
    initialValue: { accountId: null, period: PERIODS.find((p) => p.id === DEFAULT_PERIOD)! } as DashboardQuery,
  });

  protected readonly summary = this.widget<Summary>((q) => this.analytics.summary(q.accountId), (q) => q.accountId ?? '');
  protected readonly balance = this.widget<BalancePoint[]>((q) => this.analytics.balanceHistory(q.accountId, q.period));
  protected readonly cashflow = this.widget<CashflowMonth[]>((q) => this.analytics.cashflow(q.accountId, q.period));
  protected readonly categories = this.widget<SpendingByCategory>((q) => this.analytics.spendingByCategory(q.accountId, q.period));

  protected readonly balanceConfig = computed(() => {
    const w = this.balance();
    return w.status === 'ok' ? balanceLineConfig(w.data, readVizTheme()) : null;
  });
  protected readonly cashflowConfig = computed(() => {
    const w = this.cashflow();
    return w.status === 'ok' ? cashflowBarConfig(w.data, readVizTheme()) : null;
  });
  protected readonly balanceLabel = computed(() => {
    const w = this.balance();
    return w.status === 'ok' ? describeBalance(w.data) : '';
  });
  protected readonly cashflowLabel = computed(() => {
    const w = this.cashflow();
    return w.status === 'ok' ? describeCashflow(w.data) : '';
  });

  /** The widest bar is full width; the others are drawn relative to it (the share is printed beside each bar). */
  protected readonly categoryBars = computed(() => {
    const w = this.categories();
    if (w.status !== 'ok') {
      return [];
    }
    const max = Math.max(...w.data.categories.map((c) => Number(c.total)), 0);
    return w.data.categories.map((c) => ({ ...c, width: max === 0 ? 0 : (Number(c.total) / max) * 100 }));
  });

  constructor() {
    this.accountsApi.list().subscribe({
      next: (list) => {
        this.accounts.set(list);
        this.hasAccounts$.next(list.length > 0);
      },
      error: () => this.accountsFailed.set(true),
    });
  }

  protected selectedAccount(): Account | undefined {
    return (this.accounts() ?? []).find((a) => a.id === this.query().accountId);
  }

  protected setAccount(event: Event): void {
    this.navigate({ account: (event.target as HTMLSelectElement).value });
  }

  protected setPeriod(period: PeriodId): void {
    this.navigate({ period });
  }

  protected retry(): void {
    this.reload$.next(this.reload$.value + 1);
  }

  protected month(value: string): string {
    return formatMonthLong(value);
  }


  private navigate(patch: { account?: string; period?: PeriodId }): void {
    const current = this.query();
    const account = patch.account ?? current.accountId ?? '';
    const period = patch.period ?? current.period.id;
    const queryParams: Record<string, string> = {};
    if (account) queryParams['account'] = account;
    if (period !== DEFAULT_PERIOD) queryParams['period'] = period;
    void this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  /**
   * Builds a widget signal from a fetch function. `distinct` limits refetching to the inputs the widget really
   * depends on (the summary ignores the period). Previous data stays on screen while a refetch is in flight.
   */
  private widget<T>(fetch: (q: DashboardQuery) => Observable<T>, distinct?: (q: DashboardQuery) => string) {
    type Event = { kind: 'loading' } | { kind: 'error' } | { kind: 'data'; data: T };
    const queries = distinct ? this.query$.pipe(distinctUntilChanged((a, b) => distinct(a) === distinct(b))) : this.query$;
    return toSignal(
      combineLatest([queries, this.reload$, this.hasAccounts$.pipe(filter(Boolean), take(1))]).pipe(
        switchMap(([q]) =>
          fetch(q).pipe(
            map((data): Event => ({ kind: 'data', data })),
            catchError(() => of<Event>({ kind: 'error' })),
            startWith<Event>({ kind: 'loading' }),
          ),
        ),
        scan(
          (state: Widget<T>, event: Event): Widget<T> => {
            if (event.kind === 'loading') {
              return state.status === 'ok' ? { ...state, refreshing: true } : { status: 'loading' };
            }
            return event.kind === 'error' ? { status: 'error' } : { status: 'ok', data: event.data, refreshing: false };
          },
          { status: 'loading' } as Widget<T>,
        ),
      ),
      { initialValue: { status: 'loading' } as Widget<T> },
    );
  }
}
