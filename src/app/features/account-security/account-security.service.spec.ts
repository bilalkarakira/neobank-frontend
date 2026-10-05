import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AccountSecurityService } from './account-security.service';

describe('AccountSecurityService', () => {
  let service: AccountSecurityService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AccountSecurityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the sessions', () => {
    service.sessions().subscribe();
    const req = http.expectOne('/api/sessions');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('ends one session with DELETE and all the others with POST', () => {
    service.revoke('s-1').subscribe();
    const one = http.expectOne('/api/sessions/s-1');
    expect(one.request.method).toBe('DELETE');
    one.flush(null);

    service.revokeOthers().subscribe();
    const others = http.expectOne('/api/sessions/revoke-others');
    expect(others.request.method).toBe('POST');
    others.flush(null);
  });

  it('sends exactly the current and the new password to change it', () => {
    service.changePassword({ currentPassword: 'old-pass-1', newPassword: 'new-pass-22' }).subscribe();
    const req = http.expectOne('/api/me/password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ currentPassword: 'old-pass-1', newPassword: 'new-pass-22' });
    req.flush(null);
  });
});
