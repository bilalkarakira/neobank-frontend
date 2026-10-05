import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Logo } from './logo';

describe('Logo', () => {
  let fixture: ComponentFixture<Logo>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Logo] });
    fixture = TestBed.createComponent(Logo);
  });

  it('draws the mark at the requested size and spells the name', () => {
    fixture.componentRef.setInput('size', 52);
    fixture.detectChanges();
    const svg = el().querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('52');
    expect(svg.getAttribute('aria-hidden')).toBe('true'); // decorative: the wordmark carries the name
    expect(el().textContent).toContain('NeoBank');
  });

  it('can show the mark alone', () => {
    fixture.componentRef.setInput('wordmark', false);
    fixture.detectChanges();
    expect(el().textContent?.trim()).toBe('');
    expect(el().querySelector('svg')).not.toBeNull();
  });

  it('uses a lighter tile with a hairline edge on dark surfaces so it does not vanish into them', () => {
    fixture.detectChanges();
    expect(el().querySelector('rect')?.getAttribute('fill')).toBe('#0F172A');
    expect(el().querySelectorAll('rect').length).toBe(1);

    fixture.componentRef.setInput('onDark', true);
    fixture.detectChanges();
    expect(el().querySelector('rect')?.getAttribute('fill')).toBe('#1E293B');
    expect(el().querySelectorAll('rect').length).toBe(2);
  });
});
