import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateRecurringRequest, RecurringPayment, RecurringRun, UpdateRecurringRequest } from './recurring.models';

@Injectable({ providedIn: 'root' })
export class RecurringService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/recurring-payments';

  list(): Observable<RecurringPayment[]> {
    return this.http.get<RecurringPayment[]>(this.base);
  }

  create(request: CreateRecurringRequest): Observable<RecurringPayment> {
    return this.http.post<RecurringPayment>(this.base, request);
  }

  update(id: string, request: UpdateRecurringRequest): Observable<RecurringPayment> {
    return this.http.put<RecurringPayment>(`${this.base}/${id}`, request);
  }

  pause(id: string): Observable<RecurringPayment> {
    return this.http.post<RecurringPayment>(`${this.base}/${id}/pause`, null);
  }

  resume(id: string): Observable<RecurringPayment> {
    return this.http.post<RecurringPayment>(`${this.base}/${id}/resume`, null);
  }

  cancel(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  runs(id: string): Observable<RecurringRun[]> {
    return this.http.get<RecurringRun[]>(`${this.base}/${id}/runs`);
  }
}
