import { escapeHtml } from './render.ts';
import type { Dashboard } from './rollup.ts';
import { sparkline } from './spark.ts';
import type { DashboardTrend, Trend } from './trend.ts';

const CARD = { width: 260, height: 64 };

const deltaText = (trend: Trend): string => {
  if (trend.delta === null) return 'not enough history';
  const points = `${Math.abs(trend.delta * 100).toFixed(1)} pts`;
  if (trend.direction === 'worse') return `▼ ${points}`;
  if (trend.direction === 'better') return `▲ ${points}`;
  return 'flat';
};

const rateText = (rate: number | null): string => (rate === null ? '—' : `${(rate * 100).toFixed(1)}%`);

// --pass feeds the same teal-to-rose scale the table rows use, so the line color matches the health bar.
const passStyle = (rate: number | null): string => (rate === null ? '' : ` style="--pass:${Number(rate.toFixed(4))}"`);

const card = (name: string, rate: number | null, trend: Trend, overview = false): string =>
  `<article class="trend-card ${trend.direction}${overview ? ' overview' : ''}"${passStyle(rate)}>
<h4>${escapeHtml(name)}</h4>
<p class="hero"><span class="rate">${rateText(rate)}</span><span class="delta">${deltaText(trend)}</span></p>
${sparkline(trend.points, CARD)}
</article>`;

// One group per product: the product name (folded into the section title when there is only one product), an overview card with the rolled-up line, then one card per repo.
// A product with a single repo skips the overview, because it would repeat that repo's card.
export function trendCards(dashboard: Dashboard, trend: DashboardTrend, roseAtPassRate: number): string {
  const single = trend.products.length === 1;
  const groups = trend.products.map((product, p) => {
    const rollup = dashboard.products[p];
    const repos = product.repos.map((repo, r) => card(repo.name, rollup?.repos[r]?.passRate ?? null, repo.trend));
    const cards = product.repos.length > 1 ? [card(`${product.name} overview`, rollup?.passRate ?? null, product.trend, true), ...repos] : repos;
    return `<div class="trend-group">
${single ? '' : `<h3>${escapeHtml(product.name)}</h3>\n`}
<div class="trend-grid">
${cards.join('\n')}
</div>
</div>`;
  });
  return `<section class="trends" style="--rose-at:${roseAtPassRate}">
<h2>${single ? `${escapeHtml(trend.products[0]?.name ?? '')} pass rate` : 'Pass rate'}, last ${trend.days} days</h2>
${groups.join('\n')}
</section>`;
}
