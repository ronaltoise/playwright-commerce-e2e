#!/usr/bin/env node
// The nightly run: every build, then a report for each. `npm run nightly` does exactly what the
// GitHub pipeline does, so what you see here is what the pipeline produces. Results are
// reported, not thrown: the run only exits non-zero if a report couldn't be built, or with
// --strict if a build isn't HEALTHY.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Playwright's CLI, run with this same Node. `npx` is a .cmd file on Windows, which spawnSync
// can't start without a shell.
const PLAYWRIGHT = createRequire(import.meta.url).resolve('@playwright/test/cli');

const BUILDS = [
  { name: 'stable', title: 'Clean build', projects: ['stable', 'stable-mobile'] },
  {
    name: 'buggy',
    title: 'Seeded-bug build',
    projects: ['buggy'],
    known: 'e2e/reporting/known-defects.json',
  },
];

const strict = process.argv.includes('--strict');
const fileIssues = process.env.E2E_FILE_ISSUES === 'true';
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : '';
const git = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
const commit = git.status === 0 ? git.stdout.trim() : '';

const esc = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const outcomes = [];

for (const build of BUILDS) {
  const dir = `report/${build.name}`;
  console.log(`\n=== ${build.title} ===`);
  const projects = build.projects.flatMap((project) => ['--project', project]);
  const run = spawnSync(process.execPath, [PLAYWRIGHT, 'test', ...projects], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, E2E_REPORT_DIR: dir },
  });
  console.log(
    run.stdout
      .split('\n')
      .filter((line) => /^\s+\d+ (passed|failed|flaky|did not run|skipped)/.test(line))
      .join('\n')
  );

  const reportArgs = [
    'e2e/reporting/exec-report.mjs',
    '--results',
    `${dir}/results.json`,
    '--build',
    build.name,
    '--out',
    `${dir}/index.html`,
    '--summary',
    `${dir}/summary.md`,
    '--history',
    `report/history/${build.name}.json`,
    ...(commit ? ['--commit', commit] : []),
    ...(runUrl ? ['--run-url', runUrl] : []),
    ...(build.known ? ['--known', build.known] : []),
    ...(fileIssues ? ['--file-issues'] : []),
  ];
  const report = spawnSync(process.execPath, reportArgs, { encoding: 'utf8' });
  if (report.status !== 0) {
    console.error(report.stderr);
    outcomes.push({ ...build, signal: 'NO REPORT', verdict: 'The report could not be built.' });
    continue;
  }
  const [headline, details] = report.stdout.trim().split('\n');
  console.log(headline);
  outcomes.push({ ...build, ...JSON.parse(details) });
}

const cards = outcomes
  .map((o) => `<li><a href="${o.name}/index.html">${esc(o.title)}</a>: <b>${esc(o.signal)}</b>. ${esc(o.verdict)}</li>`)
  .join('');
fs.writeFileSync(
  'report/index.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nightly reports</title><style>body{max-width:760px;margin:0 auto;padding:32px 16px;font:16px/1.6 system-ui,sans-serif}</style></head><body><h1>Nightly reports</h1><ul>${cards}</ul></body></html>`
);
fs.writeFileSync(
  'report/summary.md',
  `## Nightly results\n\n${outcomes.map((o) => (fs.existsSync(`report/${o.name}/summary.md`) ? fs.readFileSync(`report/${o.name}/summary.md`, 'utf8') : `### ${o.name}: no report\n`)).join('\n')}`
);

console.log('\nOpen report/index.html to read the results.');

const failedReport = outcomes.some((o) => o.signal === 'NO REPORT');
const notHealthy = outcomes.some((o) => o.signal !== 'HEALTHY');
process.exit(failedReport || (strict && notHealthy) ? 1 : 0);
