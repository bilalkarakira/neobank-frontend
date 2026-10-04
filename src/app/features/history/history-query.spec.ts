import { convertToParamMap } from '@angular/router';
import { DEFAULT_FILTER, parseQuery, toApiParams, toQueryParams } from './history-query';

describe('history query helpers', () => {
  it('parses an empty URL into the defaults', () => {
    expect(parseQuery(convertToParamMap({}))).toEqual({ accountId: null, filter: DEFAULT_FILTER });
  });

  it('parses every URL parameter', () => {
    const { accountId, filter } = parseQuery(
      convertToParamMap({
        account: 'a1', from: '2026-03-01', to: '2026-03-31', type: 'TRANSFER', direction: 'OUT',
        min: '10', max: '99.50', q: 'rent', sort: 'amount,asc', page: '3', size: '50',
      }),
    );

    expect(accountId).toBe('a1');
    expect(filter).toEqual({
      from: '2026-03-01', to: '2026-03-31', type: 'TRANSFER', direction: 'OUT', minAmount: '10',
      maxAmount: '99.50', q: 'rent', sort: 'amount,asc', page: 3, size: 50,
    });
  });

  it('accepts the interest transaction type', () => {
    expect(parseQuery(convertToParamMap({ type: 'INTEREST' })).filter.type).toBe('INTEREST');
  });

  it('ignores junk values instead of passing them to the server', () => {
    const { filter } = parseQuery(
      convertToParamMap({ type: 'EVIL', direction: 'SIDEWAYS', sort: 'x; drop table', page: '-4', size: '9999' }),
    );

    expect(filter.type).toBe('');
    expect(filter.direction).toBe('');
    expect(filter.sort).toBe('date,desc');
    expect(filter.page).toBe(0);
    expect(filter.size).toBe(20);
  });

  it('keeps the URL short: defaults are omitted', () => {
    expect(toQueryParams('a1', DEFAULT_FILTER)).toEqual({ account: 'a1' });
    expect(toQueryParams('a1', { ...DEFAULT_FILTER, q: 'x', page: 2, size: 50, sort: 'date,asc' })).toEqual({
      account: 'a1', q: 'x', page: '2', size: '50', sort: 'date,asc',
    });
  });

  it('round-trips a filter through the URL', () => {
    const filter = { ...DEFAULT_FILTER, from: '2026-01-01', type: 'DEPOSIT' as const, minAmount: '5', page: 1 };
    const params = toQueryParams('a1', filter);

    expect(parseQuery(convertToParamMap(params)).filter).toEqual(filter);
  });

  it('maps to the API parameter names and only sends paging for the list', () => {
    const filter = { ...DEFAULT_FILTER, minAmount: '5', maxAmount: '9', q: 'x', page: 2, size: 50 };

    expect(toApiParams(filter, true)).toEqual({
      minAmount: '5', maxAmount: '9', q: 'x', sort: 'date,desc', page: '2', size: '50',
    });
    expect(toApiParams(filter, false)).toEqual({ minAmount: '5', maxAmount: '9', q: 'x', sort: 'date,desc' });
  });
});
