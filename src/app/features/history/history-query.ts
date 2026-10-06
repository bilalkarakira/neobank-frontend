import { ParamMap } from '@angular/router';
import { HistoryFilter, SortOption } from './history.models';

export const DEFAULT_FILTER: HistoryFilter = {
  from: '',
  to: '',
  type: '',
  direction: '',
  recurring: '',
  minAmount: '',
  maxAmount: '',
  q: '',
  sort: 'date,desc',
  page: 0,
  size: 20,
};

export const PAGE_SIZES = [10, 20, 50, 100];
const TYPES: HistoryFilter['type'][] = ['', 'DEPOSIT', 'TRANSFER', 'INTEREST', 'CARD_PURCHASE', 'CARD_REFUND', 'CARD_COLLECTION'];
const SORTS: SortOption[] = ['date,desc', 'date,asc', 'amount,desc', 'amount,asc'];

export interface HistoryQuery {
  accountId: string | null;
  filter: HistoryFilter;
}

/** The page's state lives in the URL, so back/forward work and a filtered view can be bookmarked. */
export function parseQuery(params: ParamMap): HistoryQuery {
  const sort = params.get('sort') as SortOption | null;
  const type = params.get('type');
  const direction = params.get('direction');
  const recurring = params.get('recurring');
  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  return {
    accountId: params.get('account'),
    filter: {
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      type: TYPES.includes(type as HistoryFilter['type']) && type !== '' ? (type as HistoryFilter['type']) : '',
      direction: direction === 'IN' || direction === 'OUT' ? direction : '',
      recurring: recurring === 'true' || recurring === 'false' ? recurring : '',
      minAmount: params.get('min') ?? '',
      maxAmount: params.get('max') ?? '',
      q: params.get('q') ?? '',
      sort: sort && SORTS.includes(sort) ? sort : DEFAULT_FILTER.sort,
      page: Number.isInteger(page) && page > 0 ? page : 0,
      size: PAGE_SIZES.includes(size) ? size : DEFAULT_FILTER.size,
    },
  };
}

/** Only non-default values go into the URL, which keeps it short and readable. */
export function toQueryParams(accountId: string | null, filter: HistoryFilter): Record<string, string> {
  const out: Record<string, string> = {};
  if (accountId) out['account'] = accountId;
  if (filter.from) out['from'] = filter.from;
  if (filter.to) out['to'] = filter.to;
  if (filter.type) out['type'] = filter.type;
  if (filter.direction) out['direction'] = filter.direction;
  if (filter.recurring) out['recurring'] = filter.recurring;
  if (filter.minAmount) out['min'] = filter.minAmount;
  if (filter.maxAmount) out['max'] = filter.maxAmount;
  if (filter.q) out['q'] = filter.q;
  if (filter.sort !== DEFAULT_FILTER.sort) out['sort'] = filter.sort;
  if (filter.page > 0) out['page'] = String(filter.page);
  if (filter.size !== DEFAULT_FILTER.size) out['size'] = String(filter.size);
  return out;
}

/** The API's parameter names (note minAmount/maxAmount); paging is only sent for the list, never for the export. */
export function toApiParams(filter: HistoryFilter, withPaging: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  if (filter.from) out['from'] = filter.from;
  if (filter.to) out['to'] = filter.to;
  if (filter.type) out['type'] = filter.type;
  if (filter.direction) out['direction'] = filter.direction;
  if (filter.recurring) out['recurring'] = filter.recurring;
  if (filter.minAmount) out['minAmount'] = filter.minAmount;
  if (filter.maxAmount) out['maxAmount'] = filter.maxAmount;
  if (filter.q) out['q'] = filter.q;
  out['sort'] = filter.sort;
  if (withPaging) {
    out['page'] = String(filter.page);
    out['size'] = String(filter.size);
  }
  return out;
}
