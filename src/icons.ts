// Status shapes follow the Playwright HTML reporter: check, cross, warning triangle, skip glyph.
// Each icon pairs with a text label, so color is never the only signal.
const svg = (shapes: string): string =>
  `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;

export const ICONS: Record<'executed' | 'passed' | 'failed' | 'flaky' | 'skipped', string> = {
  executed: svg('<path d="M2.5 8h2.5l1.5-4 3 8 1.5-4h2.5"/>'),
  passed: svg('<path d="M3.5 8.5l3 3 6-7"/>'),
  failed: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  flaky: svg('<path d="M8 2.5l6 10.5H2z"/><path d="M8 7v2.5M8 11.3v.1"/>'),
  skipped: svg('<circle cx="8" cy="8" r="5.5"/><path d="M4.3 11.7l7.4-7.4"/>'),
};

export const LOGO =
  '<svg class="logo" viewBox="0 0 44 44" width="44" height="44" fill="none" aria-hidden="true"><rect width="44" height="44" rx="11" fill="var(--color-surface-card-top)" stroke="var(--color-brand-border)" stroke-width="1.25"/><path d="M6 22h32" stroke="var(--color-guide)" stroke-width="1" stroke-dasharray="2 3"/><path d="M6 22h6l2 2 2-5 2 3l2.5 6 3.5-18 4.5 20 8.5-15" stroke="var(--color-brand-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="37" cy="15" r="2" fill="var(--color-brand-secondary)"/></svg>';

