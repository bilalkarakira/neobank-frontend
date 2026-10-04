import type { ChartConfiguration, Plugin } from 'chart.js';
import { BalancePoint, CashflowMonth } from './analytics.models';
import {
  formatCompactMoney,
  formatDay,
  formatLongDay,
  formatMoney,
  formatMonthLong,
  formatMonthShort,
} from './format';
import { VizTheme, withAlpha } from './viz-theme';

const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Shared look: recessive hairline grid, muted axis text, no axis border, no legend inside the canvas. */
function baseOptions(theme: VizTheme) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    font: { family: FONT, size: 12 },
    color: theme.textMuted,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false }, // the HTML legend (two series) or the card title (one series) carries identity
    },
  };
}

/** One tooltip listing every series at the hovered X: values lead (bold), series name follows, line keys not boxes. */
/** The few fields of a Chart.js tooltip item that these callbacks read (Chart.js's own generic types are far wider). */
interface HoverItem {
  label: string;
  parsed: { y?: number | null };
  dataset: { label?: string };
  datasetIndex: number;
}

/** Plain options object; the one cast to Chart.js's per-chart option type happens where it is attached. */
function tooltip(theme: VizTheme, title: (items: HoverItem[]) => string, keyColors: string[]) {
  return {
    backgroundColor: theme.surface,
    titleColor: theme.textSecondary,
    bodyColor: theme.textPrimary,
    borderColor: theme.grid,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    displayColors: true,
    boxWidth: 12,
    boxHeight: 2,
    usePointStyle: false,
    titleFont: { family: FONT, size: 12, weight: 'normal' as const },
    bodyFont: { family: FONT, size: 13, weight: 'bold' as const },
    callbacks: {
      title,
      label: (item: HoverItem) => ` ${formatMoney(item.parsed.y ?? 0)}  ${item.dataset.label ?? ''}`,
      // the short stroke that keys each row to its series
      labelColor: (item: HoverItem) => ({
        borderColor: keyColors[item.datasetIndex],
        backgroundColor: keyColors[item.datasetIndex],
        borderWidth: 0,
        borderRadius: 0,
      }),
    },
  };
}

/** A vertical hairline that follows the pointer, snapped to the hovered data position. */
function crosshair(theme: VizTheme): Plugin<'line'> {
  return {
    id: 'crosshair',
    afterDatasetsDraw(chart) {
      const active = chart.tooltip?.getActiveElements() ?? [];
      if (active.length === 0) {
        return;
      }
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(active[0].element.x, chartArea.top);
      ctx.lineTo(active[0].element.x, chartArea.bottom);
      ctx.lineWidth = 1;
      ctx.strokeStyle = theme.textMuted;
      ctx.stroke();
      ctx.restore();
    },
  };
}

/** The one direct label: the latest value, on an end-dot (r=4) with a 2px ring in the surface color. */
function endLabel(theme: VizTheme): Plugin<'line'> {
  return {
    id: 'endLabel',
    afterDatasetsDraw(chart) {
      const points = chart.getDatasetMeta(0).data;
      const last = points[points.length - 1];
      const value = chart.data.datasets[0]?.data[points.length - 1];
      if (!last || typeof value !== 'number') {
        return;
      }
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = theme.surface;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = theme.balance;
      ctx.fill();

      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = theme.textPrimary; // text wears the text token, never the series color
      ctx.textAlign = 'right';
      // Below the dot, over the light area wash, nothing crosses the label (the line arrives from above). Only when
      // the dot sits at the very bottom is the label placed above it instead.
      const below = last.y + 24 <= chartArea.bottom;
      ctx.textBaseline = below ? 'top' : 'bottom';
      const y = below ? last.y + 10 : last.y - 10;
      // a halo in the surface color keeps the label legible over gridlines
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = theme.surface;
      ctx.strokeText(formatMoney(value), last.x + 6, y);
      ctx.fillText(formatMoney(value), last.x + 6, y);
      ctx.restore();
    },
  };
}

/** Balance over time: ONE series, so no legend box; 2px line, a ~10% wash, end label, crosshair + tooltip. */
export function balanceLineConfig(points: BalancePoint[], theme: VizTheme): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: points.map((p) => p.date),
      datasets: [
        {
          label: 'Balance',
          data: points.map((p) => Number(p.balance)),
          borderColor: theme.balance,
          backgroundColor: withAlpha(theme.balance, 0.1),
          borderWidth: 2,
          borderJoinStyle: 'round',
          borderCapStyle: 'round',
          fill: 'origin',
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: theme.balance,
          pointHoverBorderColor: theme.surface,
          pointHoverBorderWidth: 2,
          tension: 0,
        },
      ],
    },
    options: {
      ...baseOptions(theme),
      layout: { padding: { top: 8, right: 12 } },
      plugins: {
        ...baseOptions(theme).plugins,
        tooltip: tooltip(theme, (items) => formatLongDay(items[0]?.label ?? ''), [theme.balance]) as never,
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            maxTicksLimit: 6,
            maxRotation: 0,
            color: theme.textMuted,
            callback(value) {
              return formatDay(String(this.getLabelForValue(Number(value))));
            },
          },
        },
        y: {
          grid: { color: theme.grid, lineWidth: 1 },
          border: { display: false },
          grace: '8%',
          ticks: { maxTicksLimit: 5, color: theme.textMuted, callback: (value) => formatCompactMoney(Number(value)) },
        },
      },
    },
    plugins: [crosshair(theme), endLabel(theme)],
  };
}

/**
 * Income vs spending per month: two series (hues from the validated palette), thin columns (<= 24px) with a 4px
 * rounded tip and a square base, and a 2px surface gap between touching marks. The legend is HTML (see dashboard).
 */
export function cashflowBarConfig(months: CashflowMonth[], theme: VizTheme): ChartConfiguration<'bar'> {
  const series = (label: string, key: 'income' | 'spending', color: string) => ({
    label,
    data: months.map((m) => Number(m[key])),
    backgroundColor: color,
    hoverBackgroundColor: color,
    // a 2px border in the SURFACE color is the gap between touching columns (white doing the separating)
    borderColor: theme.surface,
    borderWidth: 2,
    borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
    borderSkipped: false as const,
    maxBarThickness: 24,
    barPercentage: 0.9,
    categoryPercentage: 0.7,
  });
  return {
    type: 'bar',
    data: {
      labels: months.map((m) => m.month),
      datasets: [series('Income', 'income', theme.income), series('Spending', 'spending', theme.spending)],
    },
    options: {
      ...baseOptions(theme),
      layout: { padding: { top: 8 } },
      plugins: {
        ...baseOptions(theme).plugins,
        tooltip: tooltip(theme, (items) => formatMonthLong(items[0]?.label ?? ''), [theme.income, theme.spending]) as never,
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            maxRotation: 0,
            color: theme.textMuted,
            callback(value) {
              return formatMonthShort(String(this.getLabelForValue(Number(value))));
            },
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: theme.grid, lineWidth: 1 },
          border: { display: false },
          ticks: { maxTicksLimit: 5, color: theme.textMuted, callback: (value) => formatCompactMoney(Number(value)) },
        },
      },
    },
  };
}

/** Screen-reader summary of the balance chart. */
export function describeBalance(points: BalancePoint[]): string {
  if (points.length === 0) {
    return 'Balance over time: no data.';
  }
  const values = points.map((p) => Number(p.balance));
  const first = points[0];
  const last = points[points.length - 1];
  return (
    `Line chart of your balance over time. It goes from ${formatMoney(first.balance)} on ${formatDay(first.date)} ` +
    `to ${formatMoney(last.balance)} on ${formatDay(last.date)}. ` +
    `Lowest ${formatMoney(Math.min(...values))}, highest ${formatMoney(Math.max(...values))}.`
  );
}

/** Screen-reader summary of the cash-flow chart. */
export function describeCashflow(months: CashflowMonth[]): string {
  if (months.length === 0) {
    return 'Income and spending per month: no data.';
  }
  const income = months.reduce((sum, m) => sum + Number(m.income), 0);
  const spending = months.reduce((sum, m) => sum + Number(m.spending), 0);
  return (
    `Column chart of income and spending for ${months.length} months, ` +
    `${formatMonthShort(months[0].month)} to ${formatMonthShort(months[months.length - 1].month)}. ` +
    `Total income ${formatMoney(income)}, total spending ${formatMoney(spending)}.`
  );
}
