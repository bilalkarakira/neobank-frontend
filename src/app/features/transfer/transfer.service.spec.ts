import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TransferService } from './transfer.service';

describe('TransferService', () => {
  let service: TransferService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TransferService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts a transfer with an Idempotency-Key header', () => {
    service.transfer({ sourceAccountId: 'a', destinationIban: 'XX65NEOB1000000001', amount: '5.00' }, 'key-1').subscribe();
    const req = http.expectOne('/api/transfers');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-1');
    req.flush({});
  });

  it('looks up a recipient with the IBAN as a query parameter', () => {
    service.lookup('XX65NEOB1000000001').subscribe();
    const req = http.expectOne((r) => r.url === '/api/recipients/lookup');
    expect(req.request.params.get('iban')).toBe('XX65NEOB1000000001');
    req.flush({});
  });

  it('loads the daily limits', () => {
    service.limits().subscribe();
    http.expectOne('/api/transfers/limits').flush({});
  });
});
