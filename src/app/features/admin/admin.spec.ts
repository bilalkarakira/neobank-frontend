import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Admin } from './admin';
import { AdminAccount, AdminAccountPage, AuditEntry, Overview, Reconciliation } from './admin.models';

const OVERVIEW: Overview = {
  generatedAt: '2026-10-04T12:00:00Z',
  customers: 12,
  accounts: { active: 20, frozen: 2, closed: 1 },
  depositsHeld: '12345.60',
  transfersLast24Hours: { count: 4, amount: '300.00' },
  transfersLast30Days: { count: 40, amount: '9000.00' },
  interestPaid: '55.25',
  recurring: { active: 3, paused: 1, failedRunsLast7Days: 2 },
};
const HEALTHY: Reconciliation = {
  healthy: true,
  totalOfAllEntries: '0.00',
  accountsWithWrongBalance: [],
  customerAccountsBelowZero: [],
};

const account = (overrides: Partial<AdminAccount> = {}): AdminAccount => ({
  id: 'a1',
  iban: 'XX65NEOB1000000001',
  type: 'CHECKING',
  status: 'ACTIVE',
  balance: '500.00',
  ownerEmail: 'alice@example.com',
  ownerName: 'Alice Kim',
  createdAt: '2026-10-01T10:00:00Z',
  ...overrides,
});
const pageOf = (items: AdminAccount[], total = items.length, page = 0): AdminAccountPage => ({
  items,
  total,
  page,
  size: 20,
});

describe('Admin page', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Admin>;
  let el: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      imports: [Admin],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Admin);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  const loadOverview = (reconciliation: Reconciliation = HEALTHY) => {
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    http.expectOne('/api/admin/reconciliation').flush(reconciliation);
    fixture.detectChanges();
  };
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().includes(text))!;
  const click = (text: string) => {
    button(text).click();
    fixture.detectChanges();
  };
  const field = (id: string) => el.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!;
  const set = (id: string, value: string) => {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
    fixture.detectChanges();
  };
  const openAccounts = (items: AdminAccount[] = [account()], total = items.length) => {
    loadOverview();
    click('Accounts');
    http.expectOne((r) => r.url === '/api/admin/accounts').flush(pageOf(items, total));
    fixture.detectChanges();
  };

  // ---- overview ---------------------------------------------------------------------------------------------

  it('shows the key figures', () => {
    loadOverview();
    const text = el.textContent ?? '';
    expect(text).toContain('12'); // customers
    expect(text).toContain('$12,345.60');
    expect(text).toContain('20 active · 2 frozen · 1 closed');
    expect(text).toContain('4 in the last 24 hours');
    expect(text).toContain('$9,000.00');
    expect(text).toContain('$55.25');
    expect(text).toContain('2 failed runs in the last 7 days');
  });

  it('says the books balance when they do', () => {
    loadOverview();
    expect(el.textContent).toContain('The books balance');
  });

  it('spells out what is wrong when the books do not balance', () => {
    loadOverview({ healthy: false, totalOfAllEntries: '1.00', accountsWithWrongBalance: ['x', 'y'], customerAccountsBelowZero: ['z'] });
    const text = el.textContent ?? '';
    expect(text).toContain('The books do not balance');
    expect(text).toContain('add up to 1.00 instead of 0.00');
    expect(text).toContain('2 account(s) show a balance that differs');
    expect(text).toContain('1 customer account(s) are below zero');
    expect(el.querySelector('[role=alert]')).toBeTruthy();
  });

  it('offers a retry when the overview cannot be loaded', () => {
    http.expectOne('/api/admin/overview').flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/admin/reconciliation').flush(HEALTHY);
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load the overview.');
    click('Try again');
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    http.expectOne('/api/admin/reconciliation').flush(HEALTHY);
    fixture.detectChanges();
    expect(el.textContent).toContain('$12,345.60');
  });

  it('runs the interest job, reports the result and refreshes the numbers', () => {
    loadOverview();
    click('Run interest now');
    const req = http.expectOne('/api/admin/jobs/interest');
    expect(req.request.method).toBe('POST');
    req.flush({ skippedByLock: false, credited: 3, skipped: 1, failed: 0 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Interest job finished: 3 credited, 1 skipped, 0 failed.');
    loadOverview(); // the figures were requested again
  });

  it('says when another run already holds the lock', () => {
    loadOverview();
    click('Run recurring payments now');
    http.expectOne('/api/admin/jobs/recurring').flush({ skippedByLock: true, succeeded: 0, failed: 0 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Another recurring run is already in progress.');
    loadOverview();
  });

  it('disables both job buttons while one is running', () => {
    loadOverview();
    click('Run interest now');
    expect(button('Running…').disabled).toBe(true);
    expect(button('Run recurring payments now').disabled).toBe(true);
    http.expectOne('/api/admin/jobs/interest').flush({ skippedByLock: false, credited: 0, skipped: 0, failed: 0 });
    loadOverview();
  });

  it('shows an error when a job request is rejected', () => {
    loadOverview();
    click('Run interest now');
    http.expectOne('/api/admin/jobs/interest').flush(null, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(el.textContent).toContain('You do not have permission to do this.');
  });

  // ---- accounts ---------------------------------------------------------------------------------------------

  it('lists accounts with owner, balance and status', () => {
    openAccounts([account(), account({ id: 'a2', status: 'FROZEN', ownerEmail: 'bob@example.com', balance: '10.00' })]);
    const text = el.textContent ?? '';
    expect(text).toContain('XX65 NEOB 1000 0000 01');
    expect(text).toContain('alice@example.com');
    expect(text).toContain('$500.00');
    expect(text).toContain('FROZEN');
    expect(button('Freeze')).toBeTruthy();
    expect(button('Unfreeze')).toBeTruthy();
  });

  it('waits for a pause in typing before searching, then goes back to the first page', () => {
    openAccounts();
    set('q', 'ali');
    set('q', 'alice');
    http.expectNone((r) => r.url === '/api/admin/accounts');
    vi.advanceTimersByTime(350);
    const req = http.expectOne((r) => r.url === '/api/admin/accounts');
    expect(req.request.params.get('q')).toBe('alice');
    expect(req.request.params.get('page')).toBe('0');
    req.flush(pageOf([]));
    fixture.detectChanges();
    expect(el.textContent).toContain('No accounts match.');
  });

  it('applies the status filter immediately', () => {
    openAccounts();
    set('status', 'FROZEN');
    const req = http.expectOne((r) => r.url === '/api/admin/accounts');
    expect(req.request.params.get('status')).toBe('FROZEN');
    req.flush(pageOf([]));
  });

  it('pages through the results', () => {
    openAccounts([account()], 45); // 45 accounts at 20 per page = 3 pages
    expect(el.textContent).toContain('Page 1 of 3');
    expect(button('Previous').disabled).toBe(true);
    click('Next');
    const req = http.expectOne((r) => r.url === '/api/admin/accounts');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(pageOf([account({ id: 'a2' })], 45, 1));
    fixture.detectChanges();
    expect(el.textContent).toContain('Page 2 of 3');
    expect(button('Previous').disabled).toBe(false);
  });

  it('asks for a reason before freezing and sends nothing without one', () => {
    openAccounts();
    click('Freeze');
    expect(el.textContent).toContain('Freeze XX65 NEOB 1000 0000 01 (alice@example.com)?');
    click('Freeze account');
    http.expectNone('/api/admin/accounts/a1/freeze');
    expect(el.textContent).toContain('A reason is required.');

    set('reason', '   '); // whitespace is not a reason
    click('Freeze account');
    http.expectNone('/api/admin/accounts/a1/freeze');
  });

  it('freezes with the reason, then reloads the list and the figures', () => {
    openAccounts();
    click('Freeze');
    set('reason', ' Fraud report #42 ');
    click('Freeze account');
    const req = http.expectOne('/api/admin/accounts/a1/freeze');
    expect(req.request.body).toEqual({ reason: 'Fraud report #42' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(el.textContent).toContain('frozen.');
    http.expectOne((r) => r.url === '/api/admin/accounts').flush(pageOf([account({ status: 'FROZEN' })]));
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    http.expectOne('/api/admin/reconciliation').flush(HEALTHY);
    fixture.detectChanges();
    expect(button('Unfreeze')).toBeTruthy();
  });

  it('can back out of a freeze without sending anything', () => {
    openAccounts();
    click('Freeze');
    click('Cancel');
    expect(el.textContent).not.toContain('Confirm status change');
  });

  it('shows the server explanation when the status change is refused', () => {
    openAccounts([account({ status: 'FROZEN' })]);
    click('Unfreeze');
    set('reason', 'Cleared');
    click('Unfreeze account');
    http.expectOne('/api/admin/accounts/a1/unfreeze').flush(
      { code: 'ADMIN_INVALID_STATE', detail: 'The account is ACTIVE, so it cannot be unfrozen.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('The account is ACTIVE, so it cannot be unfrozen.');
  });

  // ---- audit ------------------------------------------------------------------------------------------------

  it('shows the audit log in plain language', () => {
    loadOverview();
    click('Audit log');
    const entries: AuditEntry[] = [
      { id: 2, at: '2026-10-04T12:00:00Z', adminEmail: 'ada@example.com', action: 'FREEZE_ACCOUNT', accountIban: 'XX65NEOB1000000001', reason: 'Fraud report #42', detail: null },
      { id: 1, at: '2026-10-04T11:00:00Z', adminEmail: 'ada@example.com', action: 'RUN_INTEREST', accountIban: null, reason: null, detail: 'credited=3 skipped=1 failed=0' },
    ];
    http.expectOne('/api/admin/audit').flush(entries);
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('Froze account');
    expect(text).toContain('XX65 NEOB 1000 0000 01');
    expect(text).toContain('Fraud report #42');
    expect(text).toContain('Ran the interest job');
    expect(text).toContain('credited=3 skipped=1 failed=0');
    expect(text).not.toContain('FREEZE_ACCOUNT');
  });

  it('shows an empty state for an empty audit log', () => {
    loadOverview();
    click('Audit log');
    http.expectOne('/api/admin/audit').flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing has been recorded yet.');
  });
});
