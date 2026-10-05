import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminAccountPage,
  AdminAccountStatus,
  AuditEntry,
  InterestRunSummary,
  Overview,
  Reconciliation,
  RecurringRunSummary,
  SecuritySnapshot,
} from './admin.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  overview(): Observable<Overview> {
    return this.http.get<Overview>('/api/admin/overview');
  }

  reconciliation(): Observable<Reconciliation> {
    return this.http.get<Reconciliation>('/api/admin/reconciliation');
  }

  accounts(query: string, status: AdminAccountStatus | '', page: number, size: number): Observable<AdminAccountPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (query.trim() !== '') {
      params = params.set('q', query.trim());
    }
    if (status !== '') {
      params = params.set('status', status);
    }
    return this.http.get<AdminAccountPage>('/api/admin/accounts', { params });
  }

  freeze(accountId: string, reason: string): Observable<void> {
    return this.http.post<void>(`/api/admin/accounts/${accountId}/freeze`, { reason });
  }

  unfreeze(accountId: string, reason: string): Observable<void> {
    return this.http.post<void>(`/api/admin/accounts/${accountId}/unfreeze`, { reason });
  }

  runInterest(): Observable<InterestRunSummary> {
    return this.http.post<InterestRunSummary>('/api/admin/jobs/interest', null);
  }

  runRecurring(): Observable<RecurringRunSummary> {
    return this.http.post<RecurringRunSummary>('/api/admin/jobs/recurring', null);
  }

  security(): Observable<SecuritySnapshot> {
    return this.http.get<SecuritySnapshot>('/api/admin/security');
  }

  unlockLogin(email: string, reason: string): Observable<void> {
    return this.http.post<void>('/api/admin/security/login-lockouts/unlock', { email, reason });
  }

  clearProbingBlock(userId: string, reason: string): Observable<void> {
    return this.http.post<void>(`/api/admin/security/probing-blocks/${userId}/clear`, { reason });
  }

  audit(): Observable<AuditEntry[]> {
    return this.http.get<AuditEntry[]>('/api/admin/audit');
  }
}
