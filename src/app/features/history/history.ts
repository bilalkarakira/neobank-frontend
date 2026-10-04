import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, debounceTime, map, of, startWith, switchMap } from 'rxjs';
import { FileDownloader } from '../../core/file-downloader';
import { accountTitle } from '../accounts/account-title';
import { Account } from '../accounts/accounts.models';
import { AccountsService } from '../accounts/accounts.service';
import { formatIban } from '../accounts/iban';
import { DEFAULT_FILTER, HistoryQuery, PAGE_SIZES, parseQuery, toQueryParams } from './history-query';
import { HistoryFilter, HistoryState, SortOption, TransactionItem } from './history.models';
import { HistoryService } from './history.service';

const AMOUNT_FORMAT = /^\d{1,9}(\.\d{1,2})?$/;

@Component({
  selector: 'app-history',
  imports: [ReactiveFormsModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './history.html',
})
export class History {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly accountsApi = inject(AccountsService);
  private readonly historyApi = inject(HistoryService);
  private readonly downloader = inject(FileDownloader);

  protected readonly title = accountTitle;
  protected readonly formatIban = formatIban;
  protected readonly pageSizes = PAGE_SIZES;

  protected readonly accounts = signal<Account[] | null>(null);
  protected readonly accountsFailed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly exportError = signal<string | null>(null);

  private readonly reload$ = new BehaviorSubject(0);

  /** The URL is the single source of truth for what is shown. */
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(parseQuery)), {
    initialValue: { accountId: null, filter: DEFAULT_FILTER } as HistoryQuery,
  });

  protected readonly state = toSignal(
    combineLatest([this.route.queryParamMap.pipe(map(parseQuery)), this.reload$]).pipe(
      switchMap(([{ accountId, filter }]) => {
        if (!accountId) {
          return of<HistoryState>({ status: 'idle' });
        }
        return this.historyApi.list(accountId, filter).pipe(
          map((page): HistoryState => ({ status: 'ok', page })),
          startWith<HistoryState>({ status: 'loading' }),
          catchError(() => of<HistoryState>({ status: 'error' })),
        );
      }),
    ),
    { initialValue: { status: 'idle' } as HistoryState },
  );

  protected readonly form = this.fb.group(
    {
      account: [''],
      from: [''],
      to: [''],
      type: [''],
      direction: [''],
      minAmount: ['', Validators.pattern(AMOUNT_FORMAT)],
      maxAmount: ['', Validators.pattern(AMOUNT_FORMAT)],
      q: ['', Validators.maxLength(100)],
    },
    { validators: [dateOrder, amountOrder] },
  );

  constructor() {
    // URL -> form (without echoing the change back into the URL)
    this.route.queryParamMap.pipe(map(parseQuery), takeUntilDestroyed()).subscribe(({ accountId, filter }) => {
      this.form.patchValue(
        {
          account: accountId ?? '',
          from: filter.from,
          to: filter.to,
          type: filter.type,
          direction: filter.direction,
          minAmount: filter.minAmount,
          maxAmount: filter.maxAmount,
          q: filter.q,
        },
        { emitEvent: false },
      );
    });

    // form -> URL, debounced so typing does not fire a request per keystroke; invalid input is never sent
    this.form.valueChanges.pipe(debounceTime(350), takeUntilDestroyed()).subscribe(() => {
      if (this.form.valid) {
        const v = this.form.getRawValue();
        this.navigate(
          {
            from: v.from,
            to: v.to,
            type: v.type as HistoryFilter['type'],
            direction: v.direction as HistoryFilter['direction'],
            minAmount: v.minAmount.trim(),
            maxAmount: v.maxAmount.trim(),
            q: v.q.trim(),
            page: 0,
          },
          v.account,
        );
      }
    });

    // A stale or bookmarked URL can point past the last page (e.g. after filtering): go to the real last page.
    effect(() => {
      const s = this.state();
      if (s.status === 'ok' && s.page.totalPages > 0 && s.page.page >= s.page.totalPages) {
        this.navigate({ page: s.page.totalPages - 1 }, undefined, true);
      }
    });

    this.accountsApi.list().subscribe({
      next: (list) => {
        this.accounts.set(list);
        if (!this.query().accountId && list.length > 0) {
          this.navigate({}, list[0].id, true);
        }
      },
      error: () => this.accountsFailed.set(true),
    });
  }

  protected retry(): void {
    this.reload$.next(this.reload$.value + 1);
  }

  /** Merges changes into the current URL state. Changing filters or sort goes back to the first page. */
  protected navigate(patch: Partial<HistoryFilter>, accountId?: string, replaceUrl = false): void {
    const current = this.query();
    const filter = { ...current.filter, ...patch };
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toQueryParams(accountId ?? current.accountId, filter),
      replaceUrl,
    });
  }

  protected goToPage(page: number): void {
    this.navigate({ page });
  }

  protected setPageSize(event: Event): void {
    this.navigate({ size: Number((event.target as HTMLSelectElement).value), page: 0 });
  }

  protected toggleSort(column: 'date' | 'amount'): void {
    const current = this.query().filter.sort;
    const next: SortOption =
      current === `${column},desc` ? (`${column},asc` as SortOption) : (`${column},desc` as SortOption);
    this.navigate({ sort: next, page: 0 });
  }

  protected sortIndicator(column: 'date' | 'amount'): string {
    const sort = this.query().filter.sort;
    return sort === `${column},desc` ? '↓' : sort === `${column},asc` ? '↑' : '';
  }

  protected ariaSort(column: 'date' | 'amount'): 'ascending' | 'descending' | 'none' {
    const sort = this.query().filter.sort;
    return sort === `${column},desc` ? 'descending' : sort === `${column},asc` ? 'ascending' : 'none';
  }

  protected hasFilters(): boolean {
    const f = this.query().filter;
    return !!(f.from || f.to || f.type || f.direction || f.minAmount || f.maxAmount || f.q);
  }

  protected clearFilters(): void {
    const accountId = this.query().accountId;
    void this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams(accountId, DEFAULT_FILTER) });
  }

  protected exportCsv(): void {
    const { accountId, filter } = this.query();
    if (!accountId || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.exportError.set(null);
    this.notice.set(null);
    this.historyApi.exportCsv(accountId, filter).subscribe({
      next: (response) => {
        this.exporting.set(false);
        const header = response.headers.get('Content-Disposition') ?? '';
        const filename = /filename="?([^";]+)"?/.exec(header)?.[1] ?? 'neobank-transactions.csv';
        this.downloader.save(response.body as Blob, filename);
        if (response.headers.get('X-Export-Truncated') === 'true') {
          this.notice.set('The export was limited to the first 10,000 rows. Narrow the filters to export the rest.');
        }
      },
      error: () => {
        this.exporting.set(false);
        this.exportError.set('Could not export the transactions. Please try again.');
      },
    });
  }

  protected selectedAccount(): Account | undefined {
    return (this.accounts() ?? []).find((a) => a.id === this.query().accountId);
  }

  protected amountNumber(value: string): number {
    return Math.abs(Number(value));
  }

  protected sign(item: TransactionItem): string {
    return item.direction === 'IN' ? '+' : '−';
  }

  protected firstRow(page: { page: number; size: number }): number {
    return page.page * page.size + 1;
  }
}

/** "From" must not be after "To" (both optional). */
function dateOrder(group: AbstractControl): ValidationErrors | null {
  const from = group.get('from')?.value as string;
  const to = group.get('to')?.value as string;
  return from && to && from > to ? { dateOrder: true } : null;
}

/** "Min" must not be greater than "Max" (both optional). */
function amountOrder(group: AbstractControl): ValidationErrors | null {
  const min = group.get('minAmount')?.value as string;
  const max = group.get('maxAmount')?.value as string;
  return min && max && AMOUNT_FORMAT.test(min) && AMOUNT_FORMAT.test(max) && Number(min) > Number(max)
    ? { amountOrder: true }
    : null;
}
