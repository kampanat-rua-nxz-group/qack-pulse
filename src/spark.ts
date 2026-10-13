import type { TrendPoint } from './trend.ts';

const WIDTH = 84;
const HEIGHT = 24;
const PAD = 3;

export type SparkSize = { width: number; height: number };
const SMALL: SparkSize = { width: WIDTH, height: HEIGHT };
const MIN_SPAN = 0.05;

type Dot = readonly [number, number];

const fmt = (value: number): string => value.toFixed(1);

// Inline SVG built from numbers only, so nothing needs escaping.
// The vertical scale fits the data but never spans less than MIN_SPAN, so a steady series stays a flat line.
export function sparkline(points: TrendPoint[], { width, height }: SparkSize = SMALL): string {
  const rated = points.flatMap((point) => (point.passRate === null ? [] : [point.passRate]));
  if (rated.length === 0) return '';
  const lo = Math.min(...rated);
  const hi = Math.max(...rated);
  const span = Math.max(hi - lo, MIN_SPAN);
  const top = (lo + hi) / 2 + span / 2;
  const x = (index: number): number => PAD + (index * (width - 2 * PAD)) / Math.max(points.length - 1, 1);
  const y = (rate: number): number => PAD + ((top - rate) / span) * (height - 2 * PAD);

  const segments: Dot[][] = [];
  let current: Dot[] = [];
  points.forEach((point, index) => {
    if (point.passRate !== null) {
      current.push([x(index), y(point.passRate)]);
      return;
    }
    if (current.length > 0) segments.push(current);
    current = [];
  });
  if (current.length > 0) segments.push(current);

  const paths = segments
    .filter((segment) => segment.length > 1)
    .map((segment) => `<path d="M${segment.map(([px, py]) => `${fmt(px)} ${fmt(py)}`).join(' L')}"/>`);
  const lone = segments
    .filter((segment) => segment.length === 1)
    .map(([[px, py]]) => `<circle cx="${fmt(px)}" cy="${fmt(py)}" r="1.5"/>`);
  const last = segments[segments.length - 1];
  const [nowX, nowY] = last[last.length - 1];
  const now = `<circle class="now" cx="${fmt(nowX)}" cy="${fmt(nowY)}" r="2.5"/>`;
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Pass rate, last ${points.length} days">${paths.join('')}${lone.join('')}${now}</svg>`;
}
