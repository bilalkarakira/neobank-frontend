import { BalancePoint, CashflowMonth } from './analytics.models';
import { balanceLineConfig, cashflowBarConfig, describeBalance, describeCashflow } from './chart-configs';
import { DEFAULT_VIZ_THEME as theme } from './viz-theme';

const POINTS: BalancePoint[] = [
  { date: '2026-10-01', balance: '100.00' },
  { date: '2026-10-02', balance: '1250.50' },
  { date: '2026-10-03', balance: '900.00' },
];
const MONTHS: CashflowMonth[] = [
  { month: '2026-08', income: '3200.00', spending: '1800.50' },
  { month: '2026-09', income: '3300.00', spending: '2100.00' },
];

// the chart callbacks only use these bits of the Chart.js context
const scaleContext = (labels: string[]) => ({ getLabelForValue: (v: number) => labels[v] });
const tooltipItem = (label: string, y: number, datasetLabel: string, datasetIndex = 0) =>
  ({ label, parsed: { y }, dataset: { label: datasetLabel }, datasetIndex }) as never;

describe('balance line chart', () => {
  const config = balanceLineConfig(POINTS, theme);
  const dataset = config.data.datasets[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = config.options as any;

  it('plots one series from the numeric balances, labelled by day', () => {
    expect(config.type).toBe('line');
    expect(config.data.labels).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(dataset.data).toEqual([100, 1250.5, 900]);
    expect(config.data.datasets.length).toBe(1);
  });

  it('follows the mark specs: 2px line in the balance color, ~10% wash, no markers except on hover', () => {
    expect(dataset.borderWidth).toBe(2);
    expect(dataset.borderColor).toBe(theme.balance);
    expect(dataset.backgroundColor).toBe('rgba(42, 120, 214, 0.1)');
    expect(dataset.pointRadius).toBe(0);
    expect(dataset.pointHoverRadius).toBeGreaterThanOrEqual(4);
    expect(dataset.pointHoverBorderColor).toBe(theme.surface); // 2px ring in the surface color
  });

  it('has no legend (one series: the card title names it) and a shared tooltip at the hovered date', () => {
    expect(options.plugins.legend.display).toBe(false);
    expect(options.interaction).toEqual({ mode: 'index', intersect: false });
    const callbacks = options.plugins.tooltip.callbacks;
    expect(callbacks.title([tooltipItem('2026-10-04', 0, 'Balance')])).toBe('Sun, Oct 4, 2026');
    expect(callbacks.label(tooltipItem('2026-10-04', 2764.5, 'Balance'))).toBe(' $2,764.50  Balance'); // value first
    expect(callbacks.labelColor(tooltipItem('2026-10-04', 1, 'Balance')).backgroundColor).toBe(theme.balance);
    expect(options.plugins.tooltip.boxHeight).toBe(2); // a short stroke, not a box
  });

  it('keeps the grid recessive and formats the axes', () => {
    expect(options.scales.y.grid.lineWidth).toBe(1);
    expect(options.scales.y.grid.color).toBe(theme.grid);
    expect(options.scales.x.grid.display).toBe(false);
    expect(options.scales.y.ticks.callback(1250)).toBe('$1.3K');
    expect(options.scales.x.ticks.callback.call(scaleContext(['2026-10-01', '2026-10-02']), 1)).toBe('Oct 2');
  });

  it('adds a crosshair and the end label as plugins, and tolerates an empty series', () => {
    expect(config.plugins?.map((p) => p.id)).toEqual(['crosshair', 'endLabel']);
    expect(() => balanceLineConfig([], theme)).not.toThrow();
    expect(balanceLineConfig([], theme).data.datasets[0].data).toEqual([]);
  });
});

describe('cash-flow column chart', () => {
  const config = cashflowBarConfig(MONTHS, theme);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = config.options as any;

  it('has an income series and a spending series with their own, fixed colors', () => {
    expect(config.type).toBe('bar');
    expect(config.data.labels).toEqual(['2026-08', '2026-09']);
    const [income, spending] = config.data.datasets;
    expect(income.label).toBe('Income');
    expect(income.data).toEqual([3200, 3300]);
    expect(income.backgroundColor).toBe(theme.income);
    expect(spending.label).toBe('Spending');
    expect(spending.data).toEqual([1800.5, 2100]);
    expect(spending.backgroundColor).toBe(theme.spending);
  });

  it('follows the mark specs: thin columns, 4px rounded tip with a square base, 2px surface gap', () => {
    for (const dataset of config.data.datasets as unknown as Record<string, unknown>[]) {
      expect(dataset['maxBarThickness']).toBeLessThanOrEqual(24);
      expect(dataset['borderRadius']).toEqual({ topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 });
      expect(dataset['borderWidth']).toBe(2);
      expect(dataset['borderColor']).toBe(theme.surface); // white doing the separating
    }
  });

  it('starts at zero, lists both series in one tooltip and keys each row with its own color', () => {
    expect(options.scales.y.beginAtZero).toBe(true);
    const callbacks = options.plugins.tooltip.callbacks;
    expect(callbacks.title([tooltipItem('2026-09', 0, 'Income')])).toBe('September 2026');
    expect(callbacks.label(tooltipItem('2026-09', 3300, 'Income', 0))).toBe(' $3,300.00  Income');
    expect(callbacks.labelColor(tooltipItem('2026-09', 1, 'Income', 0)).backgroundColor).toBe(theme.income);
    expect(callbacks.labelColor(tooltipItem('2026-09', 1, 'Spending', 1)).backgroundColor).toBe(theme.spending);
    expect(options.scales.x.ticks.callback.call(scaleContext(['2026-08', '2026-09']), 1)).toBe('Sep ’26');
  });
});

describe('chart text alternatives', () => {
  it('summarises the balance chart for screen readers', () => {
    const text = describeBalance(POINTS);

    expect(text).toContain('$100.00 on Oct 1');
    expect(text).toContain('$900.00 on Oct 3');
    expect(text).toContain('Lowest $100.00, highest $1,250.50');
    expect(describeBalance([])).toBe('Balance over time: no data.');
  });

  it('summarises the cash-flow chart for screen readers', () => {
    const text = describeCashflow(MONTHS);

    expect(text).toContain('2 months');
    expect(text).toContain('Total income $6,500.00');
    expect(text).toContain('total spending $3,900.50');
    expect(describeCashflow([])).toBe('Income and spending per month: no data.');
  });
});
