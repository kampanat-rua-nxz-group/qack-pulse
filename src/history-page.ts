import { rates } from './health.ts';
import type { HistoryLine } from './history.ts';
import { escapeHtml, safeUrl } from './render.ts';
import type { Dashboard } from './rollup.ts';
import { STYLE } from './style.ts';
import { newestRunPerDay } from './trend.ts';
import type { RunTotal } from './trend.ts';

const MAX_MONTHS = 12;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DASH = '—';

type Days = Map<string, RunTotal>;

// The dashboard table links to this id, so both pages build it the same way.
export const historyId = (product: number, repo: number, module: number): string => `m-${product}-${repo}-${module}`;

// One job shows at a time. :target selects the job the table linked to, and the first job shows when none is selected.
// One month of that job shows at a time. Each job has a hidden radio per month, and Previous and Next are labels for the neighbours.
// A day takes the same teal-to-rose color as the table rows, from its pass rate.
const historyStyle = (monthCount: number): string => `
.picker { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 1.5rem; }
.picker a { padding: 0.25rem 0.75rem; border: 1px solid var(--color-border-card); border-radius: var(--radius-pill); background: var(--color-row-module); color: var(--color-text-primary); text-decoration: none; }
.picker a:hover { border-color: var(--color-brand-border); }
.job { display: none; }
.job:target { display: block; }
main:not(:has(.job:target)) .job:first-of-type { display: block; }
.job h2 { margin: 0 0 1rem; color: var(--color-text-heading); font-size: 1.25rem; font-weight: 600; }
.mon { display: none; }
.months { max-width: 48rem; margin: 0 auto; }
.month { display: none; min-width: 0; padding: 1rem; border: 1px solid var(--color-border-card); border-radius: var(--radius-card); background: var(--color-row-repo); }
${Array.from({ length: monthCount }, (_, k) => `.mon-${k}:checked ~ .months .month-${k} { display: block; }`).join('\n')}
.month-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0 0 0.75rem; }
.month h3 { margin: 0; color: var(--color-text-heading); font-size: 0.875rem; font-weight: 700; }
.nav { padding: 0.125rem 0.625rem; border: 1px solid var(--color-border-card); border-radius: var(--radius-pill); color: var(--color-text-primary); font-size: 0.75rem; cursor: pointer; user-select: none; }
.nav:hover { border-color: var(--color-brand-border); }
.nav.off { color: var(--color-text-muted); cursor: default; opacity: 0.4; }
.nav.off:hover { border-color: var(--color-border-card); }
.cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.25rem; margin: 0; padding: 0; list-style: none; }
.dow { color: var(--color-text-muted); font-size: 0.75rem; text-align: center; }
.day {
  --tealShare: clamp(0, (var(--pass, 0) - var(--rose-at)) / (1 - var(--rose-at)), 1);
  --health: color-mix(in oklch, var(--color-brand-primary) calc(var(--tealShare) * 100%), var(--color-form-error));
  aspect-ratio: 1; min-width: 0; border-radius: 0.375rem; background: var(--color-row-module);
}
.day.ran { border: 1px solid color-mix(in oklch, var(--health) 55%, transparent); background: color-mix(in oklch, var(--health) 28%, var(--color-row-module)); }
.day.ran.no-rate { --health: var(--color-health-none); }
.day.future { opacity: 0.35; }
.day > a, .day > .cell { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: inherit; text-decoration: none; }
.day.none { display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); }
.day b { font-size: 1rem; font-weight: 600; }
.day span { font-size: 0.75rem; font-variant-numeric: tabular-nums; }
`;

const dayCell = (date: string, day: number, run: RunTotal | undefined, today: string): string => {
  if (run === undefined) return `<li class="day none${date > today ? ' future' : ''}"><b>${day}</b></li>`;
  const { counts } = run;
  const { passRate } = rates(counts);
  const title = `${date}: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped, ${counts.flaky} flaky`;
  const body = `<b>${day}</b><span>${passRate === null ? DASH : `${(passRate * 100).toFixed(1)}%`}</span>`;
  const href = safeUrl(run.runUrl);
  const inner = href === null ? `<span class="cell" title="${title}">${body}</span>` : `<a href="${escapeHtml(href)}" title="${title}">${body}</a>`;
  return `<li class="day ran${passRate === null ? ' no-rate' : ''}"${passRate === null ? '' : ` style="--pass:${Number(passRate.toFixed(4))}"`}>${inner}</li>`;
};

type MonthNav = { position: number; previous: string; next: string };

function month(year: number, index: number, days: Days | undefined, today: string, { position, previous, next }: MonthNav): string {
  const name = new Date(Date.UTC(year, index, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const lead = new Date(Date.UTC(year, index, 1)).getUTCDay();
  const length = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const cells = Array.from({ length }, (_, offset) => {
    const date = new Date(Date.UTC(year, index, offset + 1)).toISOString().slice(0, 10);
    return dayCell(date, offset + 1, days?.get(date), today);
  });
  const head = WEEKDAYS.map((weekday) => `<li class="dow">${weekday}</li>`);
  const pads = Array.from({ length: lead }, () => '<li class="pad"></li>');
  return `<div class="month month-${position}">\n<div class="month-head">${previous}<h3>${name}</h3>${next}</div>\n<ol class="cal">${[...head, ...pads, ...cells].join('')}</ol>\n</div>`;
}

// How many months the page covers: from the oldest month with a run to the current month, at most MAX_MONTHS.
function monthCount(runs: Map<string, Days>, now: Date): number {
  const oldest = [...runs.values()].flatMap((days) => [...days.keys()]).sort()[0];
  if (oldest === undefined) return 1;
  const back = now.getUTCFullYear() * 12 + now.getUTCMonth() - (Number(oldest.slice(0, 4)) * 12 + Number(oldest.slice(5, 7)) - 1);
  return Math.min(MAX_MONTHS, Math.max(back, 0) + 1);
}

// One calendar section per workflow job (module). Each day shows the newest run that started on it.
// Month 0 is the current month and shows first. Previous goes one month back, Next one month forward.
export function renderHistory(dashboard: Dashboard, history: HistoryLine[], now: Date, roseAtPassRate: number): string {
  const runs = newestRunPerDay(history);
  const today = now.toISOString().slice(0, 10);
  const count = monthCount(runs, now);
  const months = Array.from({ length: count }, (_, back) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)));
  const jobs = dashboard.products.flatMap((product, p) =>
    product.repos.flatMap((repo, r) =>
      repo.modules.map((mod, m) => {
        const id = historyId(p, r, m);
        const days = runs.get(`${repo.name}|${mod.name}`);
        const radios = months.map((_, k) => `<input type="radio" class="mon mon-${k}" name="${id}-month" id="${id}-${k}"${k === 0 ? ' checked' : ''}>`);
        const grid = months.map((first, k) => {
          const previous = k + 1 < count ? `<label class="nav" for="${id}-${k + 1}">Previous</label>` : '<span class="nav off">Previous</span>';
          const next = k > 0 ? `<label class="nav" for="${id}-${k - 1}">Next</label>` : '<span class="nav off">Next</span>';
          return month(first.getUTCFullYear(), first.getUTCMonth(), days, today, { position: k, previous, next });
        });
        return {
          id,
          name: mod.name,
          html: `<section class="job" id="${id}">\n<h2>${escapeHtml(mod.name)} <span class="sub">${escapeHtml(product.name)} / ${escapeHtml(repo.name)}</span></h2>\n${radios.join('')}\n<div class="months">\n${grid.join('\n')}\n</div>\n</section>`,
        };
      }),
    ),
  );
  const picker = jobs.map((job) => `<a href="#${job.id}">${escapeHtml(job.name)}</a>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>qack-pulse history</title>
<style>${STYLE}${historyStyle(count)}</style>
</head>
<body>
<main>
<header>
<div>
<h1>History</h1>
<p class="lede">Pass rate per day for each workflow job. Pick a job, then use Previous and Next to change month.</p>
</div>
<p class="generated"><a href="dashboard.html">Back to dashboard</a></p>
</header>
<nav class="picker" aria-label="Workflow jobs">${picker.join('')}</nav>
<div class="jobs" style="--rose-at:${roseAtPassRate}">
${jobs.map((job) => job.html).join('\n')}
</div>
<p class="legend">Each day shows the newest run that started on it, in UTC. The color fades from teal at 100% to rose at ${Number((roseAtPassRate * 100).toFixed(1))}% pass rate. Grey is a run where every test was skipped. An empty day had no run. Click a day to open its run.</p>
</main>
</body>
</html>
`;
}
