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
  id, iban, nickname, type: 'CHECKING', currency: 'USD', status: 'ACTIVE', balance: '0.00', createdAt: '',
});
const ACCOUNTS = [account('a', 'Daily', 'XX65NEOB1000000001'), account('b', 'Holiday', 'XX38NEOB1000000002')];

const item = (overrides: Partial<TransactionItem> = {}): TransactionItem => ({
  transactionId: 't1',
  type: 'TRANSFER',
  direction: 'OUT',
  amount: '-250.00',
  balanceAfter: '830.00',
  description: 'Rent share',
  counterparty: { label: 'Second U.', iban: 'XX11NEOB1000000003', ownAccount: false },
  createdAt: '2026-10-04T17:11:08Z',
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
