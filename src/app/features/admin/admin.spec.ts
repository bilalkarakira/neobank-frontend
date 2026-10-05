import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Admin } from './admin';
import { AdminAccount, AdminAccountPage, AuditEntry, CardAuthorizationPage, CardAuthorizationRow, CustomerDetail, Overview, Reconciliation, SecuritySnapshot } from './admin.models';

const OVERVIEW: Overview = {
  generatedAt: '2026-10-04T12:00:00Z',
  customers: 12,
  accounts: { active: 20, frozen: 2, closed: 1 },
  depositsHeld: '12345.60',
  transfersLast24Hours: { count: 4, amount: '300.00' },
  transfersLast30Days: { count: 40, amount: '9000.00' },
  interestPaid: '55.25',
  recurring: { active: 3, paused: 1, failedRunsLast7Days: 2 },
  security: { lockedLogins: 2, probingBlocks: 1 },
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
  ownerId: 'u-alice',
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

  // ---- customer detail and closing accounts ----------------------------------------------------------------

  const DETAIL: CustomerDetail = {
    profile: { id: 'u-alice', firstName: 'Alice', lastName: 'Kim', email: 'alice@example.com', createdAt: '2026-09-01T10:00:00Z' },
    accounts: [
      { id: 'a1', iban: 'XX65NEOB1000000001', type: 'CHECKING', status: 'ACTIVE', nickname: 'Daily', balance: '0.00', createdAt: '2026-09-01T10:00:00Z' },
      { id: 'a2', iban: 'XX38NEOB1000000002', type: 'SAVINGS', status: 'ACTIVE', nickname: null, balance: '120.50', createdAt: '2026-09-02T10:00:00Z' },
      { id: 'a3', iban: 'XX11NEOB1000000003', type: 'CHECKING', status: 'CLOSED', nickname: 'Old', balance: '0.00', createdAt: '2026-08-01T10:00:00Z' },
    ],
    recentActivity: [
      { at: '2026-10-04T12:00:00Z', accountIban: 'XX65NEOB1000000001', type: 'TRANSFER', amount: '-25.00', balanceAfter: '0.00', description: 'Gym' },
      { at: '2026-10-03T12:00:00Z', accountIban: 'XX65NEOB1000000001', type: 'DEPOSIT', amount: '25.00', balanceAfter: '25.00', description: null },
    ],
    activeSessions: 2,
    loginLockedUntil: null,
    activeOrders: 1,
    pausedOrders: 3,
  };
  const TRAIL: AuditEntry[] = [
    { id: 12, at: '2026-10-04T12:00:00Z', adminEmail: 'ada@example.com', action: 'FREEZE_ACCOUNT', accountIban: 'XX65NEOB1000000001', reason: 'Fraud report', detail: null },
    { id: 11, at: '2026-10-03T12:00:00Z', adminEmail: 'ben@example.com', action: 'VIEW_CUSTOMER', accountIban: null, reason: null, detail: 'email=alice@example.com' },
  ];
  const openCustomer = (detail: CustomerDetail = DETAIL, trail: AuditEntry[] = []) => {
    openAccounts([account({ balance: '0.00' })]);
    (el.querySelector('button[aria-label="Open customer Alice Kim"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/customers/u-alice').flush(detail);
    // the trail is asked for only after the detail: opening the customer writes its own audit row
    http.expectOne('/api/admin/customers/u-alice/audit').flush(trail);
    fixture.detectChanges();
  };

  it('opens a customer from the owner name in the account list', () => {
    openCustomer();
    const text = el.textContent ?? '';
    expect(text).toContain('Alice Kim');
    expect(text).toContain('alice@example.com · customer since Sep 1, 2026');
    expect(text).toContain('2 active session(s)');
    expect(text).toContain('1 active and 3 paused recurring payment(s)');
    expect(text).toContain('Opening this page is recorded in the audit log.');
    expect(text).toContain('XX65 NEOB 1000 0000 01');
    expect(text).toContain('$120.50');
    expect(text).toContain('Gym');
    expect(text).toContain('Transfer');
    expect(text).toContain('Deposit');
    expect(text).toContain('-$25.00');
    expect(text).not.toContain('Locked out of login');
  });

  it('shows what administrators did about the customer, newest first, with who, what, which account and why', () => {
    openCustomer(DETAIL, TRAIL);
    const rows = [...el.querySelectorAll("table")].flatMap((t) =>
      t.querySelector('caption')?.textContent?.includes('about this customer') ? [...t.querySelectorAll('tbody tr')] : [],
    );
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('ada@example.com');
    expect(rows[0].textContent).toContain('Froze account');
    expect(rows[0].textContent).toContain('XX65 NEOB 1000 0000 01');
    expect(rows[0].textContent).toContain('Fraud report');
    expect(rows[1].textContent).toContain('Viewed a customer');
    expect(rows[1].textContent).toContain('ben@example.com');
  });

  it('ignores a late trail for a customer the administrator has already left', () => {
    openAccounts([account(), account({ id: 'a9', ownerId: 'u-bob', ownerName: 'Bob Lee', ownerEmail: 'bob@example.com' })]);
    (el.querySelector('button[aria-label="Open customer Alice Kim"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/customers/u-alice').flush(DETAIL);
    const lateForAlice = http.expectOne('/api/admin/customers/u-alice/audit'); // still in flight

    click('Back to accounts');
    (el.querySelector('button[aria-label="Open customer Bob Lee"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/customers/u-bob').flush({ ...DETAIL, profile: { ...DETAIL.profile, id: 'u-bob', email: 'bob@example.com', firstName: 'Bob', lastName: 'Lee' } });
    http.expectOne('/api/admin/customers/u-bob/audit').flush([]);
    lateForAlice.flush(TRAIL); // arrives after Bob's
    fixture.detectChanges();

    expect(el.textContent).toContain('Nothing has been recorded about this customer yet.');
    expect(el.textContent).not.toContain('Froze account');
  });

  it('says so when nothing was ever recorded about the customer', () => {
    openCustomer(DETAIL, []);
    expect(el.textContent).toContain('Nothing has been recorded about this customer yet.');
  });

  it('shows a retry for the trail alone, keeping the rest of the customer view', () => {
    openAccounts([account({ balance: '0.00' })]);
    (el.querySelector('button[aria-label="Open customer Alice Kim"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/customers/u-alice').flush(DETAIL);
    http.expectOne('/api/admin/customers/u-alice/audit').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.textContent).toContain("Could not load this customer's audit trail.");
    expect(el.textContent).toContain('Alice Kim');

    click('Try again');
    http.expectOne('/api/admin/customers/u-alice/audit').flush(TRAIL);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Could not load');
    expect(el.textContent).toContain('Froze account');
  });

  it('does not ask for the trail when the customer itself could not be loaded', () => {
    openAccounts([account({ balance: '0.00' })]);
    (el.querySelector('button[aria-label="Open customer Alice Kim"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/admin/customers/u-alice').flush(null, { status: 500, statusText: 'Server Error' });
    http.expectNone('/api/admin/customers/u-alice/audit');
  });

  it('keeps the Accounts tab highlighted while a customer is open, and goes back without reloading the list', () => {
    openCustomer();
    expect(el.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim()).toBe('Accounts');

    click('← Back to accounts');

    http.expectNone((r) => r.url === '/api/admin/accounts'); // the list is still there
    expect(el.textContent).toContain('Customer accounts');
  });

  it('shows a login lock with a way to the security tab', () => {
    openCustomer({ ...DETAIL, loginLockedUntil: '2026-10-05T12:15:00Z' });
    expect(el.textContent).toContain('Locked out of login until');
    click('Review');
    http.expectOne('/api/admin/security').flush({ lockedLogins: [], otherLockedAddresses: 0, probingBlocks: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Locked out of login');
  });

  it('says so when a customer has no accounts or no activity', () => {
    openCustomer({ ...DETAIL, accounts: [], recentActivity: [] });
    expect(el.textContent).toContain('This customer has no accounts.');
    expect(el.textContent).toContain('Nothing has happened on these accounts yet.');
  });

  it('offers a retry when the customer cannot be loaded', () => {
    openAccounts([account()]);
    (el.querySelector('button[aria-label="Open customer Alice Kim"]') as HTMLButtonElement).click();
    http.expectOne('/api/admin/customers/u-alice').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load this customer.');

    click('Try again');
    http.expectOne('/api/admin/customers/u-alice').flush(DETAIL);
    http.expectOne('/api/admin/customers/u-alice/audit').flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('2 active session(s)');
  });

  it('only lets an empty account be closed, and offers nothing at all on a closed one', () => {
    openCustomer();
    const rows = [...el.querySelectorAll('tbody tr')];
    const closeOf = (row: Element) => [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close');
    expect(closeOf(rows[0])?.disabled).toBe(false);                      // 0.00: can be closed
    expect(closeOf(rows[1])?.disabled).toBe(true);                       // 120.50: the money has to be moved first
    expect(closeOf(rows[1])?.title).toBe('Only an empty account can be closed');
    expect(closeOf(rows[2])).toBeUndefined();                            // already closed
    expect(rows[2].querySelectorAll('button').length).toBe(0);
  });

  it('closes an account from the account list: a stern warning, a reason, then the list and figures are reloaded', () => {
    openAccounts([account({ balance: '0.00' })]);
    click('Close');
    expect(el.textContent).toContain('This cannot be undone.');
    expect(el.textContent).toContain('recurring payments will be cancelled');
    click('Close account for good');
    http.expectNone('/api/admin/accounts/a1/close'); // no reason yet
    expect(el.textContent).toContain('A reason is required.');

    set('reason', ' Customer asked to close it ');
    click('Close account for good');
    const req = http.expectOne('/api/admin/accounts/a1/close');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Customer asked to close it' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(el.textContent).toContain('closed.');
    http.expectOne((r) => r.url === '/api/admin/accounts').flush(pageOf([account({ status: 'CLOSED' })]));
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    http.expectOne('/api/admin/reconciliation').flush(HEALTHY);
  });

  it('closes an account from the customer view and updates it in place without another audited view', () => {
    openCustomer();
    const row = [...el.querySelectorAll('tbody tr')][0];
    [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close')!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Close XX65 NEOB 1000 0000 01 (alice@example.com)?');
    set('reason', 'Customer asked');
    click('Close account for good');
    http.expectOne('/api/admin/accounts/a1/close').flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    http.expectNone('/api/admin/customers/u-alice'); // re-fetching would write another "viewed" line to the audit log
    const first = [...el.querySelectorAll('tbody tr')][0];
    expect(first.textContent).toContain('CLOSED');
    expect(first.querySelectorAll('button').length).toBe(0);
    http.expectOne('/api/admin/customers/u-alice/audit').flush(TRAIL);
    http.expectOne((r) => r.url === '/api/admin/accounts').flush(pageOf([account({ status: 'CLOSED' })]));
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    http.expectOne('/api/admin/reconciliation').flush(HEALTHY);
  });

  it('freezes from the customer view and shows the new status in place', () => {
    openCustomer();
    const row = [...el.querySelectorAll('tbody tr')][0];
    [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Freeze')!.click();
    fixture.detectChanges();
    set('reason', 'Fraud report');
    click('Freeze account');
    http.expectOne('/api/admin/accounts/a1/freeze').flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect([...el.querySelectorAll('tbody tr')][0].textContent).toContain('FROZEN');
    expect(el.textContent).toContain('Unfreeze');
    http.expectOne('/api/admin/customers/u-alice/audit').flush(TRAIL);
    http.expectOne((r) => r.url === '/api/admin/accounts').flush(pageOf([account({ status: 'FROZEN' })]));
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    http.expectOne('/api/admin/reconciliation').flush(HEALTHY);
  });

  it('shows the server\'s explanation when closing is refused because money is left', () => {
    openCustomer({ ...DETAIL, accounts: [{ ...DETAIL.accounts[0], balance: '0.00' }] });
    const row = [...el.querySelectorAll('tbody tr')][0];
    [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close')!.click();
    fixture.detectChanges();
    set('reason', 'Customer asked');
    click('Close account for good');
    http.expectOne('/api/admin/accounts/a1/close').flush(
      { code: 'ADMIN_ACCOUNT_NOT_EMPTY', detail: 'The account still holds 0.01. It can only be closed when the balance is exactly 0.00.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('The account still holds 0.01.');
    expect([...el.querySelectorAll('tbody tr')][0].textContent).toContain('ACTIVE'); // not shown as closed
  });

  it('describes the new audit actions in plain language', () => {
    loadOverview();
    click('Audit log');
    http.expectOne('/api/admin/audit').flush([
      { id: 2, at: '2026-10-05T12:00:00Z', adminEmail: 'ada@example.com', action: 'CLOSE_ACCOUNT', accountIban: 'XX65NEOB1000000001', reason: 'Asked', detail: 'cancelledOrders=2' },
      { id: 1, at: '2026-10-05T11:00:00Z', adminEmail: 'ada@example.com', action: 'VIEW_CUSTOMER', accountIban: null, reason: null, detail: 'email=alice@example.com' },
    ]);
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('Closed account');
    expect(text).toContain('Viewed a customer');
    expect(text).toContain('cancelledOrders=2');
    expect(text).not.toContain('VIEW_CUSTOMER');
  });

  // ---- security ---------------------------------------------------------------------------------------------

  const SNAPSHOT: SecuritySnapshot = {
    lockedLogins: [{ email: 'alice@example.com', failures: 5, lockedUntil: '2026-10-05T12:15:00Z' }],
    otherLockedAddresses: 3,
    probingBlocks: [{ userId: 'u-bob', email: 'bob@example.com', misses: 10, blockedUntil: '2026-10-05T12:10:00Z' }],
  };
  const openSecurity = (snapshot: SecuritySnapshot = SNAPSHOT) => {
    loadOverview();
    click('Security');
    http.expectOne('/api/admin/security').flush(snapshot);
    fixture.detectChanges();
  };

  it('shows the lock and block counts on the overview, with a way to review them', () => {
    loadOverview();
    const text = el.textContent ?? '';
    expect(text).toContain('2 customer(s) locked out of login');
    expect(text).toContain('1 user(s) blocked for probing IBANs');
    click('Review');
    http.expectOne('/api/admin/security').flush(SNAPSHOT);
    fixture.detectChanges();
    expect(el.textContent).toContain('Locked out of login');
  });

  it('lists locked customers and blocked users, and mentions locks that belong to no customer', () => {
    openSecurity();
    const text = el.textContent ?? '';
    expect(text).toContain('alice@example.com');
    expect(text).toContain('bob@example.com');
    expect(text).toContain('3 more locked address(es) belong to no customer');
    expect(button('Unlock')).toBeTruthy();
    expect(button('Lift block')).toBeTruthy();
  });

  it('says so when nobody is locked or blocked', () => {
    openSecurity({ lockedLogins: [], otherLockedAddresses: 0, probingBlocks: [] });
    const text = el.textContent ?? '';
    expect(text).toContain('No customer is locked out right now.');
    expect(text).toContain('Nobody is blocked right now.');
    expect(text).not.toContain('more locked address');
  });

  it('needs a reason before unlocking and sends nothing without one', () => {
    openSecurity();
    click('Unlock');
    expect(el.textContent).toContain('Let alice@example.com log in again?');
    click('Unlock login');
    http.expectNone('/api/admin/security/login-lockouts/unlock');
    expect(el.textContent).toContain('A reason is required.');

    set('security-reason', '   ');
    click('Unlock login');
    http.expectNone('/api/admin/security/login-lockouts/unlock');
  });

  it('unlocks with the trimmed reason, then reloads the list and the figures', () => {
    openSecurity();
    click('Unlock');
    set('security-reason', ' Verified by phone ');
    click('Unlock login');

    const req = http.expectOne('/api/admin/security/login-lockouts/unlock');
    expect(req.request.body).toEqual({ email: 'alice@example.com', reason: 'Verified by phone' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(el.textContent).toContain('alice@example.com can log in again.');
    http.expectOne('/api/admin/security').flush({ ...SNAPSHOT, lockedLogins: [] });
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    http.expectOne('/api/admin/reconciliation').flush(HEALTHY);
    fixture.detectChanges();
    expect(el.textContent).toContain('No customer is locked out right now.');
  });

  it('lifts a probing block with the user id and the reason', () => {
    openSecurity();
    click('Lift block');
    expect(el.textContent).toContain('Let bob@example.com look up recipients again?');
    set('security-reason', 'Checked with the customer');
    click('Lift block'); // the confirm button has the same label; the first match is now the confirm one

    const req = http.expectOne('/api/admin/security/probing-blocks/u-bob/clear');
    expect(req.request.body).toEqual({ reason: 'Checked with the customer' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(el.textContent).toContain('bob@example.com can look up recipients again.');
    http.expectOne('/api/admin/security').flush({ ...SNAPSHOT, probingBlocks: [] });
    http.expectOne('/api/admin/overview').flush(OVERVIEW);
    http.expectOne('/api/admin/reconciliation').flush(HEALTHY);
  });

  it('can back out without sending anything', () => {
    openSecurity();
    click('Unlock');
    click('Cancel');
    expect(el.textContent).not.toContain('Confirm security action');
  });

  it('explains it and refreshes the list when the lock had already ended', () => {
    openSecurity();
    click('Unlock');
    set('security-reason', 'Verified');
    click('Unlock login');
    http.expectOne('/api/admin/security/login-lockouts/unlock').flush(
      { code: 'NOT_LOCKED' },
      { status: 404, statusText: 'Not Found' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('That customer is no longer locked out.');
    http.expectOne('/api/admin/security').flush({ ...SNAPSHOT, lockedLogins: [] }); // shows the truth
  });

  it('offers a retry when the security status cannot be loaded', () => {
    loadOverview();
    click('Security');
    http.expectOne('/api/admin/security').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load the security status.');
    click('Try again');
    http.expectOne('/api/admin/security').flush(SNAPSHOT);
    fixture.detectChanges();
    expect(el.textContent).toContain('alice@example.com');
  });

  it('describes the new audit actions in plain language, with the reason and the detail together', () => {
    loadOverview();
    click('Audit log');
    http.expectOne('/api/admin/audit').flush([
      { id: 2, at: '2026-10-05T12:00:00Z', adminEmail: 'ada@example.com', action: 'UNLOCK_LOGIN', accountIban: null, reason: 'Verified by phone', detail: 'email=alice@example.com' },
      { id: 1, at: '2026-10-05T11:00:00Z', adminEmail: 'ada@example.com', action: 'CLEAR_PROBING_BLOCK', accountIban: null, reason: 'Checked', detail: 'user=bob@example.com' },
    ]);
    fixture.detectChanges();
    const text = el.textContent ?? '';
    expect(text).toContain('Unlocked a login');
    expect(text).toContain('Lifted a probing block');
    expect(text).toContain('Verified by phone');
    expect(text).toContain('email=alice@example.com');
    expect(text).not.toContain('UNLOCK_LOGIN');
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

  // ---- card authorizations ----

  const authRow = (overrides: Partial<CardAuthorizationRow> = {}): CardAuthorizationRow => ({
    id: 'r1',
    createdAt: '2026-10-05T10:00:00Z',
    last4: '0012',
    cardKnown: true,
    customerEmail: 'alice@example.com',
    merchantName: 'Corner Cafe',
    amount: '45.25',
    status: 'AUTHORIZED',
    responseCode: '00',
    reason: null,
    mti: '0100',
    standIn: false,
    expiresAt: '2026-10-12T10:00:00Z',
    ...overrides,
  });
  const authPage = (items: CardAuthorizationRow[], total = items.length, page = 0): CardAuthorizationPage => ({ items, total, page, size: 20 });
  const authRequest = (predicate: (p: { get(name: string): string | null }) => boolean = () => true) =>
    http.expectOne((r) => r.url === '/api/admin/authorizations' && predicate(r.params));
  const openCards = (page: CardAuthorizationPage = authPage([authRow()])) => {
    loadOverview();
    click('Card authorizations');
    authRequest().flush(page);
    fixture.detectChanges();
  };

  it('lists card authorization decisions with the masked card, customer and result', () => {
    openCards(authPage([
      authRow(),
      authRow({ id: 'r2', status: 'DECLINED', responseCode: '51', reason: 'Not enough available money.', amount: '500.00', merchantName: 'Big Store', expiresAt: null }),
      authRow({ id: 'r3', status: 'DECLINED', responseCode: '14', reason: 'The card details did not match.', cardKnown: false, customerEmail: null, last4: '9999', expiresAt: null }),
    ]));

    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('•••• 0012');
    expect(text).toContain('alice@example.com');
    expect(text).toContain('Pending hold');
    expect(text).toContain('Code 51 · Not enough available money.');
    expect(text).toContain('unknown card');
    expect(text).toContain('MTI 0100');
    expect(el.textContent).not.toMatch(/\d{4} \d{4} \d{4} \d{4}/);
  });

  it('tags the decisions the network made on its own while NeoBank was unavailable', () => {
    openCards(authPage([authRow({ id: 'si', mti: '0120', standIn: true }), authRow({ id: 'normal' })]));

    const tagged = [...el.querySelectorAll('[data-testid=stand-in-tag]')];
    expect(tagged).toHaveLength(1);
    expect(tagged[0].closest('[data-auth]')?.getAttribute('data-auth')).toBe('si');
    expect(tagged[0].textContent).toContain('Approved by the network (stand-in)');
  });

  it('asks for the first page with the page size', () => {
    loadOverview();
    click('Card authorizations');
    const req = http.expectOne((r) => r.url === '/api/admin/authorizations');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.has('last4')).toBe(false);
    req.flush(authPage([]));
    fixture.detectChanges();
    expect(el.textContent).toContain('No card authorizations match');
  });

  it('applies the status filter at once', () => {
    openCards();
    set('auth-status', 'DECLINED');
    const req = authRequest((p) => p.get('status') === 'DECLINED');
    expect(req.request.params.get('page')).toBe('0');
    req.flush(authPage([]));
  });

  it('searches by the last four digits after a pause, and only when they are four digits', () => {
    openCards();

    set('auth-last4', '001');
    vi.advanceTimersByTime(400);
    http.expectNone((r) => r.url === '/api/admin/authorizations');
    expect(el.textContent).toContain('Enter exactly four digits');

    set('auth-last4', '0012');
    http.expectNone((r) => r.url === '/api/admin/authorizations'); // waits for a pause in typing
    vi.advanceTimersByTime(400);
    authRequest((p) => p.get('last4') === '0012').flush(authPage([authRow()]));
  });

  it('pages through the decisions', () => {
    openCards(authPage([authRow()], 45));
    expect(el.textContent).toContain('Page 1 of 3');

    click('Older');
    const req = authRequest((p) => p.get('page') === '1');
    req.flush(authPage([authRow({ id: 'r9' })], 45, 1));
    fixture.detectChanges();
    expect(el.textContent).toContain('Page 2 of 3');
  });

  it('offers a retry when the list cannot be loaded', () => {
    loadOverview();
    click('Card authorizations');
    authRequest().flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Could not load the card authorizations');

    click('Try again');
    authRequest().flush(authPage([authRow()]));
    fixture.detectChanges();
    expect(el.textContent).toContain('•••• 0012');
  });

});
