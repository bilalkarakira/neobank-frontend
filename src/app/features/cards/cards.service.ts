import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthorizationPage, Card, Dispute, DisputeRequest, IssueCardRequest, IssuedCard, Owed, PendingAuthentication } from './cards.models';

@Injectable({ providedIn: 'root' })
export class CardsService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/cards';

  list(): Observable<Card[]> {
    return this.http.get<Card[]>(this.base);
  }

  /** The number and PIN are in this response and nowhere else, ever again. */
  issue(request: IssueCardRequest): Observable<IssuedCard> {
    return this.http.post<IssuedCard>(this.base, request);
  }

  freeze(id: string): Observable<Card> {
    return this.http.post<Card>(`${this.base}/${id}/freeze`, null);
  }

  unfreeze(id: string): Observable<Card> {
    return this.http.post<Card>(`${this.base}/${id}/unfreeze`, null);
  }

  cancel(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  changeLimit(id: string, dailyLimit: string): Observable<Card> {
    return this.http.put<Card>(`${this.base}/${id}/limit`, { dailyLimit });
  }

  /** What the signed-in customer owes the bank after a cleared card payment that was bigger than their account could cover. */
  owed(): Observable<Owed> {
    return this.http.get<Owed>('/api/cards/owed');
  }

  /** Online payments waiting for the customer's approval (pending and not expired), newest first. */
  pendingAuthentications(): Observable<PendingAuthentication[]> {
    return this.http.get<PendingAuthentication[]>(`${this.base}/authentications`);
  }

  approveAuthentication(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/authentications/${id}/approve`, null);
  }

  rejectAuthentication(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/authentications/${id}/reject`, null);
  }

  /** The signed-in customer's disputes, newest first. */
  disputes(): Observable<Dispute[]> {
    return this.http.get<Dispute[]>(`${this.base}/disputes`);
  }

  /** Disputes a posted payment: the bank credits the amount for now and sends a chargeback through the network. */
  fileDispute(authorizationId: string, request: DisputeRequest): Observable<Dispute> {
    return this.http.post<Dispute>(`${this.base}/payments/${authorizationId}/dispute`, request);
  }

  /** Holds that still reserve money. */
  pending(id: string): Observable<AuthorizationPage> {
    return this.http.get<AuthorizationPage>(`${this.base}/${id}/authorizations`, { params: new HttpParams().set('pending', true) });
  }

  activity(id: string, page: number, size: number): Observable<AuthorizationPage> {
    return this.http.get<AuthorizationPage>(`${this.base}/${id}/authorizations`, {
      params: new HttpParams().set('page', page).set('size', size),
    });
  }
}
