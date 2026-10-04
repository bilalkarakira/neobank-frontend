import {
  formatChange,
  formatCompactMoney,
  formatDay,
  formatLongDay,
  formatMoney,
  formatMonthLong,
  formatMonthShort,
} from './format';

describe('dashboard formatting', () => {
  it('formats money as USD with thousands separators', () => {
    expect(formatMoney('2764.5')).toBe('$2,764.50');
    expect(formatMoney('0')).toBe('$0.00');
    expect(formatMoney('-12.3')).toBe('-$12.30');
  });

  it('formats axis ticks compactly', () => {
    expect(formatCompactMoney(0)).toBe('$0');
    expect(formatCompactMoney(500)).toBe('$500');
    expect(formatCompactMoney(1000)).toBe('$1K');
    expect(formatCompactMoney(1250)).toBe('$1.3K');
    expect(formatCompactMoney(2_500_000)).toBe('$2.5M');
    expect(formatCompactMoney(-1500)).toBe('-$1.5K');
  });

  it('formats days and months in UTC, never shifted by the time zone', () => {
    expect(formatDay('2026-10-04')).toBe('Oct 4');
    expect(formatDay('2026-01-01')).toBe('Jan 1');
    expect(formatLongDay('2026-10-04')).toBe('Sun, Oct 4, 2026');
    expect(formatMonthShort('2026-10')).toBe('Oct ’26');
    expect(formatMonthLong('2026-10')).toBe('October 2026');
  });

  it('describes a change with a direction glyph so color is never the only signal', () => {
    expect(formatChange(140)).toBe('▲ 140.0% vs last month');
    expect(formatChange(-12.34)).toBe('▼ 12.3% vs last month');
    expect(formatChange(0)).toBe('● No change vs last month');
    expect(formatChange(null)).toBe('No data last month');
  });
});
