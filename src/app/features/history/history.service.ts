import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { toApiParams } from './history-query';
import { HistoryFilter, HistoryPage } from './history.models';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);

  list(accountId: string, filter: HistoryFilter): Observable<HistoryPage> {
    return this.http.get<HistoryPage>(`/api/accounts/${accountId}/transactions`, {
      params: new HttpParams({ fromObject: toApiParams(filter, true) }),
    });
  }

  /** The file needs the bearer token, so it is fetched as a blob (a plain link could not send the header). */
  exportCsv(accountId: string, filter: HistoryFilter): Observable<HttpResponse<Blob>> {
    return this.http.get(`/api/accounts/${accountId}/transactions/export.csv`, {
      params: new HttpParams({ fromObject: toApiParams(filter, false) }),
      observe: 'response',
      responseType: 'blob',
    });
  }
}
