import { DEFAULT_VIZ_THEME, readVizTheme, withAlpha } from './viz-theme';

describe('viz theme', () => {
  it('turns a hex color into a translucent wash', () => {
    expect(withAlpha('#2a78d6', 0.1)).toBe('rgba(42, 120, 214, 0.1)');
    expect(withAlpha('not-a-hex', 0.1)).toBe('not-a-hex');
  });

  it('uses the validated palette slots by default: balance blue, spending orange, income aqua', () => {
    expect(DEFAULT_VIZ_THEME.balance).toBe('#2a78d6');
    expect(DEFAULT_VIZ_THEME.spending).toBe('#eb6834');
    expect(DEFAULT_VIZ_THEME.income).toBe('#1baf7a');
  });

  it('lets CSS custom properties override the defaults', () => {
    const root = document.createElement('div');
    root.style.setProperty('--viz-balance', '#123456');
    document.body.appendChild(root);

    const theme = readVizTheme(root);

    expect(theme.balance).toBe('#123456');
    expect(theme.income).toBe(DEFAULT_VIZ_THEME.income); // untouched properties keep their default
    root.remove();
  });
});
