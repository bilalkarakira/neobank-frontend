import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FileDownloader } from '../../core/file-downloader';
import { Account } from '../accounts/accounts.models';
import { History } from './history';
import { HistoryPage, TransactionItem } from './history.models';

const account = (id: string, nickname: string, iban: string): Account => ({
  id, iban, nickname, type: 'CHECKING', currency: 'USD', status: 'ACTIVE', balance: '0.00', availableBalance: '0.00', heldAmount: '0.00', createdAt: '',
});
const ACCOUNTS = [account('a', 'Daily', 'XX65NEOB1000000001'), account('b', 'Holiday', 'XX38NEOB1000000002')];

const item = (overrides: Partial<TransactionItem> = {}): TransactionItem => ({
  transactionId: 't1',
  type: 'TRANSFER',
  direction: 'OUT',
  amount: '-250.00',
  balanceAfter: '830.00',
  description: 'Rent share',
  category: null,
  counterparty: { label: 'Second U.', iban: 'XX11NEOB1000000003', ownAccount: false },
  createdAt: '2026-10-04T17:11:08Z',
  recurring: false,
  ...overrides,
});
const page = (items: TransactionItem[], extra: Partial<HistoryPage> = {}): HistoryPage => ({
  items, page: 0, size: 20, totalElements: items.length, totalPages: 1, ...extra,
});

describe('History page', () => {
  let http: HttpTestingController;
  let router: Router;
  let harness: RouterTestingHarness;
  let el: HTMLElement;
  const downloader = { save: vi.fn() };

  beforeEach(() => {
    downloader.save.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'history', component: History }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FileDownloader, useValue: downloader },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const listRequest = (): TestRequest => http.expectOne((r) => r.url === '/api/accounts/a/transactions');

  /** Opens /history?<query>, answers the accounts call and (when an account is selected) the first list call. */
  async function open(query: string, first: HistoryPage | null = page([item()])): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/history' + query, History);
    http.expectOne('/api/accounts').flush(ACCOUNTS);
    await harness.fixture.whenStable();
    if (first) {
      listRequest().flush(first);
    }
    harness.detectChanges();
    el = harness.routeNativeElement as HTMLElement;
  }

  const field = (id: string) => el.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(text))!;

  async function typeInto(id: string, value: string): Promise<void> {
    vi.useFakeTimers();
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    await vi.advanceTimersByTimeAsync(400); // the form is debounced
    vi.useRealTimers();
    await harness.fixture.whenStable();
  }

  it('selects the first account when the URL has none, and loads it with the default filters', async () => {
    await open('', null);

    expect(router.url).toBe('/history?account=a');
    const req = listRequest();
    expect(req.request.params.get('sort')).toBe('date,desc');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    req.flush(page([item()]));
  });

  it('shows rows with direction sign, counterparty, masked name, IBAN, note and UTC time', async () => {
    await open('?account=a', page([
      item(),
      item({ transactionId: 't2', direction: 'IN', amount: '100.00', balanceAfter: '1080.00', description: null,
        counterparty: { label: 'Cash deposit', iban: null, ownAccount: false } }),
    ]));

    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Second U.');
    expect(rows[0].textContent).toContain('XX11 NEOB 1000 0000 03');
    expect(rows[0].textContent).toContain('Rent share');
    expect(rows[0].textContent).toContain('2026-10-04 17:11');
    expect(rows[0].textContent).toContain('−$250.00');
    expect(rows[0].textContent).toContain('$830.00');
    expect(rows[0].querySelector('td.text-red-600')).not.toBeNull();
    expect(rows[1].textContent).toContain('+$100.00');
    expect(rows[1].querySelector('td.text-emerald-700')).not.toBeNull();
    expect(el.textContent).toContain('2 transactions');
  });

  it('marks payments made by a standing order, and only those, in both the table and the mobile list', async () => {
    await open('', page([
      item({ transactionId: 't-rec', description: 'Gym membership', recurring: true }),
      item({ transactionId: 't-plain', description: 'Lunch' }),
    ]));

    // only look at the results: the filter dropdown has "Recurring only" in it too
    const results = [...el.querySelectorAll('tbody tr, ul > li')];
    const badgesIn = (parts: Element[]) => parts.filter((p) => p.textContent?.includes('Recurring')).length;
    // the table row and the mobile card of the ONE recurring payment: two badges, none for the ordinary transfer
    expect(badgesIn(results)).toBe(2);
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.find((r) => r.textContent?.includes('Gym membership'))?.textContent).toContain('Recurring');
    expect(rows.find((r) => r.textContent?.includes('Lunch'))?.textContent).not.toContain('Recurring');
  });

  it('shows no badge at all when nothing is recurring', async () => {
    await open('', page([item()]));
    expect([...el.querySelectorAll('tbody tr, ul > li')].some((r) => r.textContent?.includes('Recurring'))).toBe(false);
  });

  it('offers a "Payments" filter with all, recurring only and not recurring', async () => {
    await open('', page([item()]));
    expect([...field('recurring').querySelectorAll('option')].map((o) => [o.value, o.textContent?.trim()])).toEqual([
      ['', 'All payments'], ['true', 'Recurring only'], ['false', 'Not recurring'],
    ]);
  });

  it('keeps the less common filters folded away until one of them is in use', async () => {
    await open('', page([item()]));
    const folded = el.querySelector('details')!;
    expect(folded.open).toBe(false);
    expect(folded.textContent).toContain('More filters');
    // the everyday ones stay in view, the rest live inside the fold
    expect(folded.contains(field('recurring'))).toBe(true);
    expect(folded.contains(field('minAmount'))).toBe(true);
    expect(folded.contains(field('type'))).toBe(false);
    expect(folded.contains(field('q'))).toBe(false);
  });

  it('opens the fold by itself when a filter inside it is active, so an active filter is never hidden', async () => {
    await open('?account=a&recurring=true', null);
    listRequest().flush(page([item({ recurring: true })]));
    harness.detectChanges();

    expect(el.querySelector('details')!.open).toBe(true);
  });

  it('restores the recurring filter from the URL and sends it to the server', async () => {
    await open('?account=a&recurring=true', null);

    const req = listRequest();
    expect(req.request.params.get('recurring')).toBe('true');
    req.flush(page([item({ recurring: true })]));
    harness.detectChanges();

    expect(field('recurring').value).toBe('true');
  });

  it('choosing "Recurring only" reloads from the first page and puts the filter in the URL', async () => {
    await open('?account=a&page=1', page([item()], { page: 1, totalElements: 41, totalPages: 3 }));

    await typeInto('recurring', 'true');

    expect(router.url).toBe('/history?account=a&recurring=true');
    const req = listRequest();
    expect(req.request.params.get('recurring')).toBe('true');
    expect(req.request.params.get('page')).toBe('0');
    req.flush(page([item({ recurring: true })]));
  });

  it('does not send the recurring parameter at all when it is "All payments"', async () => {
    await open('?account=a', null);
    const req = listRequest();
    expect(req.request.params.has('recurring')).toBe(false);
    req.flush(page([item()]));
  });

  it('shows the recurring filter as an active filter that "Clear filters" resets', async () => {
    await open('?account=a&recurring=false', page([item()]));
    expect(button('Clear filters')).toBeTruthy();

    button('Clear filters').click();
    await harness.fixture.whenStable();

    expect(router.url).toBe('/history?account=a');
    listRequest().flush(page([item()]));
  });

  it('exports with the same recurring filter', async () => {
    await open('?account=a&recurring=true', page([item({ recurring: true })]));

    button('Export CSV').click();
    const req = http.expectOne((r) => r.url === '/api/accounts/a/transactions/export.csv');
    expect(req.request.params.get('recurring')).toBe('true');
    req.flush(new Blob(['a,b']), {
      headers: { 'Content-Disposition': 'attachment; filename="neobank-x.csv"' },
    });
  });

  it('offers an Interest type filter and renders interest as money from the bank', async () => {
    await open('?account=a', page([
      item({ transactionId: 'i1', type: 'INTEREST', direction: 'IN', amount: '2.87', balanceAfter: '1002.87',
        description: 'Interest for September 2026', counterparty: { label: 'Interest earned', iban: null, ownAccount: false } }),
    ]));

    expect([...field('type').querySelectorAll('option')].map((o) => o.textContent?.trim())).toContain('Interest');
    const row = el.querySelector('tbody tr')!;
    expect(row.textContent).toContain('Interest earned');
    expect(row.textContent).toContain('Interest for September 2026');
    expect(row.textContent).toContain('+$2.87');
  });

  it('restores filters, paging and sort from the URL', async () => {
    await open('?account=a&type=TRANSFER&direction=OUT&min=10&max=99.5&q=rent&from=2026-03-01&sort=amount,asc&page=2&size=50', null);

    const req = listRequest();
    expect(req.request.params.get('type')).toBe('TRANSFER');
    expect(req.request.params.get('direction')).toBe('OUT');
    expect(req.request.params.get('minAmount')).toBe('10');
    expect(req.request.params.get('maxAmount')).toBe('99.5');
    expect(req.request.params.get('q')).toBe('rent');
    expect(req.request.params.get('from')).toBe('2026-03-01');
    expect(req.request.params.get('sort')).toBe('amount,asc');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('50');
    req.flush(page([item()], { page: 2, size: 50, totalElements: 101, totalPages: 3 }));
    harness.detectChanges();

    expect(field('q').value).toBe('rent');
    expect(field('type').value).toBe('TRANSFER');
    expect(field('minAmount').value).toBe('10');
    expect(el.textContent).toContain('Page 3 of 3');
  });

  it('searches after a pause in typing, resets to the first page, and puts the filter in the URL', async () => {
    await open('?account=a&page=1', page([item()], { page: 1, totalElements: 41, totalPages: 3 }));

    await typeInto('q', 'rent');

    expect(router.url).toBe('/history?account=a&q=rent');
    const req = listRequest();
    expect(req.request.params.get('q')).toBe('rent');
    expect(req.request.params.get('page')).toBe('0');
    req.flush(page([item()]));
  });

  it('does not send invalid amounts or an inverted date range', async () => {
    await open('?account=a');

    await typeInto('minAmount', '12.345');
    expect(router.url).toBe('/history?account=a');
    http.expectNone((r) => r.url === '/api/accounts/a/transactions');
    harness.detectChanges();
    expect(el.textContent).toContain('at most 2 decimals');

    await typeInto('minAmount', '');
    await typeInto('from', '2026-05-02');
    listRequest().flush(page([item()]));
    await typeInto('to', '2026-05-01');
    http.expectNone((r) => r.url === '/api/accounts/a/transactions');
    harness.detectChanges();
    expect(el.textContent).toContain('"From" must not be after "To"');
  });

  it('pages forward and back, and changing the page size returns to the first page', async () => {
    await open('?account=a', page([item()], { totalElements: 45, totalPages: 3 }));

    button('Next').click();
    await harness.fixture.whenStable();
    expect(router.url).toContain('page=1');
    const next = listRequest();
    expect(next.request.params.get('page')).toBe('1');
    next.flush(page([item()], { page: 1, totalElements: 45, totalPages: 3 }));
    harness.detectChanges();

    const sizeSelect = el.querySelector<HTMLSelectElement>('nav select')!;
    sizeSelect.value = '50';
    sizeSelect.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    const resized = listRequest();
    expect(resized.request.params.get('size')).toBe('50');
    expect(resized.request.params.get('page')).toBe('0');
    resized.flush(page([item()], { size: 50, totalElements: 45, totalPages: 1 }));
  });

  it('jumps to the last real page when the URL points past the end', async () => {
    await open('?account=a&page=5', page([], { page: 5, totalElements: 26, totalPages: 3 }));
    await harness.fixture.whenStable();

    expect(router.url).toBe('/history?account=a&page=2');
    const req = listRequest();
    expect(req.request.params.get('page')).toBe('2');
    req.flush(page([item()], { page: 2, totalElements: 26, totalPages: 3 }));
    harness.detectChanges();
    expect(el.textContent).toContain('Page 3 of 3');
  });

  it('does not redirect when the account simply has no transactions', async () => {
    await open('?account=a', page([], { totalElements: 0, totalPages: 0 }));
    await harness.fixture.whenStable();

    expect(router.url).toBe('/history?account=a');
    http.expectNone((r) => r.url === '/api/accounts/a/transactions');
  });

  it('disables Previous on the first page and Next on the last', async () => {
    await open('?account=a', page([item()], { totalElements: 45, totalPages: 3 }));
    expect(button('Previous').disabled).toBe(true);
    expect(button('Next').disabled).toBe(false);
  });

  it('toggles the sort when a column header is clicked', async () => {
    await open('?account=a');

    button('Date (UTC)').click();
    await harness.fixture.whenStable();
    let req = listRequest();
    expect(req.request.params.get('sort')).toBe('date,asc');
    req.flush(page([item()]));
    harness.detectChanges();

    button('Amount').click();
    await harness.fixture.whenStable();
    req = listRequest();
    expect(req.request.params.get('sort')).toBe('amount,desc');
    req.flush(page([item()]));
  });

  it('shows a plain empty state when the account has no transactions at all', async () => {
    await open('?account=a', page([]));
    expect(el.textContent).toContain('No transactions yet');
  });

  it('explains when filters match nothing and offers to clear them', async () => {
    await open('?account=a&q=zzz', page([]));
    expect(el.textContent).toContain('No transactions match your filters');

    button('Clear filters').click();
    await harness.fixture.whenStable();
    expect(router.url).toBe('/history?account=a');
    const req = listRequest();
    expect(req.request.params.has('q')).toBe(false);
    req.flush(page([item()]));
  });

  it('shows an error with a retry', async () => {
    await open('?account=a', null);
    listRequest().flush({}, { status: 500, statusText: 'Server Error' });
    harness.detectChanges();
    expect(el.textContent).toContain('Could not load the transactions');

    button('Try again').click();
    listRequest().flush(page([item()]));
    harness.detectChanges();
    expect(el.textContent).toContain('Second U.');
  });

  it('exports the current filters (without paging) and saves the file under the server-provided name', async () => {
    await open('?account=a&type=TRANSFER&q=rent&page=1', page([item()], { page: 1, totalElements: 41, totalPages: 3 }));

    button('Export CSV').click();
    const req = http.expectOne((r) => r.url === '/api/accounts/a/transactions/export.csv');
    expect(req.request.params.get('type')).toBe('TRANSFER');
    expect(req.request.params.get('q')).toBe('rent');
    expect(req.request.params.has('page')).toBe(false);
    req.flush(new Blob(['a,b']), {
      headers: { 'Content-Disposition': 'attachment; filename="neobank-XX65NEOB1000000001-2026-10-04.csv"' },
    });
    harness.detectChanges();

    expect(downloader.save).toHaveBeenCalledTimes(1);
    expect(downloader.save.mock.calls[0][1]).toBe('neobank-XX65NEOB1000000001-2026-10-04.csv');
    expect(el.textContent).not.toContain('limited to the first');
  });

  it('tells the user when the export was truncated, and reports export failures', async () => {
    await open('?account=a');

    button('Export CSV').click();
    http.expectOne((r) => r.url.endsWith('export.csv')).flush(new Blob(['x']), {
      headers: { 'Content-Disposition': 'attachment; filename="f.csv"', 'X-Export-Truncated': 'true' },
    });
    harness.detectChanges();
    expect(el.textContent).toContain('limited to the first 10,000 rows');

    button('Export CSV').click();
    http.expectOne((r) => r.url.endsWith('export.csv')).flush(new Blob(['boom']), { status: 500, statusText: 'Server Error' });
    harness.detectChanges();
    expect(el.textContent).toContain('Could not export');
  });
});
