import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Account, OpenAccountRequest } from './accounts.models';

@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly http = inject(HttpClient);

  list(): Observable<Account[]> {
    return this.http.get<Account[]>('/api/accounts');
  }

  open(request: OpenAccountRequest): Observable<Account> {
    return this.http.post<Account>('/api/accounts', request);
  }
}
