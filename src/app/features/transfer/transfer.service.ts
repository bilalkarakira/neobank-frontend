import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Recipient, TransferLimits, TransferRequest, TransferResponse } from './transfer.models';

@Injectable({ providedIn: 'root' })
export class TransferService {
  private readonly http = inject(HttpClient);

  /** The idempotency key makes a retry of the same attempt safe: the server moves the money only once. */
  transfer(request: TransferRequest, idempotencyKey: string): Observable<TransferResponse> {
    return this.http.post<TransferResponse>('/api/transfers', request, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  limits(): Observable<TransferLimits> {
    return this.http.get<TransferLimits>('/api/transfers/limits');
  }

  lookup(iban: string): Observable<Recipient> {
    return this.http.get<Recipient>('/api/recipients/lookup', { params: new HttpParams().set('iban', iban) });
  }
}
