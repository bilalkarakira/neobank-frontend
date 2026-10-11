import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Account } from '../accounts/accounts.models';
import { BalancePoint, CashflowMonth, SpendingByCategory, Summary } from './analytics.models';
import { CHART_FACTORY, ChartFactory } from './chart-canvas';
import { Dashboard } from './dashboard';

// no real canvas in the test DOM: the page is given a factory that records the charts it asks for
type Recorded = { canvas: HTMLCanvasElement; config: { type: string }; destroy: () => void };
const created: Recorded[] = [];
const recorder: ChartFactory = (canvas, config) => {
  const chart: Recorded = { canvas, config: config as unknown as { type: string }, destroy: vi.fn() };
  created.push(chart);
  return chart;
};
const charts = () => created;

const ACCOUNTS: Account[] = [
  { id: 'a', iban: 'XX65NEOB1000000001', type: 'CHECKING', currency: 'USD', status: 'ACTIVE', nickname: 'Daily', balance: '0', availableBalance: '0', heldAmount: '0.00', createdAt: '' },
  { id: 'b', iban: 'XX38NEOB1000000002', type: 'SAVINGS', currency: 'USD', status: 'ACTIVE', nickname: 'Holiday', balance: '0', availableBalance: '0', heldAmount: '0.00', createdAt: '' },
];
const SUMMARY: Summary = {
  currency: 'USD',
  totalBalance: '2764.50',
  thisMonth: { month: '2026-10', income: '1557.50', spending: '270.00', net: '1287.50' },
  lastMonth: { month: '2026-09', income: '1000.00', spending: '300.00', net: '700.00' },
  changePercent: { income: 55.8, spending: -10.0, net: null },
};
const BALANCE: BalancePoint[] = [
  { date: '2026-10-03', balance: '100.00' },
  { date: '2026-10-04', balance: '2764.50' },
];
const CASHFLOW: CashflowMonth[] = [
  { month: '2026-09', income: '1000.00', spending: '300.00' },
  { month: '2026-10', income: '1557.50', spending: '270.00' },
];
const CATEGORIES: SpendingByCategory = {
  from: '2026-07-07', to: '2026-10-04', total: '300.00',
  categories: [
    { name: 'Housing', total: '200.00', share: 66.7 },
    { name: 'Dining', total: '75.00', share: 25.0 },
    { name: 'Uncategorized', total: '25.00', share: 8.3 },
  ],
};

describe('Dashboard', () => {
  let http: HttpTestingController;
  let router: Router;
  let harness: RouterTestingHarness;
  let el: HTMLElement;

  beforeEach(() => {
    charts().length = 0;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'dashboard', component: Dashboard }]), provideHttpClient(), provideHttpClientTesting(),
        { provide: CHART_FACTORY, useValue: recorder },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  const call = (name: string): TestRequest => http.expectOne((r) => r.url === `/api/analytics/${name}`);
  const none = (name: string) => http.expectNone((r) => r.url === `/api/analytics/${name}`);

  async function open(query = '', accounts: Account[] = ACCOUNTS): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/dashboard' + query, Dashboard);
    http.expectOne('/api/accounts').flush(accounts);
    harness.detectChanges();
    el = harness.routeNativeElement as HTMLElement;
  }

  function answerAll() {
    call('summary').flush(SUMMARY);
    call('balance-history').flush(BALANCE);
    call('cashflow').flush(CASHFLOW);
    call('spending-by-category').flush(CATEGORIES);
    harness.detectChanges();
  }

  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(text))!;

  it('loads all four views for all accounts over the default 90 days', async () => {
    await open();

    const summary = call('summary');
    expect(summary.request.params.has('accountId')).toBe(false);
    const balance = call('balance-history');
    expect(balance.request.params.get('days')).toBe('90');
    const cashflow = call('cashflow');
    expect(cashflow.request.params.get('months')).toBe('3');
    const categories = call('spending-by-category');
    expect(categories.request.params.has('from')).toBe(true);
    balance.flush(BALANCE); cashflow.flush(CASHFLOW); categories.flush(CATEGORIES);
    summary.flush(SUMMARY);
  });

  it('shows one hero figure, supporting tiles, and the change with a direction glyph', async () => {
    await open();
    answerAll();

    const text = el.textContent!;
    expect(el.querySelectorAll('[data-testid=hero-figure]').length).toBe(1); // exactly one hero figure
    expect(text).toContain('$2,764.50');
    expect(text).toContain('Income in October 2026');
    expect(text).toContain('$1,557.50');
    expect(text).toContain('▲ 55.8% vs last month');
    expect(text).toContain('▼ 10.0% vs last month');
  });

  it('draws the balance line and the income-vs-spending columns, with a legend for the two-series chart', async () => {
    await open();
    answerAll();

    expect(charts().map((c) => c.config.type).sort()).toEqual(['bar', 'line']);
    const legend = el.querySelector('ul[aria-label=Legend]')!;
    expect(legend.textContent).toContain('Income');
    expect(legend.textContent).toContain('Spending');
    // every chart has a text alternative on its canvas
    const labels = [...el.querySelectorAll('canvas')].map((c) => c.getAttribute('aria-label'));
    expect(labels.length).toBe(2);
    expect(labels.every((l) => !!l && l.length > 20)).toBe(true);
  });

  it('shows spending by category as sorted bars with amounts and shares, widest bar first', async () => {
    await open();
    answerAll();

    const rows = [...el.querySelectorAll('section[aria-labelledby=categories-title] li')];
    expect(rows.map((r) => r.querySelector('span.font-medium')?.textContent)).toEqual(['Housing', 'Dining', 'Uncategorized']);
    expect(rows[0].textContent).toContain('$200.00 · 66.7%');
    const widths = rows.map((r) => (r.querySelector('div.bg-\\[var\\(--viz-spending\\)\\]') as HTMLElement).style.width);
    expect(widths[0]).toBe('100%');
    expect(parseFloat(widths[1])).toBeCloseTo(37.5, 1);
    expect(parseFloat(widths[2])).toBeCloseTo(12.5, 1);
    expect(el.textContent).toContain('Total $300.00');
  });

  it('says so when there is no spending in the period', async () => {
    await open();
    call('summary').flush(SUMMARY);
    call('balance-history').flush(BALANCE);
    call('cashflow').flush(CASHFLOW);
    call('spending-by-category').flush({ ...CATEGORIES, total: '0.00', categories: [] });
    harness.detectChanges();

    expect(el.textContent).toContain('No spending in this period.');
  });

  it('every chart has a table view with the same numbers', async () => {
    await open();
    answerAll();

    button('Show data as table').click(); // the first one: balance
    harness.detectChanges();
    expect(el.querySelector('canvas[aria-label^="Line chart"]')).toBeNull();
    expect(el.textContent).toContain('2026-10-04');
    expect(el.textContent).toContain('$2,764.50');

    button('Show data as table').click(); // the remaining one: cash flow
    harness.detectChanges();
    expect(el.textContent).toContain('September 2026');
    expect(el.textContent).toContain('$270.00');
    expect(el.querySelectorAll('canvas').length).toBe(0);

    button('Show chart').click();
    harness.detectChanges();
    expect(el.querySelectorAll('canvas').length).toBe(1);
  });

  it('a longer period refetches the charts but not the summary, keeps the old charts dimmed, and updates the URL', async () => {
    await open();
    answerAll();

    button('Last 12 months').click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(router.url).toBe('/dashboard?period=12m');
    none('summary'); // the summary does not depend on the period
    const balance = call('balance-history');
    expect(balance.request.params.get('days')).toBe('365');
    const cashflow = call('cashflow');
    expect(cashflow.request.params.get('months')).toBe('12');
    const categories = call('spending-by-category');
    // refetch keeps the frame: the previous chart stays on screen at reduced opacity, no skeleton
    expect(el.querySelectorAll('canvas').length).toBe(2);
    expect(el.querySelectorAll('.opacity-50').length).toBeGreaterThanOrEqual(2);
    expect(el.querySelector('.animate-pulse')).toBeNull();

    balance.flush(BALANCE); cashflow.flush(CASHFLOW); categories.flush(CATEGORIES);
    harness.detectChanges();
    expect(el.querySelectorAll('.opacity-50').length).toBe(0);
    expect(button('Last 12 months').getAttribute('aria-pressed')).toBe('true');
  });

  it('choosing an account scopes every view to it', async () => {
    await open();
    answerAll();

    const select = el.querySelector<HTMLSelectElement>('#dash-account')!;
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    expect(router.url).toBe('/dashboard?account=b');
    for (const name of ['summary', 'balance-history', 'cashflow', 'spending-by-category']) {
      const req = call(name);
      expect(req.request.params.get('accountId')).toBe('b');
      req.flush(name === 'summary' ? SUMMARY : name === 'balance-history' ? BALANCE : name === 'cashflow' ? CASHFLOW : CATEGORIES);
    }
  });

  it('restores account and period from the URL', async () => {
    await open('?account=a&period=30d');

    expect(call('summary').request.params.get('accountId')).toBe('a');
    const balance = call('balance-history');
    expect(balance.request.params.get('days')).toBe('30');
    expect(balance.request.params.get('accountId')).toBe('a');
    call('cashflow'); call('spending-by-category');
    expect(button('Last 30 days').getAttribute('aria-pressed')).toBe('true');
    balance.flush(BALANCE);
  });

  it('one failing chart does not break the page, and can be retried', async () => {
    await open();
    call('summary').flush(SUMMARY);
    call('balance-history').flush({}, { status: 500, statusText: 'Server Error' });
    call('cashflow').flush(CASHFLOW);
    call('spending-by-category').flush(CATEGORIES);
    harness.detectChanges();

    expect(el.textContent).toContain('Could not load the balance history');
    expect(el.textContent).toContain('$2,764.50'); // the rest still shows
    expect(el.textContent).toContain('Housing');

    button('Try again').click();
    // a retry refetches the widgets; answer them
    call('summary').flush(SUMMARY);
    call('balance-history').flush(BALANCE);
    call('cashflow').flush(CASHFLOW);
    call('spending-by-category').flush(CATEGORIES);
    harness.detectChanges();
    expect(el.textContent).not.toContain('Could not load the balance history');
    expect(charts().some((c) => c.config.type === 'line')).toBe(true);
  });

  it('welcomes a user with no accounts and does not call analytics', async () => {
    await open('', []);

    expect(el.textContent).toContain('Welcome to NeoBank');
    expect(el.textContent).toContain('Open an account');
    http.expectNone((r) => r.url.startsWith('/api/analytics/')); // nothing to analyse yet: no requests at all
  });
});
