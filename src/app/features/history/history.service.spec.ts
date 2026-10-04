import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_FILTER } from './history-query';
import { HistoryService } from './history.service';

describe('HistoryService', () => {
  let service: HistoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(HistoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists with filters and paging as query parameters', () => {
    service.list('a1', { ...DEFAULT_FILTER, q: 'rent', type: 'TRANSFER', page: 2 }).subscribe();

    const req = http.expectOne((r) => r.url === '/api/accounts/a1/transactions');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('rent');
    expect(req.request.params.get('type')).toBe('TRANSFER');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('20');
    expect(req.request.params.get('sort')).toBe('date,desc');
    req.flush({});
  });

  it('encodes user text safely instead of concatenating it into the URL', () => {
    service.list('a1', { ...DEFAULT_FILTER, q: "100% & 'x'=1" }).subscribe();

    const req = http.expectOne((r) => r.url === '/api/accounts/a1/transactions');
    expect(req.request.params.get('q')).toBe("100% & 'x'=1");
    expect(req.request.urlWithParams).not.toContain("& 'x'");
    req.flush({});
  });

  it('exports as a blob with the same filters but without paging', () => {
    service.exportCsv('a1', { ...DEFAULT_FILTER, direction: 'IN', page: 5, size: 100 }).subscribe();

    const req = http.expectOne((r) => r.url === '/api/accounts/a1/transactions/export.csv');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('direction')).toBe('IN');
    expect(req.request.params.has('page')).toBe(false);
    expect(req.request.params.has('size')).toBe(false);
    req.flush(new Blob(['x']));
  });
});
