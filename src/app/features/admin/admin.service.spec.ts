import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the overview and the books check', () => {
    service.overview().subscribe();
    http.expectOne('/api/admin/overview').flush({});
    service.reconciliation().subscribe();
    http.expectOne('/api/admin/reconciliation').flush({});
  });

  it('searches accounts with only the filters that are set', () => {
    service.accounts('  alice ', 'FROZEN', 2, 20).subscribe();
    const req = http.expectOne((r) => r.url === '/api/admin/accounts');
    expect(req.request.params.get('q')).toBe('alice');
    expect(req.request.params.get('status')).toBe('FROZEN');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('20');
    req.flush({});

    service.accounts('   ', '', 0, 20).subscribe();
    const plain = http.expectOne((r) => r.url === '/api/admin/accounts');
    expect(plain.request.params.has('q')).toBe(false);
    expect(plain.request.params.has('status')).toBe(false);
    plain.flush({});
  });

  it('freezes and unfreezes with a reason in the body', () => {
    service.freeze('a1', 'Fraud report').subscribe();
    const freeze = http.expectOne('/api/admin/accounts/a1/freeze');
    expect(freeze.request.method).toBe('POST');
    expect(freeze.request.body).toEqual({ reason: 'Fraud report' });
    freeze.flush(null);

    service.unfreeze('a1', 'Cleared').subscribe();
    const unfreeze = http.expectOne('/api/admin/accounts/a1/unfreeze');
    expect(unfreeze.request.body).toEqual({ reason: 'Cleared' });
    unfreeze.flush(null);
  });

  it('triggers the jobs with POST and reads the audit log', () => {
    service.runInterest().subscribe();
    expect(http.expectOne('/api/admin/jobs/interest').request.method).toBe('POST');
    service.runRecurring().subscribe();
    expect(http.expectOne('/api/admin/jobs/recurring').request.method).toBe('POST');
    service.audit().subscribe();
    expect(http.expectOne('/api/admin/audit').request.method).toBe('GET');
  });
});
