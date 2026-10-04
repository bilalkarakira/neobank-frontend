import { Component, DestroyRef, ElementRef, effect, inject, input, viewChild } from '@angular/core';
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
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const config = this.config();
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, config);
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}
