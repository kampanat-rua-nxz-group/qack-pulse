import { escapeHtml } from './render.ts';

// A small "i" button that shows its text on hover or focus. The text stays in the page and describes the button,
// so screen readers still read it. The tooltip is placed against the nearest `.tip-host` ancestor.
export const tip = (id: string, label: string, text: string): string =>
  `<span class="tip"><button type="button" class="tip-button" aria-label="${escapeHtml(label)}" aria-describedby="${id}">i</button><span class="tip-text" role="tooltip" id="${id}">${escapeHtml(text)}</span></span>`;
