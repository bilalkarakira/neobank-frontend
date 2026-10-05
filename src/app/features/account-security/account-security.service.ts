import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ChangePasswordRequest, Session } from './account-security.models';

@Injectable({ providedIn: 'root' })
export class AccountSecurityService {
  private readonly http = inject(HttpClient);

  sessions(): Observable<Session[]> {
    return this.http.get<Session[]>('/api/sessions');
  }

  /** Ends one login. Ending the current one is a logout. */
  revoke(sessionId: string): Observable<void> {
    return this.http.delete<void>(`/api/sessions/${sessionId}`);
  }

  /** Ends every login except this device's. */
  revokeOthers(): Observable<void> {
    return this.http.post<void>('/api/sessions/revoke-others', null);
  }

  /** Changes the password; the server also ends every other login. */
  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.post<void>('/api/me/password', request);
  }
}
