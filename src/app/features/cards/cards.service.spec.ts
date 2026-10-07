import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CardsService } from './cards.service';

describe('CardsService', () => {
  let service: CardsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CardsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists cards', () => {
    service.list().subscribe();
    const req = http.expectOne('/api/cards');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('asks what the customer owes the bank', () => {
    service.owed().subscribe((o) => expect(o.total).toBe('5.50'));
    const req = http.expectOne('/api/cards/owed');
    expect(req.request.method).toBe('GET');
    req.flush({ total: '5.50', items: [] });
  });

  it('lists the disputes and files one for a payment', () => {
    service.disputes().subscribe((list) => expect(list.length).toBe(1));
    const list = http.expectOne('/api/cards/disputes');
    expect(list.request.method).toBe('GET');
    list.flush([{ id: 'd1' }]);

    service.fileDispute('p1', { reason: 'OTHER', note: null, amount: '5.00' }).subscribe();
    const req = http.expectOne('/api/cards/payments/p1/dispute');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'OTHER', note: null, amount: '5.00' });
    req.flush({});
  });

  it('issues a card with the account and the optional name', () => {
    service.issue({ accountId: 'a1', nickname: null }).subscribe();
    const req = http.expectOne('/api/cards');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ accountId: 'a1', nickname: null });
    req.flush({});
  });

  it('freezes, unfreezes and cancels by id', () => {
    service.freeze('c1').subscribe();
    expect(http.expectOne('/api/cards/c1/freeze').request.method).toBe('POST');
    service.unfreeze('c1').subscribe();
    expect(http.expectOne('/api/cards/c1/unfreeze').request.method).toBe('POST');
    service.cancel('c1').subscribe();
    expect(http.expectOne('/api/cards/c1').request.method).toBe('DELETE');
  });

  it('sends the daily limit as a string, never a number', () => {
    service.changeLimit('c1', '250.50').subscribe();
    const req = http.expectOne('/api/cards/c1/limit');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ dailyLimit: '250.50' });
  });

  it('asks for pending holds and for a page of activity', () => {
    service.pending('c1').subscribe();
    const pending = http.expectOne((r) => r.url === '/api/cards/c1/authorizations');
    expect(pending.request.params.get('pending')).toBe('true');
    pending.flush({ items: [], page: 0, size: 0, totalElements: 0 });

    service.activity('c1', 2, 10).subscribe();
    const activity = http.expectOne((r) => r.url === '/api/cards/c1/authorizations');
    expect(activity.request.params.get('page')).toBe('2');
    expect(activity.request.params.get('size')).toBe('10');
    expect(activity.request.params.has('pending')).toBe(false);
    activity.flush({ items: [], page: 2, size: 10, totalElements: 0 });
  });
});
