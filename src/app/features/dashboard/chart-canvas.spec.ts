import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChartConfiguration } from 'chart.js';
import { CHART_FACTORY, ChartCanvas, ChartFactory } from './chart-canvas';

// there is no real canvas in the test DOM, so the component is given a factory that records what it is asked to draw
// (and not a replaced chart.js module: that depends on which spec file loaded the component first in a worker)
type Fake = { canvas: HTMLCanvasElement; config: ChartConfiguration; destroy: () => void };
const created: Fake[] = [];
const recorder: ChartFactory = (canvas, config) => {
  const fake: Fake = { canvas, config, destroy: vi.fn() };
  created.push(fake);
  return fake;
};

@Component({
  imports: [ChartCanvas],
  template: `<app-chart-canvas [config]="config()" [label]="label()" />`,
})
class Host {
  config = signal<ChartConfiguration>({ type: 'line', data: { labels: ['a'], datasets: [] } });
  label = signal('A line chart');
}

describe('ChartCanvas', () => {
  beforeEach(() => {
    created.length = 0;
    TestBed.configureTestingModule({ providers: [{ provide: CHART_FACTORY, useValue: recorder }] });
  });

  it('draws the configuration on a canvas that is an image with a text alternative', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas')!;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('A line chart');
    expect(created.length).toBe(1);
    expect(created[0].canvas).toBe(canvas);
    expect(created[0].config.type).toBe('line');
  });

  it('rebuilds the chart when the configuration changes, destroying the old one', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const first = created[0];

    fixture.componentInstance.config.set({ type: 'bar', data: { labels: ['b'], datasets: [] } });
    fixture.detectChanges();

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(created.length).toBe(2);
    expect(created[1].config.type).toBe('bar');
  });

  it('destroys the chart with the component (no leaked canvases)', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const chart = created[0];

    fixture.destroy();

    expect(chart.destroy).toHaveBeenCalled();
  });
});
