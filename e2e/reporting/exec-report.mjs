#!/usr/bin/env node
// Turns one Playwright JSON report into the page a person reads in the morning: a one-word signal,
// the failures with their causes, the trend, and where coverage sits.
//
//   node e2e/reporting/exec-report.mjs --results report/stable/results.json --build stable \
//     --out report/stable/index.html --summary report/stable/summary.md \
//     [--known e2e/reporting/known-defects.json] [--history report/history/stable.json] \
//     [--commit abc123] [--run-url https://...] [--file-issues]
//
// Nothing leaves this machine unless GITHUB_TOKEN (with GITHUB_REPOSITORY) or CHAT_WEBHOOK_URL is set.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((arg, i, all) => {
    if (!arg.startsWith('--')) return [];
    const next = all[i + 1];
    return [[arg.slice(2), next && !next.startsWith('--') ? next : true]];
  })
);

if (!args.results || !args.out || !args.build) {
  console.error('usage: exec-report.mjs --results results.json --out report.html --build name [options]');
  process.exit(2);
}

const readJson = (file, fallback) =>
  file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const results = readJson(args.results);
const known = readJson(args.known, {});
const history = readJson(args.history, []);

// ---- Read the run ---------------------------------------------------------------------------

const AREAS = {
  account: 'Accounts and orders',
  admin: 'Admin',
  api: 'API contract',
  auth: 'Sign-in',
  cart: 'Cart and coupons',
  catalog: 'Catalogue',
  checkout: 'Checkout and payment',
  subscription: 'Subscriptions',
};

const STATUS = { expected: 'passed', unexpected: 'failed', flaky: 'flaky', skipped: 'not run' };

function collect(suite, into = []) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) {
      const last = test.results.at(-1);
      const id = /^([A-Z]+-\d+) > /.exec(spec.title)?.[1] ?? null;
      const error = stripVTControlCharacters(last?.error?.message ?? last?.errors?.[0]?.message ?? '');
      into.push({
        id,
        title: spec.title.replace(/^[A-Z]+-\d+ > /, ''),
        fullTitle: spec.title,
        file: spec.file,
        line: spec.line,
        project: test.projectName,
        area: AREAS[/specs\/([^/]+)\//.exec(spec.file)?.[1] ?? spec.file.split('/')[1] ?? ''] ?? 'Setup',
        status: STATUS[test.status] ?? test.status,
        ms: test.results.reduce((sum, r) => sum + r.duration, 0),
        smoke: (spec.tags ?? []).includes('smoke'),
        error: error
          .split('\n')
          .filter((l) => l.trim())
          .slice(0, 3)
          .join(' ')
          .slice(0, 300),
      });
    }
  }
  for (const child of suite.suites ?? []) collect(child, into);
  return into;
}

const allRows = (results.suites ?? []).flatMap((suite) => collect(suite));
const rows = allRows.filter((r) => r.area !== 'Setup');
const setupFailed = allRows.some((r) => r.area === 'Setup' && r.status === 'failed');
const count = (status) => rows.filter((r) => r.status === status).length;
const stats = {
  total: rows.length,
  passed: count('passed'),
  failed: count('failed'),
  flaky: count('flaky'),
  notRun: count('not run'),
  ms: Math.round(results.stats?.duration ?? 0),
};

// ---- Explain the failures -------------------------------------------------------------------

const signatureOf = (row) =>
  `e2esig${createHash('sha1').update(`${args.build}::${row.file}::${row.fullTitle}`).digest('hex').slice(0, 12)}`;

const GITHUB_API = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? '';
const tracker = GITHUB_TOKEN && GITHUB_REPOSITORY;

async function github(route, body) {
  const res = await fetch(`${GITHUB_API}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return res.json();
}

const failures = rows.filter((r) => r.status === 'failed');
const filing = { filed: 0, held: 0, max: 5, error: '' };

for (const row of failures) {
  row.signature = signatureOf(row);
  if (row.id && known[row.id]) row.defect = { ...known[row.id], source: 'known' };
}

if (tracker) {
  for (const row of failures.filter((r) => !r.defect)) {
    try {
      const query = encodeURIComponent(`repo:${GITHUB_REPOSITORY} ${row.signature} in:body is:issue`);
      const { items } = await github(`/search/issues?q=${query}`);
      const open = items.find((issue) => issue.state === 'open');
      if (open) row.defect = { id: `#${open.number}`, url: open.html_url, cause: open.title, source: 'issue' };
      else if (items.length) row.regression = { id: `#${items[0].number}`, url: items[0].html_url };
    } catch (error) {
      row.lookupFailed = true;
      filing.error = String(error.message);
    }
  }
}

/** One issue per failing test, found again by its signature, so a test failing nightly files once. */
async function fileIssue(row) {
  const body = [
    'Filed by the nightly run: this test failed and no open issue carries its signature.',
    '',
    `- **Test:** ${row.fullTitle}`,
    `- **Spec:** \`${row.file}:${row.line}\``,
    `- **Build:** ${args.build}`,
    args['run-url'] ? `- **Run:** ${args['run-url']}` : null,
    '',
    '```',
    row.error.replaceAll('```', "'''"),
    '```',
    '',
    `Keep this line in the issue, because the nightly finds it by it: ${row.signature}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
  const issue = await github(`/repos/${GITHUB_REPOSITORY}/issues`, {
    title: `[nightly] ${row.fullTitle}`.slice(0, 200),
    body,
  });
  row.defect = { id: `#${issue.number}`, url: issue.html_url, cause: 'Filed tonight', source: 'filed' };
  filing.filed += 1;
}

if (tracker && args['file-issues']) {
  const toFile = failures.filter((r) => !r.defect && !r.regression && !r.lookupFailed);
  // A run this broken nearly always has one cause. An issue per test would only bury it.
  if (toFile.length > filing.max) filing.held = toFile.length;
  else {
    try {
      for (const row of toFile) await fileIssue(row);
    } catch (error) {
      filing.error = String(error.message);
    }
  }
}

const explained = (row) => row.defect && row.defect.source !== 'filed';
const unexplained = failures.filter((row) => !explained(row));
const reproduced = new Set(failures.map((r) => r.id));
const goneQuiet = Object.keys(known).filter((id) => rows.some((r) => r.id === id) && !reproduced.has(id));

// ---- The signal -----------------------------------------------------------------------------

function signalFor() {
  if (setupFailed || stats.total === 0 || stats.notRun > stats.total / 2) {
    return ['BLOCKED', 'Most of the suite did not run, so this run says little about the build.'];
  }
  if (unexplained.some((r) => r.smoke)) return ['BLOCKED', 'A critical journey is failing with no known cause.'];
  if (unexplained.length) {
    const noun = unexplained.length === 1 ? 'failure has' : 'failures have';
    return ['DEGRADED', `${unexplained.length} ${noun} no known cause and need looking at.`];
  }
  if (failures.length) return ['HEALTHY', `All ${failures.length} failures are known defects. Nothing new tonight.`];
  return ['HEALTHY', 'Every test passed.'];
}

const [signal, verdict] = signalFor();
const passRate = stats.total ? Math.round(((stats.passed + stats.flaky) / stats.total) * 1000) / 10 : 0;

const now = new Date();
const entry = { at: now.toISOString(), commit: args.commit ?? '', signal, ...stats };
const trend = [...history, entry].slice(-30);
if (args.history) write(args.history, `${JSON.stringify(trend, null, 2)}\n`);

// ---- The page -------------------------------------------------------------------------------

const esc = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

const causeCell = (row) => {
  if (row.defect?.source === 'known') {
    return `<span class="pill known">${esc(row.defect.id)}</span> ${esc(row.defect.cause)}`;
  }
  if (row.defect) {
    return `<span class="pill known"><a href="${esc(row.defect.url)}">${esc(row.defect.id)}</a></span> ${esc(row.defect.cause)}`;
  }
  if (row.regression) {
    return `<span class="pill new">Regression</span> <a href="${esc(row.regression.url)}">${esc(row.regression.id)}</a> was closed, and this is failing again`;
  }
  return `<span class="pill new">New</span> No known cause yet`;
};

const failureRows = failures
  .sort((a, b) => Number(!!explained(a)) - Number(!!explained(b)) || String(a.id).localeCompare(String(b.id)))
  .map(
    (row) => `<tr>
      <td class="id">${esc(row.id ?? '')}</td>
      <td>${esc(row.title)}<div class="error">${esc(row.error)}</div></td>
      <td>${causeCell(row)}</td>
    </tr>`
  )
  .join('');

const areaRows = Object.values(
  rows.reduce((all, row) => {
    const area = (all[row.area] ??= { name: row.area, total: 0, passed: 0, failed: 0 });
    area.total += 1;
    if (row.status === 'failed') area.failed += 1;
    else if (row.status !== 'not run') area.passed += 1;
    return all;
  }, {})
)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((a) => {
    const good = percent(a.passed, a.total);
    return `<tr>
      <td>${esc(a.name)}</td><td class="num">${a.total}</td><td class="num">${a.passed}</td><td class="num">${a.failed}</td>
      <td><div class="meter"><span class="fill" style="width:${good}%"></span><span class="gap" style="width:${100 - good}%"></span></div></td>
    </tr>`;
  })
  .join('');

const bars = trend
  .slice(-14)
  .map((run) => {
    const size = Math.max(run.total, 1);
    const title = `${run.at.slice(0, 16).replace('T', ' ')}: ${run.passed} passed, ${run.failed} failed (${run.signal})`;
    return `<div class="bar" title="${esc(title)}" role="img" aria-label="${esc(title)}">
      <span class="bad" style="height:${(run.failed / size) * 100}%"></span>
      <span class="ok" style="height:${(run.passed / size) * 100}%"></span>
    </div>`;
  })
  .join('');

const slowest = [...rows]
  .sort((a, b) => b.ms - a.ms)
  .slice(0, 5)
  .map((r) => `<li><span class="num">${seconds(r.ms)}</span> ${esc(r.id ?? '')} ${esc(r.title)}</li>`)
  .join('');

const flakyList = rows
  .filter((r) => r.status === 'flaky')
  .map((r) => `<li>${esc(r.id ?? '')} ${esc(r.title)}</li>`)
  .join('');

const notes = [
  filing.filed ? `${filing.filed} new issue${filing.filed === 1 ? '' : 's'} filed tonight.` : '',
  filing.held
    ? `${filing.held} failures have no issue. That is over the limit of ${filing.max}, so none were filed: a run this broken usually has one cause.`
    : '',
  filing.error
    ? `The issue tracker could not be reached (${filing.error}), so "New" may include failures that already have an issue.`
    : '',
  !tracker && unexplained.length ? 'No issue tracker is set up for this run, so nothing was filed.' : '',
]
  .filter(Boolean)
  .map((note) => `<p class="note">${esc(note)}</p>`)
  .join('');

const kpi = (value, name, tone = '') => `<div class="kpi ${tone}"><b>${value}</b><span>${name}</span></div>`;
const hasPlaywrightReport = fs.existsSync(path.join(path.dirname(args.out), 'playwright-report', 'index.html'));

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nightly report: ${esc(args.build)}</title>
<style>
:root{--bg:#f4f6f5;--panel:#fff;--ink:#17201c;--muted:#5d6b64;--line:#dbe2de;--ok:#1f7a4d;--ok-soft:#dff1e7;--warn:#9a6a00;--warn-soft:#fbf0d6;--bad:#b3261e;--bad-soft:#fbe3e1}
@media (prefers-color-scheme:dark){:root{--bg:#111614;--panel:#19201d;--ink:#e6ece9;--muted:#9eada5;--line:#2d3833;--ok:#6fcfa0;--ok-soft:#183126;--warn:#e6c069;--warn-soft:#352b14;--bad:#f2a29c;--bad-soft:#3b1d1b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:28px 16px 56px;display:grid;gap:22px}
h1{font-size:1.5rem;margin:0}h2{font-size:1.02rem;margin:0 0 10px}
.meta{color:var(--muted);font-size:.88rem;margin:2px 0 0}
.signal{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:14px 18px;border-radius:8px;background:var(--ok-soft);color:var(--ok)}
.signal b{font-size:1.25rem;letter-spacing:.04em}
.signal span{color:var(--ink)}
.signal.DEGRADED{background:var(--warn-soft);color:var(--warn)}
.signal.BLOCKED{background:var(--bad-soft);color:var(--bad)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 14px}
.kpi b{display:block;font-size:1.5rem;font-variant-numeric:tabular-nums}
.kpi span{color:var(--muted);font-size:.84rem}
.kpi.bad b{color:var(--bad)}.kpi.warn b{color:var(--warn)}
section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px 18px;min-width:0}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{text-align:left;padding:7px 12px 7px 0;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
th{font-size:.8rem;color:var(--muted);font-weight:600}
.id{font-family:ui-monospace,Menlo,monospace;font-size:.82rem;white-space:nowrap}
.num{font-variant-numeric:tabular-nums}
th.num,td.num{text-align:right}
.error{color:var(--muted);font-size:.8rem;margin-top:2px;overflow-wrap:anywhere}
.pill{display:inline-block;padding:0 7px;border-radius:99px;font-size:.76rem;font-weight:600;white-space:nowrap}
.pill.known{background:var(--warn-soft);color:var(--warn)}
.pill.new{background:var(--bad-soft);color:var(--bad)}
.pill a{color:inherit}
.meter{min-width:120px;display:flex;height:10px;margin-top:6px;border-radius:99px;overflow:hidden}
.meter .fill{background:var(--ok)}.meter .gap{background:var(--bad)}
.trend{display:flex;gap:5px;align-items:flex-end;height:74px}
.bar{flex:0 1 34px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;border-radius:3px;overflow:hidden;background:var(--line)}
.bar .ok{background:var(--ok)}.bar .bad{background:var(--bad)}
.note{margin:10px 0 0;color:var(--muted);font-size:.88rem}
ul{margin:0;padding-left:1.1rem}
.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px}
a{color:inherit}
</style></head><body><div class="wrap">
<header><h1>Nightly report: ${esc(args.build)} build</h1>
<p class="meta">${esc(now.toISOString().slice(0, 16).replace('T', ' '))} UTC${args.commit ? ` · commit ${esc(args.commit)}` : ''}${args['run-url'] ? ` · <a href="${esc(args['run-url'])}">run</a>` : ''}${hasPlaywrightReport ? ` · <a href="playwright-report/index.html">full Playwright report</a>` : ''}</p></header>
<div class="signal ${signal}"><b>${signal}</b><span>${esc(verdict)}</span></div>
<div class="kpis">
${kpi(stats.total, 'tests')}${kpi(`${passRate}%`, 'pass rate')}${kpi(stats.failed, 'failed', stats.failed ? 'bad' : '')}${kpi(unexplained.length, 'unexplained', unexplained.length ? 'bad' : '')}${kpi(stats.flaky, 'flaky', stats.flaky ? 'warn' : '')}${kpi(stats.notRun, 'not run', stats.notRun ? 'warn' : '')}${kpi(seconds(stats.ms), 'duration')}
</div>
${failures.length ? `<section><h2>Failures</h2><div class="scroll"><table><thead><tr><th>ID</th><th>Test</th><th>Cause</th></tr></thead><tbody>${failureRows}</tbody></table></div>${notes}</section>` : ''}
${goneQuiet.length ? `<section><h2>Known defects that did not fail tonight</h2><p class="note">Check whether these are fixed, then remove them from the known-defects file: ${esc(goneQuiet.join(', '))}</p></section>` : ''}
<section><h2>Trend, last ${Math.min(trend.length, 14)} runs</h2><div class="trend">${bars}</div></section>
<section><h2>Coverage by area</h2><div class="scroll"><table><thead><tr><th>Area</th><th class="num">Tests</th><th class="num">Passed</th><th class="num">Failed</th><th></th></tr></thead><tbody>${areaRows}</tbody></table></div></section>
<div class="columns">
<section><h2>Slowest tests</h2><ul>${slowest}</ul></section>
<section><h2>Flaky tests</h2>${flakyList ? `<ul>${flakyList}</ul>` : '<p class="note" style="margin:0">None. Every test gave the same answer on each attempt.</p>'}</section>
</div>
</div></body></html>`;

write(args.out, html);

// ---- The short forms ------------------------------------------------------------------------

const headline = `${signal}: ${args.build} build, ${stats.passed}/${stats.total} passed, ${stats.failed} failed (${unexplained.length} unexplained)`;

if (args.summary) {
  const lines = failures.map(
    (r) =>
      `| ${r.id ?? ''} | ${r.title.replaceAll('|', '/')} | ${r.defect ? `${r.defect.id}: ${r.defect.cause}` : 'New'} |`
  );
  const table = lines.length ? ['', '| ID | Test | Cause |', '|---|---|---|', ...lines] : [];
  write(
    args.summary,
    [
      `### ${args.build} build: ${signal}`,
      '',
      verdict,
      '',
      `${stats.passed} of ${stats.total} passed in ${seconds(stats.ms)}.`,
      ...table,
      '',
    ].join('\n')
  );
}

if (process.env.CHAT_WEBHOOK_URL) {
  try {
    await fetch(process.env.CHAT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${headline}${args['run-url'] ? `\n${args['run-url']}` : ''}` }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error(`chat message not sent: ${error.message}`);
  }
}

console.log(headline);
console.log(
  JSON.stringify({ build: args.build, signal, verdict, ...stats, unexplained: unexplained.length, filed: filing.filed })
);
