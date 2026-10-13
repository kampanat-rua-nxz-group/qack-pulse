import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sparkline } from '../src/spark.ts';

const pts = (rates: (number | null)[]) => rates.map((passRate, index) => ({ date: `d${index}`, counts: null, passRate }));
const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

test('returns nothing when no point has a pass rate', () => {
  assert.equal(sparkline(pts([null, null, null])), '');
  assert.equal(sparkline([]), '');
});

test('draws one line and marks the last point', () => {
  const svg = sparkline(pts([0.9, 0.92, 0.85, 0.8]));
  assert.match(svg, /^<svg class="spark" viewBox="0 0 84 24"/);
  assert.match(svg, /aria-label="Pass rate, last 4 days"/);
  assert.equal(count(svg, /<path /g), 1);
  assert.equal(count(svg, /<circle class="now"/g), 1);
});

test('a gap breaks the line and a lone point becomes a dot', () => {
  const svg = sparkline(pts([1, null, 1, 1]));
  assert.equal(count(svg, /<path /g), 1);
  assert.equal(count(svg, /<circle /g), 2);
});

test('a steady series stays finite and puts higher rates higher on the chart', () => {
  assert.doesNotMatch(sparkline(pts([1, 1, 1, 1])), /NaN|undefined|Infinity/);
  const rising = sparkline(pts([0.5, 1]));
  const [first, second] = [...rising.matchAll(/(?:M| L)([\d.]+) ([\d.]+)/g)].map((match) => Number(match[2]));
  assert.ok(second < first);
});

test('a single point is a dot with no line', () => {
  const svg = sparkline(pts([null, 0.9, null]));
  assert.equal(count(svg, /<path /g), 0);
  assert.match(svg, /<circle class="now"/);
});
