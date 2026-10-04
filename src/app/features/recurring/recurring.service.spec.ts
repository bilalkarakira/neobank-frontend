import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RecurringService } from './recurring.service';

describe('RecurringService', () => {
  let service: RecurringService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RecurringService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the recurring payments', () => {
    service.list().subscribe();
    const req = http.expectOne('/api/recurring-payments');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('creates one with the request body as given', () => {
    const body = {
      sourceAccountId: 'a',
      destinationIban: 'XX65NEOB1000000001',
      amount: '25.00',
      description: 'Rent',
      categoryId: null,
      frequency: 'MONTHLY' as const,
      startDate: '2026-10-05',
      endDate: null,
    };
    service.create(body).subscribe();
    const req = http.expectOne('/api/recurring-payments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('updates with PUT, pauses and resumes with POST, cancels with DELETE', () => {
    service.update('x', { amount: '9.00', description: null, categoryId: null }).subscribe();
    const put = http.expectOne('/api/recurring-payments/x');
    expect(put.request.method).toBe('PUT');
    put.flush({});

    service.pause('x').subscribe();
    const pause = http.expectOne('/api/recurring-payments/x/pause');
    expect(pause.request.method).toBe('POST');
    pause.flush({});

    service.resume('x').subscribe();
    const resume = http.expectOne('/api/recurring-payments/x/resume');
    expect(resume.request.method).toBe('POST');
    resume.flush({});

    service.cancel('x').subscribe();
    const del = http.expectOne('/api/recurring-payments/x');
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('loads the run history', () => {
    service.runs('x').subscribe();
    const req = http.expectOne('/api/recurring-payments/x/runs');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
