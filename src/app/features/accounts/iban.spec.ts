import { formatIban } from './iban';

describe('formatIban', () => {
  it('groups the IBAN in blocks of four', () => {
    expect(formatIban('XX47NEOB1000000001')).toBe('XX47 NEOB 1000 0000 01');
  });

  it('leaves short values untouched', () => {
    expect(formatIban('XX47')).toBe('XX47');
  });
});
