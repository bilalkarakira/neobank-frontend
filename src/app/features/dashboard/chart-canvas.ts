import { Component, DestroyRef, ElementRef, InjectionToken, effect, inject, input, viewChild } from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

// register only what the dashboard uses (keeps the bundle small)
Chart.register(LineController, LineElement, PointElement, BarController, BarElement, CategoryScale, LinearScale, Filler, Tooltip);

/** Creates a chart on a canvas. The default draws with Chart.js; tests provide a recorder, because the test DOM has no real canvas. */
export interface ChartHandle {
  destroy(): void;
}

export type ChartFactory = (canvas: HTMLCanvasElement, config: ChartConfiguration) => ChartHandle;

export const CHART_FACTORY = new InjectionToken<ChartFactory>('CHART_FACTORY', {
  providedIn: 'root',
  factory: () => (canvas, config) => new Chart(canvas, config),
});

/**
 * The single place that touches Chart.js. It draws a configuration on a canvas, rebuilds when the configuration
 * changes, and destroys the chart with the component. The canvas is an image for assistive technology, so every
 * chart carries a text summary (and the dashboard offers a table view with the same numbers).
 */
@Component({
  selector: 'app-chart-canvas',
  template: `<canvas #canvas role="img" [attr.aria-label]="label()"></canvas>`,
  host: { class: 'relative block h-full w-full' },
})
export class ChartCanvas {
  readonly config = input.required<ChartConfiguration>();
  readonly label = input('');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly createChart = inject(CHART_FACTORY);
  private chart: ChartHandle | null = null;

  constructor() {
    effect(() => {
      const config = this.config();
      this.chart?.destroy();
      this.chart = this.createChart(this.canvas().nativeElement, config);
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}
