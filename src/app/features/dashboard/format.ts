const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD_WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Only ever used to DISPLAY a decimal string from the API; never for arithmetic. */
export function formatMoney(value: string | number): string {
  return USD.format(Number(value));
}

/** Axis ticks: $0, $500, $1.2K, $3M. Clean and short, thousands-aware. */
export function formatCompactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}K`;
  return `${sign}${USD_WHOLE.format(abs)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/** "2026-10-04" -> "Oct 4" (the day is a UTC day, never shifted by the viewer's time zone). */
export function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "2026-10-04" -> "Sun, Oct 4, 2026". */
export function formatLongDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

/** "2026-10" -> "Oct ’26" for axis labels. */
export function formatMonthShort(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  const name = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${name} ’${String(date.getUTCFullYear()).slice(2)}`;
}

/** "2026-10" -> "October 2026". */
export function formatMonthLong(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** A percentage change, with direction as a glyph so color is never the only signal. */
export function formatChange(change: number | null): string {
  if (change === null) {
    return 'No data last month';
  }
  if (change === 0) {
    return '● No change vs last month';
  }
  return `${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs last month`;
}
