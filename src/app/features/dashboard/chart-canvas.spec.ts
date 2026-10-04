import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Chart, ChartConfiguration } from 'chart.js';
import { ChartCanvas } from './chart-canvas';

// there is no real canvas in the test DOM, so Chart.js is replaced by a recorder
vi.mock('chart.js', () => {
  class FakeChart {
    static register = vi.fn();
    static instances: FakeChart[] = [];
    destroy = vi.fn();
    constructor(public canvas: HTMLCanvasElement, public config: unknown) {
      FakeChart.instances.push(this);
    }
  }
  const stub = class {};
  return {
    Chart: FakeChart, LineController: stub, LineElement: stub, PointElement: stub, BarController: stub,
    BarElement: stub, CategoryScale: stub, LinearScale: stub, Filler: stub, Tooltip: stub,
  };
});

type Fake = { canvas: HTMLCanvasElement; config: unknown; destroy: ReturnType<typeof vi.fn> };
const instances = () => (Chart as unknown as { instances: Fake[] }).instances;

@Component({
  imports: [ChartCanvas],
  template: `<app-chart-canvas [config]="config()" [label]="label()" />`,
})
class Host {
  config = signal<ChartConfiguration>({ type: 'line', data: { labels: ['a'], datasets: [] } });
  label = signal('A line chart');
}

describe('ChartCanvas', () => {
  beforeEach(() => (instances().length = 0));

  it('draws the configuration on a canvas that is an image with a text alternative', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('A line chart');
    expect(instances().length).toBe(1);
    expect(instances()[0].canvas).toBe(canvas);
    expect((instances()[0].config as ChartConfiguration).type).toBe('line');
  });

  it('rebuilds the chart when the configuration changes, destroying the old one', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const first = instances()[0];

    fixture.componentInstance.config.set({ type: 'bar', data: { labels: ['b'], datasets: [] } });
    fixture.detectChanges();

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(instances().length).toBe(2);
    expect((instances()[1].config as ChartConfiguration).type).toBe('bar');
  });

  it('destroys the chart with the component (no leaked canvases)', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const chart = instances()[0];

    fixture.destroy();

    expect(chart.destroy).toHaveBeenCalled();
  });
});
