/**
 * Chart colors come from CSS custom properties (see styles.css) so the palette lives in one place. Chart.js draws on
 * a canvas and needs literal color strings, so they are resolved once per render. The defaults mirror styles.css
 * and are used when a property is missing (tests, or a page without the stylesheet).
 */
export interface VizTheme {
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  grid: string;
  /** Series colors: one entity, one color, in every chart. */
  balance: string;
  income: string;
  spending: string;
}

/** Light-mode values of the validated reference palette (slots 1, 3, 2) and its neutral ink/surface tokens. */
export const DEFAULT_VIZ_THEME: VizTheme = {
  surface: '#fcfcfb',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#6b6a66',
  grid: '#ebeae7',
  balance: '#2a78d6',
  income: '#1baf7a',
  spending: '#eb6834',
};

const PROPERTIES: Record<keyof VizTheme, string> = {
  surface: '--viz-surface',
  textPrimary: '--viz-text-primary',
  textSecondary: '--viz-text-secondary',
  textMuted: '--viz-text-muted',
  grid: '--viz-grid',
  balance: '--viz-balance',
  income: '--viz-income',
  spending: '--viz-spending',
};

export function readVizTheme(root: Element = document.documentElement): VizTheme {
  const style = getComputedStyle(root);
  const theme = { ...DEFAULT_VIZ_THEME };
  for (const key of Object.keys(PROPERTIES) as (keyof VizTheme)[]) {
    const value = style.getPropertyValue(PROPERTIES[key]).trim();
    if (value) {
      theme[key] = value;
    }
  }
  return theme;
}

/** "#2a78d6" + 0.1 -> "rgba(42, 120, 214, 0.1)": the area wash under a line. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) {
    return hex;
  }
  const n = parseInt(match[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
