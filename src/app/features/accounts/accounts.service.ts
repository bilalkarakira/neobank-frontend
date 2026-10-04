import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Account, DepositRequest, DepositResponse, OpenAccountRequest } from './accounts.models';

@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly http = inject(HttpClient);

  list(): Observable<Account[]> {
    return this.http.get<Account[]>('/api/accounts');
  }

  open(request: OpenAccountRequest): Observable<Account> {
    return this.http.post<Account>('/api/accounts', request);
  }

  /** The idempotency key makes a retry of the same attempt safe: the server credits the money only once. */
  deposit(accountId: string, request: DepositRequest, idempotencyKey: string): Observable<DepositResponse> {
    return this.http.post<DepositResponse>(`/api/accounts/${accountId}/deposits`, request, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }
}
